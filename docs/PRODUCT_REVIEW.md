# Confiance Kiosk: product and design review (October 2026)

Context: Confiance is a premium VTC platform in Yaoundé whose drivers are salaried team members. Each driver gets a
Samsung Galaxy A17 locked by Confiance Kiosk to the Confiance Driver app plus a few allowed apps. This review covers
(1) data-usage monitoring, (2) other dashboard features worth adding, (3) the driver-side app, (4) free hosting
alternatives to Netlify, and (5) a design review of both surfaces against the Confiance brand.

The review is based on reading the whole codebase (agent 1.3.4, API, dashboard) and running the dashboard locally
with a seeded fleet of eight phones on desktop and phone-sized screens.

---

## 1. Data usage per phone (Wi-Fi vs cellular)

**Feasible, cheaply, with no new Android permissions.**

- `TrafficStats.getMobileRxBytes()/getMobileTxBytes()` and `getTotalRxBytes()/getTotalTxBytes()` are readable by any
  app. They are counters since boot. The agent samples them at every check-in; the server stores the delta per phone
  per day as `mobile_bytes` and `wifi_bytes` (wifi = total − mobile). A boot resets the counters, which the agent
  already detects via `uptimeMin` going down.
- Cost: two extra numbers in the heartbeat and one small table `usage_daily(device_id, day, mobile_bytes, wifi_bytes)`
  with an upsert per check-in. Monthly roll-ups are a `SUM` query.
- Per-app breakdown (how much of the data went to Maps vs WhatsApp) needs `NetworkStatsManager`, which needs
  "usage access". As device owner the kiosk can typically obtain that during setup, but it must be tested on one A17
  before relying on it. Phase 2, not phase 1.
- While at it, the agent should also report SIM/carrier details (operator name, SIM serial, IMEI). Device owners may
  read these on Android 10+. That gives a "SIM changed" alert for stolen phones and lets you match data to the right
  MTN/Orange line.

Dashboard surface, kept small:
- Devices table: one "Data this month" column, with a split bar (cellular vs Wi-Fi) and a red tint above a budget.
- Device drawer: a 30-day bar chart and "today / this month" numbers.
- Overview: one stat card "Cellular data this month" with the fleet total and the top three consumers.
- Settings: one field "Monthly cellular budget per phone (MB)" that drives the warning and the alert e-mail.

Phone side: show the driver their own month-to-date cellular usage in Settings so they can self-regulate, and let them
connect to Wi-Fi at home without an admin PIN (see section 3). That is the single biggest lever on the bill.

---

## 2. Dashboard: features worth adding (and what to leave out)

Keep the current information architecture (Fleet / Deploy / Admin). Add in this order:

1. **Driver and vehicle fields on a phone.** Today the phone *name* doubles as the driver's name. Add `driver_name`,
   `driver_phone`, `vehicle` (plate + model), keep the device name for the hardware. Enables "reassign phone to new
   driver" and clean search. Also map model codes to friendly names (`SM-A175F` → `Galaxy A17`).
2. **Lost / stolen mode.** One button that: locks the screen, shows a full-screen message with a call-back number, plays
   a loud sound, and optionally reports the last known location. Plus a separate, confirmed "Wipe phone"
   (`DevicePolicyManager.wipeData`). The agent already has the policy hooks; this is a new command type each.
3. **Managed apps (silent install of the Confiance Driver app).** Today only the kiosk APK is distributed. Extend
   "App versions" to accept any APK (the driver app, Maps alternatives) and install or update it silently on all phones
   or a group. The installer code is already there (`Installer.kt`). This removes the manual Play Store step on 200
   phones and lets you roll back a bad driver-app release.
4. **Alerts.** A scheduled function (daily digest e-mail, immediate for critical) for: phone offline > 12 h,
   data budget exceeded, SIM changed, phone released or unmanaged, battery < 10 % repeatedly. Recipients configured in
   Settings. One setting, one table `alerts`.
5. **App activity.** Hours per day the Confiance Driver app was in the foreground, and when the phone was last unlocked.
   This answers "is the driver actually working" without GPS. Needs usage access (same prerequisite as per-app data).
6. **Last known location (optional, per-group toggle).** Useful for recovery and for shift supervision. The driver app
   already tracks trips, so keep this to a coarse "last position at check-in" and state it in the phone's Settings
   screen for transparency.
7. **Small items:** CSV export of the Devices table; readable Activity labels ("Rebooted 1 phone" instead of
   `command:reboot 1 device(s)`) with a phone/user filter; OS security-patch level in the drawer; make the
   "Need attention" stat card clickable like the others.

Deliberately not recommended: screen mirroring, remote camera, keystroke or message logging, geofencing with
automatic actions. They add cost and privacy risk out of proportion to a salaried, trusted team, and they would
complicate the Play Protect position.

---

## 3. Driver app: what to change

Current state: navy header with "Welcome, <name>", online chip, grid of app tiles, footer with version and Settings.
The settings sheet shows version, device, management, last check-in, network, volume and brightness sliders,
"Check for updates" and the PIN-protected administrator menu. Single-app fleets auto-launch into that app.

Keep that shape. Changes:

- **Wi-Fi without the admin PIN.** Wi-Fi is currently under the administrator menu. Drivers need to join home or
  office Wi-Fi to save cellular data. Make "Wi-Fi networks" a normal Settings action (dashboard toggle to disable it
  per group if ever needed). The temporary lock-task allow-list for the system panel already exists.
- **Brightness bug.** The slider sets `window.attributes.screenBrightness`, which only affects the kiosk window; the
  moment the driver opens Maps the system brightness returns. As device owner use
  `dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, …)` (and switch off auto-brightness or leave it,
  but say which).
- **Status strip** under the header: battery %, Wi-Fi/cellular, "Data this month: 1.2 GB". One line, muted.
- **Driver identity:** show "<Driver name> · <Plate>" in the header once the dashboard has those fields.
- **Contact dispatch** button (dials the ops number through a temporary allow-list, like the Wi-Fi panel) and
  **Report a problem** (sends the diagnostics block to the dashboard and flags the phone). Both reduce support calls.
- **Settings sheet layout:** two sections, "This phone" (read-only facts) and "Adjust" (Wi-Fi, volume, brightness,
  language override EN/FR), then one "Administrator…" row. Remove the "Check for updates" button from the main sheet
  (keep it in Diagnostics); drivers never need it.
- Keep: 5-tap admin shortcut, EN/FR by locale, auto-launch for single-app groups, "Not installed" state on tiles.

---

## 4. Hosting: free and secure alternatives to Netlify

Load profile: 200 phones × one check-in / 5 min ≈ 58 k requests/day (1.7 M/month). With the Supabase wake-up channel
connected the agent already backs off to 15 min, ≈ 19 k/day. Request bodies are small; the APK is ~0.6 MB.

| Option | Free tier that matters | Fit | Effort to move |
|---|---|---|---|
| **Cloudflare** Pages + Workers + D1 + R2 (+ Durable Objects) | 100 k requests/day, D1 5 M reads + 100 k row writes/day, R2 10 GB, free WAF/rate-limiting, cron triggers | Best overall. Fits at a 10–15 min heartbeat with instant commands on the push channel. Durable Objects can replace Supabase Realtime later (one vendor). | Medium. The API is already a plain `Request → Response` function with injected `db`/`blobs`; D1 is SQLite so ~10 Postgres-isms in the SQL need rewriting (`SERIAL`, `::int`, `DOUBLE PRECISION`). |
| **Supabase** Edge Functions + Postgres + Storage, static dashboard on Cloudflare Pages or GitHub Pages | 500 k function invocations/month, 500 MB Postgres, 1 GB storage | Fits only with the 15 min heartbeat (≈570 k/month is at the limit). Keeps Postgres, migrations port as-is. Realtime is already there. | Low–medium (Deno runtime, same SQL). |
| **Oracle Cloud Always Free** VM (4 ARM cores, 24 GB RAM) with Node + Postgres + Caddy | No request caps, forever free | Most control, no limits, but you patch and back up the server yourself and Oracle reclaims idle instances. | Medium (Docker Compose), ongoing ops. |
| Render / Fly.io / Railway | Free web services sleep or expired DBs; Fly and Railway no longer free for new orgs | Not recommended for an always-on fleet API. | — |
| Vercel Hobby | Non-commercial only (ToS) | Excluded. | — |

Recommendation: Cloudflare. Second choice Supabase if you want zero SQL changes. Either way raise the default heartbeat
to 10 min now (instant commands already arrive by push), which also halves the Netlify bill if you stay.

Security is equivalent across the three: TLS, HttpOnly cookies, the per-phone bearer token and the signed APK
verification are all in the app code, not in the host. Cloudflare adds free bot protection and rate limiting in
front of `/api/login`.

---

## 5. Design review against the Confiance brand

Brand on confiance-app.com: navy (#081A51), white, reassuring tone, tagline "La mobilité en toute sérénité", FR/EN/ZH.

### Dashboard (SaaS console)

Overall: already a credible modern console. Inter, 8/12 px radii, navy sidebar, light surfaces, status pills, skeleton
loading, slide-over drawer, bulk bar, keyboard-safe refresh. Mobile layout works. Nothing needs a redesign; the points
below are polish.

1. **Language.** The UI is English, the login art is English with a French tagline, and the ops team is in Cameroon.
   Ship French as the default with an EN toggle in the user box. `app.js` uses literal strings (~250); a small
   dictionary and a `t()` helper is enough. Pick one language per screen (the login page currently mixes two).
2. **Naming and units.** Driver vs device naming (section 2.1); "50000 MB" → "48.8 GB"; "samsung SM-A175F" →
   "Samsung Galaxy A17"; the version card shows "—" when nothing is uploaded, say "Not uploaded yet".
3. **Devices table.** Add Network (icon) and Data columns; move the agent version into a pill shown only when
   outdated; on phone-sized screens render cards instead of a 760 px-wide table.
4. **Overview.** The "Needs attention" card leaves a tall empty column. Put the fleet-status bar as a full-width strip
   under the stat cards, then "Needs attention" and "Recent activity" side by side. Add the data stat card.
5. **Settings.** The security checklist marks "Exit PIN on" with a warning triangle while the control next to it says
   "on" in a warm pill; readers see a contradiction. Use a neutral grey row for "optional" states and reserve the
   warning for risky ones (2FA off, approval off). Group the page into Security / Phones / Wi-Fi / Users tabs
   instead of one long scroll.
6. **Activity.** Plain-language labels, a phone/user filter, and the IP address actually shown.
7. **Brand touches.** Keep navy for the sidebar and primary buttons. Use the brand-soft tint (#EAEFFB) for selected
   rows and the stat icons (already done) and avoid introducing new accent colours. The logo mark as favicon is right.

### Driver app (kiosk)

Overall: coherent with the console (navy header, white tiles, same status colours), readable in daylight, large
targets. Points:

1. Header: the wordmark is typed text; use the logo mark + wordmark lockup and the driver name/plate. Keep the
   rounded bottom corners.
2. Add the one-line status strip (battery, network, data) and the group message as a soft banner, not yellow text.
3. Tiles: fine. Cap labels at two lines, show a greyed tile with "Not installed" (already) and tap-to-report.
4. Settings sheet restructured as in section 3; fix system brightness; Wi-Fi for drivers.
5. Footer: replace "Confiance Kiosk · v1.3.4" + Settings with a bottom bar of three quiet actions: Wi-Fi, Dispatch,
   Settings. Version goes into Settings.
6. Keep EN/FR by device locale and add an in-app override; some drivers will prefer English on a French-locale phone.

---

## Suggested order of work

1. Data usage (agent + API + table column + drawer chart) and driver-side Wi-Fi. One release of the agent (1.4.0).
2. Driver/vehicle fields, friendly model names, units, FR translation of the dashboard.
3. Lost mode + wipe, managed apps, alerts.
4. Hosting move to Cloudflare, with the heartbeat at 10 min.
5. App activity and optional last location.
