# Security overview: Confiance Kiosk

## Dashboard
- Sign-in: password (12+ characters, scrypt-hashed) plus optional **two-factor codes** (authenticator app, with one-time
  recovery codes). Settings → *Require two-factor for all users* enforces it.
- Sessions: HttpOnly, SameSite=Strict, Secure cookies, 12 h, when the console is served next to the API (Netlify proxy); a
  console hosted elsewhere (GitHub Pages) keeps a bearer token in the browser instead and sends no cookies. Changing your
  password or two-factor settings signs out all other sessions. Cookie-based changes must carry a custom header (CSRF).
- Brute-force protection: 8 failed sign-ins lock that address/account for 5 minutes. Failures are logged with the address.
- Roles: *Admin* and read-only *Viewer*. Every change is written to the Activity log.
- Browser hardening: strict Content-Security-Policy (no inline scripts), HSTS, no framing, no referrer, locked-down permissions.

## Phones
- Enrolment: the QR/code is single-purpose and expires. **New phones are locked down but get no apps until you approve them**
  (Settings → *New phones must be approved*).
- Lockdown: device-owner "lock task" mode, survives reboot. No factory reset, safe mode, USB debugging, adding users,
  installing/uninstalling apps, or force-stop / clear-data from Settings.
- No on-phone exit by default: only *Release* in the dashboard unlocks a phone. An optional exit PIN is hashed with PBKDF2
  (120,000 rounds) and locks out after 5 wrong tries.
- Removing a phone from the dashboard first unlocks it (*Release & remove*); *Delete now* is for lost phones.
- Transport: HTTPS only (the app refuses http://). Each phone has its own secret token, stored hashed on the server.
- Check-ins go through Supabase PostgREST with the public key plus the phone's token; every table has row-level security
  with no policies, so the public key can only call `kiosk_heartbeat` and `kiosk_report`, which verify the token themselves.
- Lost mode, ring, locate and wipe are dashboard commands written to the Activity log; wipe asks the admin to type the
  phone's name. Location is only reported when Settings → Phones → "Report last known location" is on, and the phone's
  Settings screen says so to the driver.
- Updates: APKs must be signed with the same key (Android enforces this) and match the SHA-256 the server announces.

## Instant-command channel
- Supabase only carries an empty "wake up" ping on a per-phone channel named with 128 random bits. Someone who learned a channel
  name could only make that phone check in early; commands, policy and data are only ever served over the authenticated API.

## What you must protect
- The **signing keystore** (`kiosk-release.keystore` + its password): whoever holds it can ship an app that phones will accept.
- The **dashboard admin accounts** (turn on two-factor) and the **enrolment QR** until its expiry.
- Supabase account access (database, storage and the function's secrets) and the static-hosting account (Netlify/GitHub).

## Known limits
- Recovering a phone that is offline and unusable needs a physical factory reset from the recovery menu (needs the phone in hand).
- The session secret and the cron key live in the `settings` table (generated on first start); anyone with database access
  can read them, which is also true of every other row.
