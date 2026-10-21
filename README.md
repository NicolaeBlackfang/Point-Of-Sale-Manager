# OpenPOS

**Offline-first Point of Sale & Inventory Management for retail.**

> **Created by Sajid Asim** — [github.com/NicolaeBlackfang](https://github.com/NicolaeBlackfang) · [sajidasim506@gmail.com](mailto:sajidasim506@gmail.com) · MIT License

One codebase, two deliverables:

| | Deliverable | What it is |
|---|---|---|
| 🖥️ | **Software Application** | An Electron desktop app for the checkout counter. Sells with the network unplugged, syncs when it returns. |
| 🌐 | **Website** | The same React interface as a browser app, plus the API server behind it. |

---

## Quick start

```bash
git clone https://github.com/NicolaeBlackfang/Point-Of-Sale-Manager.git
cd Point-Of-Sale-Manager

npm run install:all                 # server + web + desktop tooling
cp server/.env.example server/.env  # then set MONGODB_URI and JWT_SECRET

npm run server    # API     → http://localhost:5000
npm run web       # Website → http://localhost:5173
npm run electron:dev   # desktop app against the dev servers
```

Prefer an installer? See the [Desktop app guide](docs/desktop-app.md).

**Requirements:** Node.js v18+ (v20 recommended) and MongoDB (local or Atlas).

---

## What it does

**Point of Sale**
- Product card grid + keyboard-wedge barcode scanning, webcam QR scan, QR image upload
- Cart with quantity editing, live tax totals, optional customer name
- Receipts with a QR code, reprint, and refund support
- **Offline sales queue** — the counter keeps selling through a network outage
- **Active cart persistence** — a crash or power loss never loses a basket

**Desktop application**
- Native Electron shell for **Linux** (AppImage / .deb) and **Windows** (NSIS installer)
- Local SQLite database, background sync that runs while the window is closed
- Native printing: system print queue, silent HTML print, and **ESC/POS over TCP**
- Launch on startup, persistent window bounds, configurable backend server

**Inventory & staff**
- Product images are **mandatory**; SKU is unique and editable by the Operator
- Branch-scoped stock with low-stock thresholds and webhook / e-mail alerts
- Staff management, three roles, and cashier performance

**Reporting & compliance**
- Dependency-free SVG analytics: daily revenue, top products, payment mix
- CSV / PDF / JSON financial export, sales logs with SKU + branch + cashier
- Immutable, human-readable audit log of every stock and money movement
- Editable **receipt templates** with dynamic tokens, logo, custom CSS, JSON import/export

---

## Guides

| Guide | Covers |
|---|---|
| **[VPS deployment](docs/vps-deployment.md)** | Provisioning a server, hardening, Nginx + TLS, systemd, backups, updates |
| **[Desktop app](docs/desktop-app.md)** | Install, point it at your server, printers, receipts, offline behaviour, troubleshooting |
| **[Website](docs/website.md)** | Build, deploy to Nginx/static hosts, roles, POS usage, reporting |
| **[Web server](docs/server.md)** | Install, configure, seed, run under pm2/systemd, TLS, API surface |

---

## Project structure

```
openpos/
├── apps/
│   ├── desktop/          # 🖥️  Electron main process (SQLite, sync, printers)
│   └── web/              # 🌐  React SPA — also the desktop renderer
├── server/               # ⚙️  Express API + MongoDB
├── build/                #    app icons
├── scripts/              #    build tooling
└── docs/                 #    guides and project documentation
```

`server/` and `apps/web/` are independent — deploy them on separate hosts. `apps/desktop/` is a
client only and never bundles the server.

---

## Commands

| Command | Does |
|---|---|
| `npm run install:all` | Install every package |
| `npm run server` | Start the API (dev, auto-reload) |
| `npm run web` | Start the website (dev) |
| `npm run electron:dev` | Run the desktop app against the dev servers |
| `npm test` | Server unit tests (94, no database needed) |
| `npm run lint` | Frontend lint (0 errors) |
| `npm run build:web` / `npm run build:desktop` | Production bundles |
| `npm run electron:build:linux` / `:win` | Build installers into `dist-electron/` |

---

## Documentation

| Document | Contents |
|---|---|
| [prd.md](docs/prd.md) | Product requirements, personas, acceptance criteria, open questions |
| [rules.md](docs/rules.md) | Binding engineering rules and the definition of done |
| [architecture.md](docs/architecture.md) | System architecture, data flow, deployment, configuration |
| [design.md](docs/design.md) | Design system, screens, receipt design, accessibility |
| [memory.md](docs/memory.md) | Durable technical decisions and gotchas — **read before changing something obvious** |
| [tracker.md](docs/tracker.md) | Work tracker, verification status, roadmap |
| [vps-deployment.md](docs/vps-deployment.md) | **Hosting the whole system on a VPS** |

---

## Security

Helmet headers with a hardened CSP, rate limiting, 10 kB payload limits, NoSQL-injection
sanitisation, and role- and branch-scoped authorisation on every mutating route. Sale prices are
always recomputed server-side. The desktop app runs with `contextIsolation: true`,
`nodeIntegration: false`, and a preload whitelist.

Never commit a real `.env` — `.gitignore` already excludes it.

---

## License

MIT — see [LICENSE](LICENSE).
