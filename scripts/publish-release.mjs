// Publish an APK to the dashboard. The version is read from the APK itself, never typed by hand.
// Usage: BASE_URL=https://... ADMIN_EMAIL=... ADMIN_PASSWORD=... CERT_SHA256=<base64url> node scripts/publish-release.mjs path/to/app.apk
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const apkPath = process.argv[2];
const { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, CERT_SHA256 = "", AAPT2 = "aapt2" } = process.env;
if (!apkPath || !BASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Usage: BASE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… [CERT_SHA256=…] [AAPT2=path] node scripts/publish-release.mjs app.apk");
  process.exit(1);
}
const badging = execFileSync(AAPT2, ["dump", "badging", apkPath], { encoding: "utf8" });
const m = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
if (!m) throw new Error("Could not read the version from the APK");
const [, pkg, versionCode, versionName] = m;
console.log(`Publishing ${pkg} ${versionName} (code ${versionCode})`);

const login = await fetch(`${BASE_URL}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
const body = await login.json();
if (!login.ok) throw new Error(`Sign-in failed: ${body.error}${body.needs2fa ? " (this account uses two-factor; use an account without it or add a CLI token)" : ""}`);
const q = new URLSearchParams({ versionCode, versionName, ...(CERT_SHA256 ? { certSha256: CERT_SHA256 } : {}) });
const up = await fetch(`${BASE_URL}/api/releases?${q}`, { method: "PUT", headers: { "content-type": "application/octet-stream", authorization: `Bearer ${body.token}` }, body: readFileSync(apkPath) });
console.log(up.ok ? "Uploaded." : `Upload failed: ${up.status} ${await up.text()}`);
process.exit(up.ok ? 0 : 1);
