# Company Kiosk: locked-down Android fleet + dashboard

Internal tool for ~200 Android phones: agents can only use approved company apps, can't exit even after a reboot,
and a web dashboard shows and manages every device.

| Folder | What |
|---|---|
| `android-agent/` | Kotlin Android app (kiosk launcher + device-owner policy + heartbeat agent). |
| `backend/` | Node 22 API + dashboard (static page in `backend/public`), SQLite storage. |
| `releases/` | Built, signed APK(s) with checksum info. |
| `docs/` | `DEPLOY.md` (host the dashboard), `PROVISIONING.md` (set up phones by QR). |

## How it works
- Phones are provisioned by **QR code** at first boot, which makes the app the **device owner**. That enables Android's
  real *Lock Task* mode, which a user cannot leave and which survives power-cycling.
- The app reports battery, connectivity, version and installed apps every minute and receives its policy
  (allowed apps, PIN, message) and commands (reboot, lock, release, update).
- New APK versions uploaded in the dashboard are installed silently on every device.

## Build the APK
```bash
cd android-agent
# one-time: create a keystore + keystore.properties (see docs/PROVISIONING.md), never commit them
./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```
Requires JDK 17+ and the Android SDK (platform 34).

## Run the dashboard locally
```bash
cd backend && npm ci
ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=change-me-now PUBLIC_URL=http://localhost:8080 npm start
npm test
```
