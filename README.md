# OpenPOS — Retail Management & POS System

**OpenPOS** is an open-source, offline-first Point of Sale and Inventory Management platform for
retail businesses. It pairs a fast desktop checkout terminal with multi-branch inventory,
role-based staff management, executive analytics, and a complete audit trail.

Built for **PC/laptop workstations**: a collapsible left sidebar, wide data tables,
keyboard-wedge scanner input, and an 80 mm thermal receipt layout.

---

## About OpenPOS

OpenPOS is a full-stack JavaScript application:

- **Frontend:** React 19 + Vite, Tailwind CSS v4, Lucide icons, Axios, and IndexedDB (`idb`)
- **Backend:** Node.js + Express 5, Mongoose 9, JWT authentication, `helmet`, and
  `express-rate-limit`
- **Database:** MongoDB (local instance or MongoDB Atlas)

It is designed to keep a retail counter running even when the network drops, and to give owners a
transparent record of every stock movement and transaction.

---

## Key Features

- **Desktop/laptop-optimized interface** with a modern, collapsible left sidebar and grouped
  navigation.
- **Multi-role architecture** (Superadmin, Operator, Cashier) with role-based access control.
- **Offline-first IndexedDB sale queue** with automatic sync and a live pending-sync indicator.
- **Real-time hardware scanner and webcam input support** (keyboard-wedge, camera, QR image
  upload, or manual entry).
- **Advanced Sales Logs** showing the **Product SKU per line item** and the
  **Cashier-specific branch** that processed each sale.
- **Human-readable System Logs** plus **Superadmin stock-purge tools** for retention control.
- **Analytics & Reports:** dependency-free SVG charts (daily revenue, top products, payment mix)
  and CSV / PDF / JSON financial exports.
- **Configurable store settings:** currency, tax rate, low-stock threshold, store timezone
  (by UTC offset, UTC-12:00 → UTC+14:00), low-stock webhooks, and SMTP e-mail alerts.

---

## Architecture & Project Structure

```
openpos/
├── backend/                  # Express API (independent service)
│   ├── config/               # MongoDB connection
│   ├── controllers/          # route handlers (products, sales, analytics, settings, logs)
│   ├── middleware/           # JWT auth + role guards, NoSQL-injection sanitizer
│   ├── models/               # Mongoose schemas (Product, Sale, SystemLog, Setting, User)
│   ├── routes/               # Express routers mounted under /api
│   ├── scripts/              # database seed script
│   ├── tests/                # node:test unit suites (no database required)
│   ├── utils/                # cache, timezone, tax, low-stock, audit, mailer helpers
│   ├── app.js                # Express app (security middleware + routes)
│   └── server.js             # HTTP entrypoint
└── frontend/                 # React SPA (independent service)
    └── src/
        ├── components/       # dashboards, admin modules, POS, shared UI
        ├── context/          # Auth, Settings, Theme providers
        ├── pages/            # role dashboards (Cashier, Operator, Superadmin)
        ├── services/         # Axios API client + IndexedDB offline queue
        └── utils/            # shared helpers
```

`backend` and `frontend` are **fully independent**: they can be installed, run, and deployed on
separate hosts/servers. Point the frontend at your API via its environment variable.

---

## Installation & Setup

### Prerequisites

- **Node.js** v18 or newer
- **MongoDB** — either a local instance (`mongodb://127.0.0.1:27017/openpos`) or a
  **MongoDB Atlas** cluster

---

### Backend Setup

```bash
# 1. Move into the backend module
cd backend

# 2. Configure the environment
cp .env.example .env        # then edit .env and fill in the values
```

Key variables (see `backend/.env.example` for the full list):

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Long random string used to sign JWTs |
| `PORT` | — | API port (default `5000`) |
| `CLIENT_URL` | — | Allowed CORS origin (default `http://localhost:5173`) |
| `JWT_EXPIRE` | — | Token lifetime (default `1d`) |
| `LOW_STOCK_WEBHOOK_URL` | — | Optional low-stock webhook |
| `CSP_ENABLED` | — | Content-Security-Policy is on by default; set `false` to disable |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | — | Optional initial Superadmin seed |

```bash
# 3. Install dependencies
npm install

# 4. Start the API
npm run dev      # development (nodemon, auto-reload)
# or
npm start        # production
```

Optionally create the first Superadmin account:

```bash
SEED_ADMIN_PASSWORD='a-strong-password' npm run seed
```

---

### Frontend Setup

```bash
# 1. Move into the frontend module
cd frontend

# 2. Configure environment variables (optional)
#    Create a .env file to point at a non-default API host, e.g.:
echo "VITE_API_URL=http://localhost:5000/api" > .env

# 3. Install dependencies
npm install

# 4. Start the dev server
npm run dev
```

The dev server runs on `http://localhost:5173`. To produce an optimized production build:

```bash
npm run build      # outputs to frontend/dist/
npm run preview    # serve the production build locally
```

Deploy the `dist/` output to any static host and point `VITE_API_URL` at your deployed API.

---

## Testing & Linting

The backend unit tests require **no database connection**:

```bash
cd backend
npm test           # node:test suites

cd ../frontend
npm run lint       # oxlint
npm run build      # production build check
```

---

## Security

OpenPOS ships with production-oriented defaults:

- **Helmet** security headers with a hardened Content-Security-Policy and
  `X-Frame-Options: DENY` (frameguard).
- **Rate limiting** on all `/api` routes and stricter limiting on `/api/auth/login`.
- **Explicit 10 kb payload limits** on JSON and URL-encoded bodies to mitigate DoS.
- **NoSQL-injection defense** that strips MongoDB operators from request bodies and rejects
  operator-shaped query parameters.
- **Role- and branch-scoped authorization** on every mutating route (IDOR protection), with
  server-side price/total recomputation on checkout.

Please **never commit a real `.env`** file — `.gitignore` already excludes it.

---

## License

OpenPOS is released under the **MIT License**. See the [`LICENSE`](./LICENSE) file for the full
text.

---

## Developer / Author

- **Developer:** Sajid Asim
- **Repository:** `https://github.com/<your-username>/openpos`
- **Contact:** `<your-email@example.com>`

Contributions are welcome! Fork the repository, create a feature branch, run the tests and linter
(see above), and open a pull request. For bugs and feature requests, please open a GitHub Issue.
