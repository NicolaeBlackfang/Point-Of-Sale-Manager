# OpenPOS — Product Requirements Document (PRD)

**Product:** OpenPOS — Retail Management & Point of Sale System
**Version:** 1.0.0
**Status:** Shipped (desktop) / Shipped (web)
**Owner:** Sajid Asim
**Last updated:** 2026-10-21

---

## 1. Product Summary

OpenPOS is an **offline-first point-of-sale and inventory management platform** for retail
businesses. It is delivered in **two forms from a single codebase**:

| Deliverable | Path | Purpose |
|---|---|---|
| **Web server** | `server/` + `apps/web/` | Multi-branch API + browser SPA for head-office and web use |
| **Software application** | `apps/desktop/` | Electron desktop terminal for the checkout counter |

The two forms share the exact same React application (`apps/web/`), so a feature shipped to the
website is immediately available in the desktop app, and vice-versa.

---

## 2. Problem Statement

Retail counters fail when the network drops. A cashier who cannot complete a sale because a
spinning wheel cannot reach the cloud loses revenue and trust. Shop owners also lose visibility
when stock movements, refunds, and staff activity are recorded only on paper.

OpenPOS solves this with:

1. A counter terminal that **never stops selling** — sales are written to a local database and
   pushed to the server when connectivity returns.
2. A **single source of truth** server backed by MongoDB, exposing every product, sale, receipt,
   refund, and audit event.
3. **Native hardware integration** — thermal printers over USB, serial, network, and the system
   print queue; barcode scanners as keyboard-wedge or webcam.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| ID | Goal | Success Metric |
|---|---|---|
| G1 | Counter keeps selling through a full network outage | 100% of sales queued locally, 0 lost on restore |
| G2 | Queued sales reach the server automatically | Sync within 30 s of connectivity returning |
| G3 | Sub-2-second checkout interaction | Scan-to-cart under 100 ms; full checkout under 2 s |
| G4 | One installable package for Linux and Windows | `.AppImage`, `.deb`, `.exe` from one command |
| G5 | Full accountability for stock and money | Every mutation written to an immutable audit log |
| G6 | Works on a normal shop PC, no server admin | App boots offline; no local database service required |

### 3.2 Non-Goals

- **Not** a full accounting/ERP system (no double-entry bookkeeping, no VAT filings).
- **Not** a multi-tenant SaaS billing platform (single-organisation deployment per server).
- **Not** an e-commerce storefront.
- **Not** an HR/payroll suite.

---

## 4. Personas

### 4.1 Cashier (Operator at the counter)

- **Goal:** Scan items, take payment, print a receipt, hand it over. Nothing else.
- **Needs:** Keyboard-wedge scanner, card/cash split, fast cart edits, offline resilience, a
  receipt that is legible and reprintable.
- **Pain:** Network drops mid-queue; a printer that jams; an unreadable receipt.

### 4.2 Store Operator / Inventory Manager

- **Goal:** Keep stock accurate, manage the price list and staff, see what is selling.
- **Needs:** Product CRUD with mandatory imagery, SKU uniqueness, branch scoping, low-stock
  alerts, staff management, and sales logs showing SKU + branch + cashier.
- **Pain:** Duplicate SKUs, products without photos, no idea who sold what.

### 4.3 Owner / Superadmin

- **Goal:** See the whole business, from any screen, and trust the numbers.
- **Needs:** Revenue analytics, payment mix, top products, CSV/PDF/JSON export, audit trail,
  receipt retention policy, store-wide settings (currency, tax, timezone, low-stock webhook).
- **Pain:** Numbers that do not match the till; a black box of stock shrinkage.

### 4.4 System Administrator

- **Goal:** Deploy and keep the thing running.
- **Needs:** One-command install, a documented server start procedure, environment-variable
  configuration, health checks, and installers for both desktop platforms.

---

## 5. Functional Requirements

### FR-1 — Authentication & Authorisation

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Email/username + password login issuing a signed JWT | Must |
| FR-1.2 | Three roles: `superadmin`, `operator`, `cashier`, enforced server-side on every route | Must |
| FR-1.3 | Branch-scoped access so a cashier only sees their own branch's data | Must |
| FR-1.4 | Client prices/totals are never trusted — the server recomputes them | Must |
| FR-1.5 | Rate limiting on all `/api` routes; stricter on `/api/auth/login` | Must |

### FR-2 — Product & Inventory Management

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Product image is **mandatory** before a product can be created | Must |
| FR-2.2 | Images stored as data URLs, validated for MIME type and size | Must |
| FR-2.3 | SKU is unique and editable by the Operator (was previously read-only) | Must |
| FR-2.4 | Products are branch-scoped and support low-stock thresholds | Must |
| FR-2.5 | Audit log entry for every create/update/delete | Must |

### FR-3 — Point of Sale

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Card-grid product browsing **and** keyboard-wedge scan entry | Must |
| FR-3.2 | Webcam QR scanning and QR image upload as scan sources | Should |
| FR-3.3 | Cart supports quantity change, item removal, live totals with tax | Must |
| FR-3.4 | Optional customer name captured at checkout and printed on the receipt | Must |
| FR-3.5 | Payment method recorded (`cash` / `card` / etc.) and shown on the receipt | Must |
| FR-3.6 | Receipt contains a QR code encoding the transaction id | Must |
| FR-3.7 | **Offline sale:** a failed checkout queues the sale locally and confirms to the cashier | Must |
| FR-3.8 | **Active cart persistence:** an unsaved cart survives an app crash or restart | Must |
| FR-3.9 | Stock is decremented on a successful (or queued) sale | Must |

### FR-4 — Offline Operation (desktop app)

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Products cached locally in SQLite for offline browsing | Must |
| FR-4.2 | Completed sales queued in a local SQLite table | Must |
| FR-4.3 | Background sync engine retries every 30 s while the server is reachable | Must |
| FR-4.4 | `401/403` retains the queue (token expired) instead of dropping sales | Must |
| FR-4.5 | Other `4xx` drops only the rejected sale so the queue cannot wedge | Must |
| FR-4.6 | `5xx`/network errors retain the queue and retry next pass | Must |
| FR-4.7 | Active cart persisted to local storage and restored on launch | Must |
| FR-4.8 | Sync continues in the main process even while the window is closed | Should |

### FR-5 — Receipts & Refunds

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Receipts retained for **7 days**; older ones expire | Must |
| FR-5.2 | Refunds are processed against a receipt, restoring stock | Must |
| FR-5.3 | Refunded receipts are visibly marked `REFUNDED` | Must |
| FR-5.4 | **Editable receipt template** — store name, address, phone, tax ID, logo, header/footer, paper width, QR toggle, custom CSS | Must |
| FR-5.5 | Template JSON can be exported and imported | Must |
| FR-5.6 | **Dynamic tokens** in header/footer (`{{customer_name}}`, `{{total_amount}}`, …) | Must |
| FR-5.7 | Live preview in the template editor | Should |

### FR-6 — Printing

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | System printer via the OS print queue (native desktop) | Must |
| FR-6.2 | ESC/POS over raw TCP to a networked printer (default port `9100`) | Must |
| FR-6.3 | WebUSB / Web Serial / Web Bluetooth for USB & serial thermal printers | Must |
| FR-6.4 | 58 mm and 80 mm paper widths | Must |
| FR-6.5 | Silent printing (no dialog) with printer selection from the OS list | Should |

### FR-7 — Reporting & Audit

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Daily revenue, top products, payment-mix charts rendered as dependency-free SVG | Must |
| FR-7.2 | CSV / PDF / JSON financial export | Must |
| FR-7.3 | Human-readable audit log viewer | Must |
| FR-7.4 | Sales logs show product **SKU** per line item and the cashier's **branch** | Must |
| FR-7.5 | Cashier performance module | Should |

### FR-8 — Store Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Currency symbol, tax rate, low-stock threshold | Must |
| FR-8.2 | Store timezone by UTC offset (−12:00 → +14:00) | Must |
| FR-8.3 | Low-stock webhook URL and SMTP e-mail alerts | Should |
| FR-8.4 | Desktop: launch on system startup | Should |
| FR-8.5 | Desktop: **configurable backend endpoint** shared by the UI and the sync engine | Must |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | Helmet headers with hardened CSP, `X-Frame-Options: DENY` |
| NFR-2 | Security | 10 kB JSON/urlencoded body limits (DoS mitigation) |
| NFR-3 | Security | NoSQL-injection sanitiser strips MongoDB operators from bodies and rejects operator-shaped query params |
| NFR-4 | Security | Desktop runs with `contextIsolation: true`, `nodeIntegration: false`, preload-only IPC |
| NFR-5 | Performance | Checkout interaction under 2 s on a 2015-class laptop |
| NFR-6 | Reliability | Zero sale loss across a simulated 30-minute outage |
| NFR-7 | Portability | One codebase produces Linux and Windows installers |
| NFR-8 | Maintainability | Backend unit tests need no database; CI runs on every push |
| NFR-9 | Offline | Desktop app boots and sells with the network cable unplugged |

---

## 7. Deployment Targets

| Target | Artefact | Install path |
|---|---|---|
| Linux (glibc) | `OpenPOS-<version>.AppImage` | Single file, run directly |
| Linux (glibc) | `openpos_<version>_amd64.deb` | `sudo dpkg -i` / `apt install` |
| Windows x64 | `OpenPOS Setup <version>.exe` | NSIS assisted installer |
| Web (any host) | `apps/web/dist/` static bundle | Nginx / Apache / any static host |
| API (any host) | `server/` Node service | systemd / PM2 / Docker |

---

## 8. Acceptance Criteria

The release is accepted when **all** of the following hold:

1. `npm test` in `server/` passes with 0 failures.
2. `npm run lint` in `apps/web/` reports 0 errors.
3. `npm run build:web` and `npm run build:desktop` both succeed.
4. The desktop app launches, creates `openpos-offline.db`, and exposes all six tables.
5. A sale queued while offline is pushed to MongoDB after connectivity returns, with the correct
   server-computed total.
6. A `401` response leaves the queue intact; a `400` drops only the offending sale.
7. A receipt prints via the system printer, the network ESC/POS transport, and the native HTML
   transport.
8. The receipt template editor round-trips a template through export → import.

---

## 9. Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| Q1 | Should the desktop app bundle a local server for fully air-gapped installs? | Owner | Open — currently client-only against a remote API |
| Q2 | Stock conflict resolution when two terminals sell the same SKU offline | Owner | Open — last-write-wins today |
| Q3 | Should receipts be retained per-branch instead of globally? | Owner | Deferred |
| Q4 | Multi-currency per transaction | Owner | Deferred |

---

## 10. Related Documents

- [`rules.md`](./rules.md) — engineering and contribution rules
- [`architecture.md`](./architecture.md) — system architecture
- [`design.md`](./design.md) — UI/UX design system
- [`memory.md`](./memory.md) — durable technical decisions and gotchas
- [`tracker.md`](./tracker.md) — work tracker
