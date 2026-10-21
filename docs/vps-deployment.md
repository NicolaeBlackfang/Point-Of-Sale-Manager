# VPS Deployment Guide

> Hosting **OpenPOS** on a real server: a VPS with Ubuntu, Nginx, Let's Encrypt, and MongoDB
> Atlas — plus the terminal desktops that talk to it.

This is the complete path from "I bought a VPS" to "the cashier can sell".

---

## 0. The 15-minute checklist

If you just want it online, this is the whole thing:

```bash
# 1. Server
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git curl
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable

# 2. Node + code
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo git clone <your-repo> /opt/openpos && cd /opt/openpos
sudo npm ci --prefix server && npm ci --prefix apps/web && npm ci

# 3. Config
sudo cp server/.env.example server/.env && sudo nano server/.env   # MONGODB_URI + JWT_SECRET
sudo npm run build:web --prefix apps/web

# 4. Service
sudo cp deploy/openpos-api.service /etc/systemd/system/
sudo systemctl enable --now openpos-api

# 5. Nginx + TLS
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/openpos-security-headers.conf /etc/nginx/snippets/
sudo cp deploy/openpos-nginx.conf /etc/nginx/sites-available/openpos
sudo ln -s /etc/nginx/sites-available/openpos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pos.example.com -d api.example.com
```

The rest of this document explains each step and what to do when it breaks.

---

## 1. Topology

```
   ┌──────────────────────────── your VPS (Ubuntu 24.04/26.04) ─────────────────────────┐
   │                                                                                      │
   │   Internet ──443──▶ Nginx                                                          │
   │                     ├── /            → static SPA      (apps/web/dist)              │
   │                     └── /api/        → 127.0.0.1:5000    (node server.js)            │
   │                                          │                                           │
   │   127.0.0.1:5000 ◀── systemd: openpos-api (user: openpos)                            │
   │                                          │                                           │
   │                                          ▼                                           │
   │                              MongoDB Atlas  (or a local mongod)                       │
   └──────────────────────────────────────────────────────────────────────────────────────┘

   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Terminal │   │ Terminal │   │ Browser  │      → https://api.example.com/api
   │ (deb)    │   │ (AppImage)│  │ (web)    │      → https://pos.example.com
   └──────────┘   └──────────┘   └──────────┘
```

**Two domains** (or one domain + two paths) are needed:

| Domain | Serves |
|---|---|
| `pos.example.com` | The website (React SPA) |
| `api.example.com` | The API (`/api/...`) |

The desktop terminals are configured with the **API** URL (`https://api.example.com/api`),
not the website URL.

---

## 2. Sizing

| Load | vCPU | RAM | Disk |
|---|---|---|---|
| 1–2 terminals, <500 sales/day | 1 | 1 GB | 20 GB |
| 2–5 terminals, a few branches | 2 | 2–4 GB | 40 GB |
| 5+ terminals, analytics-heavy | 2+ | 4–8 GB | 80 GB+ |

Add 2 GB swap on any box with 1–2 GB RAM — MongoDB and Node both use it as a safety net.

---

## 3. Provision and harden the server

### 3.1 Create the server

Any mainstream provider works (Hetzner, DigitalOcean, Linode, Vultr, AWS Lightsail, …).
Pick **Ubuntu 24.04 LTS** or newer. After the OS is up:

```bash
sudo adduser --disabled-password --gecos "" openpos
sudo usermod -aG sudo openpos          # only if you need the user to sudo
```

### 3.2 SSH keys only

```bash
# on your laptop
ssh-keygen -t ed25519 -C "openpos-vps"
ssh-copy-id openpos@SERVER_IP

# on the server — turn off password auth
sudo nano /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin no
sudo systemctl restart ssh
```

Keep one terminal open until key-based login is confirmed working.

### 3.3 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

**Never open 5000.** The API is reached through Nginx on 443 only.

### 3.4 Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3.5 fail2ban (optional, but cheap)

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

### 3.6 Time and swap

```bash
sudo timedatectl set-timezone UTC
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. DNS

Add **A records** at your registrar (or in Cloudflare / Route 53):

| Type | Name | Value |
|---|---|---|
| A | `pos` | the VPS IPv4 |
| A | `api` | the VPS IPv4 |

Wait for propagation (`dig +short pos.example.com`) before running Certbot — otherwise the
certificate request fails.

---

## 5. Database

### 5.1 MongoDB Atlas (recommended)

1. Create a free **M0** cluster (or a paid one for production).
2. **Database Access** → add a user with *Read and write to any database*.
3. **Network Access** → allow your VPS IP (`SERVER_IP/32`). Do **not** open `0.0.0.0/0`.
4. Copy the connection string:
   `mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/retail_pos_system?retryWrites=true&w=majority`

> The password must be URL-encoded if it contains `@ : / # ?` characters.

### 5.2 MongoDB on the VPS itself

Only if you want no external dependency. **You must back it up yourself.**

```bash
sudo install -m 0755 https://www.mongodb.org/static/pgp/server-8.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
sudo systemctl status mongod
```

`MONGODB_URI` then becomes `mongodb://127.0.0.1:27017/retail_pos_system`.

---

## 6. Install Node and OpenPOS

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # v24.x
```

Install the application as the `openpos` user, never as root:

```bash
sudo -u openpos git clone <your-repo> /opt/openpos
cd /opt/openpos
sudo -u openpos npm ci --prefix server
sudo -u openpos npm ci --prefix apps/web
sudo -u openpos npm ci
```

Build the website bundle (the desktop app is built on a developer machine or in CI):

```bash
sudo -u openpos npm run build:web --prefix apps/web
ls apps/web/dist/index.html
```

---

## 7. Configure the API

```bash
sudo -u openpos cp server/.env.example server/.env
sudo -u openpos nano server/.env
```

Minimum for production:

```ini
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/retail_pos_system?retryWrites=true&w=majority
JWT_SECRET=<64+ random hex characters>
CLIENT_URL=https://pos.example.com
CSP_ENABLED=true
```

Generate the secret on the server so it never travels over chat:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`CLIENT_URL` is the **website** origin — that is what the browser sends. The desktop terminals
are not browsers, so they do not need to be listed.

Lock the file down — it holds the Atlas password:

```bash
sudo chown openpos:openpos /opt/openpos/server/.env
sudo chmod 600 /opt/openpos/server/.env
```

### Seed the first Superadmin

```bash
cd /opt/openpos/server
sudo -u openpos env SEED_ADMIN_PASSWORD='<strong password>' npm run seed
```

---

## 8. Run the API as a systemd service

Create `/etc/systemd/system/openpos-api.service` (also checked in as
[`deploy/openpos-api.service`](../deploy/openpos-api.service)):

```ini
[Unit]
Description=OpenPOS API
Documentation=https://github.com/NicolaeBlackfang/Point-Of-Sale-Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openpos
Group=openpos
WorkingDirectory=/opt/openpos/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=-/opt/openpos/server/.env

# --- hardening ---
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false
ReadWritePaths=/opt/openpos/server/uploads

# --- logging ---
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openpos-api

[Install]
WantedBy=multi-user.target
```

> `ReadWritePaths=/opt/openpos/server/uploads` is required because the API writes uploaded
> product images there. `ProtectSystem=strict` makes everything else read-only.

```bash
sudo mkdir -p /opt/openpos/server/uploads
sudo chown -R openpos:openpos /opt/openpos/server/uploads
sudo systemctl daemon-reload
sudo systemctl enable --now openpos-api
sudo systemctl status openpos-api
```

**Check the log:**

```bash
sudo journalctl -u openpos-api -f
```

### Log rotation

Journald already rotates, but if you prefer files, add `/etc/logrotate.d/openpos`:

```
/var/log/openpos/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

## 9. Nginx

> The same two vhosts are checked in as [`deploy/openpos-nginx.conf`](../deploy/openpos-nginx.conf)
> — copy that file, replace the domain names, and skip the rest of this section.

### 9.1 The API

`/etc/nginx/sites-available/openpos-api`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    client_max_body_size 6m;      # base64 product images

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 60s;
    }

    # uploaded product images
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }

    location / {
        return 404;
    }
}
```

`X-Forwarded-For` matters: the API uses `app.set('trust proxy', 1)`, so the rate limiter and
the audit log see the **real** client IP instead of `127.0.0.1`.

> **Behind a CDN or another proxy?** `trust proxy = 1` means "one hop between the browser and
> Node". If you put Cloudflare, CloudFront or a load balancer in front of Nginx, the chain
> becomes client → CDN → Nginx → Node, and Express would read the *CDN's* IP as the client.
> Raise the value to match the number of trusted hops:
>
> ```js
> app.set('trust proxy', 2);   // 1 = Nginx only, 2 = Nginx + one proxy in front
> ```
>
> Only raise it as far as you actually trust — each extra hop lets a client spoof its own
> `X-Forwarded-For` and slip past the rate limiter.

### 9.2 The website

The web app is served by Nginx, so the security headers (CSP, HSTS, clickjacking protection)
have to be configured **here** — the API's Helmet headers only apply to the API's own
responses.

First install the shipped header snippet and point its CSP at your API origin:

```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/openpos-security-headers.conf /etc/nginx/snippets/
sudo sed -i 's#https://api.example.com#https://api.example.com#g' /etc/nginx/snippets/openpos-security-headers.conf
```

> Replace `https://api.example.com` inside the snippet with your real API origin. If it does not
> match, the browser blocks every request to the backend (the CSP `connect-src`).

`/etc/nginx/sites-available/openpos-website`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pos.example.com;

    root /opt/openpos/apps/web/dist;
    index index.html;

    include /etc/nginx/snippets/openpos-security-headers.conf;

    # SPA fallback — every unknown route must serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # hashed assets can be cached forever
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        # a location block with its own add_header loses the inherited headers
        include /etc/nginx/snippets/openpos-security-headers.conf;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
        include /etc/nginx/snippets/openpos-security-headers.conf;
    }
}
```

> The SPA fallback is mandatory. Without it, refreshing `pos.example.com/products` gives a 404.

> **Gotcha:** in Nginx a `location` block that declares its own `add_header` drops every
> header inherited from the `server` block. The snippet is therefore included in the
> `/assets/` and `= /index.html` blocks as well.

### 9.3 Enable both

```bash
sudo ln -s /etc/nginx/sites-available/openpos-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/openpos-website /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10. TLS with Let's Encrypt

```bash
sudo certbot --nginx -d pos.example.com -d api.example.com
```

Certbot rewrites the vhosts, adds the redirect to HTTPS and installs the renewal timer.

**Verify auto-renewal:**

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

Certbot also needs to be able to reach the ACME endpoint on port 80 — keep `ufw` open on 80/443.

---

## 11. Verify the deployment

```bash
# 1. API is alive
curl https://api.example.com/api/health
# {"status":"ok","service":"openpos-api",...}

# 2. The website loads
curl -I https://pos.example.com
# HTTP/2 200

# 3. The API refuses anonymous access
curl -o /dev/null -w "%{http_code}\n" https://api.example.com/api/products
# 401

# 4. Login works
curl -s -X POST https://api.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"..."}' | head -c 40
```

**Then point a terminal at it:**

1. Install the desktop app on the counter machine (see [Desktop app guide](./desktop-app.md)).
2. **Settings → Desktop Application → Backend server** → `https://api.example.com/api`.
3. Sign in, sell a test product, and check it in the web dashboard.

---

## 12. Updating

```bash
cd /opt/openpos
sudo -u openpos git pull
sudo -u openpos npm ci --prefix server
sudo -u openpos npm ci --prefix apps/web
sudo -u openpos npm run build:web --prefix apps/web
sudo systemctl restart openpos-api
```

A zero-downtime deploy needs two API instances behind Nginx with `proxy_pass` to a Unix socket
or a second port — overkill for a single shop.

---

## 13. Backups

### 13.1 Database (Atlas)

```bash
sudo apt install -y mongodb-database-tools
mongodump --uri="$MONGODB_URI" --archive=/var/backups/openpos-$(date +%F).gz --gzip
```

Cron, daily at 02:17:

```cron
17 2 * * * mongodump --uri="mongodb+srv://..." --archive=/var/backups/openpos-$(date +\%F).gz --gzip
```

Keep the dump **off the VPS** too — `rclone`/`aws s3 sync` to a bucket.

### 13.2 Uploads and config

```bash
sudo tar czf /var/backups/openpos-files-$(date +%F).tar.gz \
  /opt/openpos/server/uploads /opt/openpos/server/.env
```

**Store the `.env` backup encrypted.** It contains the Atlas password and the JWT secret.
Rotating `JWT_SECRET` logs everyone out, so keep it safe.

---

## 14. Monitoring

```bash
# disk
df -h
# service
sudo systemctl status openpos-api
# recent errors
sudo journalctl -u openpos-api -p err --since "24 hours ago"
# live access
sudo tail -f /var/log/nginx/pos.example.com.access.log
```

For real alerting, add a tiny cron job that pings you when the health check fails:

```bash
*/5 * * * * curl -fsS https://api.example.com/api/health >/dev/null || /usr/local/bin/alert-admin
```

---

## 15. Security checklist

| Item | Status |
|---|---|
| SSH keys only, root login disabled | ☐ |
| `ufw` default-deny, port 5000 **not** open | ☐ |
| `MONGODB_URI` and `JWT_SECRET` in `server/.env`, mode `600` | ☐ |
| Atlas network access limited to the VPS IP | ☐ |
| `CLIENT_URL` set to the real website origin (CORS) | ☐ |
| TLS on both domains, auto-renewal verified | ☐ |
| `NODE_ENV=production` | ☐ |
| Database backups running **and** a restore tested | ☐ |
| systemd hardening directives in place | ☐ |

---

## 16. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `502 Bad Gateway` from Nginx | The API is down. `sudo systemctl status openpos-api` and `journalctl -u openpos-api`. |
| `429 Too many requests` for everyone | The rate limiter is counting the proxy as the client. Make sure `X-Forwarded-For` is set — it is, in the vhost above. |
| `Not allowed by CORS` in the browser console | `CLIENT_URL` does not match the site origin exactly (scheme + host + port). Restart the API after changing it. |
| SPA 404 on refresh | Missing `try_files $uri $uri/ /index.html;`. |
| Certificate request fails | DNS has not propagated yet, or port 80 is blocked. Check `dig +short pos.example.com`. |
| `MongooseServerSelectionError` | Wrong `MONGODB_URI`, or the VPS IP is not whitelisted in Atlas. |
| Uploads return 403 | `ReadWritePaths=/opt/openpos/server/uploads` is missing from the unit, or the folder is not owned by `openpos`. |
| Terminals cannot sign in | They are pointed at `http://localhost:5000`. Set the **Backend server** to `https://api.example.com/api`. |
| `jwt expired` everywhere | The token lifetime passed — sign in again. A `401` deliberately keeps the offline queue intact. |
| AppImage says "No usable sandbox!" | Install the AppArmor profile: see [Desktop app guide](./desktop-app.md). |

---

## 17. Related documents

- [server.md](./server.md) — the API itself: env reference, seeding, API surface
- [website.md](./website.md) — the web app: build, roles, reporting
- [desktop-app.md](./desktop-app.md) — the terminal: install, printers, offline behaviour
- [architecture.md](./architecture.md) — how the pieces fit together
- [memory.md](./memory.md) — decisions and gotchas that affect deployment
