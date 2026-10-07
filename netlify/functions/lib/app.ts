import QRCode from "qrcode";
import { createHash } from "node:crypto";
import type { BlobStore, Db } from "./db.ts";
import { toPg } from "./db.ts";
import {
  hashPassword, hashPin, randomToken, sha256, signSession, verifyPassword, verifySession, type Session,
} from "./auth.ts";

// Phones check in every HEARTBEAT_SEC. "online" tolerates two missed check-ins.
export const HEARTBEAT_SEC = 300;
const ONLINE_MS = 12 * 60_000;
const STALE_MS = 30 * 60_000;
const NO_ACK_TYPES = new Set(["reboot", "unenroll", "update"]);
const COMMAND_TYPES = new Set(["refresh", "reboot", "lock", "release", "relock", "unenroll", "update"]);

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
  /** Optional first release shipped with the deploy; installed on first request if no release exists. */
  loadSeed?: () => Promise<Seed | null>;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (s: string | null | undefined, fallback: any) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
const sha256Buf = (b: ArrayBuffer) => createHash("sha256").update(Buffer.from(b)).digest("hex");

interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Row;
  admin?: Session;
  device?: Row;
}
type Handler = (c: Ctx) => Promise<unknown | Response>;
type Auth = "none" | "read" | "write" | "device";
interface Route { method: string; re: RegExp; auth: Auth; fn: Handler }

export function createApp(deps: Deps): (req: Request) => Promise<Response> {
  const { db, blobs, env } = deps;
  const get = async (sql: string, ...p: any[]) => (await db.query(toPg(sql), p))[0] as Row | undefined;
  const all = (sql: string, ...p: any[]) => db.query(toPg(sql), p) as Promise<Row[]>;
  const run = async (sql: string, ...p: any[]) => { await db.query(toPg(sql), p); };
  const insert = async (sql: string, ...p: any[]) => Number((await db.query(toPg(sql + " RETURNING id"), p))[0].id);
  const now = () => Date.now();

  const setting = async (k: string, d = "") => ((await get("SELECT value FROM settings WHERE key=?", k))?.value as string) ?? d;
  const setSetting = (k: string, v: string) =>
    run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, v);
  const audit = (actor: string, action: string, detail = "") =>
    run("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)", now(), actor, action, String(detail));

  const secret = env.SESSION_SECRET ?? "";

  // ---------- one-time init: first admin + bundled first release ----------
  let initP: Promise<void> | null = null;
  const init = () => (initP ??= (async () => {
    const admins = await get("SELECT 1 x FROM admins");
    const email = (env.ADMIN_EMAIL ?? "").toLowerCase().trim();
    const pw = env.ADMIN_PASSWORD ?? "";
    if (!admins && email && pw.length >= 8) {
      await run("INSERT INTO admins(email,pass_hash,role) VALUES(?,?,'admin') ON CONFLICT(email) DO NOTHING", email, hashPassword(pw));
    }
    if (!(await get("SELECT 1 x FROM releases")) && deps.loadSeed) {
      const seed = await deps.loadSeed();
      if (seed) await storeRelease(seed.apk, seed.versionCode, seed.versionName, seed.certSha256);
    }
  })().catch((e) => { initP = null; throw e; }));

  async function storeRelease(apk: ArrayBuffer, versionCode: number, versionName: string, cert: string) {
    const digest = sha256Buf(apk);
    await blobs.set(digest, apk);
    await run("INSERT INTO releases(version_code,version_name,sha256,cert_sha256,size,created_at) VALUES(?,?,?,?,?,?)",
      versionCode, versionName, digest, cert, apk.byteLength, now());
    return digest;
  }

  const currentRelease = () => get("SELECT * FROM releases ORDER BY version_code DESC, id DESC LIMIT 1");

  // ---------- policy ----------
  const policyEpoch = async () => Number(await setting("policy_epoch", "1"));
  const bumpEpoch = async () => setSetting("policy_epoch", String((await policyEpoch()) + 1));

  async function effectivePolicy(d: Row) {
    const g = d.group_id ? await get("SELECT * FROM device_groups WHERE id=?", d.group_id) : undefined;
    return {
      version: d.policy_version + (await policyEpoch()),
      name: d.name,
      allowedApps: d.allowed_override != null ? json(d.allowed_override, []) : json(g?.allowed_apps, []),
      message: d.message_override != null ? d.message_override : g?.message ?? "",
      pinSalt: await setting("pin_salt"),
      pinHash: await setting("pin_hash"),
      disableDebugging: (await setting("disable_debugging", "1")) === "1",
      intervalSec: HEARTBEAT_SEC,
    };
  }

  const statusOf = (d: Row) => {
    const age = d.last_seen ? now() - d.last_seen : Infinity;
    return age < ONLINE_MS ? "online" : age < STALE_MS ? "stale" : "offline";
  };

  async function queueCommand(deviceId: number, type: string, payload: any = {}) {
    if (type === "update" && !payload.url) {
      const rel = await currentRelease();
      if (!rel) throw new HttpError(409, "No release uploaded yet");
      payload = { url: `/apk/${rel.sha256}.apk`, sha256: rel.sha256, versionCode: rel.version_code };
    }
    await run("INSERT INTO commands(device_id,type,payload,created_at) VALUES(?,?,?,?)", deviceId, type, JSON.stringify(payload), now());
  }

  const view = async (d: Row, full = false) => {
    const status = json(d.status, {});
    const out: Row = {
      id: d.id, name: d.name, groupId: d.group_id, model: d.model, osVersion: d.os_version,
      serial: d.serial, lastSeen: d.last_seen, state: statusOf(d), enrolledAt: d.enrolled_at,
      battery: status.battery ?? null, charging: !!status.charging, network: status.network ?? null,
      agentVersion: status.agentVersion ?? null, agentVersionCode: status.agentVersionCode ?? 0,
      deviceOwner: !!status.deviceOwner, released: !!status.released,
      freeStorageMb: status.freeStorageMb ?? null, uptimeMin: status.uptimeMin ?? null, notes: d.notes,
      hasOverride: d.allowed_override != null,
    };
    if (full) {
      out.allowedOverride = d.allowed_override != null ? json(d.allowed_override, []) : null;
      out.messageOverride = d.message_override;
      out.effective = await effectivePolicy(d);
      out.apps = json(d.apps, []);
      out.androidId = d.android_id;
      out.commands = await all("SELECT id,type,status,error,created_at,done_at FROM commands WHERE device_id=? ORDER BY id DESC LIMIT 15", d.id);
    }
    return out;
  };

  const cleanApps = (a: any): { pkg: string; label: string }[] =>
    (Array.isArray(a) ? a : [])
      .filter((x) => x && typeof x.pkg === "string" && /^[A-Za-z0-9_.]+$/.test(x.pkg))
      .map((x) => ({ pkg: x.pkg, label: String(x.label ?? x.pkg).slice(0, 60) }));

  const baseUrl = (c: Ctx) => (env.PUBLIC_URL || c.url.origin).replace(/\/$/, "");
  const isHttps = (c: Ctx) => c.url.protocol === "https:" || (env.PUBLIC_URL ?? "").startsWith("https");

  // ---------- routes ----------
  const routes: Route[] = [];
  const add = (method: string, path: string, auth: Auth, fn: Handler) =>
    routes.push({ method, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), auth, fn });
  const who = (c: Ctx) => c.admin!.email;
  const reply = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

  add("GET", "/healthz", "none", async () => ({ ok: true }));

  add("POST", "/api/login", "none", async (c) => {
    const email = String(c.body.email ?? "").toLowerCase().trim();
    const key = `${c.req.headers.get("x-nf-client-connection-ip") ?? "ip"}|${email}`;
    const a = await get("SELECT * FROM login_attempts WHERE key=?", key);
    if (a && a.n >= 8 && a.until_ts > now()) throw new HttpError(429, "Too many attempts, try again in a few minutes");
    const admin = await get("SELECT * FROM admins WHERE email=?", email);
    if (!admin || !verifyPassword(String(c.body.password ?? ""), admin.pass_hash)) {
      await run("INSERT INTO login_attempts(key,n,until_ts) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=login_attempts.n+1, until_ts=excluded.until_ts",
        key, now() + 5 * 60_000);
      throw new HttpError(401, "Wrong email or password");
    }
    await run("DELETE FROM login_attempts WHERE key=?", key);
    const token = signSession(secret, { id: admin.id, email: admin.email, role: admin.role });
    await audit(admin.email, "login");
    return reply({ email: admin.email, role: admin.role, token }, 200, {
      "set-cookie": `kiosk_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isHttps(c) ? "; Secure" : ""}`,
    });
  });
  add("POST", "/api/logout", "none", async () =>
    reply({ ok: true }, 200, { "set-cookie": "kiosk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }));
  add("GET", "/api/me", "read", async (c) => ({ email: c.admin!.email, role: c.admin!.role }));

  // APK downloads are public on purpose: provisioning fetches them before the device has credentials.
  add("GET", "/apk/:name", "none", async (c) => {
    const name = c.params.name;
    const rel = name === "latest.apk" ? await currentRelease() : await get("SELECT * FROM releases WHERE sha256=?", name.replace(/\.apk$/, ""));
    const data = rel ? await blobs.get(rel.sha256) : null;
    if (!rel || !data) throw new HttpError(404, "No such release");
    return new Response(data, { headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(data.byteLength),
      "content-disposition": `attachment; filename="kiosk-${rel.version_name}.apk"`,
      "cache-control": name === "latest.apk" ? "no-cache" : "public, max-age=31536000, immutable",
    } });
  });

  // ---------- device API ----------
  add("POST", "/api/device/enroll", "none", async (c) => {
    const b = c.body;
    const tok = await get("SELECT * FROM enroll_tokens WHERE token=?", String(b.enrollToken ?? ""));
    if (!tok || tok.expires_at < now() || tok.uses >= tok.max_uses) throw new HttpError(403, "Invalid or expired enrollment code");
    const deviceToken = randomToken(32);
    const existing = b.serial || b.androidId
      ? await get("SELECT * FROM devices WHERE (serial=? AND serial<>'') OR (android_id=? AND android_id<>'')", b.serial ?? "", b.androidId ?? "")
      : undefined;
    let id: number; let name: string;
    if (existing) {
      id = existing.id; name = existing.name;
      await run("UPDATE devices SET token_hash=?, model=?, os_version=?, last_seen=? WHERE id=?",
        sha256(deviceToken), b.model ?? "", b.osVersion ?? "", now(), id);
    } else {
      const n = Number((await get("SELECT COUNT(*)::int c FROM devices"))!.c) + 1;
      name = `${tok.label || "Device"}-${String(n).padStart(3, "0")}`;
      id = await insert(
        `INSERT INTO devices(name,group_id,token_hash,android_id,serial,model,os_version,enrolled_at,last_seen)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        name, tok.group_id, sha256(deviceToken), b.androidId ?? "", b.serial ?? "", b.model ?? "", b.osVersion ?? "", now(), now());
    }
    await run("UPDATE enroll_tokens SET uses=uses+1 WHERE token=?", tok.token);
    await audit("device", "enroll", `${name} (${b.model ?? "?"})`);
    return { deviceToken, name, id };
  });

  add("POST", "/api/device/heartbeat", "device", async (c) => {
    const d = c.device!;
    const b = c.body;
    for (const a of Array.isArray(b.acks) ? b.acks : []) {
      await run("UPDATE commands SET status=?, error=?, done_at=? WHERE id=? AND device_id=? AND status IN ('sent','pending')",
        a.status === "done" ? "done" : "failed", String(a.error ?? "").slice(0, 300), now(), Number(a.id), d.id);
    }
    await run("UPDATE devices SET status=?, last_seen=?, apps=COALESCE(?,apps) WHERE id=?",
      JSON.stringify(b.status ?? {}), now(), Array.isArray(b.apps) ? JSON.stringify(b.apps) : null, d.id);

    // Auto-update: queue an update when the device runs an older build than the newest release.
    const rel = await currentRelease();
    const code = Number(b.status?.agentVersionCode ?? 0);
    if (rel && (await setting("auto_update", "1")) === "1" && b.status?.deviceOwner && code > 0 && code < rel.version_code) {
      const pending = await get("SELECT 1 x FROM commands WHERE device_id=? AND type='update' AND created_at>?", d.id, now() - 30 * 60_000);
      if (!pending) await queueCommand(d.id, "update");
    }

    const cmds = await all("SELECT id,type,payload FROM commands WHERE device_id=? AND status='pending' ORDER BY id LIMIT 10", d.id);
    for (const cmd of cmds) {
      const instant = NO_ACK_TYPES.has(cmd.type);
      await run("UPDATE commands SET status=?, sent_at=?, done_at=? WHERE id=?", instant ? "done" : "sent", now(), instant ? now() : null, cmd.id);
    }
    const fresh = (await get("SELECT * FROM devices WHERE id=?", d.id))!;
    return {
      policy: await effectivePolicy(fresh),
      commands: cmds.map((cmd) => {
        const payload = json(cmd.payload, {});
        if (payload.url?.startsWith("/")) payload.url = baseUrl(c) + payload.url;
        return { id: String(cmd.id), type: cmd.type, payload };
      }),
    };
  });

  // ---------- dashboard API ----------
  add("GET", "/api/overview", "read", async () => {
    const devices = await all("SELECT * FROM devices");
    const rel = await currentRelease();
    const counts = { total: devices.length, online: 0, stale: 0, offline: 0, lowBattery: 0, outdated: 0, notLocked: 0 };
    for (const d of devices) {
      const st = json(d.status, {});
      counts[statusOf(d) as "online" | "stale" | "offline"]++;
      if (typeof st.battery === "number" && st.battery >= 0 && st.battery <= 20 && !st.charging) counts.lowBattery++;
      if (rel && (st.agentVersionCode ?? 0) < rel.version_code) counts.outdated++;
      if (!st.deviceOwner || st.released) counts.notLocked++;
    }
    return { ...counts, currentVersion: rel?.version_name ?? null, intervalSec: HEARTBEAT_SEC };
  });

  add("GET", "/api/devices", "read", async (c) => {
    const q = c.query.get("q") ?? "", group = c.query.get("group") ?? "", state = c.query.get("state") ?? "";
    let rows = await all("SELECT * FROM devices ORDER BY name");
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((d) => [d.name, d.model, d.serial, d.notes].some((x) => String(x ?? "").toLowerCase().includes(needle)));
    }
    if (group) rows = rows.filter((d) => String(d.group_id ?? "none") === group);
    let out = await Promise.all(rows.map((d) => view(d)));
    if (state) out = out.filter((d) => d.state === state);
    return out;
  });

  const deviceOr404 = async (id: string) => {
    const d = await get("SELECT * FROM devices WHERE id=?", Number(id));
    if (!d) throw new HttpError(404, "Not found");
    return d;
  };
  add("GET", "/api/devices/:id", "read", async (c) => view(await deviceOr404(c.params.id), true));
  add("PATCH", "/api/devices/:id", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    const b = c.body;
    const sets: string[] = []; const vals: any[] = [];
    if (typeof b.name === "string" && b.name.trim()) { sets.push("name=?"); vals.push(b.name.trim().slice(0, 60)); }
    if ("groupId" in b) { sets.push("group_id=?"); vals.push(b.groupId ?? null); }
    if ("allowedOverride" in b) { sets.push("allowed_override=?"); vals.push(b.allowedOverride == null ? null : JSON.stringify(cleanApps(b.allowedOverride))); }
    if ("messageOverride" in b) { sets.push("message_override=?"); vals.push(b.messageOverride ?? null); }
    if (typeof b.notes === "string") { sets.push("notes=?"); vals.push(b.notes.slice(0, 500)); }
    if (sets.length) {
      sets.push("policy_version=policy_version+1");
      await run(`UPDATE devices SET ${sets.join(",")} WHERE id=?`, ...vals, d.id);
      await audit(who(c), "edit-device", d.name);
    }
    return view((await get("SELECT * FROM devices WHERE id=?", d.id))!, true);
  });
  add("DELETE", "/api/devices/:id", "write", async (c) => {
    const d = await deviceOr404(c.params.id);
    await run("DELETE FROM devices WHERE id=?", d.id);
    await audit(who(c), "delete-device", d.name);
    return { ok: true };
  });

  async function sendCommand(actor: string, ids: number[], type: string) {
    if (!COMMAND_TYPES.has(type)) throw new HttpError(400, "Unknown command");
    let n = 0;
    for (const id of ids) {
      if (!(await get("SELECT 1 x FROM devices WHERE id=?", id))) continue;
      await queueCommand(id, type);
      n++;
    }
    await audit(actor, `command:${type}`, `${n} device(s)`);
    return n;
  }
  add("POST", "/api/devices/:id/commands", "write", async (c) => {
    const n = await sendCommand(who(c), [Number(c.params.id)], String(c.body.type));
    if (!n) throw new HttpError(404, "Not found");
    return { ok: true };
  });
  add("POST", "/api/commands/bulk", "write", async (c) =>
    ({ queued: await sendCommand(who(c), (c.body.ids ?? []).map(Number), String(c.body.type)) }));

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
    return { ok: true };
  });
  add("DELETE", "/api/groups/:id", "write", async (c) => {
    await run("DELETE FROM device_groups WHERE id=?", Number(c.params.id));
    await bumpEpoch();
    await audit(who(c), "delete-group", c.params.id);
    return { ok: true };
  });

  add("GET", "/api/apps", "read", async () => {
    const seen = new Map<string, { pkg: string; label: string; devices: number }>();
    for (const d of await all("SELECT apps FROM devices")) {
      for (const a of json(d.apps, []) as { pkg: string; label: string }[]) {
        const cur = seen.get(a.pkg) ?? { pkg: a.pkg, label: a.label, devices: 0 };
        cur.devices++;
        seen.set(a.pkg, cur);
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  // enrollment tokens + QR
  add("GET", "/api/enroll-tokens", "read", async () =>
    (await all("SELECT t.*, g.name AS group_name FROM enroll_tokens t LEFT JOIN device_groups g ON g.id=t.group_id ORDER BY created_at DESC"))
      .map((t) => ({ token: t.token, label: t.label, groupId: t.group_id, groupName: t.group_name,
        expiresAt: t.expires_at, maxUses: t.max_uses, uses: t.uses, createdAt: t.created_at })));
  add("POST", "/api/enroll-tokens", "write", async (c) => {
    const b = c.body;
    const token = randomToken(12);
    const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
    await run("INSERT INTO enroll_tokens(token,label,group_id,expires_at,max_uses,created_at) VALUES(?,?,?,?,?,?)",
      token, String(b.label ?? "").trim().slice(0, 30) || "Device", b.groupId ?? null, now() + days * 86_400_000,
      Math.min(Math.max(Number(b.maxUses) || 200, 1), 5000), now());
    await audit(who(c), "create-enroll-token", b.label ?? "");
    return { token };
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
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": `${base}/apk/latest.apk`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": cert,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
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
      (gid == null || d.group_id === gid) && (json(d.status, {}).agentVersionCode ?? 0) < rel.version_code);
    for (const d of rows) await queueCommand(d.id, "update");
    await audit(who(c), "rollout", `${rel.version_name} → ${rows.length} device(s)`);
    return { queued: rows.length };
  });

  // settings
  add("GET", "/api/settings", "read", async () => ({
    pinSet: !!(await setting("pin_hash")),
    disableDebugging: (await setting("disable_debugging", "1")) === "1",
    autoUpdate: (await setting("auto_update", "1")) === "1",
    certSha256: await setting("cert_sha256"),
    wifiSsid: await setting("wifi_ssid"),
    wifiPasswordSet: !!(await setting("wifi_password")),
  }));
  add("PUT", "/api/settings", "write", async (c) => {
    const b = c.body;
    if ("pin" in b) {
      const pin = String(b.pin);
      if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, "PIN must be 4–8 digits");
      const salt = randomToken(8);
      await setSetting("pin_salt", salt);
      await setSetting("pin_hash", hashPin(salt, pin));
      await bumpEpoch();
      await audit(who(c), "change-pin");
    }
    if ("disableDebugging" in b) { await setSetting("disable_debugging", b.disableDebugging ? "1" : "0"); await bumpEpoch(); }
    if ("autoUpdate" in b) await setSetting("auto_update", b.autoUpdate ? "1" : "0");
    if ("certSha256" in b) await setSetting("cert_sha256", String(b.certSha256).trim());
    if ("wifiSsid" in b) await setSetting("wifi_ssid", String(b.wifiSsid).trim());
    if ("wifiPassword" in b && b.wifiPassword !== "") await setSetting("wifi_password", String(b.wifiPassword));
    await audit(who(c), "change-settings");
    return { ok: true };
  });

  // dashboard users
  add("GET", "/api/admins", "read", async () => all("SELECT id,email,role FROM admins ORDER BY email"));
  add("POST", "/api/admins", "write", async (c) => {
    const email = String(c.body.email ?? "").toLowerCase().trim();
    if (!email.includes("@") || String(c.body.password ?? "").length < 8)
      throw new HttpError(400, "Valid email and a password of 8+ characters required");
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

  add("GET", "/api/audit", "read", async () =>
    (await all("SELECT * FROM audit ORDER BY id DESC LIMIT 200")).map((a) => ({ ts: a.ts, actor: a.actor, action: a.action, detail: a.detail })));

  // ---------- dispatcher ----------
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    try {
      let matched: Route | undefined; let params: Record<string, string> = {};
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method) continue;
        matched = r; params = { ...(m.groups ?? {}) };
        break;
      }
      if (!matched) return reply({ error: pathMatched ? "Method not allowed" : "Not found" }, pathMatched ? 405 : 404);
      if (!secret) throw new HttpError(500, "SESSION_SECRET is not configured");
      await init();

      const ctx: Ctx = { req, url, params, query: url.searchParams, body: {} };
      if (matched.auth === "read" || matched.auth === "write") {
        const h = req.headers.get("authorization");
        const cookie = /(?:^|;\s*)kiosk_session=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
        const s = verifySession(secret, h?.startsWith("Bearer ") ? h.slice(7) : cookie);
        if (!s) throw new HttpError(401, "Not signed in");
        if (matched.auth === "write" && s.role !== "admin") throw new HttpError(403, "Read-only account");
        ctx.admin = s;
      } else if (matched.auth === "device") {
        const h = req.headers.get("authorization");
        const d = h?.startsWith("Bearer ") ? await get("SELECT * FROM devices WHERE token_hash=?", sha256(h.slice(7))) : undefined;
        if (!d) throw new HttpError(401, "Unknown device");
        ctx.device = d;
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !(req.method === "PUT" && url.pathname === "/api/releases")) {
        const text = await req.text();
        if (text) {
          try { ctx.body = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
        }
      }
      const out = await matched.fn(ctx);
      return out instanceof Response ? out : reply(out);
    } catch (e: any) {
      if (e instanceof HttpError) return reply({ error: e.message }, e.status);
      console.error(e);
      return reply({ error: "Server error" }, 500);
    }
  };
}
