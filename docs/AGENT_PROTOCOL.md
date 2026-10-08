# Agent ↔ server protocol (agent 1.4.0, backend v2)

This is the contract between the Android agent (`android-agent/`) and the backend (`supabase/functions/kiosk/`).
All times are epoch milliseconds. All requests are HTTPS JSON.

## 1. Addresses

The phone stores:

- `serverUrl`: the dashboard/API base, e.g. `https://<ref>.supabase.co/functions/v1/kiosk` (from the QR
  `server_url` extra, the USB script, or typed by hand). Legacy phones may still hold `https://confiance-kiosk.netlify.app`,
  which proxies to the Supabase function.
- `rest.url` and `rest.key` (optional, returned by enrolment and by every policy): the Supabase REST base
  `https://<ref>.supabase.co/rest/v1` and the publishable (anon) key. When present, check-ins go there (cheap, no
  function invocation). When absent, check-ins go to `serverUrl`.

## 2. Enrolment (once)

`POST {serverUrl}/api/device/enroll`

```json
{ "enrollToken": "7NHNU-9UA6D", "androidId": "…", "serial": "…", "model": "samsung SM-A175F",
  "osVersion": "Android 15 (API 35)", "securityPatch": "2026-09-01", "imei": "…", "simSerial": "…" }
```

Response `200`:

```json
{ "deviceToken": "…", "name": "Driver-012", "id": 12,
  "rest": { "url": "https://<ref>.supabase.co/rest/v1", "key": "sb_publishable_…" } }
```

`403` = code invalid/expired/used up (the agent forgets the code and shows the entry form again).

## 3. Check-in (heartbeat)

Preferred: `POST {rest.url}/rpc/kiosk_heartbeat` with headers `apikey: {rest.key}`, `Content-Type: application/json`.
Fallback: `POST {serverUrl}/api/device/heartbeat` with `Authorization: Bearer {deviceToken}` (body without `token`).

Body (REST form; the fallback form is identical minus `token`):

```json
{
  "token": "<deviceToken>",
  "status": {
    "battery": 84, "charging": false, "network": "wifi|cellular|ethernet|none|other",
    "freeStorageMb": 48210, "agentVersion": "1.4.0", "agentVersionCode": 13,
    "deviceOwner": true, "released": false, "lastCrash": "", "pushConnected": true, "uptimeMin": 1440,
    "securityPatch": "2026-09-01", "imei": "…", "simSerial": "…", "simOperator": "MTN Cameroon",
    "phoneNumber": "+2376…", "signal": 3, "usageAccess": true, "lostMode": false, "lang": "fr"
  },
  "acks": [ { "id": "41", "status": "done|failed", "error": "" } ],
  "apps": [ { "pkg": "com.confiance.driver", "label": "Confiance Driver", "versionCode": 120 } ],
  "usage": { "mobileBytes": 1048576, "wifiBytes": 5242880,
             "appUsage": { "com.confiance.driver": 412, "com.whatsapp": 35 } },
  "location": { "lat": 3.8667, "lon": 11.5167, "accuracy": 25, "at": 1760000000000 }
}
```

- `apps` is only sent when the list changed (hash) — same as 1.3.x. `versionCode` is new and lets the server
  decide which managed apps need installing.
- `usage.mobileBytes` / `wifiBytes` are the **deltas since the previous check-in** (the agent keeps the last
  `TrafficStats` sample; after a reboot the baseline is 0). `appUsage` is **today's total foreground minutes**
  per allowed package (absolute, server replaces). Omit `usage` entirely when nothing could be measured.
- `location` is only sent when the policy has `reportLocation: true` and a fix is available, or when a
  `locate` command was received (then a fresh fix is attempted first).

Response `200`:

```json
{
  "policy": {
    "version": 1000042, "name": "Driver-012", "driverName": "Aminatou Njoya", "vehicle": "Prado · LT 452 AB",
    "allowedApps": [ { "pkg": "com.confiance.driver", "label": "Confiance Driver" } ],
    "message": "", "pinSalt": "", "pinHash": "pbkdf2$120000$…$…", "disableDebugging": true,
    "intervalSec": 600, "pushIntervalSec": 1800,
    "push": { "url": "https://<ref>.supabase.co", "key": "sb_publishable_…", "channel": "dev-…" },
    "rest": { "url": "https://<ref>.supabase.co/rest/v1", "key": "sb_publishable_…" },
    "serverUrl": "https://<ref>.supabase.co/functions/v1/kiosk",
    "driverWifi": true, "dispatchPhone": "+237 6 00 00 00 00", "reportLocation": false,
    "installApps": [ { "pkg": "com.confiance.driver", "versionCode": 121, "url": "https://…/apk/<sha>.apk", "sha256": "…" } ],
    "lostMode": { "on": false, "message": "", "phone": "" },
    "dataBudgetMb": 2048,
    "update": { "url": "https://…/apk/<sha>.apk", "sha256": "…", "versionCode": 15, "versionName": "1.4.2" }
  },
  "commands": [ { "id": "41", "type": "lock", "payload": {} } ]
}
```

Policy rules for the agent:

- Apply the lockdown when `version` changes (as before).
- `intervalSec` is the check-in interval without a live push connection; `pushIntervalSec` (≥ intervalSec) is
  the interval while the push channel is connected.
- `serverUrl`: when present and different from the stored one, store it (this is how phones move from Netlify to
  Supabase). `rest`: store when present; clear when absent.
- `driverWifi`: when true the Settings sheet offers "Wi-Fi networks" to the driver without a PIN.
- `dispatchPhone`: when non-empty, show a "Call dispatch" action that dials it (dialer temporarily allowed in lock task).
- `update` (1.4.2+): present when a newer kiosk release exists and auto-update is on; the agent installs it
  itself (retrying every 10 minutes while it fails) and the app's Settings screen offers "Update now".
- `installApps`: for each entry whose package is missing or has an installed `versionCode` lower than the given
  one, download `url`, verify `sha256`, and install silently (PackageInstaller, device owner). At most one attempt
  per package per hour; report failures in the next heartbeat as `status.lastError`.
- `lostMode.on`: show the lost screen (full-screen message + "Call {phone}" button), keep the task locked, ring loudly
  for 60 s on entering lost mode. Report `status.lostMode: true`. The dashboard clears it with a `found` command
  or by `lostMode.on: false`.
- `dataBudgetMb`: shown to the driver next to their month-to-date cellular usage.

## 4. Commands

| type | payload | agent behaviour | ack |
|---|---|---|---|
| `refresh` | | re-apply policy | yes |
| `reboot` | | reboot | no (server marks done when sent) |
| `lock` | | `lockNow()` | yes |
| `release` / `relock` | | leave / re-enter kiosk | yes |
| `unenroll` | | remove management, clear prefs | no |
| `update` | `{url, sha256, versionCode}` | self-update | no |
| `install` | `{pkg, url, sha256, versionCode}` | install/update another app | yes (after commit; failure → `failed` + error) |
| `lost` | `{message, phone}` | enter lost mode + ring | yes |
| `found` | | leave lost mode | yes |
| `ring` | `{seconds}` (default 30) | alarm sound at max volume, screen on | yes |
| `locate` | | get a fresh location, send it in the next heartbeat (check in immediately) | yes |
| `wipe` | | `wipeData(0)` (factory reset) | no (ack before wiping is impossible; server marks done when sent) |

Acks are sent in the next heartbeat's `acks` array (as in 1.3.x).

## 5. Problem reports from the driver

`POST {rest.url}/rpc/kiosk_report` (apikey header) or `POST {serverUrl}/api/device/report` (Bearer):

```json
{ "token": "<deviceToken>", "kind": "problem", "text": "L'application se ferme toute seule" }
```

Creates an alert in the dashboard (kind `problem`). Max 300 characters; at most one report per 10 minutes per phone.

## 6. Setup beacon (unchanged)

`POST {serverUrl}/api/setup-beacon` `{ step, detail, model }`, no auth, throttled.

## 7. Realtime wake-up (unchanged)

The phone joins Supabase Realtime channel `policy.push.channel` with `policy.push.key`; any `wake` broadcast triggers
an immediate check-in. The free plan allows 200 concurrent connections: phones that cannot join simply poll at
`intervalSec`.
