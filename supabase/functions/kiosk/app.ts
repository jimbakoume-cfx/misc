import QRCode from "qrcode";
import { Buffer } from "node:buffer";
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import type { Assets, BlobStore, Db } from "./db.ts";
import { staticType, toPg } from "./db.ts";
import {
  hashPassword, newRecoveryCode, newTotpSecret, normRecovery, randomToken, sha256, signSession, verifyPassword,
  verifySession, verifyTotp, type Session,
} from "./auth.ts";

// Defaults for how often phones check in (the dashboard can change them in Settings). "online" tolerates two
// missed check-ins; a phone with a live push connection checks in less often, so its window is wider.
export const HEARTBEAT_SEC = 600;
export const PUSH_HEARTBEAT_SEC = 1800;
const MIN_PASSWORD = 12;
const COMMAND_TYPES = new Set(["refresh", "reboot", "lock", "release", "relock", "unenroll", "update", "install", "lost", "found", "ring", "locate", "wipe"]);
// Every command except these needs the app to be the device owner.
const NO_OWNER_NEEDED = new Set(["refresh", "locate", "ring", "lost", "found"]);
const SWEEP_EVERY_MS = 5 * 60_000;

type Row = Record<string, any>;

export interface Seed {
  apk: ArrayBuffer;
  versionCode: number;
  versionName: string;
  certSha256: string;
}

export interface Deps {
  db: Db;
  blobs: BlobStore;
  env: Record<string, string | undefined>;
  /** Dashboard files to serve next to the API (index.html, app.js, …). */
  assets?: Assets;
  /** Optional first release shipped with the deploy; installed on first request if no release exists. */
  loadSeed?: () => Promise<Seed | null>;
  /** For tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (s: any, fallback: any) => {
  if (s == null) return fallback;
  if (typeof s === "object") return s;
  try { return JSON.parse(s); } catch { return fallback; }
};
// Enrolment codes are typed by hand on phones, so avoid look-alike characters (0/O, 1/I/L) and ignore case, spaces and dashes.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const randomCode = () => Array.from(randomBytes(10), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
const showCode = (t: string) => (/^[2-9A-HJKMNP-Z]{10}$/.test(t) ? `${t.slice(0, 5)}-${t.slice(5)}` : t);
const PIN_ITERATIONS = 120_000;
const pinHashV2 = (salt: string, pin: string) => `pbkdf2$${PIN_ITERATIONS}$${salt}$${pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256").toString("hex")}`;
const sha256Buf = (b: ArrayBuffer) => createHash("sha256").update(Buffer.from(b)).digest("hex");
const monthOf = (day: string) => day.slice(0, 7);

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};

interface Ctx {
  req: Request;
  url: URL;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Row;
  admin?: Session;
}
type Handler = (c: Ctx) => Promise<unknown | Response>;
type Auth = "none" | "read" | "write" | "cron";
interface Route { method: string; re: RegExp; auth: Auth; fn: Handler }

export function createApp(deps: Deps): (req: Request) => Promise<Response> {
  const { blobs, env } = deps;
  const doFetch = deps.fetch ?? fetch;
  // Per-isolate counters for the Server-Timing header (diagnostics; approximate under concurrent requests).
  const stats = { n: 0, ms: 0 };
  const db: Db = { query: async (text, params) => { const t = performance.now(); try { return await deps.db.query(text, params); } finally { stats.n++; stats.ms += performance.now() - t; } } };
  const get = async (sql: string, ...p: any[]) => (await db.query(toPg(sql), p))[0] as Row | undefined;
  const all = (sql: string, ...p: any[]) => db.query(toPg(sql), p) as Promise<Row[]>;
  const run = async (sql: string, ...p: any[]) => { await db.query(toPg(sql), p); };
  const insert = async (sql: string, ...p: any[]) => Number((await db.query(toPg(sql + " RETURNING id"), p))[0].id);
  const now = () => Date.now();

  // The settings table is small and read on every request, so it is loaded in one query and kept for a few seconds
  // per isolate (writes update the copy). Every database round trip costs ~100 ms from the edge, so fewer is faster.
  let sCache: Record<string, string> | null = null; let sAt = 0;
  const allSettings = async () => {
    if (!sCache || now() - sAt > 5_000) {
      sCache = Object.fromEntries((await all("SELECT key,value FROM settings")).map((r) => [r.key, String(r.value ?? "")]));
      sAt = now();
    }
    return sCache;
  };
  const setting = async (k: string, d = "") => (await allSettings())[k] ?? d;
  const setSetting = async (k: string, v: string) => {
    await run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, v);
    if (sCache) sCache[k] = v;
  };
  const audit = (actor: string, action: string, detail = "") =>
    run("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)", now(), actor, action, String(detail));
  const num = (v: any, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

  // ---------- addresses ----------
  const publicUrl = (env.PUBLIC_URL ?? "").replace(/\/$/, "");
  const basePath = publicUrl ? new URL(publicUrl).pathname.replace(/\/$/, "") : "";
  const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const supabaseKey = env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || json(env.SUPABASE_PUBLISHABLE_KEYS, {})?.default || "";
  const pushOn = !!(supabaseUrl && supabaseKey);
  const apkBase = (base: string) => blobs.publicBase ?? `${base}/apk`;

  let secret = env.SESSION_SECRET ?? "";

  // ---------- one-time init: addresses for the SQL side, session secret, first admin, bundled first release ----------
  let initP: Promise<void> | null = null;
  const init = (base: string) => (initP ??= (async () => {
    const s = await allSettings();
    const want: Record<string, string> = {
      cron_key: s.cron_key || randomToken(24), public_url: base, apk_base_url: apkBase(base),
      supabase_url: pushOn ? supabaseUrl : "", supabase_anon_key: pushOn ? supabaseKey : "",
    };
    if (!secret) { secret = s.session_secret || randomToken(32); want.session_secret = secret; }
    const changed = Object.entries(want).filter(([k, v]) => s[k] !== v);
    if (changed.length) {
      await run(`INSERT INTO settings(key,value) VALUES ${changed.map(() => "(?,?)").join(",")} ON CONFLICT(key) DO UPDATE SET value=excluded.value`, ...changed.flat());
      for (const [k, v] of changed) s[k] = v;
    }
    const email = (env.ADMIN_EMAIL ?? "").toLowerCase().trim();
    const pw = env.ADMIN_PASSWORD ?? "";
    const bootstrapAdmin = email && pw.length >= 8;
    if (bootstrapAdmin || deps.loadSeed) {
      const st = (await get("SELECT EXISTS(SELECT 1 FROM admins) a, EXISTS(SELECT 1 FROM releases) r"))!;
      if (!st.a && bootstrapAdmin) {
        await run("INSERT INTO admins(email,pass_hash,role) VALUES(?,?,'admin') ON CONFLICT(email) DO NOTHING", email, hashPassword(pw));
      }
      if (!st.r && deps.loadSeed) {
        const seed = await deps.loadSeed();
        if (seed) await storeRelease(seed.apk, seed.versionCode, seed.versionName, seed.certSha256);
      }
    }
  })().catch((e) => { initP = null; throw e; }));

  async function storeRelease(apk: ArrayBuffer, versionCode: number, versionName: string, cert: string) {
    const digest = sha256Buf(apk);
    await blobs.set(`${digest}.apk`, apk, "application/vnd.android.package-archive");
    const existing = await get("SELECT 1 x FROM releases WHERE sha256=?", digest);
    if (existing) {
      // Uploading the same file again corrects its label instead of adding a duplicate row.
      await run("UPDATE releases SET version_code=?, version_name=?, cert_sha256=? WHERE sha256=?", versionCode, versionName, cert, digest);
    } else {
      await run("INSERT INTO releases(version_code,version_name,sha256,cert_sha256,size,created_at) VALUES(?,?,?,?,?,?)",
        versionCode, versionName, digest, cert, apk.byteLength, now());
    }
    // The setup QR downloads the newest release from a fixed address.
    const latest = await currentRelease();
    if (latest?.sha256 === digest) await blobs.set("kiosk-agent.apk", apk, "application/vnd.android.package-archive");
    return digest;
  }

  const currentRelease = () => get("SELECT * FROM releases ORDER BY version_code DESC, id DESC LIMIT 1");

  // ---------- instant push (Supabase Realtime) ----------
  // Each phone listens on a private channel whose name is a random secret only that phone knows. The server only ever
  // sends an empty "wake" ping; the phone then checks in (authenticated) for its commands and policy.
  const channelOf = (pushId: string) => `dev-${pushId}`;

  /** Pings phones so they check in now. Best effort: failures never break the request (phones still poll). */
  async function wake(ids: number[]) {
    if (!pushOn || !ids.length) return;
    const rows = (await Promise.all(ids.map((id) => get("SELECT id,push_id FROM devices WHERE id=?", id)))).filter((r) => r?.push_id) as Row[];
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100).map((r) => ({ topic: channelOf(r.push_id), event: "wake", payload: {}, private: false }));
      try {
        await doFetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: { apikey: supabaseKey, "content-type": "application/json" },
          body: JSON.stringify({ messages: batch }),
          signal: AbortSignal.timeout(3000),
        });
      } catch (e) { console.warn("push wake failed:", (e as Error).message); }
    }
  }
  const wakeAll = async () => wake((await all("SELECT id FROM devices")).map((r) => r.id));
  const wakeGroup = async (gid: number) => wake((await all("SELECT id FROM devices WHERE group_id=?", gid)).map((r) => r.id));

  const policyEpoch = async () => Number(await setting("policy_epoch", "1"));
  const bumpEpoch = async () => setSetting("policy_epoch", String((await policyEpoch()) + 1));

  // ---------- SQL functions shared with the phones' REST path ----------
  /** Calls one of the kiosk_* SQL functions; `PTxxx` error codes become HTTP statuses (PostgREST does the same). */
  async function sqlFn(name: string, ...args: unknown[]) {
    try {
      const row = await get(`SELECT ${name}(${args.map(() => "?").join(",")}) AS r`, ...args.map((a) => (a != null && typeof a === "object" ? JSON.stringify(a) : a)));
      return json(row?.r, {});
    } catch (e: any) {
      const m = /^PT(\d{3})$/.exec(e?.code ?? "") ?? /^PT(\d{3})$/.exec(e?.cause?.code ?? "");
      if (m) throw new HttpError(Number(m[1]), String(e.message ?? "").replace(/^error:\s*/i, ""));
      throw e;
    }
  }

  // ---------- device state ----------
  let cfgAt = 0; let cfg = { hb: HEARTBEAT_SEC, push: PUSH_HEARTBEAT_SEC };
  const intervals = async () => {
    if (now() - cfgAt > 10_000) {
      const s = await allSettings();
      cfg = { hb: num(s.heartbeat_sec, HEARTBEAT_SEC), push: num(s.push_heartbeat_sec, PUSH_HEARTBEAT_SEC) };
      cfgAt = now();
    }
    return cfg;
  };
  const statusOf = (d: Row) => {
    const st = json(d.status, {});
    const iv = (st.pushConnected ? cfg.push : cfg.hb) * 1000;
    const age = d.last_seen ? now() - d.last_seen : Infinity;
    return age < iv * 2 + 60_000 ? "online" : age < iv * 6 ? "stale" : "offline";
  };

  async function queueCommand(deviceId: number, type: string, payload: any = {}) {
    if (type === "update" && !payload.url) {
      const rel = await currentRelease();
      if (!rel) throw new HttpError(409, "No release uploaded yet");
      payload = { url: `${await setting("apk_base_url")}/${rel.sha256}.apk`, sha256: rel.sha256, versionCode: rel.version_code };
    }
    await run("INSERT INTO commands(device_id,type,payload,created_at) VALUES(?,?,?,?)", deviceId, type, JSON.stringify(payload), now());
  }

  /** Month-to-date data per phone, in one query. */
  async function monthUsage(): Promise<Map<number, { mobileBytes: number; wifiBytes: number }>> {
    const month = monthOf((await get("SELECT kiosk_day(?) d", now()))!.d);
    const rows = await all("SELECT device_id, SUM(mobile_bytes)::double precision m, SUM(wifi_bytes)::double precision w FROM usage_daily WHERE left(day,7)=? GROUP BY device_id", month);
    return new Map(rows.map((r) => [Number(r.device_id), { mobileBytes: num(r.m), wifiBytes: num(r.w) }]));
  }

  const view = async (d: Row, full = false, usage?: Map<number, { mobileBytes: number; wifiBytes: number }>) => {
    const status = json(d.status, {});
    const out: Row = {
      id: d.id, name: d.name, groupId: d.group_id, model: d.model || status.model || "", osVersion: d.os_version || status.osVersion || "",
      serial: d.serial, lastSeen: d.last_seen, state: statusOf(d), enrolledAt: d.enrolled_at,
      driverName: d.driver_name ?? "", driverPhone: d.driver_phone ?? "", vehicle: d.vehicle ?? "",
      battery: status.battery ?? null, charging: !!status.charging, network: status.network ?? null,
      agentVersion: status.agentVersion ?? null, agentVersionCode: num(status.agentVersionCode),
      deviceOwner: !!status.deviceOwner, released: !!status.released,
      freeStorageMb: status.freeStorageMb ?? null, uptimeMin: status.uptimeMin ?? null, notes: d.notes,
      hasOverride: d.allowed_override != null, removing: !!d.remove_pending, approved: !!d.approved,
      lastCrash: status.lastCrash || "", lastError: status.lastError || "", live: !!status.pushConnected,
      imei: d.imei || status.imei || "", simOperator: status.simOperator ?? "", phoneNumber: status.phoneNumber ?? "",
      signal: status.signal ?? null, securityPatch: d.security_patch || status.securityPatch || "",
      usageAccess: !!status.usageAccess, lang: status.lang ?? "",
      lostMode: !!d.lost_mode, lostOnPhone: !!status.lostMode, problem: d.problem || "", problemAt: d.problem_at ?? null,
      location: json(d.last_location, null),
      dataMonth: usage ? usage.get(Number(d.id)) ?? { mobileBytes: 0, wifiBytes: 0 } : undefined,
    };
    if (full) {
      out.allowedOverride = d.allowed_override != null ? json(d.allowed_override, []) : null;
      out.messageOverride = d.message_override;
      out.lostMessage = d.lost_message ?? ""; out.lostPhone = d.lost_phone ?? "";
      const [eff, commands, alerts, month] = await Promise.all([
        get("SELECT kiosk_policy(d) AS r FROM devices d WHERE d.id=?", d.id),
        all("SELECT id,type,status,error,created_at,done_at FROM commands WHERE device_id=? ORDER BY id DESC LIMIT 15", d.id),
        all("SELECT id,ts,kind,message FROM alerts WHERE device_id=? AND active=1 ORDER BY ts DESC", d.id),
        usage ? Promise.resolve(usage) : monthUsage(),
      ]);
      out.effective = json(eff?.r, {});
      out.apps = json(d.apps, []);
      out.androidId = d.android_id;
      out.commands = commands;
      out.alerts = alerts;
      if (!usage) out.dataMonth = month.get(Number(d.id)) ?? { mobileBytes: 0, wifiBytes: 0 };
    }
    return out;
  };

  const cleanApps = (a: any): { pkg: string; label: string }[] =>
    (Array.isArray(a) ? a : [])
      .filter((x) => x && typeof x.pkg === "string" && /^[A-Za-z0-9_.]+$/.test(x.pkg))
      .map((x) => ({ pkg: x.pkg, label: String(x.label ?? x.pkg).slice(0, 60) }));

  const baseUrl = (c: Ctx) => publicUrl || c.url.origin;
  const isHttps = (c: Ctx) => c.url.protocol === "https:" || publicUrl.startsWith("https");
  const cookiePath = "/";
  const sessionCookie = (c: Ctx, token: string) => `kiosk_session=${token}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=43200${isHttps(c) ? "; Secure" : ""}`;

  // ---------- alerts ----------
  let sweptAt = 0;
  async function sweep(force = false) {
    if (!force && now() - sweptAt < SWEEP_EVERY_MS) return;
    sweptAt = now();
    await run("SELECT kiosk_sweep()");
  }
  const alertRows = (rows: Row[]) => rows.map((a) => ({ id: a.id, ts: a.ts, deviceId: a.device_id, deviceName: a.device_name ?? null, driverName: a.driver_name ?? "", kind: a.kind, message: a.message, active: !!a.active, clearedAt: a.cleared_at }));
  async function emailAlerts() {
    const to = (await setting("alert_emails")).split(/[,;\s]+/).filter((x) => x.includes("@"));
    const key = env.RESEND_API_KEY;
    const pending = await all("SELECT a.*, d.name device_name FROM alerts a LEFT JOIN devices d ON d.id=a.device_id WHERE a.active=1 AND a.emailed=0 ORDER BY a.ts");
    if (!pending.length) return { sent: 0, pending: 0 };
    if (!key || !to.length) return { sent: 0, pending: pending.length };
    const lines = pending.map((a) => `• ${a.device_name ?? "Fleet"} — ${a.kind.replace(/_/g, " ")}: ${a.message}`);
    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.ALERT_FROM || "Confiance Kiosk <onboarding@resend.dev>", to,
        subject: `Confiance Kiosk: ${pending.length} alert${pending.length > 1 ? "s" : ""}`,
        text: `${lines.join("\n")}\n\nOpen the dashboard: ${await setting("public_url")}/`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new HttpError(502, `E-mail provider answered ${res.status}`);
    await run(`UPDATE alerts SET emailed=1 WHERE id IN (${pending.map(() => "?").join(",")})`, ...pending.map((a) => a.id));
    return { sent: pending.length, pending: 0 };
  }

  // ---------- routes ----------
  const routes: Route[] = [];
  const add = (method: string, path: string, auth: Auth, fn: Handler) =>
    routes.push({ method, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), auth, fn });
  const who = (c: Ctx) => c.admin!.email;
  const reply = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
  // A dashboard served from another host (static hosting) signs in with a bearer token, never cookies, so the API can
  // answer any origin: a third-party page gains nothing without a token, and cookie sessions are same-origin only.
  const CORS: Record<string, string> = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-requested-with",
    "access-control-max-age": "86400",
  };
  const withCors = (res: Response) => { for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v); return res; };

  add("GET", "/healthz", "none", async () => ({ ok: true }));

  // Failed sign-ins are counted per IP+email and per IP; 8 failures lock that key for 5 minutes.
  async function throttled(keys: string[]) {
    for (const k of keys) {
      const a = await get("SELECT * FROM login_attempts WHERE key=?", k);
      if (a && a.n >= 8 && a.until_ts > now()) throw new HttpError(429, "Too many attempts, try again in a few minutes");
    }
  }
  const failed = (keys: string[]) => Promise.all(keys.map((k) =>
    run("INSERT INTO login_attempts(key,n,until_ts) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=login_attempts.n+1, until_ts=excluded.until_ts", k, now() + 5 * 60_000)));
  const clientIp = (c: Ctx) => c.req.headers.get("x-nf-client-connection-ip") ?? c.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? c.req.headers.get("cf-connecting-ip") ?? "ip";

  add("POST", "/api/login", "none", async (c) => {
    const email = String(c.body.email ?? "").toLowerCase().trim();
    const ip = clientIp(c);
    const keys = [`${ip}|${email}`, `ip|${ip}`];
    await throttled(keys);
    const admin = await get("SELECT * FROM admins WHERE email=?", email);
    if (!admin || !verifyPassword(String(c.body.password ?? ""), admin.pass_hash)) {
      await failed(keys);
      await audit(email || "?", "login-failed", `from ${ip}`);
      throw new HttpError(401, "Wrong email or password");
    }
    if (admin.totp_enabled) {
      const code = String(c.body.code ?? "").trim();
      if (!code) return reply({ error: "Enter the 6-digit code from your authenticator app", needs2fa: true }, 401);
      let ok = verifyTotp(admin.totp_secret, code);
      if (!ok) {
        // a one-time recovery code also works, and is used up
        const hashes: string[] = json(admin.recovery_codes, []);
        const h = sha256(normRecovery(code));
        if (hashes.includes(h)) {
          ok = true;
          await run("UPDATE admins SET recovery_codes=? WHERE id=?", JSON.stringify(hashes.filter((x) => x !== h)), admin.id);
          await audit(admin.email, "recovery-code-used", `from ${ip}`);
        }
      }
      if (!ok) {
        await failed(keys);
        await audit(admin.email, "login-failed", `wrong 2FA code from ${ip}`);
        return reply({ error: "That code is not right", needs2fa: true }, 401);
      }
    }
    await run("DELETE FROM login_attempts WHERE key=?", keys[0]);
    const token = signSession(secret, { id: admin.id, email: admin.email, role: admin.role, sv: admin.session_version });
    await audit(admin.email, "login", `from ${ip}`);
    return reply({ email: admin.email, role: admin.role, token, twoFactor: !!admin.totp_enabled }, 200, { "set-cookie": sessionCookie(c, token) });
  });
  add("POST", "/api/logout", "none", async () =>
    reply({ ok: true }, 200, { "set-cookie": `kiosk_session=; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=0` }));
  add("GET", "/api/me", "read", async (c) => {
    const a = (await get("SELECT totp_enabled FROM admins WHERE id=?", c.admin!.id))!;
    return { email: c.admin!.email, role: c.admin!.role, twoFactor: !!a.totp_enabled, mustSetup2fa: await needs2faSetup(c.admin!) };
  });

  // ---------- my account: password + two-factor ----------
  async function needs2faSetup(a: Session) {
    if ((await setting("require_2fa", "0")) !== "1") return false;
    return !(await get("SELECT totp_enabled FROM admins WHERE id=?", a.id))?.totp_enabled;
  }
  const strongPassword = (pw: string) => {
    if (pw.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters (a few random words work well)`);
  };

  add("POST", "/api/me/password", "read", async (c) => {
    const me = (await get("SELECT * FROM admins WHERE id=?", c.admin!.id))!;
    if (!verifyPassword(String(c.body.current ?? ""), me.pass_hash)) {
      await audit(me.email, "password-change-failed");
      throw new HttpError(403, "Current password is wrong");
    }
    const next = String(c.body.next ?? "");
    strongPassword(next);
    if (next === String(c.body.current)) throw new HttpError(400, "Choose a different password");
    await run("UPDATE admins SET pass_hash=?, session_version=session_version+1 WHERE id=?", hashPassword(next), me.id);
    await audit(me.email, "password-changed", "all other sessions signed out");
    const token = signSession(secret, { id: me.id, email: me.email, role: me.role, sv: me.session_version + 1 });
    return reply({ ok: true, token }, 200, { "set-cookie": sessionCookie(c, token) });
  });

  add("POST", "/api/me/2fa/setup", "read", async (c) => {
    const me = (await get("SELECT * FROM admins WHERE id=?", c.admin!.id))!;
    if (me.totp_enabled) throw new HttpError(409, "Two-factor sign-in is already on");
    const sec = newTotpSecret();
    await run("UPDATE admins SET totp_secret=? WHERE id=?", sec, me.id);
    const uri = `otpauth://totp/Confiance%20Kiosk:${encodeURIComponent(me.email)}?secret=${sec}&issuer=Confiance%20Kiosk&digits=6&period=30`;
    return { secret: sec, qr: await QRCode.toDataURL(uri, { margin: 2, width: 280 }) };
  });
  add("POST", "/api/me/2fa/enable", "read", async (c) => {
    const me = (await get("SELECT * FROM admins WHERE id=?", c.admin!.id))!;
    if (!me.totp_secret) throw new HttpError(400, "Start the setup first");
    if (!verifyTotp(me.totp_secret, String(c.body.code ?? ""))) throw new HttpError(400, "That code is not right. Check the time on your phone and try again.");
    const codes = Array.from({ length: 8 }, newRecoveryCode);
    await run("UPDATE admins SET totp_enabled=1, recovery_codes=?, session_version=session_version+1 WHERE id=?",
      JSON.stringify(codes.map((x) => sha256(normRecovery(x)))), me.id);
    await audit(me.email, "2fa-enabled");
    const token = signSession(secret, { id: me.id, email: me.email, role: me.role, sv: me.session_version + 1 });
    return reply({ ok: true, recoveryCodes: codes, token }, 200, { "set-cookie": sessionCookie(c, token) });
  });
  add("POST", "/api/me/2fa/disable", "read", async (c) => {
    const me = (await get("SELECT * FROM admins WHERE id=?", c.admin!.id))!;
    if (!verifyPassword(String(c.body.password ?? ""), me.pass_hash) || !me.totp_enabled || !verifyTotp(me.totp_secret, String(c.body.code ?? "")))
      throw new HttpError(403, "Password or code is wrong");
    if ((await setting("require_2fa", "0")) === "1") throw new HttpError(409, "Two-factor sign-in is required for all users; turn that requirement off first");
    await run("UPDATE admins SET totp_enabled=0, totp_secret=NULL, recovery_codes='[]', session_version=session_version+1 WHERE id=?", me.id);
    await audit(me.email, "2fa-disabled");
    return { ok: true };
  });

  // Setup diagnostics: during QR setup the app reports each step, so a phone that hangs can be traced. No secrets, throttled.
  add("POST", "/api/setup-beacon", "none", async (c) => {
    const recent = await get("SELECT COUNT(*)::int n FROM audit WHERE action LIKE 'setup:%' AND ts>?", now() - 3_600_000);
    if (Number(recent?.n ?? 0) > 300) throw new HttpError(429, "Too many reports");
    const step = String(c.body.step ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "unknown";
    await audit(`phone ${String(c.body.model ?? "?").slice(0, 40)}`, `setup:${step}`, String(c.body.detail ?? "").slice(0, 300));
    return { ok: true };
  });

  // APK downloads are public on purpose: provisioning fetches them before the device has credentials.
  add("GET", "/apk/:name", "none", async (c) => {
    const name = c.params.name;
    const latest = name === "latest.apk" || name === "kiosk-agent.apk";
    if (latest) {
      // Note downloads (rate-limited to one entry a minute) so a phone that never fetches the app is easy to spot.
      const ua = (c.req.headers.get("user-agent") ?? "?").slice(0, 80);
      if (!(await get("SELECT 1 x FROM audit WHERE action='apk-download' AND ts>?", now() - 60_000)))
        await audit("download", "apk-download", `${clientIp(c)} ${ua}`);
    }
    const sha = name.replace(/\.apk$/, "");
    const rel = latest ? await currentRelease()
      : (await get("SELECT version_name, sha256 FROM releases WHERE sha256=?", sha)) ?? (await get("SELECT version_name, sha256 FROM managed_apps WHERE sha256=?", sha));
    const data = rel ? await blobs.get(`${rel.sha256}.apk`) : null;
    if (!rel || !data) throw new HttpError(404, "No such release");
    return new Response(data, { headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(data.byteLength),
      "content-disposition": `attachment; filename="kiosk-${rel.version_name}.apk"`,
      "cache-control": latest ? "no-cache" : "public, max-age=31536000, immutable",
    } });
  });

  // ---------- device API (the logic lives in SQL so phones can also call it directly through PostgREST) ----------
  const restInfo = () => (pushOn ? { url: `${supabaseUrl}/rest/v1`, key: supabaseKey } : null);
  add("POST", "/api/device/enroll", "none", async (c) => {
    const b = c.body;
    const r = await sqlFn("kiosk_enroll", String(b.enrollToken ?? ""), {
      androidId: b.androidId ?? "", serial: b.serial ?? "", model: b.model ?? "", osVersion: b.osVersion ?? "",
      securityPatch: b.securityPatch ?? "", imei: b.imei ?? "", simSerial: b.simSerial ?? "",
    });
    return { ...r, rest: restInfo() };
  });
  const bearer = (c: Ctx) => { const h = c.req.headers.get("authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; };
  add("POST", "/api/device/heartbeat", "none", async (c) => {
    const b = c.body;
    return sqlFn("kiosk_heartbeat", bearer(c) || String(b.token ?? ""), b.status ?? {}, Array.isArray(b.acks) ? b.acks : [],
      Array.isArray(b.apps) ? b.apps : null, b.usage && typeof b.usage === "object" ? b.usage : null, b.location && typeof b.location === "object" ? b.location : null);
  });
  add("POST", "/api/device/report", "none", async (c) =>
    sqlFn("kiosk_report", bearer(c) || String(c.body.token ?? ""), String(c.body.kind ?? "problem"), String(c.body.text ?? "")));

  // ---------- dashboard API ----------
  add("GET", "/api/overview", "read", async () => {
    await sweep();
    const [devices, rel, usage, alertRowsRaw, budget] = await Promise.all([
      all("SELECT * FROM devices"), currentRelease(), monthUsage(),
      all("SELECT a.*, d.name device_name, d.driver_name FROM alerts a LEFT JOIN devices d ON d.id=a.device_id WHERE a.active=1 ORDER BY a.ts DESC LIMIT 50"),
      setting("data_budget_mb", "2048"),
    ]);
    const counts = { total: devices.length, online: 0, stale: 0, offline: 0, lowBattery: 0, outdated: 0, notLocked: 0, pendingApproval: 0, lost: 0, problems: 0 };
    let mobile = 0, wifi = 0;
    const top: { id: number; name: string; driverName: string; mobileBytes: number }[] = [];
    for (const d of devices) {
      const st = json(d.status, {});
      counts[statusOf(d) as "online" | "stale" | "offline"]++;
      if (typeof st.battery === "number" && st.battery >= 0 && st.battery <= 20 && !st.charging) counts.lowBattery++;
      if (rel && num(st.agentVersionCode) < rel.version_code) counts.outdated++;
      if (!st.deviceOwner || st.released) counts.notLocked++;
      if (!d.approved) counts.pendingApproval++;
      if (d.lost_mode) counts.lost++;
      if (d.problem) counts.problems++;
      const u = usage.get(Number(d.id)); if (u) { mobile += u.mobileBytes; wifi += u.wifiBytes; top.push({ id: d.id, name: d.name, driverName: d.driver_name ?? "", mobileBytes: u.mobileBytes }); }
    }
    top.sort((a, b) => b.mobileBytes - a.mobileBytes);
    return {
      ...counts, currentVersion: rel?.version_name ?? null, currentVersionCode: rel?.version_code ?? 0, intervalSec: cfg.hb, push: pushOn,
      live: devices.filter((d) => json(d.status, {}).pushConnected).length,
      data: { mobileBytes: mobile, wifiBytes: wifi, budgetMb: num(budget), top: top.slice(0, 5) },
      alerts: alertRows(alertRowsRaw),
    };
  });

  add("GET", "/api/devices", "read", async (c) => {
    const q = c.query.get("q") ?? "", group = c.query.get("group") ?? "", state = c.query.get("state") ?? "";
    let [rows, usage] = await Promise.all([all("SELECT * FROM devices ORDER BY name"), monthUsage()]);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((d) => [d.name, d.driver_name, d.vehicle, d.model, d.serial, d.notes, d.imei].some((x) => String(x ?? "").toLowerCase().includes(needle)));
    }
    if (group) rows = rows.filter((d) => String(d.group_id ?? "none") === group);
    let out = await Promise.all(rows.map((d) => view(d, false, usage)));
    if (state) out = out.filter((d) => d.state === state);
    return out;
  });

  const deviceOr404 = async (id: string) => {
    const d = await get("SELECT * FROM devices WHERE id=?", Number(id));
    if (!d) throw new HttpError(404, "Not found");
    return d;
  };
  add("GET", "/api/devices/:id", "read", async (c) => view(await deviceOr404(c.params.id), true));
  add("GET", "/api/devices/:id/usage", "read", async (c) => {
    const d = await deviceOr404(c.params.id);
    const days = Math.min(Math.max(num(c.query.get("days"), 30), 1), 180);
    const today = (await get("SELECT kiosk_day(?) d", now()))!.d as string;
    const rows = await all("SELECT day, mobile_bytes::double precision m, wifi_bytes::double precision w, app_usage FROM usage_daily WHERE device_id=? ORDER BY day DESC LIMIT ?", d.id, days);
    const month = rows.filter((r) => monthOf(r.day) === monthOf(today)).reduce((a, r) => ({ mobileBytes: a.mobileBytes + num(r.m), wifiBytes: a.wifiBytes + num(r.w) }), { mobileBytes: 0, wifiBytes: 0 });
    return {
      today, budgetMb: num(await setting("data_budget_mb", "2048")), month,
      days: rows.reverse().map((r) => ({ day: r.day, mobileBytes: num(r.m), wifiBytes: num(r.w), appUsage: json(r.app_usage, {}) })),
    };
  });
  add("GET", "/api/usage", "read", async (c) => {
    const days = Math.min(Math.max(num(c.query.get("days"), 30), 1), 180);
    const rows = await all("SELECT day, SUM(mobile_bytes)::double precision m, SUM(wifi_bytes)::double precision w FROM usage_daily GROUP BY day ORDER BY day DESC LIMIT ?", days);
    const perDevice = await all("SELECT u.device_id, d.name, d.driver_name, SUM(u.mobile_bytes)::double precision m, SUM(u.wifi_bytes)::double precision w FROM usage_daily u JOIN devices d ON d.id=u.device_id WHERE left(u.day,7)=left(kiosk_day(?),7) GROUP BY u.device_id, d.name, d.driver_name ORDER BY m DESC", now());
    return {
      days: rows.reverse().map((r) => ({ day: r.day, mobileBytes: num(r.m), wifiBytes: num(r.w) })),
      month: perDevice.map((r) => ({ id: r.device_id, name: r.name, driverName: r.driver_name, mobileBytes: num(r.m), wifiBytes: num(r.w) })),
      budgetMb: num(await setting("data_budget_mb", "2048")),
    };
  });
  add("PATCH", "/api/devices/:id", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    const b = c.body;
    const sets: string[] = []; const vals: any[] = [];
    const str = (k: string, col: string, max: number) => { if (typeof b[k] === "string") { sets.push(`${col}=?`); vals.push(b[k].trim().slice(0, max)); } };
    if (typeof b.name === "string" && b.name.trim()) { sets.push("name=?"); vals.push(b.name.trim().slice(0, 60)); }
    str("driverName", "driver_name", 80); str("driverPhone", "driver_phone", 40); str("vehicle", "vehicle", 80);
    if ("groupId" in b) { sets.push("group_id=?"); vals.push(b.groupId ?? null); }
    if ("allowedOverride" in b) { sets.push("allowed_override=?"); vals.push(b.allowedOverride == null ? null : JSON.stringify(cleanApps(b.allowedOverride))); }
    if ("messageOverride" in b) { sets.push("message_override=?"); vals.push(b.messageOverride ?? null); }
    if (typeof b.notes === "string") { sets.push("notes=?"); vals.push(b.notes.slice(0, 500)); }
    if (sets.length) {
      sets.push("policy_version=policy_version+1");
      await run(`UPDATE devices SET ${sets.join(",")} WHERE id=?`, ...vals, d.id);
      await audit(who(c), "edit-device", d.name);
      await wake([d.id]);
    }
    return view((await get("SELECT * FROM devices WHERE id=?", d.id))!, true);
  });
  add("POST", "/api/devices/:id/approve", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    await run("UPDATE devices SET approved=1 WHERE id=?", d.id);
    await audit(who(c), "approve-device", d.name);
    await wake([d.id]);
    return { ok: true };
  });
  add("POST", "/api/devices/approve-all", "write", async (c) => {
    const waiting = (await all("SELECT id FROM devices WHERE approved=0")).map((r) => r.id);
    const n = waiting.length;
    await run("UPDATE devices SET approved=1 WHERE approved=0");
    await wake(waiting);
    await audit(who(c), "approve-all-devices", `${n} device(s)`);
    return { approved: n };
  });
  add("POST", "/api/devices/:id/problem/clear", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    await run("UPDATE devices SET problem='', problem_at=NULL WHERE id=?", d.id);
    await run("SELECT kiosk_clear_alert(?, 'problem')", d.id);
    await audit(who(c), "problem-cleared", d.name);
    return { ok: true };
  });

  // Removing a phone that is still locked would strand it, so by default it is first told to unlock itself
  // (`unenroll`) and is deleted from the dashboard as soon as it has received that command.
  // `?force=1` deletes immediately (lost/destroyed phones).
  add("DELETE", "/api/devices/:id", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    if (c.query.get("force") === "1" || json(d.status, {}).deviceOwner !== true) {
      await run("DELETE FROM devices WHERE id=?", d.id);
      await audit(who(c), "delete-device", d.name);
      return { ok: true, removed: true };
    }
    await run("UPDATE devices SET remove_pending=1 WHERE id=?", d.id);
    await queueCommand(d.id, "unenroll");
    await audit(who(c), "remove-device-requested", d.name);
    await wake([d.id]);
    return { ok: true, removed: false, pending: true };
  });

  // Every command except a few needs the app to be the device owner; on a phone that is only running the
  // app (installed by hand, not set up from the QR code) Android rejects them, so say so instead of queueing them.
  const NOT_MANAGED = "This phone is not managed (the app is not the device owner), so this command cannot work. Factory-reset it and set it up with the QR code.";
  async function commandPayload(type: string, body: Row) {
    if (type === "install") {
      const app = await get("SELECT * FROM managed_apps WHERE id=?", num(body.appId));
      if (!app) throw new HttpError(404, "Unknown app");
      return { pkg: app.pkg, versionCode: app.version_code, url: `${await setting("apk_base_url")}/${app.sha256}.apk`, sha256: app.sha256 };
    }
    if (type === "lost") return { message: String(body.message ?? "").slice(0, 200), phone: String(body.phone ?? "").slice(0, 40) };
    if (type === "ring") return { seconds: Math.min(Math.max(num(body.seconds, 30), 5), 300) };
    return {};
  }
  async function sendCommand(actor: string, ids: number[], type: string, body: Row = {}, strict = false) {
    if (!COMMAND_TYPES.has(type)) throw new HttpError(400, "Unknown command");
    const payload = await commandPayload(type, body);
    let n = 0, skipped = 0;
    const queuedIds: number[] = [];
    for (const id of ids) {
      const d = await get("SELECT id,status FROM devices WHERE id=?", id);
      if (!d) continue;
      if (!NO_OWNER_NEEDED.has(type) && json(d.status, {}).deviceOwner !== true) {
        if (strict) throw new HttpError(409, NOT_MANAGED);
        skipped++;
        continue;
      }
      if (type === "lost") await run("UPDATE devices SET lost_mode=1, lost_message=?, lost_phone=?, policy_version=policy_version+1 WHERE id=?", payload.message, payload.phone, id);
      if (type === "found") await run("UPDATE devices SET lost_mode=0, policy_version=policy_version+1 WHERE id=?", id);
      await queueCommand(id, type, payload);
      queuedIds.push(id);
      n++;
    }
    await audit(actor, `command:${type}`, `${n} device(s)${skipped ? `, ${skipped} not managed` : ""}${type === "install" ? ` ${payload.pkg}` : ""}`);
    await wake(queuedIds);
    return { n, skipped };
  }
  add("POST", "/api/devices/:id/commands", "write", async (c) => {
    const { n } = await sendCommand(who(c), [Number(c.params.id)], String(c.body.type), c.body, true);
    if (!n) throw new HttpError(404, "Not found");
    return { ok: true };
  });
  add("POST", "/api/commands/bulk", "write", async (c) =>
    ((r) => ({ queued: r.n, skipped: r.skipped }))(await sendCommand(who(c), (c.body.ids ?? []).map(Number), String(c.body.type), c.body)));

  // groups
  add("GET", "/api/groups", "read", async () =>
    (await all("SELECT g.*, (SELECT COUNT(*)::int FROM devices d WHERE d.group_id=g.id) AS devices FROM device_groups g ORDER BY name"))
      .map((g) => ({ id: g.id, name: g.name, message: g.message, allowedApps: json(g.allowed_apps, []), devices: g.devices })));
  add("POST", "/api/groups", "write", async (c) => {
    const b = c.body;
    if (!String(b.name ?? "").trim()) throw new HttpError(400, "Name required");
    if (await get("SELECT 1 x FROM device_groups WHERE name=?", String(b.name).trim())) throw new HttpError(409, "A group with that name exists");
    const id = await insert("INSERT INTO device_groups(name,allowed_apps,message) VALUES(?,?,?)",
      String(b.name).trim(), JSON.stringify(cleanApps(b.allowedApps)), String(b.message ?? ""));
    await audit(who(c), "create-group", b.name);
    return { id };
  });
  add("PATCH", "/api/groups/:id", "write", async (c) => {
    const g = await get("SELECT * FROM device_groups WHERE id=?", Number(c.params.id));
    if (!g) throw new HttpError(404, "Not found");
    const b = c.body;
    await run("UPDATE device_groups SET name=?, allowed_apps=?, message=? WHERE id=?",
      String(b.name ?? g.name).trim() || g.name,
      "allowedApps" in b ? JSON.stringify(cleanApps(b.allowedApps)) : g.allowed_apps,
      "message" in b ? String(b.message ?? "") : g.message, g.id);
    await bumpEpoch();
    await audit(who(c), "edit-group", g.name);
    await wakeGroup(g.id);
    return { ok: true };
  });
  add("DELETE", "/api/groups/:id", "write", async (c) => {
    const members = (await all("SELECT id FROM devices WHERE group_id=?", Number(c.params.id))).map((r) => r.id);
    await run("DELETE FROM device_groups WHERE id=?", Number(c.params.id));
    await bumpEpoch();
    await wake(members);
    await audit(who(c), "delete-group", c.params.id);
    return { ok: true };
  });

  // Catalogue of apps: everything the phones reported (system apps flagged), the managed APKs, and the fleet-wide
  // allowed list, with `allowed` = allowed on every phone (Apps page).
  add("GET", "/api/apps", "read", async () => {
    const seen = new Map<string, { pkg: string; label: string; devices: number; system: boolean; allowed: boolean }>();
    const globalApps = cleanApps(json(await setting("allowed_apps", "[]"), []));
    const allowed = new Set(globalApps.map((a) => a.pkg));
    for (const d of await all("SELECT apps FROM devices")) {
      for (const a of json(d.apps, []) as { pkg: string; label: string; system?: boolean }[]) {
        if (!a?.pkg) continue;
        const cur = seen.get(a.pkg) ?? { pkg: a.pkg, label: a.label || a.pkg, devices: 0, system: false, allowed: allowed.has(a.pkg) };
        cur.devices++;
        if (a.system) cur.system = true;
        seen.set(a.pkg, cur);
      }
    }
    for (const m of await all("SELECT DISTINCT ON (pkg) pkg, label FROM managed_apps ORDER BY pkg, version_code DESC")) {
      if (!seen.has(m.pkg)) seen.set(m.pkg, { pkg: m.pkg, label: m.label || m.pkg, devices: 0, system: false, allowed: allowed.has(m.pkg) });
    }
    for (const a of globalApps) if (!seen.has(a.pkg)) seen.set(a.pkg, { pkg: a.pkg, label: a.label, devices: 0, system: false, allowed: true });
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  // managed apps: other APKs installed silently on phones whose allowed list contains the package
  add("GET", "/api/managed-apps", "read", async () =>
    (await all("SELECT * FROM managed_apps ORDER BY pkg, version_code DESC, id DESC")).map((m) => ({
      id: m.id, pkg: m.pkg, label: m.label, versionCode: m.version_code, versionName: m.version_name, sha256: m.sha256, size: m.size, createdAt: m.created_at,
    })));
  add("PUT", "/api/managed-apps", "write", async (c) => {
    const body = await c.req.arrayBuffer();
    if (body.byteLength < 1000) throw new HttpError(400, "Send the APK as the request body");
    const pkg = (c.query.get("pkg") ?? "").trim();
    const versionCode = num(c.query.get("versionCode"));
    if (!/^[A-Za-z0-9_.]+$/.test(pkg) || !versionCode) throw new HttpError(400, "pkg and versionCode required");
    const digest = sha256Buf(body);
    await blobs.set(`${digest}.apk`, body, "application/vnd.android.package-archive");
    const label = (c.query.get("label") ?? "").trim().slice(0, 60) || pkg;
    const versionName = (c.query.get("versionName") ?? "").trim().slice(0, 30) || String(versionCode);
    const dup = await get("SELECT id FROM managed_apps WHERE sha256=?", digest);
    if (dup) await run("UPDATE managed_apps SET pkg=?, label=?, version_code=?, version_name=? WHERE id=?", pkg, label, versionCode, versionName, dup.id);
    else await run("INSERT INTO managed_apps(pkg,label,version_code,version_name,sha256,size,created_at) VALUES(?,?,?,?,?,?,?)", pkg, label, versionCode, versionName, digest, body.byteLength, now());
    await bumpEpoch();
    await audit(who(c), "upload-app", `${label} ${versionName} (${versionCode})`);
    const affected = (await all("SELECT d.id FROM devices d LEFT JOIN device_groups g ON g.id=d.group_id WHERE COALESCE(d.allowed_override, g.allowed_apps, '[]') LIKE ?", `%"${pkg}"%`)).map((r) => r.id);
    await wake(affected);
    return { ok: true, sha256: digest, devices: affected.length };
  });
  add("DELETE", "/api/managed-apps/:id", "write", async (c) => {
    const m = await get("SELECT * FROM managed_apps WHERE id=?", Number(c.params.id));
    if (!m) throw new HttpError(404, "Not found");
    await run("DELETE FROM managed_apps WHERE id=?", m.id);
    await bumpEpoch();
    await audit(who(c), "delete-app", `${m.label} ${m.version_name}`);
    return { ok: true };
  });

  // enrollment tokens + QR
  add("GET", "/api/enroll-tokens", "read", async () =>
    (await all("SELECT t.*, g.name AS group_name, (SELECT COUNT(*)::int FROM devices d WHERE d.enroll_code=t.token) AS devices FROM enroll_tokens t LEFT JOIN device_groups g ON g.id=t.group_id ORDER BY created_at DESC"))
      .map((t) => ({ token: t.token, code: showCode(t.token), label: t.label, groupId: t.group_id, groupName: t.group_name,
        expiresAt: t.expires_at, maxUses: t.max_uses, uses: t.uses, devices: num(t.devices), createdAt: t.created_at })));
  add("POST", "/api/enroll-tokens", "write", async (c) => {
    const b = c.body;
    const token = randomCode();
    const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
    await run("INSERT INTO enroll_tokens(token,label,group_id,expires_at,max_uses,created_at) VALUES(?,?,?,?,?,?)",
      token, String(b.label ?? "").trim().slice(0, 30) || "Device", b.groupId ?? null, now() + days * 86_400_000,
      Math.min(Math.max(Number(b.maxUses) || 200, 1), 5000), now());
    await audit(who(c), "create-enroll-token", b.label ?? "");
    return { token, code: showCode(token) };
  });
  add("DELETE", "/api/enroll-tokens/:token", "write", async (c) => {
    await run("DELETE FROM enroll_tokens WHERE token=?", c.params.token);
    return { ok: true };
  });

  add("GET", "/api/provisioning/:token", "read", async (c) => {
    const t = await get("SELECT * FROM enroll_tokens WHERE token=?", c.params.token);
    if (!t) throw new HttpError(404, "Unknown code");
    const rel = await currentRelease();
    if (!rel) throw new HttpError(409, "Upload an APK on the App versions page first");
    const cert = rel.cert_sha256 || (await setting("cert_sha256"));
    if (!cert) throw new HttpError(409, "Signing-certificate checksum missing (Settings page)");
    const base = baseUrl(c);
    const payload: Row = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.cofilo.kiosk/.AdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": blobs.publicBase ? `${blobs.publicBase}/kiosk-agent.apk` : `${base}/apk/latest.apk`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": cert,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": { server_url: base, enroll_token: t.token },
    };
    const wifi = await setting("wifi_ssid");
    if (wifi) {
      const pass = await setting("wifi_password");
      payload["android.app.extra.PROVISIONING_WIFI_SSID"] = wifi;
      payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = pass;
      payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = pass ? "WPA" : "NONE";
    }
    return { payload, qr: await QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: "L", margin: 2, width: 560 }) };
  });

  // releases
  add("GET", "/api/releases", "read", async () =>
    (await all("SELECT * FROM releases ORDER BY version_code DESC, id DESC")).map((r) => ({
      id: r.id, versionCode: r.version_code, versionName: r.version_name, sha256: r.sha256,
      certSha256: r.cert_sha256, size: r.size, createdAt: r.created_at,
    })));
  add("PUT", "/api/releases", "write", async (c) => {
    const body = await c.req.arrayBuffer();
    if (body.byteLength < 1000) throw new HttpError(400, "Send the APK as the request body");
    const versionCode = Number(c.query.get("versionCode"));
    const versionName = c.query.get("versionName");
    if (!versionCode || !versionName) throw new HttpError(400, "versionCode and versionName required");
    const certIn = (c.query.get("certSha256") ?? "").trim();
    if (certIn) await setSetting("cert_sha256", certIn);
    const digest = await storeRelease(body, versionCode, versionName, certIn || (await setting("cert_sha256")));
    await audit(who(c), "upload-release", `${versionName} (${versionCode})`);
    return { ok: true, sha256: digest };
  });
  add("POST", "/api/releases/rollout", "write", async (c) => {
    const rel = await currentRelease();
    if (!rel) return { queued: 0 };
    const gid = c.body.groupId ?? null;
    const rows = (await all("SELECT * FROM devices")).filter((d) =>
      (gid == null || d.group_id === gid) && num(json(d.status, {}).agentVersionCode) < rel.version_code);
    for (const d of rows) await queueCommand(d.id, "update");
    await wake(rows.map((d) => d.id));
    await audit(who(c), "rollout", `${rel.version_name} → ${rows.length} device(s)`);
    return { queued: rows.length };
  });

  // alerts
  add("GET", "/api/alerts", "read", async (c) => {
    await sweep();
    const where = c.query.get("all") === "1" ? "" : "WHERE a.active=1";
    return alertRows(await all(`SELECT a.*, d.name device_name, d.driver_name FROM alerts a LEFT JOIN devices d ON d.id=a.device_id ${where} ORDER BY a.active DESC, a.ts DESC LIMIT 300`));
  });
  add("POST", "/api/alerts/:id/dismiss", "write", async (c) => {
    await run("UPDATE alerts SET active=0, cleared_at=? WHERE id=?", now(), Number(c.params.id));
    return { ok: true };
  });
  add("POST", "/api/alerts/dismiss-all", "write", async (c) => {
    await run("UPDATE alerts SET active=0, cleared_at=? WHERE active=1", now());
    await audit(who(c), "alerts-dismissed");
    return { ok: true };
  });
  // Hourly job (pg_cron → this function): offline sweep + alert e-mails. Also usable by any external scheduler.
  add("POST", "/api/cron", "cron", async () => {
    await sweep(true);
    const mail = await emailAlerts();
    return { ok: true, ...mail };
  });

  // settings
  add("GET", "/api/settings", "read", async () => ({
    pushConfigured: pushOn,
    emailConfigured: !!env.RESEND_API_KEY,
    publicUrl: await setting("public_url"),
    restUrl: restInfo()?.url ?? null,
    pinSet: !!(await setting("pin_hash")),
    pinEnabled: (await setting("pin_enabled", "0")) === "1",
    requireApproval: (await setting("require_approval", "1")) === "1",
    require2fa: (await setting("require_2fa", "0")) === "1",
    disableDebugging: (await setting("disable_debugging", "1")) === "1",
    autoUpdate: (await setting("auto_update", "1")) === "1",
    certSha256: await setting("cert_sha256"),
    wifiSsid: await setting("wifi_ssid"),
    wifiPasswordSet: !!(await setting("wifi_password")),
    dataBudgetMb: num(await setting("data_budget_mb", "2048")),
    allowedApps: cleanApps(json(await setting("allowed_apps", "[]"), [])),
    offlineAlertHours: num(await setting("offline_alert_hours", "12")),
    alertEmails: await setting("alert_emails"),
    driverWifi: (await setting("driver_wifi", "1")) === "1",
    dispatchPhone: await setting("dispatch_phone"),
    reportLocation: (await setting("report_location", "0")) === "1",
    heartbeatSec: num(await setting("heartbeat_sec"), HEARTBEAT_SEC),
    pushHeartbeatSec: num(await setting("push_heartbeat_sec"), PUSH_HEARTBEAT_SEC),
    tz: await setting("tz", "Africa/Douala"),
  }));
  add("PUT", "/api/settings", "write", async (c) => {
    const b = c.body;
    let policyChanged = false;
    if ("pin" in b) {
      const pin = String(b.pin);
      if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, "PIN must be 4–8 digits");
      const salt = randomToken(8);
      await setSetting("pin_salt", salt);
      await setSetting("pin_hash", pinHashV2(salt, pin));
      await setSetting("pin_enabled", "1");
      policyChanged = true;
      await audit(who(c), "change-pin");
    }
    if ("pinEnabled" in b) {
      if (b.pinEnabled && !(await setting("pin_hash"))) throw new HttpError(400, "Set a PIN first");
      await setSetting("pin_enabled", b.pinEnabled ? "1" : "0");
      policyChanged = true;
      await audit(who(c), b.pinEnabled ? "enable-device-pin" : "disable-device-pin");
    }
    if ("requireApproval" in b) { await setSetting("require_approval", b.requireApproval ? "1" : "0"); await audit(who(c), "setting-require-approval", String(!!b.requireApproval)); }
    if ("require2fa" in b) {
      if (b.require2fa && !(await get("SELECT 1 x FROM admins WHERE id=? AND totp_enabled=1", c.admin!.id)))
        throw new HttpError(400, "Turn on two-factor sign-in for your own account first");
      await setSetting("require_2fa", b.require2fa ? "1" : "0");
      await audit(who(c), "setting-require-2fa", String(!!b.require2fa));
    }
    if ("disableDebugging" in b) { await setSetting("disable_debugging", b.disableDebugging ? "1" : "0"); policyChanged = true; }
    if ("autoUpdate" in b) await setSetting("auto_update", b.autoUpdate ? "1" : "0");
    if ("certSha256" in b) await setSetting("cert_sha256", String(b.certSha256).trim());
    if ("wifiSsid" in b) await setSetting("wifi_ssid", String(b.wifiSsid).trim());
    if ("wifiPassword" in b && b.wifiPassword !== "") await setSetting("wifi_password", String(b.wifiPassword));
    if ("dataBudgetMb" in b) { await setSetting("data_budget_mb", String(Math.max(0, Math.min(num(b.dataBudgetMb), 1_000_000)))); policyChanged = true; }
    if ("allowedApps" in b) {
      // apps every phone may open, on top of its group's list
      const list = cleanApps(b.allowedApps);
      await setSetting("allowed_apps", JSON.stringify(list)); policyChanged = true;
      await audit(who(c), "setting-allowed-apps", list.map((a) => a.pkg).join(", ").slice(0, 300));
    }
    if ("offlineAlertHours" in b) await setSetting("offline_alert_hours", String(Math.max(1, Math.min(num(b.offlineAlertHours, 12), 720))));
    if ("alertEmails" in b) await setSetting("alert_emails", String(b.alertEmails).trim().slice(0, 500));
    if ("driverWifi" in b) { await setSetting("driver_wifi", b.driverWifi ? "1" : "0"); policyChanged = true; }
    if ("dispatchPhone" in b) { await setSetting("dispatch_phone", String(b.dispatchPhone).trim().slice(0, 40)); policyChanged = true; }
    if ("reportLocation" in b) { await setSetting("report_location", b.reportLocation ? "1" : "0"); policyChanged = true; await audit(who(c), "setting-report-location", String(!!b.reportLocation)); }
    if ("heartbeatSec" in b) { await setSetting("heartbeat_sec", String(Math.max(60, Math.min(num(b.heartbeatSec, HEARTBEAT_SEC), 3600)))); policyChanged = true; }
    if ("pushHeartbeatSec" in b) { await setSetting("push_heartbeat_sec", String(Math.max(60, Math.min(num(b.pushHeartbeatSec, PUSH_HEARTBEAT_SEC), 7200)))); policyChanged = true; }
    if ("tz" in b && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(String(b.tz))) await setSetting("tz", String(b.tz));
    if (policyChanged) await bumpEpoch();
    cfgAt = 0;
    await audit(who(c), "change-settings");
    await wakeAll();
    return { ok: true };
  });

  // dashboard users
  add("GET", "/api/admins", "read", async () =>
    (await all("SELECT id,email,role,totp_enabled FROM admins ORDER BY email")).map((a) => ({ id: a.id, email: a.email, role: a.role, twoFactor: !!a.totp_enabled })));
  add("POST", "/api/admins", "write", async (c) => {
    const email = String(c.body.email ?? "").toLowerCase().trim();
    if (!email.includes("@")) throw new HttpError(400, "Enter a valid email");
    strongPassword(String(c.body.password ?? ""));
    if (await get("SELECT 1 x FROM admins WHERE email=?", email)) throw new HttpError(409, "That email already exists");
    await run("INSERT INTO admins(email,pass_hash,role) VALUES(?,?,?)", email, hashPassword(String(c.body.password)), c.body.role === "viewer" ? "viewer" : "admin");
    await audit(who(c), "create-admin", email);
    return { ok: true };
  });
  add("DELETE", "/api/admins/:id", "write", async (c) => {
    if (Number(c.params.id) === c.admin!.id) throw new HttpError(400, "You cannot delete yourself");
    await run("DELETE FROM admins WHERE id=?", Number(c.params.id));
    return { ok: true };
  });

  // Dashboard files are published here (scripts/publish-dashboard.mjs) when they are not bundled with the code.
  add("PUT", "/api/static", "write", async (c) => {
    if (!blobs.setStatic) throw new HttpError(409, "This deployment serves its dashboard from the bundle");
    const p = "/" + (c.query.get("path") ?? "").replace(/^\/+/, "");
    if (!/^\/[A-Za-z0-9_./-]+$/.test(p) || p.includes("..")) throw new HttpError(400, "Bad path");
    const body = await c.req.arrayBuffer();
    await blobs.setStatic(p, body, staticType(p));
    return { ok: true, path: p, size: body.byteLength };
  });

  add("GET", "/api/audit", "read", async (c) => {
    const q = (c.query.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(num(c.query.get("limit"), 200), 1), 1000);
    const rows = q
      ? await all("SELECT * FROM audit WHERE lower(actor) LIKE ? OR lower(action) LIKE ? OR lower(detail) LIKE ? ORDER BY id DESC LIMIT ?", `%${q}%`, `%${q}%`, `%${q}%`, limit)
      : await all("SELECT * FROM audit ORDER BY id DESC LIMIT ?", limit);
    return rows.map((a) => ({ ts: a.ts, actor: a.actor, action: a.action, detail: a.detail }));
  });

  // ---------- static dashboard ----------
  async function serveAsset(path: string): Promise<Response | null> {
    const a = await deps.assets?.get(path === "/" ? "/index.html" : path);
    if (!a) return null;
    const body = typeof a.body === "string" ? a.body : new Uint8Array(a.body);
    return new Response(body as BodyInit, { headers: {
      "content-type": a.type,
      "cache-control": a.immutable ? "public, max-age=31536000, immutable" : "no-cache",
      ...SECURITY_HEADERS,
    } });
  }

  /** The function may be mounted at a prefix (`/functions/v1/kiosk`); routes are matched on the path below it. */
  function stripBase(pathname: string): string | null {
    const candidates = [basePath, basePath.replace(/^\/functions\/v1/, ""), "/functions/v1/kiosk", "/kiosk"].filter(Boolean);
    for (const p of candidates) {
      if (pathname === p) return "";
      if (pathname.startsWith(p + "/")) return pathname.slice(p.length);
    }
    return basePath ? null : pathname;
  }

  // ---------- dispatcher ----------
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const t0 = performance.now(); const n0 = stats.n, ms0 = stats.ms;
    const timed = (res: Response) => {
      res.headers.set("server-timing", `total;dur=${(performance.now() - t0).toFixed(0)}, db;dur=${(stats.ms - ms0).toFixed(0)};desc="${stats.n - n0} queries"`);
      return res;
    };
    try {
      const path = stripBase(url.pathname);
      if (path === null) return reply({ error: "Not found" }, 404);
      if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
      const base = publicUrl || url.origin;
      await init(base);
      await intervals();
      if (path === "" && req.method === "GET") return Response.redirect(`${base}/${url.search}`, 302);
      let matched: Route | undefined; let params: Record<string, string> = {};
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method) continue;
        matched = r; params = { ...(m.groups ?? {}) };
        break;
      }
      if (!matched) {
        if (!pathMatched && (req.method === "GET" || req.method === "HEAD")) {
          const asset = await serveAsset(path || "/");
          if (asset) return asset;
        }
        return reply({ error: pathMatched ? "Method not allowed" : "Not found" }, pathMatched ? 405 : 404);
      }

      const ctx: Ctx = { req, url, path, params, query: url.searchParams, body: {} };
      if (matched.auth === "read" || matched.auth === "write") {
        const h = req.headers.get("authorization");
        const cookie = /(?:^|;\s*)kiosk_session=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
        const viaCookie = !h?.startsWith("Bearer ");
        const signed = verifySession(secret, viaCookie ? cookie : h!.slice(7));
        if (!signed) throw new HttpError(401, "Not signed in");
        // The account must still exist and the session must not have been revoked (password change, 2FA change).
        const acct = await get("SELECT id,email,role,session_version FROM admins WHERE id=?", signed.id);
        if (!acct || (signed.sv ?? 1) !== acct.session_version) throw new HttpError(401, "Session expired, sign in again");
        const s: Session = { ...signed, email: acct.email, role: acct.role };
        // Browser (cookie) requests that change data must carry our custom header: cross-site forms/fetches cannot.
        if (viaCookie && !["GET", "HEAD"].includes(req.method) && req.headers.get("x-requested-with") !== "confiance-dashboard")
          throw new HttpError(403, "Your dashboard page is out of date. Reload it (Ctrl+F5) and try again.");
        if (matched.auth === "write" && s.role !== "admin") throw new HttpError(403, "Read-only account");
        if (!path.startsWith("/api/me") && path !== "/api/logout" && (await needs2faSetup(s)))
          return reply({ error: "Set up two-factor sign-in on the Account page first", need2faSetup: true }, 403);
        ctx.admin = s;
      } else if (matched.auth === "cron") {
        const k = req.headers.get("x-cron-key") ?? url.searchParams.get("key") ?? "";
        if (!k || k !== (await setting("cron_key"))) throw new HttpError(401, "Bad cron key");
      }
      const rawBody = req.method === "PUT" && (path === "/api/releases" || path === "/api/managed-apps" || path === "/api/static");
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !rawBody) {
        const text = await req.text();
        if (text) {
          try { ctx.body = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
        }
      }
      const out = await matched.fn(ctx);
      return timed(withCors(out instanceof Response ? out : reply(out)));
    } catch (e: any) {
      if (e instanceof HttpError) return timed(withCors(reply({ error: e.message }, e.status)));
      console.error(e);
      return timed(withCors(reply({ error: "Server error" }, 500)));
    }
  };
}
