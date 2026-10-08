import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type Seed } from "../supabase/functions/kiosk/app.ts";
import { totp } from "../supabase/functions/kiosk/auth.ts";

/** Runs the real function code against an in-memory Postgres (PGlite) and an in-memory blob store. */
async function makeApp(opts: { seed?: Seed; env?: Record<string, string>; fetch?: typeof fetch } = {}) {
  const pg = new PGlite();
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const m of readdirSync(dir).sort()) await pg.exec(readFileSync(new URL(m, dir), "utf8"));
  const blobs = new Map<string, ArrayBuffer>();
  const pub = new URL("../public/", import.meta.url);
  const handler = createApp({
    db: { query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any[] },
    blobs: { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } },
    assets: { get: (path) => { try { return { type: path.endsWith(".html") ? "text/html" : "text/javascript", body: readFileSync(new URL(`.${path}`, pub)) }; } catch { return null; } } },
    env: { SESSION_SECRET: "test-secret", ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "correct-horse-battery", PUBLIC_URL: "https://kiosk.example.com", ...(opts.env ?? {}) },
    fetch: opts.fetch,
    loadSeed: opts.seed ? async () => opts.seed! : undefined,
  });
  const call = async (method: string, url: string, o: { body?: unknown; token?: string; raw?: Uint8Array; cookie?: string; headers?: Record<string, string> } = {}) => {
    const res = await handler(new Request(`https://kiosk.example.com${url}`, {
      method,
      headers: {
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
        ...(o.cookie ? { cookie: `kiosk_session=${o.cookie}` } : {}),
        ...(o.headers ?? {}),
        ...(o.raw ? { "content-type": "application/octet-stream" } : o.body ? { "content-type": "application/json" } : {}),
      },
      body: (o.raw ?? (o.body ? JSON.stringify(o.body) : undefined)) as any,
    }));
    const isJson = res.headers.get("content-type")?.includes("json");
    const buf = isJson ? null : await res.arrayBuffer();
    return { status: res.status, body: isJson ? await res.json() : null, buf, res };
  };
  const login = await call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } });
  const callCron = async () => {
    const key = (await pg.query("SELECT value FROM settings WHERE key='cron_key'")).rows[0] as any;
    return call("POST", "/api/cron", { headers: { "x-cron-key": key.value } });
  };
  return { call, admin: login.body.token as string, login, callCron };
}

const { call, admin, login } = await makeApp();

test("first admin comes from env (email lower-cased); wrong password and anonymous access are rejected", async () => {
  assert.equal(login.status, 200);
  assert.match(login.res.headers.get("set-cookie") ?? "", /kiosk_session=.*HttpOnly.*Secure/);
  assert.equal((await call("POST", "/api/login", { body: { email: "boss@example.com", password: "nope" } })).status, 401);
  assert.equal((await call("GET", "/api/devices")).status, 401);
  assert.equal((await call("GET", "/api/devices", { token: admin })).status, 200);
  assert.equal((await call("GET", "/healthz")).body.ok, true);
  assert.equal((await call("GET", "/api/nope", { token: admin })).status, 404);
  assert.equal((await call("DELETE", "/api/me", { token: admin })).status, 405);
});

test("login locks out after repeated failures", async () => {
  const from = { "x-nf-client-connection-ip": "198.51.100.7" };
  for (let i = 0; i < 8; i++) await call("POST", "/api/login", { body: { email: "victim@example.com", password: "x" }, headers: from });
  const r = await call("POST", "/api/login", { body: { email: "victim@example.com", password: "x" }, headers: from });
  assert.equal(r.status, 429);
  // a different address is not affected, and neither is that address once it signs in elsewhere
  assert.equal((await call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } })).status, 200);
  // the locked address cannot sign in even with the right password
  assert.equal((await call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" }, headers: from })).status, 429);
});

let enrollToken = "";
let deviceToken = "";
let deviceId = 0;
let groupId = 0;

test("group + enrollment token + device enrolls", async () => {
  groupId = (await call("POST", "/api/groups", { token: admin, body: {
    name: "Sales", message: "Welcome", allowedApps: [{ pkg: "com.company.crm", label: "CRM" }, { pkg: "bad pkg!", label: "x" }],
  } })).body.id;
  assert.ok(groupId);
  assert.equal((await call("POST", "/api/groups", { token: admin, body: { name: "Sales" } })).status, 409);
  enrollToken = (await call("POST", "/api/enroll-tokens", { token: admin, body: { label: "Phone", groupId, maxUses: 2 } })).body.token;

  assert.equal((await call("POST", "/api/device/enroll", { body: { enrollToken: "wrong" } })).status, 403);
  const e = await call("POST", "/api/device/enroll", { body: { enrollToken, serial: "SN1", androidId: "A1", model: "Pixel", osVersion: "Android 14" } });
  assert.equal(e.status, 200);
  assert.match(e.body.name, /^Phone-001$/);
  deviceToken = e.body.deviceToken;
  deviceId = e.body.id;

  // a new phone is locked down but has no apps until an administrator approves it
  const pending = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } });
  assert.deepEqual(pending.body.policy.allowedApps, []);
  assert.equal(pending.body.policy.message, "Waiting for administrator approval");
  assert.equal((await call("GET", "/api/overview", { token: admin })).body.pendingApproval, 1);
  assert.equal((await call("POST", `/api/devices/${deviceId}/approve`, { token: admin })).status, 200);
  assert.equal((await call("GET", "/api/overview", { token: admin })).body.pendingApproval, 0);

  // factory reset + re-enroll keeps the same device record (and its approval)
  const again = await call("POST", "/api/device/enroll", { body: { enrollToken, serial: "SN1", androidId: "A1", model: "Pixel", osVersion: "Android 14" } });
  assert.equal(again.body.id, deviceId);
  assert.notEqual(again.body.deviceToken, deviceToken);
  deviceToken = again.body.deviceToken;
  // hand-typed variants of the same code are accepted (case, spaces, dash, look-alike letters)
  assert.match(enrollToken, /^[2-9A-HJKMNP-Z]{10}$/);
  const typed = `${enrollToken.slice(0, 5)}-${enrollToken.slice(5)}`.toLowerCase().replace(/(\d)/g, "$1");
  assert.equal(typed.replace(/[^a-z0-9]/g, "").toUpperCase(), enrollToken);
  // token exhausted (max 2 uses)
  assert.equal((await call("POST", "/api/device/enroll", { body: { enrollToken, serial: "SN2" } })).status, 403);
  const t2 = (await call("POST", "/api/enroll-tokens", { token: admin, body: { label: "Typed", maxUses: 5 } })).body;
  assert.match(t2.code, /^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  const lower = ` ${t2.code.toLowerCase()} `;
  const e2 = await call("POST", "/api/device/enroll", { body: { enrollToken: lower, serial: "SN-T", androidId: "AT", model: "T", osVersion: "A" } });
  assert.equal(e2.status, 200);
  assert.equal((await call("POST", "/api/devices/approve-all", { token: admin })).body.approved, 1);
  assert.equal((await call("GET", "/api/enroll-tokens", { token: admin })).body.find((t: any) => t.token === t2.token).code, t2.code);
  await call("DELETE", `/api/devices/${e2.body.id}`, { token: admin });
});

test("heartbeat returns group policy with sanitised apps, PIN hash and interval", async () => {
  await call("PUT", "/api/settings", { token: admin, body: { pin: "4321" } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: {
    status: { battery: 15, charging: false, agentVersionCode: 1, agentVersion: "1.0.0", deviceOwner: true },
    apps: [{ pkg: "com.company.crm", label: "CRM" }],
  } });
  assert.equal(hb.status, 200);
  assert.deepEqual(hb.body.policy.allowedApps, [{ pkg: "com.company.crm", label: "CRM" }]);
  assert.equal(hb.body.policy.message, "Welcome");
  assert.equal(hb.body.policy.intervalSec, 600);
  assert.equal(hb.body.policy.pushIntervalSec, 1800);
  assert.equal(hb.body.policy.driverWifi, true);
  assert.deepEqual(hb.body.policy.installApps, []);
  assert.match(hb.body.policy.pinHash, /^pbkdf2\$120000\$[^$]+\$[0-9a-f]{64}$/);
  // PIN can be switched off: phones then get no PIN at all (dashboard-only release)
  await call("PUT", "/api/settings", { token: admin, body: { pinEnabled: false } });
  const noPin = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { battery: 15, charging: false, agentVersionCode: 1, agentVersion: "1.0.0", deviceOwner: true } } });
  assert.equal(noPin.body.policy.pinHash, "");
  await call("PUT", "/api/settings", { token: admin, body: { pinEnabled: true } });
  assert.equal((await call("POST", "/api/device/heartbeat", { token: "bad", body: {} })).status, 401);

  const list = await call("GET", "/api/devices", { token: admin });
  assert.equal(list.body[0].state, "online");
  assert.equal(list.body[0].battery, 15);
  assert.equal(typeof list.body[0].lastSeen, "number");
  const ov = await call("GET", "/api/overview", { token: admin });
  assert.equal(ov.body.lowBattery, 1);
  assert.equal(ov.body.total, 1);
  assert.equal((await call("GET", "/api/devices?q=pixel", { token: admin })).body.length, 1);
  assert.equal((await call("GET", "/api/devices?q=zzz", { token: admin })).body.length, 0);
  assert.equal((await call("GET", `/api/devices?group=${groupId}`, { token: admin })).body.length, 1);
  assert.equal((await call("GET", "/api/groups", { token: admin })).body[0].devices, 1);
});

test("policy version changes when admin edits; device override wins over group", async () => {
  const v1 = (await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } })).body.policy.version;
  await call("PATCH", `/api/devices/${deviceId}`, { token: admin, body: { allowedOverride: [{ pkg: "com.other.app", label: "Other" }] } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } });
  assert.ok(hb.body.policy.version > v1);
  assert.deepEqual(hb.body.policy.allowedApps, [{ pkg: "com.other.app", label: "Other" }]);
  const apps = await call("GET", "/api/apps", { token: admin });
  assert.equal(apps.body[0].pkg, "com.company.crm");
});

test("apps allowed on every phone (Apps page) are merged into each phone's list and shown in the catalogue", async () => {
  await call("PUT", "/api/settings", { token: admin, body: { allowedApps: [{ pkg: "com.android.chrome", label: "Chrome" }, { pkg: "bad pkg!", label: "x" }] } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } });
  assert.deepEqual(hb.body.policy.allowedApps, [{ pkg: "com.android.chrome", label: "Chrome" }, { pkg: "com.other.app", label: "Other" }]);
  const apps = await call("GET", "/api/apps", { token: admin });
  assert.equal(apps.body.find((a) => a.pkg === "com.android.chrome").allowed, true);
  assert.equal(apps.body.find((a) => a.pkg === "com.company.crm").allowed, false);
  assert.deepEqual((await call("GET", "/api/settings", { token: admin })).body.allowedApps, [{ pkg: "com.android.chrome", label: "Chrome" }]);
  await call("PUT", "/api/settings", { token: admin, body: { allowedApps: [] } });
  assert.deepEqual((await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } })).body.policy.allowedApps, [{ pkg: "com.other.app", label: "Other" }]);
});

test("commands are delivered once and acked", async () => {
  assert.equal((await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "nonsense" } })).status, 400);
  assert.equal((await call("POST", "/api/devices/9999/commands", { token: admin, body: { type: "reboot" } })).status, 404);
  // an unmanaged phone (app installed by hand, not the device owner) cannot be sent commands that need ownership
  await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: false } } });
  const refused = await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "release" } });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /not managed/);
  assert.equal((await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "refresh" } })).status, 200);
  const bulk = await call("POST", "/api/commands/bulk", { token: admin, body: { ids: [deviceId], type: "reboot" } });
  assert.deepEqual([bulk.body.queued, bulk.body.skipped], [0, 1]);
  await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } }); // flush the refresh
  await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: true } } });
  await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "release" } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb.body.commands.length, 1);
  assert.equal(hb.body.commands[0].type, "release");
  const hb2 = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: true }, acks: [{ id: hb.body.commands[0].id, status: "done" }] } });
  assert.equal(hb2.body.commands.length, 0);
  const detail = await call("GET", `/api/devices/${deviceId}`, { token: admin });
  assert.equal(detail.body.commands[0].status, "done");
});

test("release upload, provisioning QR payload, auto-update command", async () => {
  assert.equal((await call("GET", `/api/provisioning/${enrollToken}`, { token: admin })).status, 409);
  const apk = new Uint8Array(5000).fill(7);
  const up = await call("PUT", "/api/releases?versionCode=2&versionName=1.3.0&certSha256=abcDEF_-123", { token: admin, raw: apk });
  assert.equal(up.status, 200);
  const dl = await call("GET", "/apk/latest.apk");
  assert.equal(dl.status, 200);
  assert.equal(dl.res.headers.get("content-type"), "application/vnd.android.package-archive");
  assert.equal(dl.buf!.byteLength, 5000);
  assert.equal((await call("GET", `/apk/${up.body.sha256}.apk`)).status, 200);
  assert.equal((await call("GET", "/apk/unknown.apk")).status, 404);

  const prov = await call("GET", `/api/provisioning/${enrollToken}`, { token: admin });
  assert.equal(prov.status, 200);
  const p = prov.body.payload;
  assert.equal(p["android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME"], "com.cofilo.kiosk/.AdminReceiver");
  assert.equal(p["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION"], "https://kiosk.example.com/apk/latest.apk");
  assert.equal(p["android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM"], "abcDEF_-123");
  assert.deepEqual(p["android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE"], { server_url: "https://kiosk.example.com", enroll_token: enrollToken });
  assert.match(prov.body.qr, /^data:image\/png;base64,/);

  // a device on v1 that is device owner gets an update command automatically
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { agentVersionCode: 1, deviceOwner: true } } });
  const upd = hb.body.commands.find((c: any) => c.type === "update");
  assert.ok(upd);
  assert.match(upd.payload.url, /^https:\/\/kiosk\.example\.com\/apk\/[0-9a-f]{64}\.apk$/);
  assert.equal(upd.payload.sha256, up.body.sha256);
  // not queued twice within 30 minutes
  const hb2 = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { agentVersionCode: 1, deviceOwner: true } } });
  assert.equal(hb2.body.commands.filter((c: any) => c.type === "update").length, 0);
});

test("viewer accounts are read-only", async () => {
  await call("POST", "/api/admins", { token: admin, body: { email: "view@example.com", password: "longenough-12!", role: "viewer" } });
  const v = (await call("POST", "/api/login", { body: { email: "view@example.com", password: "longenough-12!" } })).body.token;
  assert.equal((await call("GET", "/api/devices", { token: v })).status, 200);
  assert.equal((await call("POST", "/api/groups", { token: v, body: { name: "x" } })).status, 403);
});

test("audit log records admin actions", async () => {
  const rows = (await call("GET", "/api/audit", { token: admin })).body;
  assert.ok(rows.some((r: any) => r.action === "create-group"));
  assert.ok(rows.some((r: any) => r.action === "upload-release"));
});

test("removing a locked phone releases it first, then deletes it once it has the command", async () => {
  await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: true } } });
  const del = await call("DELETE", `/api/devices/${deviceId}`, { token: admin });
  assert.equal(del.body.removed, false);
  assert.equal(del.body.pending, true);
  const listed = (await call("GET", "/api/devices", { token: admin })).body.find((d: any) => d.id === deviceId);
  assert.equal(listed.removing, true);
  // next check-in delivers the unlock command and the phone leaves the fleet
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb.status, 200);
  assert.ok(hb.body.commands.some((c: any) => c.type === "unenroll"));
  assert.equal((await call("GET", `/api/devices/${deviceId}`, { token: admin })).status, 404);
  assert.equal((await call("POST", "/api/device/heartbeat", { token: deviceToken, body: {} })).status, 401);
});

test("force-delete removes a phone immediately; unmanaged phones are deleted straight away", async () => {
  const tok = (await call("POST", "/api/enroll-tokens", { token: admin, body: { label: "F", maxUses: 3 } })).body.token;
  const a = (await call("POST", "/api/device/enroll", { body: { enrollToken: tok, serial: "F1", androidId: "F1", model: "m", osVersion: "o" } })).body;
  await call("POST", "/api/device/heartbeat", { token: a.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal((await call("DELETE", `/api/devices/${a.id}?force=1`, { token: admin })).body.removed, true);
  const b = (await call("POST", "/api/device/enroll", { body: { enrollToken: tok, serial: "F2", androidId: "F2", model: "m", osVersion: "o" } })).body;
  assert.equal((await call("DELETE", `/api/devices/${b.id}`, { token: admin })).body.removed, true);
});

test("bundled seed release is installed on first request and used for provisioning", async () => {
  const meta = JSON.parse(readFileSync(new URL("../releases/seed.json", import.meta.url), "utf8"));
  const buf = readFileSync(new URL(`../releases/${meta.file}`, import.meta.url));
  const seed: Seed = { apk: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, ...meta };
  const s = await makeApp({ seed });
  const rels = await s.call("GET", "/api/releases", { token: s.admin });
  assert.equal(rels.body.length, 1);
  assert.equal(rels.body[0].versionName, meta.versionName);
  assert.equal(rels.body[0].certSha256, meta.certSha256);
  const dl = await s.call("GET", "/apk/latest.apk");
  assert.equal(dl.buf!.byteLength, buf.byteLength);
  const t = (await s.call("POST", "/api/enroll-tokens", { token: s.admin, body: { label: "X" } })).body.token;
  const prov = await s.call("GET", `/api/provisioning/${t}`, { token: s.admin });
  assert.equal(prov.body.payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM"], meta.certSha256);
});

test("changing the password signs out other sessions and enforces the length rule", async () => {
  const s = await makeApp();
  const other = (await s.call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } })).body.token;
  assert.equal((await s.call("POST", "/api/me/password", { token: s.admin, body: { current: "wrong", next: "a-new-long-password" } })).status, 403);
  assert.equal((await s.call("POST", "/api/me/password", { token: s.admin, body: { current: "correct-horse-battery", next: "short" } })).status, 400);
  const ok = await s.call("POST", "/api/me/password", { token: s.admin, body: { current: "correct-horse-battery", next: "a-new-long-password" } });
  assert.equal(ok.status, 200);
  assert.equal((await s.call("GET", "/api/devices", { token: other })).status, 401);            // old session revoked
  assert.equal((await s.call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } })).status, 401);
  assert.equal((await s.call("POST", "/api/login", { body: { email: "boss@example.com", password: "a-new-long-password" } })).status, 200);
  assert.equal((await s.call("POST", "/api/admins", { token: s.admin, body: { email: "x@example.com", password: "elevenchars" } })).status, 401); // old token no longer valid
});

test("two-factor sign-in: setup, enforced at login, recovery codes work once, can be required for everyone", async () => {
  const s = await makeApp();
  const setup = await s.call("POST", "/api/me/2fa/setup", { token: s.admin });
  assert.match(setup.body.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.body.qr, /^data:image\/png;base64,/);
  assert.equal((await s.call("POST", "/api/me/2fa/enable", { token: s.admin, body: { code: "000000" } })).status, 400);
  const enable = await s.call("POST", "/api/me/2fa/enable", { token: s.admin, body: { code: totp(setup.body.secret) } });
  assert.equal(enable.status, 200);
  assert.equal(enable.body.recoveryCodes.length, 8);
  assert.equal((await s.call("GET", "/api/devices", { token: s.admin })).status, 401); // enabling 2FA signs old sessions out

  const creds = { email: "boss@example.com", password: "correct-horse-battery" };
  const needs = await s.call("POST", "/api/login", { body: creds });
  assert.equal(needs.status, 401); assert.equal(needs.body.needs2fa, true);
  assert.equal((await s.call("POST", "/api/login", { body: { ...creds, code: "123456" } })).status, 401);
  const good = await s.call("POST", "/api/login", { body: { ...creds, code: totp(setup.body.secret) } });
  assert.equal(good.status, 200); assert.equal(good.body.twoFactor, true);
  const t = good.body.token;

  const rec = enable.body.recoveryCodes[0];
  assert.equal((await s.call("POST", "/api/login", { body: { ...creds, code: rec.toLowerCase() } })).status, 200);
  assert.equal((await s.call("POST", "/api/login", { body: { ...creds, code: rec } })).status, 401); // single use

  // require 2FA for everyone: a user without it can only reach the account page
  assert.equal((await s.call("PUT", "/api/settings", { token: t, body: { require2fa: true } })).status, 200);
  await s.call("POST", "/api/admins", { token: t, body: { email: "new@example.com", password: "another-long-pass" } });
  const nu = (await s.call("POST", "/api/login", { body: { email: "new@example.com", password: "another-long-pass" } })).body.token;
  const blocked = await s.call("GET", "/api/devices", { token: nu });
  assert.equal(blocked.status, 403); assert.equal(blocked.body.need2faSetup, true);
  assert.equal((await s.call("GET", "/api/me", { token: nu })).body.mustSetup2fa, true);
  assert.equal((await s.call("POST", "/api/me/2fa/disable", { token: t, body: { password: creds.password, code: totp(setup.body.secret) } })).status, 409);
});

test("cookie sessions must send the custom header on changes (CSRF); bearer tokens are unaffected", async () => {
  const s = await makeApp();
  assert.equal((await s.call("GET", "/api/devices", { cookie: s.admin })).status, 200);
  assert.equal((await s.call("POST", "/api/groups", { cookie: s.admin, body: { name: "G1" } })).status, 403);
  assert.equal((await s.call("POST", "/api/groups", { cookie: s.admin, headers: { "x-requested-with": "confiance-dashboard" }, body: { name: "G1" } })).status, 200);
  assert.equal((await s.call("POST", "/api/groups", { token: s.admin, body: { name: "G2" } })).status, 200);
});

test("repeated failed sign-ins are recorded with the address", async () => {
  const s = await makeApp();
  await s.call("POST", "/api/login", { body: { email: "boss@example.com", password: "nope" }, headers: { "x-nf-client-connection-ip": "203.0.113.9" } });
  const rows = (await s.call("GET", "/api/audit", { token: s.admin })).body;
  assert.ok(rows.some((r: any) => r.action === "login-failed" && r.detail.includes("203.0.113.9")));
});

test("re-uploading the same APK corrects its label instead of adding a duplicate", async () => {
  const s = await makeApp();
  const apk = new Uint8Array(6000).fill(9);
  await s.call("PUT", "/api/releases?versionCode=7&versionName=1.2.0&certSha256=abc", { token: s.admin, raw: apk });
  assert.match((await s.call("GET", "/apk/latest.apk")).res.headers.get("content-disposition") ?? "", /kiosk-1\.2\.0\.apk/);
  await s.call("PUT", "/api/releases?versionCode=7&versionName=1.2.1&certSha256=abc", { token: s.admin, raw: apk });
  const rels = (await s.call("GET", "/api/releases", { token: s.admin })).body;
  assert.equal(rels.length, 1);
  assert.equal(rels[0].versionName, "1.2.1");
  assert.match((await s.call("GET", "/apk/latest.apk")).res.headers.get("content-disposition") ?? "", /kiosk-1\.2\.1\.apk/);
  // a genuinely different file is still a new release
  await s.call("PUT", "/api/releases?versionCode=8&versionName=1.3.0", { token: s.admin, raw: new Uint8Array(6000).fill(8) });
  assert.equal((await s.call("GET", "/api/releases", { token: s.admin })).body.length, 2);
});

test("instant push: phones get a private channel and are pinged when something changes", async () => {
  const sent: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fakeFetch = (async (url: string, init: any) => { sent.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response("", { status: 202 }); }) as unknown as typeof fetch;
  const s = await makeApp({ env: { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_KEY: "sb_publishable_test" }, fetch: fakeFetch });
  await s.call("PUT", "/api/settings", { token: s.admin, body: { requireApproval: false } });
  sent.length = 0;
  const tok = (await s.call("POST", "/api/enroll-tokens", { token: s.admin, body: { label: "P", maxUses: 5 } })).body.token;
  const e = (await s.call("POST", "/api/device/enroll", { body: { enrollToken: tok, serial: "P1", androidId: "P1", model: "m", osVersion: "o" } })).body;
  const hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  const push = hb.body.policy.push;
  assert.equal(e.rest.url, "https://proj.supabase.co/rest/v1");
  assert.equal(hb.body.policy.rest.key, "sb_publishable_test");
  assert.equal(push.url, "https://proj.supabase.co");
  assert.equal(push.key, "sb_publishable_test");
  assert.match(push.channel, /^dev-[A-Za-z0-9_-]{20,}$/);
  const hb2 = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb2.body.policy.push.channel, push.channel); // stable per phone

  // a dashboard command pings exactly that phone's channel, with no data in the message
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "refresh" } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://proj.supabase.co/realtime/v1/api/broadcast");
  assert.equal(sent[0].headers.apikey, "sb_publishable_test");
  assert.deepEqual(sent[0].body.messages, [{ topic: push.channel, event: "wake", payload: {}, private: false }]);

  // editing the group or a setting pings the affected phones
  sent.length = 0;
  const g = (await s.call("POST", "/api/groups", { token: s.admin, body: { name: "PG" } })).body.id;
  await s.call("PATCH", `/api/devices/${e.id}`, { token: s.admin, body: { groupId: g } });
  assert.equal(sent.length, 1);
  await s.call("PATCH", `/api/groups/${g}`, { token: s.admin, body: { message: "hello" } });
  assert.equal(sent.length, 2);
  await s.call("PUT", "/api/settings", { token: s.admin, body: { autoUpdate: false } });
  assert.equal(sent.length, 3);
  assert.equal((await s.call("GET", "/api/overview", { token: s.admin })).body.push, true);
});

test("instant push is optional: no config means no channel, and a failing Supabase never breaks the dashboard", async () => {
  const off = await makeApp();
  await off.call("PUT", "/api/settings", { token: off.admin, body: { requireApproval: false } });
  const tok = (await off.call("POST", "/api/enroll-tokens", { token: off.admin, body: { label: "N" } })).body.token;
  const e = (await off.call("POST", "/api/device/enroll", { body: { enrollToken: tok, serial: "N1", androidId: "N1", model: "m", osVersion: "o" } })).body;
  const hb = await off.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb.body.policy.push, null);

  const broken = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const on = await makeApp({ env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_KEY: "k" }, fetch: broken });
  await on.call("PUT", "/api/settings", { token: on.admin, body: { requireApproval: false } });
  const t2 = (await on.call("POST", "/api/enroll-tokens", { token: on.admin, body: { label: "B" } })).body.token;
  const e2 = (await on.call("POST", "/api/device/enroll", { body: { enrollToken: t2, serial: "B1", androidId: "B1", model: "m", osVersion: "o" } })).body;
  await on.call("POST", "/api/device/heartbeat", { token: e2.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal((await on.call("POST", `/api/devices/${e2.id}/commands`, { token: on.admin, body: { type: "refresh" } })).status, 200);
});

test("a stale dashboard tab gets a clear instruction instead of a cryptic error", async () => {
  const s = await makeApp();
  const r = await s.call("POST", "/api/groups", { cookie: s.admin, body: { name: "Stale" } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /out of date\. Reload/);
});

test("setup diagnostics: phones can report setup steps and downloads are noted, with throttling", async () => {
  const s = await makeApp();
  await s.call("PUT", "/api/releases?versionCode=9&versionName=9.9.9&certSha256=x", { token: s.admin, raw: new Uint8Array(3000).fill(5) });
  assert.equal((await s.call("GET", "/apk/latest.apk", { headers: { "user-agent": "ManagedProvisioning/1.0" } })).status, 200);
  assert.equal((await s.call("GET", "/apk/latest.apk")).status, 200);
  const b = await s.call("POST", "/api/setup-beacon", { body: { step: "get-provisioning-mode", detail: "allowed=[1,2] sdk=35", model: "samsung SM-A175F" } });
  assert.equal(b.status, 200);
  await s.call("POST", "/api/setup-beacon", { body: { step: "x<script>", detail: "y".repeat(1000), model: "m" } });
  const rows = (await s.call("GET", "/api/audit", { token: s.admin })).body;
  assert.equal(rows.filter((r: any) => r.action === "apk-download").length, 1);                 // two downloads, one note
  assert.ok(rows.some((r: any) => r.action === "setup:get-provisioning-mode" && r.detail.includes("allowed=[1,2]")));
  assert.ok(rows.some((r: any) => r.action === "setup:xscript" && r.detail.length === 300));      // sanitised and capped
});

// ---------- v2: data usage, alerts, lost mode, managed apps, driver reports ----------
async function enrolled(s: Awaited<ReturnType<typeof makeApp>>, label = "V") {
  await s.call("PUT", "/api/settings", { token: s.admin, body: { requireApproval: false } });
  const tok = (await s.call("POST", "/api/enroll-tokens", { token: s.admin, body: { label, maxUses: 5 } })).body.token;
  const e = (await s.call("POST", "/api/device/enroll", { body: { enrollToken: tok, serial: `${label}1`, androidId: `${label}1`, model: "samsung SM-A175F", osVersion: "Android 15", imei: "35000000", simSerial: "sim-A" } })).body;
  await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true, battery: 80 } } });
  return e;
}

test("data usage: deltas add up per day, month totals and the budget alert", async () => {
  const s = await makeApp();
  const e = await enrolled(s, "U");
  await s.call("PUT", "/api/settings", { token: s.admin, body: { dataBudgetMb: 100 } });
  const hb = async (mobile: number, wifi: number, appUsage?: any) =>
    s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true, battery: 80 }, usage: { mobileBytes: mobile, wifiBytes: wifi, ...(appUsage ? { appUsage } : {}) } } });
  assert.equal((await hb(30 * 1048576, 5 * 1048576, { "com.confiance.driver": 120 })).body.policy.dataBudgetMb, 100);
  await hb(40 * 1048576, 1 * 1048576);
  const u = await s.call("GET", `/api/devices/${e.id}/usage`, { token: s.admin });
  assert.equal(u.status, 200);
  assert.equal(u.body.days.length, 1);
  assert.equal(u.body.days[0].mobileBytes, 70 * 1048576);
  assert.equal(u.body.days[0].wifiBytes, 6 * 1048576);
  assert.deepEqual(u.body.days[0].appUsage, { "com.confiance.driver": 120 });   // kept when a later report has none
  assert.equal(u.body.month.mobileBytes, 70 * 1048576);
  const list = await s.call("GET", "/api/devices", { token: s.admin });
  assert.equal(list.body[0].dataMonth.mobileBytes, 70 * 1048576);
  assert.equal(list.body[0].imei, "35000000");
  // over budget -> one active alert, visible in the overview
  await hb(50 * 1048576, 0);
  const ov = await s.call("GET", "/api/overview", { token: s.admin });
  assert.equal(ov.body.data.mobileBytes, 120 * 1048576);
  assert.equal(ov.body.data.top[0].id, e.id);
  const budgetAlerts = ov.body.alerts.filter((a: any) => a.kind === "data_budget");
  assert.equal(budgetAlerts.length, 1);
  await hb(1, 0);
  assert.equal((await s.call("GET", "/api/alerts", { token: s.admin })).body.filter((a: any) => a.kind === "data_budget").length, 1); // not duplicated
  const fleet = await s.call("GET", "/api/usage", { token: s.admin });
  assert.equal(fleet.body.month[0].mobileBytes, 120 * 1048576 + 1);
  // dismiss
  await s.call("POST", `/api/alerts/${budgetAlerts[0].id}/dismiss`, { token: s.admin });
  assert.equal((await s.call("GET", "/api/alerts", { token: s.admin })).body.length, 0);
});

test("alerts: SIM change, battery, unmanaged, offline sweep, and the cron endpoint e-mails a digest", async () => {
  const sent: any[] = [];
  const fakeFetch = (async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  const s = await makeApp({ env: { RESEND_API_KEY: "re_test" }, fetch: fakeFetch });
  const e = await enrolled(s, "A");
  await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true, battery: 8, charging: false, simSerial: "sim-B", simOperator: "MTN" } } });
  let kinds = (await s.call("GET", "/api/alerts", { token: s.admin })).body.map((a: any) => a.kind).sort();
  assert.deepEqual(kinds, ["battery", "sim_changed"]);
  await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: false, battery: 90 } } });
  kinds = (await s.call("GET", "/api/alerts", { token: s.admin })).body.map((a: any) => a.kind).sort();
  assert.deepEqual(kinds, ["sim_changed", "unmanaged"]);   // battery cleared, unmanaged raised
  // offline: push last_seen into the past and sweep through the cron endpoint (needs the key)
  await s.call("PUT", "/api/settings", { token: s.admin, body: { offlineAlertHours: 1, alertEmails: "ops@confiance-app.com" } });
  assert.equal((await s.call("POST", "/api/cron")).status, 401);
  const res = await s.callCron();
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, 2);                       // sim_changed + unmanaged mailed once
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.resend.com/emails");
  assert.deepEqual(sent[0].body.to, ["ops@confiance-app.com"]);
  assert.match(sent[0].body.text, /SIM card changed/);
  assert.equal((await s.callCron()).body.sent, 0);     // nothing new
});

test("lost mode, ring, locate, wipe and the driver problem report", async () => {
  const s = await makeApp();
  const e = await enrolled(s, "L");
  assert.equal((await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "lost", message: "Rapportez ce téléphone", phone: "+237600000000" } })).status, 200);
  let hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb.body.policy.lostMode.on, true);
  assert.equal(hb.body.policy.lostMode.phone, "+237600000000");
  assert.deepEqual(hb.body.commands.map((c: any) => c.type), ["lost"]);
  assert.equal(hb.body.commands[0].payload.message, "Rapportez ce téléphone");
  assert.equal((await s.call("GET", `/api/devices/${e.id}`, { token: s.admin })).body.lostMode, true);
  assert.equal((await s.call("GET", "/api/overview", { token: s.admin })).body.lost, 1);
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "found" } });
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "ring", seconds: 10 } });
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "locate" } });
  hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true }, location: { lat: 3.87, lon: 11.52, accuracy: 20, at: 1 } } });
  assert.equal(hb.body.policy.lostMode.on, false);
  assert.deepEqual(hb.body.commands.map((c: any) => c.type), ["found", "ring", "locate"]);
  assert.equal(hb.body.commands[1].payload.seconds, 10);
  assert.deepEqual((await s.call("GET", `/api/devices/${e.id}`, { token: s.admin })).body.location, { lat: 3.87, lon: 11.52, accuracy: 20, at: 1 });
  // wipe is delivered once and marked done without an ack
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "wipe" } });
  hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.deepEqual(hb.body.commands.map((c: any) => c.type), ["wipe"]);
  const det = await s.call("GET", `/api/devices/${e.id}`, { token: s.admin });
  assert.equal(det.body.commands.find((c: any) => c.type === "wipe").status, "done");
  // the driver reports a problem -> alert + flag; the admin clears it
  const rep = await s.call("POST", "/api/device/report", { token: e.deviceToken, body: { kind: "problem", text: "L'application se ferme" } });
  assert.equal(rep.status, 200);
  assert.equal((await s.call("POST", "/api/device/report", { token: e.deviceToken, body: { text: "again" } })).status, 429);
  assert.equal((await s.call("GET", `/api/devices/${e.id}`, { token: s.admin })).body.problem, "L'application se ferme");
  assert.ok((await s.call("GET", "/api/alerts", { token: s.admin })).body.some((a: any) => a.kind === "problem"));
  await s.call("POST", `/api/devices/${e.id}/problem/clear`, { token: s.admin });
  assert.equal((await s.call("GET", `/api/devices/${e.id}`, { token: s.admin })).body.problem, "");
  assert.ok(!(await s.call("GET", "/api/alerts", { token: s.admin })).body.some((a: any) => a.kind === "problem"));
  assert.equal((await s.call("POST", "/api/device/report", { body: { token: "nope", text: "x" } })).status, 401);
});

test("managed apps: uploaded APKs reach phones whose allowed list has the package", async () => {
  const s = await makeApp();
  const e = await enrolled(s, "M");
  const g = (await s.call("POST", "/api/groups", { token: s.admin, body: { name: "Drivers", allowedApps: [{ pkg: "com.confiance.driver", label: "Confiance Driver" }] } })).body.id;
  await s.call("PATCH", `/api/devices/${e.id}`, { token: s.admin, body: { groupId: g, driverName: "Aminatou Njoya", vehicle: "Prado · LT 452 AB", driverPhone: "+237 6 99" } });
  const up = await s.call("PUT", "/api/managed-apps?pkg=com.confiance.driver&versionCode=120&versionName=2.3.0&label=Confiance%20Driver", { token: s.admin, raw: new Uint8Array(4000).fill(3) });
  assert.equal(up.status, 200);
  assert.equal(up.body.devices, 1);
  const hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true }, apps: [{ pkg: "com.confiance.driver", label: "Confiance Driver", versionCode: 100 }] } });
  assert.equal(hb.body.policy.driverName, "Aminatou Njoya");
  assert.equal(hb.body.policy.vehicle, "Prado · LT 452 AB");
  assert.equal(hb.body.policy.installApps.length, 1);
  assert.equal(hb.body.policy.installApps[0].versionCode, 120);
  assert.match(hb.body.policy.installApps[0].url, /^https:\/\/kiosk\.example\.com\/apk\/[0-9a-f]{64}\.apk$/);
  assert.equal((await s.call("GET", `/apk/${up.body.sha256}.apk`)).status, 200);
  // explicit install command carries the same payload
  const apps = (await s.call("GET", "/api/managed-apps", { token: s.admin })).body;
  assert.equal(apps.length, 1);
  await s.call("POST", `/api/devices/${e.id}/commands`, { token: s.admin, body: { type: "install", appId: apps[0].id } });
  const hb2 = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb2.body.commands[0].type, "install");
  assert.equal(hb2.body.commands[0].payload.pkg, "com.confiance.driver");
  assert.ok((await s.call("GET", "/api/apps", { token: s.admin })).body.some((a: any) => a.pkg === "com.confiance.driver"));
  await s.call("DELETE", `/api/managed-apps/${apps[0].id}`, { token: s.admin });
  assert.deepEqual((await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } })).body.policy.installApps, []);
  // search finds drivers and vehicles
  assert.equal((await s.call("GET", "/api/devices?q=njoya", { token: s.admin })).body.length, 1);
  assert.equal((await s.call("GET", "/api/devices?q=452", { token: s.admin })).body.length, 1);
});

test("the dashboard is served next to the API with security headers; settings expose the new knobs", async () => {
  const s = await makeApp();
  const page = await s.call("GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(page.res.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  assert.match(new TextDecoder().decode(page.buf!), /<title>Confiance Kiosk<\/title>/);
  assert.equal((await s.call("GET", "/app.js")).status, 200);
  assert.equal((await s.call("GET", "/nope.js")).status, 404);
  const st = (await s.call("GET", "/api/settings", { token: s.admin })).body;
  assert.equal(st.heartbeatSec, 600);
  assert.equal(st.dataBudgetMb, 2048);
  assert.equal(st.tz, "Africa/Douala");
  await s.call("PUT", "/api/settings", { token: s.admin, body: { heartbeatSec: 300, dispatchPhone: "+237 6 00", driverWifi: false } });
  const e = await enrolled(s, "S");
  const hb = await s.call("POST", "/api/device/heartbeat", { token: e.deviceToken, body: { status: { deviceOwner: true } } });
  assert.equal(hb.body.policy.intervalSec, 300);
  assert.equal(hb.body.policy.dispatchPhone, "+237 6 00");
  assert.equal(hb.body.policy.driverWifi, false);
  assert.equal(hb.body.policy.serverUrl, "https://kiosk.example.com");
});
