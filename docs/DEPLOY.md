# Deploying (Supabase backend + static dashboard)

Everything server-side runs on **Supabase** (free plan): Postgres, Storage (APK files), Realtime (instant commands),
one Edge Function (`supabase/functions/kiosk`, the dashboard API) and pg_cron (hourly alert e-mails).
Phones check in straight through PostgREST (`kiosk_heartbeat`), so the function only serves the console.

| What | Where |
|---|---|
| Project | `confiance-kiosk`, ref `qzkoowbcngcdnhqystwz`, region eu-west-3 (Paris) |
| API / function | `https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk` |
| Dashboard | `https://confiance-kiosk.jim-bakoume.workers.dev` on Cloudflare (static files + a Worker that proxies `/api` → the function) |
| APK downloads | `https://qzkoowbcngcdnhqystwz.supabase.co/storage/v1/object/public/apk/kiosk-agent.apk` |

Supabase does not let a function on `*.supabase.co` serve HTML (it rewrites it to plain text), so the console's files
are hosted elsewhere and talk to the function. Two free options are wired up:

1. **Cloudflare Workers (the one in use).** The `cloudflare/` project serves `public/` and proxies `/api/*`, `/apk/*`
   and `/healthz` to the function, so the page is same-origin and uses cookies. See "Dashboard on Cloudflare Workers"
   below. Netlify did the same job until 24 November 2026 and is retired: `netlify.toml` now only redirects the old
   address (`confiance-kiosk-console.netlify.app`) to the Cloudflare one for as long as that Netlify site exists.
2. **GitHub Pages.** `.github/workflows/pages.yml` publishes `public/` with `<meta name="kiosk-api">` pointing at the
   function (the console then signs in with a bearer token). Enable it once (repository **Settings → Pages → Source:
   GitHub Actions**), then run the workflow from the Actions tab; it is manual until Pages is enabled. Any other static
   host works the same way: copy `public/` and set that meta tag.

## First deployment (already done for the project above)
```bash
npm i -g supabase            # Supabase CLI, then: supabase login
supabase link --project-ref qzkoowbcngcdnhqystwz
supabase db push             # applies supabase/migrations/*.sql
supabase functions deploy kiosk --no-verify-jwt   # the function does its own sign-in
```
Then create the first admin (the function also does this from `ADMIN_EMAIL` / `ADMIN_PASSWORD` secrets if the table is
empty), sign in, and publish the console files and the current APK:
```bash
KIOSK_URL=https://qzkoowbcngcdnhqystwz.supabase.co/functions/v1/kiosk KIOSK_EMAIL=you@… KIOSK_PASSWORD=… \
  node scripts/publish-dashboard.mjs          # optional: only needed to open the console at the function URL
# upload releases/kiosk-agent-1.3.4.apk on the Apps page (or scripts/publish-release.mjs)
```
Notes for the hosted apply through the Supabase MCP (used for the first deployment): statements containing
`DELETE`/`TRUNCATE`/`DROP` wait for an interactive confirmation; `supabase db push` has no such limit.

## Secrets (Edge Function → Secrets)
None are required: the session secret and the cron key are generated on first start and kept in the `settings` table.
Optional:

| Secret | Purpose |
|---|---|
| `RESEND_API_KEY`, `ALERT_FROM` | Alert e-mails (hourly digest to Settings → Alerts e-mails) through resend.com (free: 3 000/month). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the first admin when the table is empty. Remove afterwards. |
| `PUBLIC_URL` | Only if the function is reached through another address than `https://<ref>.supabase.co/functions/v1/kiosk`. |

## Deploying changes
- API: `supabase functions deploy kiosk --no-verify-jwt`.
- Database: add a file under `supabase/migrations/`, then `supabase db push`.
- Dashboard: `cd cloudflare && npm ci && npx cf deploy` (Cloudflare); GitHub Pages redeploys on push.
- Phones: build the APK, upload it on the **Apps** page; phones update themselves.

## Capacity and cost (free plan)
- Check-ins go through PostgREST, which has no request cap; they cost only egress (≈1.5 GB/month for 200 phones at
  10 min). Function invocations (500 000/month) are used by the console only.
- Realtime allows **200 concurrent connections** on the free plan: phones that cannot join simply poll at the check-in
  interval (Settings → Phones). Pro ($25/month) allows 500.
- Storage: 1 GB (each APK version ≈ 1–50 MB). Database: 500 MB (usage rows are ~100 bytes per phone per day).
- A free project pauses after 7 days without API traffic; phones checking in keep it active.

## Tests
`npm ci && npm test` runs the API, including the SQL functions, against an in-memory Postgres (PGlite).
`npm run dev` serves the whole thing locally on http://localhost:8099 (admin@test.com / dev-password-123).

## Moving data from the old Netlify database
`scripts/migrate-from-netlify.mjs` copies every table (phones keep their tokens, so they stay enrolled):
```bash
SOURCE_URL='postgres://…netlify…' TARGET_URL='postgres://postgres.qzkoowbcngcdnhqystwz:…@aws-0-eu-west-3.pooler.supabase.com:5432/postgres' \
  node scripts/migrate-from-netlify.mjs
```
Then upload the current APK again on the Apps page (files lived in Netlify Blobs). Phones on agent 1.3.x keep talking
to the Netlify address, which proxies to Supabase; once they receive agent 1.4.0 they switch to the Supabase address by
themselves (`policy.serverUrl`), after which the Netlify proxy rules are no longer needed.

## Dashboard on Cloudflare Workers

The `cloudflare/` folder is a small Workers project: the files of `public/` as static assets, and
`cloudflare/src/worker.ts` in front of them. The Worker sets the security headers, proxies `/api/*`, `/apk/*` and
`/healthz` to the Supabase function (adding `x-region` so the function runs next to its database, and passing the
visitor's address so sign-in throttling stays per visitor), and redirects `/kiosk-agent.apk` to Storage. The page
is therefore same-origin and needs no CORS entry.

Deploy after any change under `public/` or `cloudflare/`:

```bash
cd cloudflare
npm ci
npx cf deploy        # needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
```

The project is configured in `cloudflare.config.ts` (Worker name, bindings, Supabase address) and
`wrangler.config.ts` (the assets directory, `../public`). A custom domain can be added with `domains` in
`cloudflare.config.ts` once the domain is on the Cloudflare account.
