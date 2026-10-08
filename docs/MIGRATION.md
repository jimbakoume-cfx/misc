# Moving from Netlify to Supabase

The backend moved from Netlify Functions + Netlify DB/Blobs to Supabase on 8 October 2026. This is the checklist of
what changed and the few steps that cannot be done from the repository.

## What runs where now

| Before | Now |
|---|---|
| Netlify function `netlify/functions/kiosk` (API + dashboard) | Supabase Edge Function `supabase/functions/kiosk` (API only, JSON + APK) |
| Netlify DB (Neon Postgres) | Supabase Postgres, `supabase/migrations/*.sql`; phones call `kiosk_heartbeat` / `kiosk_report` through PostgREST |
| Netlify Blobs (APK files) | Supabase Storage, public bucket `apk` (`kiosk-agent.apk` = current release) |
| Netlify scheduled function (alerts) | pg_cron job `kiosk-hourly` → `POST /api/cron` through pg_net |
| Dashboard served by the function | Static files in `public/`, hosted on Netlify (default) or GitHub Pages; the API is called at `https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk` |

## Steps

1. **Supabase project.** `confiance-kiosk` (`qzkoowbcngcdnhqystwz`, eu-west-3) already has the schema (migration
   versions 20261007000000 … 20261011000000), the storage buckets, the hourly cron and the function (version 2).
   If you use the Supabase CLI, run `supabase migration repair --status reverted 20261008093951` once: that version was
   recorded by the hosted apply and does not exist as a file.
2. **Delete the old project.** The previous project `Confiance` (`lbvlczxvqlpnqjtxsyqn`, paused) cannot be deleted from
   the API; delete it in the Supabase dashboard (Project settings → General → Delete project).
3. **Copy the old data** (optional, phones stay enrolled):
   ```bash
   SOURCE_URL='<Netlify DB connection string>' \
   TARGET_URL='postgres://postgres.qzkoowbcngcdnhqystwz:<db password>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres' \
   node scripts/migrate-from-netlify.mjs
   ```
   Then upload the current APK (`releases/kiosk-agent-1.3.4.apk`) on the Apps page: the files were in Netlify Blobs.
   Without this step, enrol the phones again with a new code.
4. **Deploy the dashboard.** Netlify: connect the repository (branch `main`) or `netlify deploy --prod --dir=public` with
   the new `netlify.toml`; the site now serves `public/` and proxies `/api`, `/apk`, `/healthz` to Supabase. Remove the
   old Netlify environment variables (`DATABASE_URL`, `SESSION_SECRET`, …): nothing reads them any more.
   GitHub Pages: Settings → Pages → Source "GitHub Actions", then run `.github/workflows/pages.yml` from the Actions tab.
5. **Alert e-mails.** In Supabase → Edge Functions → Secrets add `RESEND_API_KEY` (and `ALERT_FROM`, a verified sender).
   Without it, alerts show in the dashboard only.
6. **Build agent 1.4.0.** `android-agent/` already contains the new protocol (data usage, SIM, ring, locate, lost mode,
   wipe, PostgREST check-ins, instant commands). Build and sign it with the existing key, upload it on the Apps page,
   then **Roll out**. Phones on 1.3.x keep working through the Netlify proxy in the meantime and switch to the Supabase
   address by themselves once updated (`policy.serverUrl`).
7. **Change the admin password** (Account page) after the first sign-in; the one created during the migration is only
   in the deployment notes.

## Limits to keep in mind
- Realtime: 200 concurrent connections on the free plan (instant commands). Phones beyond that poll every 10 minutes.
- Edge Function: 500 000 invocations/month, used by the dashboard only.
- Storage: 1 GB, database: 500 MB. Usage history is kept 180 days by `kiosk_sweep`.
