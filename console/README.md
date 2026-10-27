# Confiance Console (front-end rebuild)

A rebuild of the operations console at https://dashboard.confiance-app.com, front end only.
It runs on sample data by default, so every page works with no backend.

```bash
cd console
npm ci
npm run dev          # http://localhost:3000 → /fr/login
```

Demo mode accepts any e-mail and password (the password `wrong` is refused, to show the refusal message).

## What was taken from the live console, and what was not

Only the sign-in page is public, so only it could be copied exactly. Everything behind it was rebuilt from what
the public files give away:

| Taken from the live site | Where it is here |
|---|---|
| Stack: Next.js 16.2.6 (App Router, Turbopack), React 19.3, next-intl (fr / en / zh), Supabase Auth, Tailwind v4 | `package.json` |
| Every design token: colours, fonts, radii, type scale, paddings, and the column widths of each table (trips, Allies, riders, fleet, documents, pairs, end of shift, categories), plus the 1920px+ set | `app/globals.css` |
| The shell's layout rules (sticky navy rail, phone top bar, drawer, scrim, overview columns, inbox layout) | `app/globals.css` |
| Fonts: Cormorant Garamond, Jost, DM Sans, IBM Plex Mono | `app/fonts.ts`, `app/fonts/` |
| Logo, icons, web manifest | `public/`, `app/icon.png`, `app/manifest.ts` |
| Sign-in and password reset: same markup, styles, messages, 60-second resend countdown, error mapping | `app/[locale]/login/` |
| The `Card`, `Notice` and `ErrorNote` components | `components/ui/` |
| Redirects: `/` and `/{locale}` → sign-in; dashboard pages → sign-in with `?next=`; the `safeNext` rule | `proxy.ts`, `lib/auth/` |
| All live strings for fr, en and zh, including the catalogue of about 900 refusal messages the API can return | `messages/live/` |

Inferred, not copied: the pages behind sign-in. The rail, the pages and their columns follow the table widths in
the stylesheet, the "back to" links (Trips, Vehicles, Allies, Riders, Companies, Disputes) and the domain the refusal
messages describe. These are Allies (drivers), pairs and relief, end-of-shift checks, papers, classes and prices,
companies on credit or prepaid, refunds, payment orders with approvals, and the support inbox. Expect them to differ
from the real screens in detail.

## Layout

```
app/[locale]/login            sign-in + forgot password (as on the live console)
app/[locale]/auth/set-password where the reset e-mail lands
app/[locale]/dashboard/       overview, map, trips, alerts, support, disputes, allies, riders, companies,
                              vehicles, rota, documents, finance, tiers, marketing, settings, audit
components/ui                 Card, Notice, ErrorNote, Table/Row/Cell, FilterBar, Tabs, Tile, Bars, Chip…
components/shell              rail, phone top bar, idle sign-out
lib/data                      types, sample data, and the query functions pages call
lib/auth                      demo vs Supabase sign-in, session, refusal mapping, safeNext
messages/live                 strings served by the live console (do not edit by hand)
messages/console              this rebuild's page strings (zh falls back to en)
```

## Connecting it to real data

- **Sign-in:** set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Sign-in, reset links and sessions
  then go through Supabase Auth, as on the live console.
- **Data:** pages only import from `lib/data/index.ts`. Replace those functions' bodies with calls to your API
  (Supabase RPCs, REST) and no page needs to change. Buttons that change things use `ActionButton`; give it an
  `onRun` that calls the API and returns a refusal code (shown through `ErrorNote`) on failure.
- **Map:** the live console uses Mapbox. `dashboard/map` plots positions on a plain canvas so it needs no token;
  swap in Mapbox or MapLibre there.
- **Idle sign-out:** `NEXT_PUBLIC_IDLE_MINUTES` (default 30).
