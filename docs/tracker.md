# OpenPOS — Work Tracker

**Last updated:** 2026-10-21
**Current version:** 1.0.0

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## 1. Release 1.0.0 — Shipped

### 1.1 Web platform

| Status | Item | Notes |
|---|---|---|
| [x] | Express 5 API with Helmet, CORS, rate limiting, 10 kB body limits | `server/app.js` |
| [x] | MongoDB / Atlas connection layer | `server/config/db.js` |
| [x] | JWT auth with bcrypt hashing, role + branch scoping | `server/middleware/authMiddleware.js` |
| [x] | NoSQL-injection sanitiser as the first custom middleware | `server/middleware/sanitizeMiddleware.js` |
| [x] | Product CRUD with mandatory image, unique editable SKU | `server/controllers/productController.js` |
| [x] | Sales with **server-side** price/tax/total recomputation | `server/controllers/salesController.js` |
| [x] | Receipts with 7-day retention | `server/models/Receipt.js` |
| [x] | Refunds that restore stock | `server/utils/refunds.js` |
| [x] | Analytics (daily revenue, top products, payment mix) | `server/controllers/analyticsController.js` |
| [x] | Audit log (append-only, human-readable) | `server/controllers/auditController.js` |
| [x] | Store settings (currency, tax, low stock, timezone, webhook, SMTP) | `server/controllers/settingsController.js` |
| [x] | Superadmin seed script | `server/scripts/seed.js` |
| [x] | 94 unit tests, no database required | `server/tests/` |

### 1.2 Web application (`apps/web/`)

| Status | Item | Notes |
|---|---|---|
| [x] | React 19 + Vite + Tailwind CSS v4 | |
| [x] | Collapsible grouped sidebar shell | `components/ui/Layout.jsx`, `Sidebar.jsx` |
| [x] | Cashier / Operator / Superadmin dashboards | `pages/` |
| [x] | Product card grid + keyboard-wedge scan entry | `components/pos/ProductGrid.jsx`, `ScanInputSection.jsx` |
| [x] | Cart with quantity edit, removal, live tax totals | `components/pos/CartTable.jsx` |
| [x] | Checkout with customer name capture | `components/pos/CheckoutSection.jsx` |
| [x] | Recent shift transactions with click-to-receipt | `components/pos/RecentTransactions.jsx` |
| [x] | Receipt with QR code, refund marker, reprint | `components/pos/ReceiptDocument.jsx` |
| [x] | Webcam QR scanning and QR image upload | `components/pos/ScannerSourceSelector.jsx` |
| [x] | Offline sale queue (IndexedDB) | `services/offline.js` |
| [x] | Analytics charts (dependency-free SVG) | `components/reports/AnalyticsCharts.jsx` |
| [x] | CSV / PDF / JSON financial export | `components/reports/FinancialExportModule.jsx` |
| [x] | Sales logs showing SKU + branch + cashier | `components/reports/SalesLogModule.jsx` |
| [x] | Staff management + cashier performance | `components/staff/` |
| [x] | Superadmin stock-purge / retention tools | `components/logs/CashierAuditLogs.jsx` |
| [x] | 0 lint errors | `oxlint` |

### 1.3 Desktop application (`apps/desktop/`)

| Status | Item | Notes |
|---|---|---|
| [x] | Electron 33 shell with `contextIsolation`, preload whitelist | `main.cjs`, `preload.cjs` |
| [x] | Persistent window bounds + native menu | `main.cjs` |
| [x] | OS printer discovery, silent HTML printing | `printers.cjs` |
| [x] | ESC/POS over raw TCP (`host:9100`) | `printers.cjs` |
| [x] | SQLite local store (WASM, no native rebuild) | `sqlite-store.cjs` |
| [x] | Tables: `products`, `sales_queue`, `sales_cache`, `sync_meta`, `active_carts` | |
| [x] | Background sync engine, 30 s interval, reachability probe | `sync-engine.cjs` |
| [x] | Authenticated sync (JWT pushed from the renderer) | `sync:setToken` IPC |
| [x] | 401/403 retain the queue; other 4xx drop one sale; 5xx retains | `sync-engine.cjs` |
| [x] | Active-cart persistence and restore | `active_carts` |
| [x] | Runtime-configurable backend URL shared by UI and main process | `settings:getApiBase` / `setApiBase` |
| [x] | Auto-launch on system login (XDG / LoginItem) | `main.cjs` |
| [x] | Desktop settings panel (auto-launch, server, DB type, queue, sync) | `components/settings/DesktopSettingsPanel.jsx` |
| [x] | Hash router + relative assets for `file://` | `App.jsx`, `vite.config.js` |
| [x] | App icon (PNG set + ICO) | `build/` |

### 1.4 Receipt templates

| Status | Item | Notes |
|---|---|---|
| [x] | Structured template editor (store, branding, messages, paper, CSS) | `components/settings/ReceiptTemplateEditor.jsx` |
| [x] | 58 mm / 80 mm selection, QR toggle, logo upload | |
| [x] | Live preview | |
| [x] | JSON export / import | `utils/receiptTemplate.js` |
| [x] | 14 dynamic tokens resolved against the sale | `renderTokens()` |
| [x] | Applied to the screen receipt **and** the native print HTML | `ReceiptDocument.jsx`, `utils/printer.js` |
| [x] | Available to Superadmin, Operator, and Cashier | |

### 1.5 Packaging

| Status | Item | Notes |
|---|---|---|
| [x] | Linux AppImage (104 MB) | `npm run electron:build:linux` |
| [x] | Linux `.deb` (73 MB) | requires `author.email` in `package.json` |
| [x] | Windows NSIS installer (79 MB) | `npm run electron:build:win` |
| [x] | Wine-free Linux → Windows cross-build | `scripts/nsis-no-wine.cjs` |
| [x] | `dist-electron/` git-ignored | `.gitignore` |

### 1.6 Documentation (this release)

| Status | Item | Notes |
|---|---|---|
| [x] | `docs/prd.md` — requirements, personas, acceptance criteria | |
| [x] | `docs/rules.md` — binding engineering rules | |
| [x] | `docs/architecture.md` — system architecture | |
| [x] | `docs/design.md` — design system | |
| [x] | `docs/memory.md` — durable decisions and gotchas | |
| [x] | `docs/tracker.md` — this file | |
| [x] | `README.md` rewritten — short hub with the credit at the top and links to the guides | |
| [x] | `docs/desktop-app.md` — desktop install, configuration, offline behaviour, troubleshooting | |
| [x] | `docs/website.md` — web build, deployment, roles, POS usage, reporting | |
| [x] | `docs/server.md` — server install, env reference, seed, pm2/systemd, TLS, API surface | |
| [x] | `docs/vps-deployment.md` — full VPS guide: provisioning, hardening, Nginx, TLS, backups, updates | |
| [x] | `deploy/openpos-api.service` + `deploy/openpos-nginx.conf` — ready-to-copy production configs | |
| [x] | Folder reorganisation: `backend/`→`server/`, `frontend/`→`apps/web/`, `electron/`→`apps/desktop/` | |
| [x] | All path references updated (package.json, CI, main.cjs, tests, .gitignore) | |

---

## 2. Verification status

| Check | Result |
|---|---|
| `npm test` (server) | **94 / 94 pass** |
| `npm run lint` (web) | **0 errors, 0 warnings** |
| `npm run build:web` | ✅ |
| `npm run build:desktop` | ✅ |
| Packaged Linux app launches, creates DB with all 6 tables | ✅ |
| Extracted AppImage launches | ✅ (FUSE missing in this container) |
| Windows installer is a valid PE32 NSIS SFX with a 74-file payload | ✅ |
| Offline sale queued → synced → confirmed in MongoDB | ✅ |
| `401` retains the queue, `400` drops one sale | ✅ (unit + live) |
| Active cart save → restore → remove | ✅ (unit) |
| Physical thermal printer output | ⚠️ code/unit-verified only — no printer attached |

---

## 3. Next up — 1.1.0 candidates

| Priority | Item | Why |
|---|---|---|
| 🔴 High | **Stock conflict resolution** across offline terminals | Two terminals can oversell the same SKU while offline. Needs a server-side reservation or a conflict report. |
| 🔴 High | **Offline product cache warm-up on login** | The browser build's `getCachedProducts()` returns `[]`; the desktop build is complete. Make them consistent. |
| 🟡 Medium | **Air-gapped deployment mode** | Bundle a local server for sites with no internet (see `prd.md` Q1). |
| 🟡 Medium | **Printer hardware QA** | Test every transport against a real 58 mm/80 mm device and document the results. |
| 🟡 Medium | **Windows installer on Windows CI** | Produces a properly signed/icon'd installer (see `memory.md` §3). |
| 🟡 Medium | **Code signing** | Authenticode signing for the NSIS installer to avoid SmartScreen warnings. |
| 🟡 Medium | **Auto-update channel** | `electron-updater` with a generic provider. |
| 🟢 Low | Multi-currency per transaction | Deferred in the PRD. |
| 🟢 Low | Per-branch receipt retention | Deferred in the PRD. |
| 🟢 Low | Cashier shift handover / cash drawer reconciliation | Common retail need, not yet in scope. |
| 🟢 Low | Receipt template versioning + rollback | A store manager may want to revert a template. |

---

## 4. Ideas backlog

- Barcode label printing (own product labels, not just receipts).
- Weighted/bulk products (price per kg, tare weight).
- Customer accounts with stored balance and loyalty points.
- Split payment (part cash, part card) on a single sale.
- Shift/Z-report for the cashier with a variance warning.
- Product bundles and combo pricing.
- Offline receipt reprint from the local `sales_cache`.

---

## 5. Open questions

See [`prd.md` §9](./prd.md#9-open-questions) — Q1 (air-gapped mode), Q2 (stock conflicts),
Q3 (per-branch receipt retention), Q4 (multi-currency).

---

## 6. How to update this file

1. Move a row from §3 to §1 and tick it when the work lands.
2. Update **Verification status** with the actual command output.
3. Bump the version at the top and in `package.json` together.
4. Record the *why* of anything surprising in [`memory.md`](./memory.md), not here.
