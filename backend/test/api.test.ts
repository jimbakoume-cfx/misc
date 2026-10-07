import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "kiosk-test-"));
process.env.ADMIN_EMAIL = "boss@example.com";
process.env.ADMIN_PASSWORD = "correct-horse-battery";

const { buildApp } = await import("../src/server.ts");
const { openDb } = await import("../src/db.ts");
const { hashPin } = await import("../src/auth.ts");

const app = buildApp({ db: openDb(":memory:"), secret: "test-secret", publicUrl: "https://kiosk.example.com" });
const call = async (method: string, url: string, opts: { body?: unknown; token?: string; raw?: Buffer } = {}) => {
  const res = await app.inject({
    method: method as any, url,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.raw ? { "content-type": "application/octet-stream" } : opts.body ? { "content-type": "application/json" } : {}),
    },
    payload: (opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined)) as any,
  });
  return { status: res.statusCode, body: res.body ? (res.headers["content-type"]?.toString().includes("json") ? res.json() : res.body) : null, res };
};

const login = await call("POST", "/api/login", { body: { email: "boss@example.com", password: "correct-horse-battery" } });
const admin = login.body.token as string;

test("login rejects wrong password and anonymous access", async () => {
  assert.equal((await call("POST", "/api/login", { body: { email: "boss@example.com", password: "nope" } })).status, 401);
  assert.equal((await call("GET", "/api/devices")).status, 401);
  assert.equal((await call("GET", "/api/devices", { token: admin })).status, 200);
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
  // token exhausted (max 2 uses)
  assert.equal((await call("POST", "/api/device/enroll", { body: { enrollToken, serial: "SN2" } })).status, 403);
});

test("heartbeat returns group policy with sanitised apps and PIN hash", async () => {
  await call("PUT", "/api/settings", { token: admin, body: { pin: "4321" } });
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: {
    status: { battery: 15, charging: false, agentVersionCode: 1, agentVersion: "1.0.0", deviceOwner: true },
    apps: [{ pkg: "com.company.crm", label: "CRM" }],
  } });
  assert.equal(hb.status, 200);
  assert.deepEqual(hb.body.policy.allowedApps, [{ pkg: "com.company.crm", label: "CRM" }]);
  assert.equal(hb.body.policy.message, "Welcome");
  assert.equal(hb.body.policy.pinHash, hashPin(hb.body.policy.pinSalt, "4321"));
  assert.equal((await call("POST", "/api/device/heartbeat", { token: "bad", body: {} })).status, 401);

  const list = await call("GET", "/api/devices", { token: admin });
  assert.equal(list.body[0].state, "online");
  assert.equal(list.body[0].battery, 15);
  const ov = await call("GET", "/api/overview", { token: admin });
  assert.equal(ov.body.lowBattery, 1);
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
  const apk = Buffer.alloc(5000, 7);
  const up = await call("PUT", "/api/releases?versionCode=2&versionName=1.1.0&certSha256=abcDEF_-123", { token: admin, raw: apk });
  assert.equal(up.status, 200);
  const dl = await call("GET", "/apk/latest.apk");
  assert.equal(dl.status, 200);
  assert.equal(dl.res.rawPayload.length, 5000);

  const prov = await call("GET", `/api/provisioning/${enrollToken}`, { token: admin });
  assert.equal(prov.status, 200);
  const p = prov.body.payload;
  assert.equal(p["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION"], "https://kiosk.example.com/apk/latest.apk");
  assert.equal(p["android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM"], "abcDEF_-123");
  assert.deepEqual(p["android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE"], { server_url: "https://kiosk.example.com", enroll_token: enrollToken });
  assert.match(prov.body.qr, /^data:image\/png;base64,/);

  // device on v1 as device owner gets an update command automatically
  const hb = await call("POST", "/api/device/heartbeat", { token: deviceToken, body: { status: { agentVersionCode: 1, deviceOwner: true } } });
  const upd = hb.body.commands.find((c: any) => c.type === "update");
  assert.ok(upd);
  assert.match(upd.payload.url, /^https:\/\/kiosk\.example\.com\/apk\/[0-9a-f]{64}\.apk$/);
});

test("viewer accounts are read-only", async () => {
  await call("POST", "/api/admins", { token: admin, body: { email: "view@example.com", password: "longenough1", role: "viewer" } });
  const v = (await call("POST", "/api/login", { body: { email: "view@example.com", password: "longenough1" } })).body.token;
  assert.equal((await call("GET", "/api/devices", { token: v })).status, 200);
  assert.equal((await call("POST", "/api/groups", { token: v, body: { name: "x" } })).status, 403);
});

test("deleting a device invalidates its token", async () => {
  await call("DELETE", `/api/devices/${deviceId}`, { token: admin });
  assert.equal((await call("POST", "/api/device/heartbeat", { token: deviceToken, body: {} })).status, 401);
});
