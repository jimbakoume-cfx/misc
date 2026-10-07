# Security overview: Confiance Kiosk

## Dashboard
- Sign-in: password (12+ characters, scrypt-hashed) plus optional **two-factor codes** (authenticator app, with one-time
  recovery codes). Settings → *Require two-factor for all users* enforces it.
- Sessions: HttpOnly, SameSite=Strict, Secure cookies, 12 h. Changing your password or two-factor settings signs out all other
  sessions. Changes made from the browser must carry a custom header (CSRF protection).
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
- Updates: APKs must be signed with the same key (Android enforces this) and match the SHA-256 the server announces.

## Instant-command channel
- Supabase only carries an empty "wake up" ping on a per-phone channel named with 128 random bits. Someone who learned a channel
  name could only make that phone check in early; commands, policy and data are only ever served over the authenticated API.

## What you must protect
- The **signing keystore** (`kiosk-release.keystore` + its password): whoever holds it can ship an app that phones will accept.
- The **dashboard admin accounts** (turn on two-factor) and the **enrolment QR** until its expiry.
- Netlify account access (it can read the environment variables, including `SESSION_SECRET`).

## Known limits
- Recovering a phone that is offline and unusable needs a physical factory reset from the recovery menu (needs the phone in hand).
- `SESSION_SECRET` is stored as a normal (not "secret-flagged") Netlify variable because the connector used for setup could not
  set secret variables. Re-save it as a secret in the Netlify UI if you want it hidden from team members.
