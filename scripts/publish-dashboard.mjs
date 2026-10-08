// Publishes the dashboard files (public/) to the running backend, which stores them in the "web" bucket and serves them.
// Usage: KIOSK_URL=https://<ref>.supabase.co/functions/v1/kiosk KIOSK_EMAIL=... KIOSK_PASSWORD=... [KIOSK_CODE=123456] node scripts/publish-dashboard.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const base = (process.env.KIOSK_URL ?? "").replace(/\/$/, "");
if (!base) { console.error("Set KIOSK_URL (e.g. https://<ref>.supabase.co/functions/v1/kiosk)"); process.exit(1); }
const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.KIOSK_EMAIL, password: process.env.KIOSK_PASSWORD, code: process.env.KIOSK_CODE ?? "" }) });
const auth = await login.json();
if (!login.ok) { console.error("login failed:", auth.error); process.exit(1); }
const root = new URL("..", import.meta.url).pathname, pub = join(root, "public");
const files = [];
(function walk(dir) { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : (n.endsWith(".apk") || files.push(p)); } })(pub);
for (const f of files) {
  const path = relative(pub, f).split("\\").join("/");
  const r = await fetch(`${base}/api/static?path=${encodeURIComponent(path)}`, { method: "PUT", headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/octet-stream" }, body: readFileSync(f) });
  const j = await r.json();
  console.log(r.ok ? `ok   ${path} (${j.size} bytes)` : `FAIL ${path}: ${j.error}`);
  if (!r.ok) process.exitCode = 1;
}
