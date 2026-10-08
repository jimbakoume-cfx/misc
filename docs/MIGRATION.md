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
4. **Dashboard hosting.** The console is live at https://confiance-kiosk-console.netlify.app (Netlify project
   `confiance-kiosk-console` in the jim-bakoume team, deployed from this repository with the new `netlify.toml`: static
   `public/` plus `/api`, `/apk`, `/healthz` proxied to Supabase). The repository is linked to that project, so
   every push to the deployed branch redeploys it. The previous site,
   `confiance-kiosk.netlify.app`, belongs to another Netlify account; phones on agent 1.3.x still talk to it, so either
   redeploy this repository there too (same `netlify.toml`, which turns it into a proxy to Supabase) or re-enrol those
   phones with agent 1.4.0. Remove its old environment variables (`DATABASE_URL`, `SESSION_SECRET`, …) afterwards.
   GitHub Pages: Settings → Pages → Source "GitHub Actions", then run `.github/workflows/pages.yml` from the Actions tab.
5. **Alert e-mails.** In Supabase → Edge Functions → Secrets add `RESEND_API_KEY` (and `ALERT_FROM`, a verified sender).
   Without it, alerts show in the dashboard only.
6. **Agent 1.4.0** is built (`releases/kiosk-agent-1.4.0.apk`) and uploaded as the current release, so new phones get
   it from the QR code. It is signed with a **new** keystore (the 1.3.4 key was not available), so phones still on
   1.3.4 cannot update in place: Android refuses an update signed with another key. Set those phones up again from
   the QR code (factory reset) or keep them on 1.3.4 through the old Netlify address. Every future build must be
   signed with the same new keystore (`kiosk-release.keystore`, kept outside the repository).
7. **Change the admin password** (Account page) after the first sign-in; the one created during the migration is only
   in the deployment notes.

## Limits to keep in mind
- Realtime: 200 concurrent connections on the free plan (instant commands). Phones beyond that poll every 10 minutes.
- Edge Function: 500 000 invocations/month, used by the dashboard only.
- Storage: 1 GB, database: 500 MB. Usage history is kept 180 days by `kiosk_sweep`.
