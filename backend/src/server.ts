import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import QRCode from "qrcode";
import type { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, openDb } from "./db.ts";
import {
  hashPassword, hashPin, randomToken, sha256, signSession, verifyPassword, verifySession, type Session,
} from "./auth.ts";

const ONLINE_MS = 3 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const NO_ACK_TYPES = new Set(["reboot", "unenroll", "update"]);
const COMMAND_TYPES = new Set(["refresh", "reboot", "lock", "release", "relock", "unenroll", "update"]);

type Row = Record<string, any>;
interface Options { db?: DatabaseSync; secret?: string; publicUrl?: string; logger?: boolean }

const json = (s: string | null | undefined, fallback: any) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

export function buildApp(opts: Options = {}): FastifyInstance {
  const db = opts.db ?? openDb();
  const secret = opts.secret ?? loadSecret();
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 250 * 1024 * 1024, trustProxy: true });

  const get = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
  const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
  const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
  const now = () => Date.now();
  const setting = (k: string, d = "") => (get("SELECT value FROM settings WHERE key=?", k)?.value as string) ?? d;
  const setSetting = (k: string, v: string) =>
    run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, v);
  const audit = (actor: string, action: string, detail = "") =>
    run("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)", now(), actor, action, detail);
  const baseUrl = (req: FastifyRequest) => (opts.publicUrl ?? process.env.PUBLIC_URL ?? `${req.protocol}://${req.headers.host}`).replace(/\/$/, "");

  app.addContentTypeParser(
    ["application/octet-stream", "application/vnd.android.package-archive"],
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  // ---------- auth helpers ----------
  const session = (req: FastifyRequest): Session | null => {
    const h = req.headers.authorization;
    const cookie = /(?:^|;\s*)kiosk_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    return verifySession(secret, h?.startsWith("Bearer ") ? h.slice(7) : cookie);
  };
  const needAdmin = (write: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const s = session(req);
    if (!s) return reply.code(401).send({ error: "Not signed in" });
    if (write && s.role !== "admin") return reply.code(403).send({ error: "Read-only account" });
    (req as any).admin = s;
  };
  const read = { preHandler: needAdmin(false) };
  const write = { preHandler: needAdmin(true) };
  const who = (req: FastifyRequest) => ((req as any).admin as Session).email;

  const deviceFor = (req: FastifyRequest): Row | undefined => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return undefined;
    return get("SELECT * FROM devices WHERE token_hash=?", sha256(h.slice(7)));
  };

  // ---------- policy ----------
  const policyEpoch = () => Number(setting("policy_epoch", "1"));
  const bumpEpoch = () => setSetting("policy_epoch", String(policyEpoch() + 1));

  function effectivePolicy(d: Row) {
    const g = d.group_id ? get("SELECT * FROM groups WHERE id=?", d.group_id) : undefined;
    const allowed = d.allowed_override != null ? json(d.allowed_override, []) : json(g?.allowed_apps, []);
    const message = d.message_override != null ? d.message_override : g?.message ?? "";
    return {
      version: d.policy_version + policyEpoch(),
      name: d.name,
      allowedApps: allowed,
      message,
      pinSalt: setting("pin_salt"),
      pinHash: setting("pin_hash"),
      disableDebugging: setting("disable_debugging", "1") === "1",
    };
  }

  const statusOf = (d: Row) => {
    const age = d.last_seen ? now() - d.last_seen : Infinity;
    return age < ONLINE_MS ? "online" : age < STALE_MS ? "stale" : "offline";
  };

  const currentRelease = () => get("SELECT * FROM releases ORDER BY version_code DESC, id DESC LIMIT 1");

  function queueCommand(deviceId: number, type: string, payload: any = {}) {
    if (type === "update" && !payload.url) {
      const rel = currentRelease();
      if (!rel) throw new Error("No release uploaded yet");
      payload = { url: `/apk/${rel.sha256}.apk`, sha256: rel.sha256, versionCode: rel.version_code };
    }
    run("INSERT INTO commands(device_id,type,payload,created_at) VALUES(?,?,?,?)",
      deviceId, type, JSON.stringify(payload), now());
  }

  const view = (d: Row, full = false) => {
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
      out.effective = effectivePolicy(d);
      out.apps = json(d.apps, []);
      out.androidId = d.android_id;
      out.commands = all("SELECT id,type,status,error,created_at,done_at FROM commands WHERE device_id=? ORDER BY id DESC LIMIT 15", d.id);
    }
    return out;
  };

  // ---------- public ----------
  app.get("/healthz", async () => ({ ok: true }));

  const attempts = new Map<string, { n: number; until: number }>();
  app.post("/api/login", async (req, reply) => {
    const { email = "", password = "" } = (req.body ?? {}) as Row;
    const key = `${req.ip}|${String(email).toLowerCase()}`;
    const a = attempts.get(key);
    if (a && a.n >= 8 && a.until > now()) return reply.code(429).send({ error: "Too many attempts, try again in a few minutes" });
    const admin = get("SELECT * FROM admins WHERE email=?", String(email).toLowerCase().trim());
    if (!admin || !verifyPassword(String(password), admin.pass_hash)) {
      attempts.set(key, { n: (a?.n ?? 0) + 1, until: now() + 5 * 60_000 });
      return reply.code(401).send({ error: "Wrong email or password" });
    }
    attempts.delete(key);
    const token = signSession(secret, { id: admin.id, email: admin.email, role: admin.role });
    reply.header("Set-Cookie", `kiosk_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${opts.publicUrl?.startsWith("https") || process.env.PUBLIC_URL?.startsWith("https") ? "; Secure" : ""}`);
    audit(admin.email, "login");
    return { email: admin.email, role: admin.role, token };
  });
  app.post("/api/logout", async (_req, reply) => {
    reply.header("Set-Cookie", "kiosk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return { ok: true };
  });
  app.get("/api/me", read, async (req) => {
    const s = (req as any).admin as Session;
    return { email: s.email, role: s.role };
  });

  // APK downloads are public on purpose: provisioning fetches them before the device has any credentials.
  app.get<{ Params: { name: string } }>("/apk/:name", async (req, reply) => {
    const name = req.params.name;
    const rel = name === "latest.apk" ? currentRelease() : get("SELECT * FROM releases WHERE sha256=?", name.replace(/\.apk$/, ""));
    const file = rel && join(DATA_DIR, "apks", `${rel.sha256}.apk`);
    if (!rel || !file || !existsSync(file)) return reply.code(404).send({ error: "No such release" });
    reply.header("Content-Type", "application/vnd.android.package-archive");
    reply.header("Content-Length", rel.size);
    reply.header("Content-Disposition", `attachment; filename="kiosk-${rel.version_name}.apk"`);
    return reply.send(createReadStream(file));
  });

  // ---------- device API ----------
  app.post("/api/device/enroll", async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    const tok = get("SELECT * FROM enroll_tokens WHERE token=?", String(b.enrollToken ?? ""));
    if (!tok || tok.expires_at < now() || tok.uses >= tok.max_uses)
      return reply.code(403).send({ error: "Invalid or expired enrollment code" });

    const deviceToken = randomToken(32);
    const existing = b.serial || b.androidId
      ? get("SELECT * FROM devices WHERE (serial=? AND serial<>'') OR (android_id=? AND android_id<>'')", b.serial ?? "", b.androidId ?? "")
      : undefined;
    let id: number; let name: string;
    if (existing) {
      id = existing.id; name = existing.name;
      run("UPDATE devices SET token_hash=?, model=?, os_version=?, last_seen=? WHERE id=?",
        sha256(deviceToken), b.model ?? "", b.osVersion ?? "", now(), id);
    } else {
      const n = (get("SELECT COUNT(*) c FROM devices")!.c as number) + 1;
      name = `${tok.label || "Device"}-${String(n).padStart(3, "0")}`;
      const r = run(
        `INSERT INTO devices(name,group_id,token_hash,android_id,serial,model,os_version,enrolled_at,last_seen)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        name, tok.group_id, sha256(deviceToken), b.androidId ?? "", b.serial ?? "", b.model ?? "", b.osVersion ?? "", now(), now());
      id = Number(r.lastInsertRowid);
    }
    run("UPDATE enroll_tokens SET uses=uses+1 WHERE token=?", tok.token);
    audit("device", "enroll", `${name} (${b.model ?? "?"})`);
    return { deviceToken, name, id };
  });

  app.post("/api/device/heartbeat", async (req, reply) => {
    const d = deviceFor(req);
    if (!d) return reply.code(401).send({ error: "Unknown device" });
    const b = (req.body ?? {}) as Row;

    for (const a of Array.isArray(b.acks) ? b.acks : []) {
      run("UPDATE commands SET status=?, error=?, done_at=? WHERE id=? AND device_id=? AND status IN ('sent','pending')",
        a.status === "done" ? "done" : "failed", String(a.error ?? "").slice(0, 300), now(), Number(a.id), d.id);
    }
    run("UPDATE devices SET status=?, last_seen=?, apps=COALESCE(?,apps) WHERE id=?",
      JSON.stringify(b.status ?? {}), now(), Array.isArray(b.apps) ? JSON.stringify(b.apps) : null, d.id);

    // Auto-update: queue an update when the device runs an older build than the newest release.
    const rel = currentRelease();
    const code = Number(b.status?.agentVersionCode ?? 0);
    if (rel && setting("auto_update", "1") === "1" && b.status?.deviceOwner && code > 0 && code < rel.version_code) {
      const pending = get("SELECT 1 x FROM commands WHERE device_id=? AND type='update' AND created_at>?", d.id, now() - 30 * 60_000);
      if (!pending) queueCommand(d.id, "update");
    }

    const cmds = all("SELECT id,type,payload FROM commands WHERE device_id=? AND status='pending' ORDER BY id LIMIT 10", d.id);
    for (const c of cmds) {
      run("UPDATE commands SET status=?, sent_at=?, done_at=? WHERE id=?",
        NO_ACK_TYPES.has(c.type) ? "done" : "sent", now(), NO_ACK_TYPES.has(c.type) ? now() : null, c.id);
    }
    const fresh = get("SELECT * FROM devices WHERE id=?", d.id)!;
    return {
      policy: effectivePolicy(fresh),
      commands: cmds.map((c) => {
        const payload = json(c.payload, {});
        if (payload.url?.startsWith("/")) payload.url = baseUrl(req) + payload.url;
        return { id: String(c.id), type: c.type, payload };
      }),
    };
  });

  // ---------- dashboard API ----------
  app.get("/api/overview", read, async () => {
    const devices = all("SELECT * FROM devices");
    const rel = currentRelease();
    const counts = { total: devices.length, online: 0, stale: 0, offline: 0, lowBattery: 0, outdated: 0, notLocked: 0 };
    for (const d of devices) {
      const st = json(d.status, {});
      counts[statusOf(d) as "online" | "stale" | "offline"]++;
      if (typeof st.battery === "number" && st.battery >= 0 && st.battery <= 20 && !st.charging) counts.lowBattery++;
      if (rel && (st.agentVersionCode ?? 0) < rel.version_code) counts.outdated++;
      if (!st.deviceOwner || st.released) counts.notLocked++;
    }
    return { ...counts, currentVersion: rel?.version_name ?? null, groups: all("SELECT COUNT(*) c FROM groups")[0].c };
  });

  app.get("/api/devices", read, async (req) => {
    const { q = "", group = "", state = "" } = req.query as Row;
    let rows = all("SELECT * FROM devices ORDER BY name");
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter((d) => [d.name, d.model, d.serial, d.notes].some((x) => String(x ?? "").toLowerCase().includes(needle)));
    }
    if (group) rows = rows.filter((d) => String(d.group_id ?? "none") === String(group));
    let out = rows.map((d) => view(d));
    if (state) out = out.filter((d) => d.state === state);
    return out;
  });

  app.get<{ Params: { id: string } }>("/api/devices/:id", read, async (req, reply) => {
    const d = get("SELECT * FROM devices WHERE id=?", Number(req.params.id));
    return d ? view(d, true) : reply.code(404).send({ error: "Not found" });
  });

  app.patch<{ Params: { id: string } }>("/api/devices/:id", write, async (req, reply) => {
    const id = Number(req.params.id);
    const d = get("SELECT * FROM devices WHERE id=?", id);
    if (!d) return reply.code(404).send({ error: "Not found" });
    const b = (req.body ?? {}) as Row;
    const sets: string[] = []; const vals: any[] = [];
    if (typeof b.name === "string" && b.name.trim()) { sets.push("name=?"); vals.push(b.name.trim().slice(0, 60)); }
    if ("groupId" in b) { sets.push("group_id=?"); vals.push(b.groupId ?? null); }
    if ("allowedOverride" in b) { sets.push("allowed_override=?"); vals.push(b.allowedOverride == null ? null : JSON.stringify(cleanApps(b.allowedOverride))); }
    if ("messageOverride" in b) { sets.push("message_override=?"); vals.push(b.messageOverride ?? null); }
    if (typeof b.notes === "string") { sets.push("notes=?"); vals.push(b.notes.slice(0, 500)); }
    if (sets.length) {
      sets.push("policy_version=policy_version+1");
      run(`UPDATE devices SET ${sets.join(",")} WHERE id=?`, ...vals, id);
      audit(who(req), "edit-device", d.name);
    }
    return view(get("SELECT * FROM devices WHERE id=?", id)!, true);
  });

  app.delete<{ Params: { id: string } }>("/api/devices/:id", write, async (req, reply) => {
    const d = get("SELECT * FROM devices WHERE id=?", Number(req.params.id));
    if (!d) return reply.code(404).send({ error: "Not found" });
    run("DELETE FROM devices WHERE id=?", d.id);
    audit(who(req), "delete-device", d.name);
    return { ok: true };
  });

  function sendCommand(actor: string, ids: number[], type: string) {
    if (!COMMAND_TYPES.has(type)) throw Object.assign(new Error("Unknown command"), { statusCode: 400 });
    let n = 0;
    for (const id of ids) {
      if (!get("SELECT 1 x FROM devices WHERE id=?", id)) continue;
      queueCommand(id, type);
      n++;
    }
    audit(actor, `command:${type}`, `${n} device(s)`);
    return n;
  }
  app.post<{ Params: { id: string } }>("/api/devices/:id/commands", write, async (req, reply) => {
    try {
      const n = sendCommand(who(req), [Number(req.params.id)], String((req.body as Row)?.type));
      return n ? { ok: true } : reply.code(404).send({ error: "Not found" });
    } catch (e: any) { return reply.code(e.statusCode ?? 400).send({ error: e.message }); }
  });
  app.post("/api/commands/bulk", write, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    try { return { queued: sendCommand(who(req), (b.ids ?? []).map(Number), String(b.type)) }; }
    catch (e: any) { return reply.code(e.statusCode ?? 400).send({ error: e.message }); }
  });

  const cleanApps = (a: any): { pkg: string; label: string }[] =>
    (Array.isArray(a) ? a : [])
      .filter((x) => x && typeof x.pkg === "string" && /^[A-Za-z0-9_.]+$/.test(x.pkg))
      .map((x) => ({ pkg: x.pkg, label: String(x.label ?? x.pkg).slice(0, 60) }));

  // groups
  app.get("/api/groups", read, async () =>
    all("SELECT g.*, (SELECT COUNT(*) FROM devices d WHERE d.group_id=g.id) AS devices FROM groups g ORDER BY name")
      .map((g) => ({ id: g.id, name: g.name, message: g.message, allowedApps: json(g.allowed_apps, []), devices: g.devices })));
  app.post("/api/groups", write, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    if (!String(b.name ?? "").trim()) return reply.code(400).send({ error: "Name required" });
    try {
      const r = run("INSERT INTO groups(name,allowed_apps,message) VALUES(?,?,?)",
        String(b.name).trim(), JSON.stringify(cleanApps(b.allowedApps)), String(b.message ?? ""));
      audit(who(req), "create-group", b.name);
      return { id: Number(r.lastInsertRowid) };
    } catch { return reply.code(409).send({ error: "A group with that name exists" }); }
  });
  app.patch<{ Params: { id: string } }>("/api/groups/:id", write, async (req, reply) => {
    const id = Number(req.params.id);
    const g = get("SELECT * FROM groups WHERE id=?", id);
    if (!g) return reply.code(404).send({ error: "Not found" });
    const b = (req.body ?? {}) as Row;
    run("UPDATE groups SET name=?, allowed_apps=?, message=? WHERE id=?",
      String(b.name ?? g.name).trim() || g.name,
      "allowedApps" in b ? JSON.stringify(cleanApps(b.allowedApps)) : g.allowed_apps,
      "message" in b ? String(b.message ?? "") : g.message, id);
    bumpEpoch();
    audit(who(req), "edit-group", g.name);
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/groups/:id", write, async (req) => {
    run("DELETE FROM groups WHERE id=?", Number(req.params.id));
    bumpEpoch();
    audit(who(req), "delete-group", req.params.id);
    return { ok: true };
  });

  // every app seen on any device, for the "allowed apps" picker
  app.get("/api/apps", read, async () => {
    const seen = new Map<string, { pkg: string; label: string; devices: number }>();
    for (const d of all("SELECT apps FROM devices")) {
      for (const a of json(d.apps, []) as { pkg: string; label: string }[]) {
        const cur = seen.get(a.pkg) ?? { pkg: a.pkg, label: a.label, devices: 0 };
        cur.devices++;
        seen.set(a.pkg, cur);
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  // enrollment tokens + QR
  app.get("/api/enroll-tokens", read, async () =>
    all("SELECT t.*, g.name AS group_name FROM enroll_tokens t LEFT JOIN groups g ON g.id=t.group_id ORDER BY created_at DESC")
      .map((t) => ({ token: t.token, label: t.label, groupId: t.group_id, groupName: t.group_name,
        expiresAt: t.expires_at, maxUses: t.max_uses, uses: t.uses, createdAt: t.created_at })));
  app.post("/api/enroll-tokens", write, async (req) => {
    const b = (req.body ?? {}) as Row;
    const token = randomToken(12);
    const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
    run("INSERT INTO enroll_tokens(token,label,group_id,expires_at,max_uses,created_at) VALUES(?,?,?,?,?,?)",
      token, String(b.label ?? "").trim().slice(0, 30) || "Device", b.groupId ?? null, now() + days * 86_400_000,
      Math.min(Math.max(Number(b.maxUses) || 200, 1), 5000), now());
    audit(who(req), "create-enroll-token", b.label ?? "");
    return { token };
  });
  app.delete<{ Params: { token: string } }>("/api/enroll-tokens/:token", write, async (req) => {
    run("DELETE FROM enroll_tokens WHERE token=?", req.params.token);
    return { ok: true };
  });

  app.get<{ Params: { token: string } }>("/api/provisioning/:token", read, async (req, reply) => {
    const t = get("SELECT * FROM enroll_tokens WHERE token=?", req.params.token);
    if (!t) return reply.code(404).send({ error: "Unknown code" });
    const rel = currentRelease();
    if (!rel) return reply.code(409).send({ error: "Upload an APK on the Releases page first" });
    const cert = rel.cert_sha256 || setting("cert_sha256");
    if (!cert) return reply.code(409).send({ error: "Signing-certificate checksum missing (Releases page)" });
    const base = baseUrl(req);
    const payload: Row = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.cofilo.kiosk/.AdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": `${base}/apk/latest.apk`,
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": cert,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": { server_url: base, enroll_token: t.token },
    };
    const wifi = setting("wifi_ssid");
    if (wifi) {
      payload["android.app.extra.PROVISIONING_WIFI_SSID"] = wifi;
      payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = setting("wifi_password");
      payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = setting("wifi_password") ? "WPA" : "NONE";
    }
    const text = JSON.stringify(payload);
    return { payload, qr: await QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 2, width: 560 }) };
  });

  // releases
  app.get("/api/releases", read, async () =>
    all("SELECT * FROM releases ORDER BY version_code DESC, id DESC").map((r) => ({
      id: r.id, versionCode: r.version_code, versionName: r.version_name, sha256: r.sha256,
      certSha256: r.cert_sha256, size: r.size, createdAt: r.created_at,
    })));
  app.put("/api/releases", write, async (req, reply) => {
    const q = req.query as Row;
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 1000) return reply.code(400).send({ error: "Send the APK as the request body" });
    const versionCode = Number(q.versionCode);
    if (!versionCode || !q.versionName) return reply.code(400).send({ error: "versionCode and versionName required" });
    const digest = sha256Buffer(body);
    mkdirSync(join(DATA_DIR, "apks"), { recursive: true });
    writeFileSync(join(DATA_DIR, "apks", `${digest}.apk`), body);
    const cert = String(q.certSha256 ?? "").trim() || setting("cert_sha256");
    if (q.certSha256) setSetting("cert_sha256", String(q.certSha256).trim());
    run("INSERT INTO releases(version_code,version_name,sha256,cert_sha256,filename,size,created_at) VALUES(?,?,?,?,?,?,?)",
      versionCode, String(q.versionName), digest, cert, `${digest}.apk`, body.length, now());
    audit(who(req), "upload-release", `${q.versionName} (${versionCode})`);
    return { ok: true, sha256: digest };
  });
  app.post("/api/releases/rollout", write, async (req) => {
    const b = (req.body ?? {}) as Row;
    const rel = currentRelease();
    if (!rel) return { queued: 0 };
    const rows = all("SELECT * FROM devices").filter((d) =>
      (b.groupId == null || d.group_id === b.groupId) && (json(d.status, {}).agentVersionCode ?? 0) < rel.version_code);
    rows.forEach((d) => queueCommand(d.id, "update"));
    audit(who(req), "rollout", `${rel.version_name} → ${rows.length} device(s)`);
    return { queued: rows.length };
  });

  // settings
  app.get("/api/settings", read, async () => ({
    pinSet: !!setting("pin_hash"),
    disableDebugging: setting("disable_debugging", "1") === "1",
    autoUpdate: setting("auto_update", "1") === "1",
    certSha256: setting("cert_sha256"),
    wifiSsid: setting("wifi_ssid"),
    wifiPasswordSet: !!setting("wifi_password"),
  }));
  app.put("/api/settings", write, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    if ("pin" in b) {
      const pin = String(b.pin);
      if (!/^\d{4,8}$/.test(pin)) return reply.code(400).send({ error: "PIN must be 4–8 digits" });
      const salt = randomToken(8);
      setSetting("pin_salt", salt);
      setSetting("pin_hash", hashPin(salt, pin));
      bumpEpoch();
      audit(who(req), "change-pin");
    }
    if ("disableDebugging" in b) { setSetting("disable_debugging", b.disableDebugging ? "1" : "0"); bumpEpoch(); }
    if ("autoUpdate" in b) setSetting("auto_update", b.autoUpdate ? "1" : "0");
    if ("certSha256" in b) setSetting("cert_sha256", String(b.certSha256).trim());
    if ("wifiSsid" in b) setSetting("wifi_ssid", String(b.wifiSsid).trim());
    if ("wifiPassword" in b && b.wifiPassword !== "") setSetting("wifi_password", String(b.wifiPassword));
    audit(who(req), "change-settings");
    return { ok: true };
  });

  // admins
  app.get("/api/admins", read, async () => all("SELECT id,email,role FROM admins ORDER BY email"));
  app.post("/api/admins", write, async (req, reply) => {
    const b = (req.body ?? {}) as Row;
    const email = String(b.email ?? "").toLowerCase().trim();
    if (!email.includes("@") || String(b.password ?? "").length < 8)
      return reply.code(400).send({ error: "Valid email and a password of 8+ characters required" });
    try {
      run("INSERT INTO admins(email,pass_hash,role) VALUES(?,?,?)", email, hashPassword(String(b.password)), b.role === "viewer" ? "viewer" : "admin");
      audit(who(req), "create-admin", email);
      return { ok: true };
    } catch { return reply.code(409).send({ error: "That email already exists" }); }
  });
  app.delete<{ Params: { id: string } }>("/api/admins/:id", write, async (req, reply) => {
    const id = Number(req.params.id);
    if (id === ((req as any).admin as Session).id) return reply.code(400).send({ error: "You cannot delete yourself" });
    run("DELETE FROM admins WHERE id=?", id);
    return { ok: true };
  });

  app.get("/api/audit", read, async () =>
    all("SELECT * FROM audit ORDER BY id DESC LIMIT 200").map((a) => ({ ts: a.ts, actor: a.actor, action: a.action, detail: a.detail })));

  // ---------- static dashboard ----------
  app.register(fastifyStatic, { root: new URL("../public", import.meta.url).pathname });

  // first admin from the environment
  if (!get("SELECT 1 x FROM admins")) {
    const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
    const pw = process.env.ADMIN_PASSWORD ?? "";
    if (email && pw.length >= 8) {
      run("INSERT INTO admins(email,pass_hash,role) VALUES(?,?,'admin')", email, hashPassword(pw));
    } else if (opts.logger !== false) {
      console.warn("No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) and restart.");
    }
  }
  return app;
}

import { createHash } from "node:crypto";
const sha256Buffer = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = join(DATA_DIR, "session.secret");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  const s = randomToken(32);
  writeFileSync(f, s, { mode: 0o600 });
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 8080);
  app.listen({ port, host: "0.0.0.0" }).catch((e) => { console.error(e); process.exit(1); });
}
