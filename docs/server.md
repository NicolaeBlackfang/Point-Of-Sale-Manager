# Web Server — Installation & Guide

> The **server** is the Express + MongoDB API. It serves the website, authenticates staff, and
> receives the desktop app's sync traffic.
>
> Deploying this to a real server? Read **[VPS deployment](./vps-deployment.md)** — it covers
> provisioning, hardening, Nginx, TLS, systemd, backups and updates end to end.

---

## 1. Requirements

- **Node.js v18+** (v20 recommended)
- **MongoDB 6+** locally, or a **MongoDB Atlas** cluster
- A process manager (pm2 or systemd) for production

---

## 2. Install

```bash
git clone https://github.com/NicolaeBlackfang/Point-Of-Sale-Manager.git
cd Point-Of-Sale-Manager/server
npm ci                       # or: npm install
```

---

## 3. Configure

```bash
cp .env.example .env
$EDITOR .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB / Atlas connection string |
| `JWT_SECRET` | ✅ | — | Long random string used to sign JWTs |
| `PORT` | `5000` | `5000` | API port |
| `CLIENT_URL` | — | `http://localhost:5173` | Comma-separated CORS allow-list |
| `JWT_EXPIRE` | — | `1d` | Token lifetime |
| `LOW_STOCK_WEBHOOK_URL` | — | — | Low-stock webhook (overridable in Store Settings) |
| `CSP_ENABLED` | — | `true` | Set `false` only if a proxy manages CSP |
| `SEED_ADMIN_USERNAME` | — | `admin` | First Superadmin username (seed) |
| `SEED_ADMIN_PASSWORD` | — | — | First Superadmin password (seed) — min. 8 chars, a letter and a number |
| `SEED_ADMIN_NAME` | — | `System Administrator` | First Superadmin display name (seed) |

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. Seed the first Superadmin

```bash
SEED_ADMIN_PASSWORD='a-strong-password' npm run seed
```

The seed applies the same password policy as the staff endpoints: at least 8
characters, including at least one letter and one number.

---

## 5. Start the server

**Development**

```bash
npm run dev      # nodemon, auto-reload
```

**Production**

```bash
npm start        # node server.js
```

**With pm2**

```bash
npm i -g pm2
pm2 start server.js --name openpos-api
pm2 save
pm2 startup      # run the printed command once
```

**With systemd** — create `/etc/systemd/system/openpos-api.service`:

```ini
[Unit]
Description=OpenPOS API
After=network.target

[Service]
Type=simple
User=openpos
WorkingDirectory=/opt/openpos/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openpos-api
sudo systemctl status openpos-api
```

---

## 6. Verify

```bash
curl http://localhost:5000/api/health
# {"status":"ok","service":"openpos-api","uptime":12,"timestamp":"..."}
```

The health endpoint is public and never touches the database, so it works even when MongoDB is
down — useful for load-balancer checks.

---

## 7. Firewall & TLS

```bash
# Only expose 80/443; keep 5000 on localhost behind the reverse proxy
sudo ufw allow 'Nginx Full'
sudo ufw deny 5000
```

Terminate TLS at Nginx (certbot) or at a load balancer. Set `NODE_ENV=production` so the API
runs in production mode.

---

## 8. Runtime configuration

Currency, tax rate, low-stock threshold, timezone, and the low-stock webhook are **also**
editable in the UI under **Store Settings** — those override the environment defaults.

---

## 9. API surface

| Route | Purpose |
|---|---|
| `POST /api/auth/login` | Sign in, returns a JWT |
| `GET /api/products` | Product catalogue (branch-scoped) |
| `POST /api/sales` | Record a sale — **prices are recomputed server-side** |
| `GET /api/sales/my-sales` | The caller's own sales (used by the POS) |
| `POST /api/sales/:id/refund` | Refund a sale and restore stock |
| `GET /api/analytics/*` | Revenue, top products, payment mix |
| `GET /api/audit-logs` | Append-only audit trail (alias: `/api/system-logs`) |
| `GET/PUT /api/settings/*` | Store settings |
| `GET /api/health` | Liveness probe |

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `MongooseServerSelectionError` | `MONGODB_URI` is wrong, or the IP is not whitelisted in Atlas. |
| `jwt must be provided` | The client is not sending the `Authorization: Bearer` header. |
| `Not allowed by CORS` | Add the website origin to `CLIENT_URL` and restart. |
| `Too many requests` | The rate limiter tripped — 300 requests / 15 min per IP. |
| Seed says "user exists" | Use a different `SEED_ADMIN_USERNAME`, or reset the password in the UI. |
