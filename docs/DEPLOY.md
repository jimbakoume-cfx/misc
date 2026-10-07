# Deploying the dashboard

The dashboard + API is one small Node 22 service with an embedded SQLite database
(plenty for hundreds of devices). It needs **HTTPS** and a **persistent disk** for `/data`.

## Environment variables
| Variable | Purpose |
|---|---|
| `PUBLIC_URL` | Public HTTPS address, e.g. `https://kiosk.yourcompany.com`. Goes into the QR code. **Required.** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the first dashboard admin on first start (8+ char password). |
| `DATA_DIR` | Where the database and APKs live (default `/data` in Docker). Back this up. |
| `SESSION_SECRET` | Optional; generated and stored in `DATA_DIR` if absent. |
| `PORT` | Default 8080. |

## Docker
```bash
docker build -t kiosk-dashboard backend
docker run -d --restart=always -p 8080:8080 -v kiosk-data:/data \
  -e PUBLIC_URL=https://kiosk.yourcompany.com \
  -e ADMIN_EMAIL=you@yourcompany.com -e ADMIN_PASSWORD='choose-a-long-password' \
  kiosk-dashboard
```
Put it behind HTTPS (Caddy, nginx, Cloudflare Tunnel, or a platform such as Fly.io / Render / Railway with a volume).

## Without Docker
```bash
cd backend && npm ci --omit=dev
PUBLIC_URL=https://kiosk.yourcompany.com ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... npm start
```

## First-time setup in the dashboard
1. Sign in → **Settings** → set the **Admin PIN**.
2. **App versions** → upload `releases/kiosk-agent-1.0.0.apk` with version name `1.0.0`, code `1`, and the
   certificate checksum from `releases/kiosk-agent-1.0.0.txt`.
3. **Groups & apps** → create a group and tick the company apps agents may open (apps appear once a device has reported them; you can also type a package name).
4. **Add devices** → create a code → scan the QR on each reset phone (see PROVISIONING.md).

## Notes
- Devices call `POST /api/device/heartbeat` about once a minute: ~3 requests/second for 200 devices.
- Back up `DATA_DIR` (it holds `kiosk.db`, `apks/`, `session.secret`).
- Tests: `cd backend && npm test`.
