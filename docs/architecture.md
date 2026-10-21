# OpenPOS — Architecture

**Version:** 1.0.0
**Last updated:** 2026-10-21

---

## 1. System Overview

OpenPOS is a **three-tier system** with a deliberate split between the *web server* and the
*software application*:

```
┌───────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT TOPOLOGY                          │
│                                                                       │
│   ┌──────────────────────┐        ┌───────────────────────────┐     │
│   │   CASHIER TERMINAL   │        │      HEAD OFFICE / WEB    │     │
│   │  ┌────────────────┐  │        │   ┌───────────────────┐   │     │
│   │  │ apps/desktop   │  │        │   │  Browser / SPA    │   │     │
│   │  │ Electron app   │  │        │   │  apps/web (dist)  │   │     │
│   │  └───────┬────────┘  │        │   └─────────┬─────────┘   │     │
│   │          │           │        │             │             │     │
│   │   ┌──────▼──────┐    │        │             │             │     │
│   │   │  SQLite     │    │        │             │             │     │
│   │   │  local DB   │    │        │             │             │     │
│   │   └─────────────┘    │        │             │             │     │
│   └──────────┬───────────┘        └─────────────┼─────────────┘     │
│              │            (HTTPS / HTTP)         │                   │
│              └────────────────┬───────────────────┘                   │
│                               ▼                                       │
│                 ┌─────────────────────────────┐                      │
│                 │        server/  (Express)    │                      │
│                 │  routes → controllers →      │                      │
│                 │  services → Mongoose models │                      │
│                 └──────────────┬──────────────┘                      │
│                                ▼                                     │
│                 ┌─────────────────────────────┐                      │
│                 │   MongoDB / MongoDB Atlas   │                      │
│                 └─────────────────────────────┘                      │
└───────────────────────────────────────────────────────────────────────┘
```

**Key point:** the desktop app and the website render the **same React bundle**
(`apps/web/`). The desktop app adds a native shell around it. This is why a UI change ships to
both surfaces at once, and why feature parity is a hard rule (`docs/rules.md` R-2.1).

---

## 2. Repository Structure

```
openpos/
├── apps/
│   ├── desktop/                       # Electron main process (client-only)
│   │   ├── main.cjs                   # lifecycle, window, menu, IPC handlers
│   │   ├── preload.cjs                # contextBridge whitelist
│   │   ├── printers.cjs               # OS printers, silent HTML print, ESC/POS TCP
│   │   ├── sqlite-store.cjs           # local SQLite (products, queue, carts)
│   │   └── sync-engine.cjs            # background queue sync + reachability probe
│   │
│   └── web/                           # React SPA (website AND desktop renderer)
│       ├── index.html
│       ├── vite.config.js             # base/ + router switch on VITE_DESKTOP
│       ├── public/favicon.svg
│       └── src/
│           ├── main.jsx
│           ├── App.jsx                # BrowserRouter | HashRouter
│           ├── pages/                 # Login, Cashier/Operator/Superadmin dashboards
│           ├── components/
│           │   ├── ui/                # Layout, Sidebar, ProtectedRoute, Pagination
│           │   ├── pos/               # ProductGrid, CartTable, CartModal, ReceiptDocument
│           │   ├── inventory/         # Add/Edit product, image upload, operator module
│           │   ├── staff/             # Staff CRUD, cashier performance
│           │   ├── reports/           # Analytics, sales log, financial export
│           │   ├── logs/              # Cashier audit logs
│           │   └── settings/          # Store, receipt template, printer, desktop
│           ├── context/               # Auth, Settings, Theme
│           ├── services/              # api.js, electron.js, offline.js
│           ├── utils/                 # printer.js, receiptTemplate.js, formatting
│           └── context/ + index.css
│
├── server/                            # Express + MongoDB web server
│   ├── server.js                      # HTTP entrypoint
│   ├── app.js                         # middleware chain + route mounting
│   ├── config/db.js                   # Mongoose connection
│   ├── routes/                        # express routers (mounted under /api)
│   ├── controllers/                   # request handlers
│   ├── middleware/                    # auth, role/branch guard, sanitiser
│   ├── models/                        # Product, Sale, Receipt, Setting, SystemLog, User
│   ├── utils/                         # validators, cache, timezone, receipts, refunds, audit
│   ├── scripts/seed.js                # first Superadmin
│   └── tests/                         # node:test suites (no DB required)
│
├── build/                             # app icons (PNG set + ICO)
├── scripts/                           # nsis-no-wine.cjs (Linux → Windows cross-build)
├── docs/                              # this documentation set
└── package.json                       # workspace scripts + electron-builder config
```

---

## 3. The Server (`server/`)

### 3.1 Request pipeline

```
request
  → helmet (CSP, frameguard, HSTS)
  → cors (allow-list from CLIENT_URL)
  → express.json / urlencoded  (10 kB limit)
  → express-rate-limit  (global)
  → sanitizeMiddleware            ← NoSQL-operator stripping, FIRST custom middleware
  → /api routes
      → authMiddleware            ← JWT verify
      → role / branch guard       ← superadmin | operator | cashier
      → controller
          → utils (validators, cache, timezone, receipts, refunds, audit)
          → Mongoose model
```

### 3.2 Layers

| Layer | Directory | Responsibility |
|---|---|---|
| **Routes** | `server/routes/` | Declare endpoints and attach middleware. No business logic. |
| **Controllers** | `server/controllers/` | Read/validate the request, call utils + models, shape the response. |
| **Models** | `server/models/` | Mongoose schemas, indexes, validation, `timestamps`. |
| **Middleware** | `server/middleware/` | Authentication, authorisation, input sanitising. |
| **Utils** | `server/utils/` | Pure, testable helpers shared by controllers. |

### 3.3 Data model

| Model | Purpose | Key constraints |
|---|---|---|
| `User` | Staff accounts | bcrypt hash, `role` ∈ {superadmin, operator, cashier}, `branchNumber` |
| `Product` | Inventory item | `sku` unique (case-insensitive), `imageUrl` **required**, `price`, `stockQuantity`, `branchNumber` |
| `Sale` | A transaction | server-computed `totalWithTax`, line items, `paymentMethod`, `transactionId`, `refundStatus` |
| `Receipt` | Retained receipt snapshot | expires 7 days after `createdAt` |
| `Setting` | Store configuration | singleton-ish key/value (currency, tax, timezone, webhook) |
| `SystemLog` | Audit trail | append-only, human-readable `action` + `details` |

---

## 4. The Web Application (`apps/web/`)

### 4.1 Two build modes, one source

| Mode | Command | `base` | Router | `window.electron` |
|---|---|---|---|---|
| **Web** | `npm run build:web` | `/` | `BrowserRouter` | absent |
| **Desktop** | `npm run build:desktop` | `./` | `HashRouter` | present |

The switch is the `VITE_DESKTOP` environment variable, read in
`apps/web/vite.config.js` and `apps/web/src/App.jsx`. The desktop build must use relative asset
paths because the bundle is loaded over `file://`.

### 4.2 Service layer

| Module | Responsibility | Native equivalent |
|---|---|---|
| `services/api.js` | Axios instance, JWT interceptor, runtime API base (`setApiBase`) | — |
| `services/electron.js` | Safe wrapper over `window.electron`; every method no-ops safely when absent | the preload bridge |
| `services/offline.js` | Storage-agnostic offline API: SQLite on desktop, IndexedDB in the browser | `apps/desktop/sqlite-store.cjs` |

**`services/offline.js` is the single offline entry point.** Its public surface:

```
cacheProduct / getCachedProduct / getCachedProducts
queueSale / getQueuedSales / removeQueuedSale / getQueueCount / flushQueue
cacheRecentSales / getCachedRecentSales
saveActiveCart / getActiveCart / getActiveCarts / removeActiveCart
isNetworkError
```

### 4.3 State

| Context | Provider | Purpose |
|---|---|---|
| `AuthContext` | `AuthProvider.jsx` | Current user, role, JWT, login/logout |
| `SettingsContext` | `SettingsProvider.jsx` | Store settings, currency/tax formatting |
| `ThemeContext` | `ThemeProvider.jsx` | Light/dark preference |

---

## 5. The Desktop Application (`apps/desktop/`)

### 5.1 Process model

```
┌─ MAIN PROCESS (Node) ──────────────────────────────────────────────┐
│                                                                      │
│  main.cjs                                                            │
│   ├── BrowserWindow lifecycle, persistent bounds                    │
│   ├── Native application menu                                        │
│   ├── Auto-launch registration (XDG / LoginItem)                    │
│   ├── IPC handlers (the only renderer→system door)                  │
│   └── syncEngine.startAutoSync({ intervalMs: 30_000 })               │
│                                                                      │
│  sqlite-store.cjs ── SQLite (node-sqlite3-wasm)                     │
│      products | sales_queue | sales_cache | sync_meta | active_carts│
│                                                                      │
│  printers.cjs                                                        │
│      ├── listSystemPrinters()                                        │
│      ├── printHtml()   → hidden BrowserWindow + webContents.print()  │
│      └── printEscPosOverNetwork() → raw TCP to host:9100            │
└──────────────────────────────────────────────────────────────────────┘
              ▲ contextBridge (whitelist) ▲
┌─ PRELOAD (sandboxed bridge) ────────────────────────────────────────┐
│  preload.cjs — exposes window.electron.{printing, desktop, sync,    │
│                sqlite, apiBase}                                     │
└──────────────────────────────────────────────────────────────────────┘
              ▲ ipcRenderer.invoke ▲
┌─ RENDERER (Chromium) ──────────────────────────────────────────────┐
│  apps/web/dist — the exact same React app the website serves        │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Security posture

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Renderer cannot reach Node globals |
| `nodeIntegration` | `false` | No `require` in the page |
| `sandbox` | `false` | Required for the WASM SQLite loader in the main process |
| `webSecurity` | `true` | Same-origin policy enforced |
| Preload | whitelist | No generic `invoke` escape hatch |

### 5.3 Local database

`~/.config/openpos/openpos-offline.db` (Linux) / the OS user-data path (Windows/macOS).

| Table | Purpose | Key columns |
|---|---|---|
| `products` | Offline product catalogue | `id` PK, `sku` UNIQUE, `data` (JSON), `cachedAt` |
| `sales_queue` | Un-synced sales | `id` PK AUTOINCREMENT, `payload` (JSON), `queuedAt`, `synced` |
| `sales_cache` | Recent sale history offline | `id` PK, `data` (JSON), `cachedAt` |
| `sync_meta` | Key/value (e.g. the API base URL) | `key` PK, `value` |
| `active_carts` | In-progress baskets | `id` PK, `data` (JSON), `updatedAt` |

`node-sqlite3-wasm` is used **instead of** `better-sqlite3` because a native binding would need
rebuilding against Electron's ABI on every Electron upgrade. The WASM build behaves identically in
plain Node (unit tests) and inside Electron.

### 5.4 Sync engine

```
every 30 s
  └─ TCP reachability probe (host/port from the API base)
       └─ POST {apiBase}/sales  for each queued sale, FIFO
            ├─ 2xx      → remove from queue, sent++
            ├─ 401/403  → STOP, keep the queue  (token expired → re-auth)
            ├─ 4xx      → drop THIS sale, continue  (payload rejected)
            └─ 5xx/net → STOP, keep the queue  (retry next pass)
```

Authentication: the renderer pushes its JWT to the main process via `sync:setToken` whenever an
API request is made (`services/api.js` interceptor). The main process never reads the token from
disk.

The renderer **also** runs its own flush on mount, on `online`, and every 30 s. Both paths are
idempotent because the server deduplicates by `transactionId`.

### 5.5 Printing transports

| Transport | Mechanism | Availability |
|---|---|---|
| `system` | `window.print()` | Browser + desktop |
| `native` | Hidden `BrowserWindow` + `webContents.print()` (silent) | Desktop |
| `escpos-network` | Raw TCP to `host:9100` | Desktop |
| `webusb` / `webserial` / `webbluetooth` | Browser USB/Serial/Bluetooth APIs | Browser + Chromium desktop |

`native` renders the receipt to HTML (`utils/printer.js` → `buildReceiptHtml`), which supports the
full receipt template including custom CSS, logo, and QR code.

---

## 6. Configuration

### 6.1 Server environment (`server/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB / Atlas connection string |
| `JWT_SECRET` | ✅ | — | JWT signing secret |
| `PORT` | — | `5000` | API port |
| `CLIENT_URL` | — | `http://localhost:5173` | CORS allow-list |
| `JWT_EXPIRE` | — | `1d` | Token lifetime |
| `LOW_STOCK_WEBHOOK_URL` | — | — | Low-stock webhook |
| `CSP_ENABLED` | — | `true` | Content-Security-Policy toggle |
| `SEED_ADMIN_*` | — | — | Optional first Superadmin |

### 6.2 Web environment (`apps/web/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base for the **web** build |
| `VITE_DESKTOP` | `false` | Set to `true` for the desktop bundle (relative assets + hash router) |

### 6.3 Runtime configuration (desktop)

| Setting | Stored in | Read by |
|---|---|---|
| Backend server URL | `sync_meta.apiBase` (SQLite) + `localStorage.openpos.apiBase` | Renderer (`api.js`) **and** main process (`main.cjs`) |
| Auto-launch on login | OS-specific (XDG autostart / LoginItem) | `main.cjs` |
| Window bounds | `window-bounds.json` in the user-data dir | `main.cjs` |
| Receipt template | `localStorage.openpos.receiptTemplate` | `utils/receiptTemplate.js` |
| Printer config | `localStorage` (printer settings) | `utils/printer.js` |

---

## 7. Security Architecture

| Layer | Control |
|---|---|
| Transport | HTTPS in production; `X-Frame-Options: DENY`; HSTS via Helmet |
| Headers | Hardened Content-Security-Policy (`CSP_ENABLED`) |
| Body | 10 kB JSON/urlencoded limit |
| Rate limit | Global on `/api`, stricter on `/api/auth/login` |
| Injection | `sanitizeMiddleware` strips MongoDB operators from bodies, rejects operator-shaped query params |
| Auth | JWT (HS256) + `bcrypt` password hashing |
| Authz | Role + branch scope on every mutating route (IDOR protection) |
| Integrity | Server recomputes all prices/totals/tax; client values are ignored |
| Desktop | `contextIsolation` + `nodeIntegration:false` + preload whitelist |
| Secrets | `.env` git-ignored; `VITE_*` variables are public by definition |

---

## 8. Deployment Architecture

### 8.1 Web deployment

```
Nginx ── / ─────────► apps/web/dist/  (static)
       └─ /api ─────► server/  (Node behind pm2/systemd)  ──► MongoDB Atlas
```

```nginx
server {
  listen 443 ssl;
  server_name pos.example.com;

  root /var/www/openpos/apps/web/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;   # SPA fallback
  }

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### 8.2 Desktop deployment

1. Build the installers: `npm run electron:build:linux` / `npm run electron:build:win`.
2. Distribute `OpenPOS-1.0.0.AppImage`, `openpos_1.0.0_amd64.deb`, or `OpenPOS Setup 1.0.0.exe`.
3. On each terminal, install → open **Desktop Settings** → set the **Backend server** URL →
   sign in.

The desktop app stores no server code; it is a pure client.

---

## 9. CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Working directory | Steps |
|---|---|---|
| **Backend tests** | `server/` | `npm ci` → `npm test` (node:test, no DB) |
| **Frontend lint & build** | `apps/web/` | `npm ci` → `npm run lint` → `npm run build` |

Release artefacts are produced locally/by CI with `electron-builder` and are **not** committed
(`dist-electron/` is git-ignored).

---

## 10. Related Documents

- [`prd.md`](./prd.md) — requirements and acceptance criteria
- [`rules.md`](./rules.md) — binding engineering rules
- [`design.md`](./design.md) — UI/UX design system
- [`memory.md`](./memory.md) — durable technical decisions and gotchas
- [`tracker.md`](./tracker.md) — work tracker
- [`vps-deployment.md`](./vps-deployment.md) — VPS hosting & deployment guide
- [`desktop-app.md`](./desktop-app.md) — desktop app install & usage guide
- [`website.md`](./website.md) — website install & usage guide
- [`server.md`](./server.md) — web server install & operations guide
