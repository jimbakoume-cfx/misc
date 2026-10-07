# Deploying the dashboard (Netlify)

The dashboard + API run on **Netlify**: static dashboard (`public/`), one serverless function
(`netlify/functions/api.mts`), **Netlify Database** (Postgres, migrations in `netlify/database/migrations/`)
and **Netlify Blobs** (APK files). Live site: https://confiance-kiosk.netlify.app

## Environment variables (Site configuration → Environment variables)
| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs dashboard sessions. Long random string. **Required.** Changing it signs everyone out. |
| `PUBLIC_URL` | Public HTTPS address, goes into the QR code, e.g. `https://confiance-kiosk.netlify.app`. |
| `SUPABASE_URL`, `SUPABASE_KEY` | Instant commands. Your Supabase project URL and its *publishable* key (`sb_publishable_…`). Optional: without them phones are reached at their next 5-minute check-in. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Only used to create the very first admin when the database has none. Delete `ADMIN_PASSWORD` afterwards. |

## First-time setup
1. Deploy (`netlify deploy --prod`, or connect the repo). Migrations run automatically.
2. Sign in, then **Settings → Admin PIN** (used on the phone to unlock it) and change your dashboard password by adding a new admin user and removing the old one.
3. **Groups & apps**: create groups and tick the apps agents may open.
4. **Add devices**: create a code and scan its QR on each factory-reset phone (see PROVISIONING.md).

The first APK (`releases/kiosk-agent-1.3.1.apk`) is bundled with the deploy and installed as release #1 on first use.
Upload later versions on the **App versions** page; phones update themselves.

## Deploying changes
Do not upload the whole repo folder: `android-agent/` may contain your signing keystore. Deploy only
`public/`, `netlify/`, `netlify.toml`, `package*.json` and `releases/seed.json` + the seed APK.

## Capacity and cost
Phones check in every 5 minutes → ~58k function calls/day for 200 devices (~1.7M/month). The Netlify **Free**
plan is too small for that; use a paid plan, or raise the interval (policy `intervalSec`, 60–3600).
Function request bodies are limited to ~6 MB, enough for the current ~0.6 MB APK.

## Tests
`npm ci && npm test` runs the API against an in-memory Postgres (PGlite).

## Instant commands (Supabase Realtime)
Each phone keeps one live connection to your Supabase project and listens on a private channel whose name is a random secret
only that phone knows. Pressing a button in the dashboard sends an empty "wake up" ping to that channel (server → Supabase REST
broadcast), the phone checks in immediately over the normal authenticated API and runs the command. No data travels through
Supabase, and no secret/service key is needed: only the publishable key, which is safe to embed.
- Phones that are not live (sleeping, offline) still pick commands up at their next check-in (5 min; 15 min while live).
- The dashboard shows "⚡ live" per phone and "Phones live" on the Overview.
- Supabase **Free** allows 200 simultaneous connections (exactly your fleet size); **Pro** ($25/month) allows 500.
- Project: `confiance-kiosk` (eu-west-3). Test: `node` script in `scripts/` or watch Overview → "Phones live".
