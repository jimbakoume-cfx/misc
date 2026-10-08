# Confiance Kiosk: locked-down Android fleet + dashboard

Internal tool for ~200 Android phones: agents can only use approved company apps, can't exit even after a reboot,
and a web dashboard shows and manages every device.

| Folder | What |
|---|---|
| `android-agent/` | Kotlin Android app (kiosk launcher + device-owner policy + heartbeat agent). |
| `supabase/` | The API (one Edge Function, `functions/kiosk`) and the Postgres migrations, including the SQL check-in functions phones call directly. |
| `public/` | The static dashboard (French by default, English toggle). Hosted on Netlify or GitHub Pages, talks to the Supabase function. |
| `releases/` | Built, signed APK(s) with checksum info. |
| `docs/` | `DEPLOY.md` (Supabase + static hosting), `PROVISIONING.md` / `USB_SETUP.md` (set up phones), `AGENT_PROTOCOL.md` (phone ↔ server contract), `SECURITY.md`, `PRODUCT_REVIEW.md`. |

## How it works
- Phones are provisioned by **QR code** at first boot, which makes the app the **device owner**. That enables Android's
  real *Lock Task* mode, which a user cannot leave and which survives power-cycling.
- The app checks in every 10 minutes (30 when its instant channel is up) with battery, network, SIM, data usage
  (cellular vs Wi-Fi), screen time per app and installed apps, and receives its policy (allowed apps, driver, PIN,
  message, dispatch number) and commands (lock, reboot, release, ring, locate, lost mode, wipe, install, update).
- The dashboard shows data usage per phone against a monthly budget, raises alerts (offline, SIM changed, budget,
  battery, driver-reported problems) and can e-mail them. APKs uploaded on the Apps page (the kiosk itself and the
  Confiance Driver app) are installed silently on every phone that is allowed to run them.

## Build the APK
```bash
cd android-agent
# one-time: create a keystore + keystore.properties (see docs/PROVISIONING.md), never commit them
./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```
Requires JDK 17+ and the Android SDK (platform 34).

## Dashboard and backend
Backend on Supabase (project `confiance-kiosk`), dashboard at https://confiance-kiosk-console.netlify.app; see `docs/DEPLOY.md`.
Tests: `npm ci && npm test`. Local copy of everything: `npm run dev`.
