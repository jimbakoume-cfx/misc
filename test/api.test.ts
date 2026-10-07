import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createApp, type Seed } from "../netlify/functions/lib/app.ts";

/** Runs the real function code against an in-memory Postgres (PGlite) and an in-memory blob store. */
async function makeApp(opts: { seed?: Seed } = {}) {
  const pg = new PGlite();
  const dir = new URL("../netlify/database/migrations/", import.meta.url);
  for (const m of readdirSync(dir).sort()) await pg.exec(readFileSync(new URL(`${m}/migration.sql`, dir), "utf8"));
  const blobs = new Map<string, ArrayBuffer>();
  const handler = createApp({
    db: { query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any[] },
    blobs: { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } },
    env: { SESSION_SECRET: "test-secret", ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "correct-horse-battery", PUBLIC_URL: "https://kiosk.example.com" },
    loadSeed: opts.seed ? async () => opts.seed! : undefined,
  });
  const call = async (method: string, url: string, o: { body?: unknown; token?: string; raw?: Uint8Array } = {}) => {
    const res = await handler(new Request(`https://kiosk.example.com${url}`, {
      method,
      headers: {
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
        ...(o.raw ? { "content-type": "application/octet-stream" } : o.body ? { "content-type": "application/json" } : {}),
      },
      body: (o.raw ?? (o.body ? JSON.stringify(o.body) : undefined)) as any,
    }));
    const isJson = res.headers.get("content-type")?.includes("json");
    const buf = isJson ? null : await res.arrayBuffer();
    return { status: res.status, body: isJson ? await res.json() : null, buf, res };
  };
  const login = await call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } });
  return { call, admin: login.body.token as string, login };
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
  for (let i = 0; i < 8; i++) await call("POST", "/api/login", { body: { email: "victim@example.com", password: "x" } });
  const r = await call("POST", "/api/login", { body: { email: "victim@example.com", password: "x" } });
  assert.equal(r.status, 429);
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

  // factory reset + re-enroll keeps the same device record
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
  assert.equal(hb.body.policy.intervalSec, 300);
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

test("commands are delivered once and acked", async () => {
  assert.equal((await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "nonsense" } })).status, 400);
  assert.equal((await call("POST", "/api/devices/9999/commands", { token: admin, body: { type: "reboot" } })).status, 404);
  await call("POST", `/api/devices/${deviceId}/commands`, { token: admin, body: { type: "release" } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {} } });
  assert.equal(hb.body.commands.length, 1);
  assert.equal(hb.body.commands[0].type, "release");
  const hb2 = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: {}, acks: [{ id: hb.body.commands[0].id, status: "done" }] } });
  assert.equal(hb2.body.commands.length, 0);
  const detail = await call("GET", `/api/devices/${deviceId}`, { token: admin });
  assert.equal(detail.body.commands[0].status, "done");
});

test("release upload, provisioning QR payload, auto-update command", async () => {
  assert.equal((await call("GET", `/api/provisioning/${enrollToken}`, { token: admin })).status, 409);
  const apk = new Uint8Array(5000).fill(7);
  const up = await call("PUT", "/api/releases?versionCode=2&versionName=1.2.0&certSha256=abcDEF_-123", { token: admin, raw: apk });
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
  await call("POST", "/api/admins", { token: admin, body: { email: "view@example.com", password: "longenough1", role: "viewer" } });
  const v = (await call("POST", "/api/login", { body: { email: "view@example.com", password: "longenough1" } })).body.token;
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
  assert.equal(rels.body[0].versionName, "1.2.0");
  assert.equal(rels.body[0].certSha256, meta.certSha256);
  const dl = await s.call("GET", "/apk/latest.apk");
  assert.equal(dl.buf!.byteLength, buf.byteLength);
  const t = (await s.call("POST", "/api/enroll-tokens", { token: s.admin, body: { label: "X" } })).body.token;
  const prov = await s.call("GET", `/api/provisioning/${t}`, { token: s.admin });
  assert.equal(prov.body.payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM"], meta.certSha256);
});
