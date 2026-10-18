# Multi-Branch Point of Sale (POS) System

A modern, full-stack Point of Sale and Inventory Management solution built with React, Node.js/Express, MongoDB, and Tailwind CSS. The platform features role-based access control (RBAC), multi-branch inventory tracking, real-time sales terminal processing, and QR code integration for quick product scanning.

---

## 🚀 Features

### 👑 Superadmin Dashboard
- **Executive Metrics**: High-level annual and monthly revenue tracking, transaction totals, and active branch counts.
- **Product Audit & Controls**: Oversight of product listings across all branches with soft-delete capabilities.
- **Cashier Performance**: Track sales per cashier, view detailed transaction audit logs, and execute monthly sales resets.
- **Operator Management**: Monitor active inventory operators and their branch assignments.
- **Financial Exports**: Export sales data to CSV (Excel-compatible with UTF-8 BOM), PDF, or JSON with flexible filters (per-branch, per-cashier, date range).
- **Analytics Charts**: Visual daily revenue, top-selling products, and payment-method breakdown — all rendered as dependency-free SVG charts.
- **Store Settings**: Configure store-wide currency (symbol + ISO code), sales tax rate, and low-stock threshold from the Config tab.
- **Audit Log Viewer**: Filterable record of every product create/update/delete/stock-change and settings edit, with timestamps, actors, and before/after diffs.
- **Low-Stock Alert Banner**: Automatic banner listing products at or below the configured stock threshold.
- **Staff Registration**: Quick-register new System Cashiers or Inventory Operators.

### 📦 Operator Workspace
- **Inventory Management**: Create, edit, and soft-delete product listings tied to specific branches.
- **QR Code Generator**: Automatically generates downloadable QR codes for newly added products based on SKU.
- **Stock Tracking**: Real-time stock status monitoring with low-stock alerts.
- **Paginated Product Catalog**: Search and filter inventory by SKU, product name, or category.

### 🛒 Cashier POS Terminal
- **Multi-Modal Product Lookup**: Scan QR codes via physical scanner, upload QR image files, or manually enter SKUs. A global keystroke listener auto-focuses the scan field so keyboard-wedge barcode scanners work anywhere on the page.
- **Offline Mode**: If the network drops mid-shift, product lookups are served from an IndexedDB cache and completed sales are queued locally. The queue auto-syncs the moment connectivity returns; a navbar indicator shows how many sales are pending.
- **Cart Management**: Real-time stock availability checks, quantity adjustments, and auto-subtotal calculation with live tax computation.
- **Multi-Payment Support**: Flexible checkout workflows supporting Cash and Card payment methods.
- **Receipt Printing**: 80 mm thermal-printer-optimized receipts via a dedicated print stylesheet — totals include tax and the configured currency.
- **Recent Transactions**: Quick view of cashier-specific recent transaction history (cached for offline viewing).

### 🎨 UX & Infrastructure
- **Dark Mode**: Persistent light/dark theme toggle in the navbar (respects system preference on first visit).
- **Security Hardening**: Helmet headers, CORS allowlist, express-rate-limit on all API routes (stricter on login), server-side price recomputation, IDOR ownership checks on product mutations, and generic error responses.
- **Database-Backed Settings**: Store-wide settings persisted in MongoDB and applied to every sale automatically.
- **Audit Logging**: Non-blocking fire-and-forget audit trail writes; every mutation is traceable to a user.
- **Optional Low-Stock Webhook**: Set `LOW_STOCK_WEBHOOK_URL` in the environment to receive a POST whenever a product drops to/below the threshold.
- **CI Pipeline**: GitHub Actions workflow runs backend unit tests and frontend lint + production build on every push and pull request.

---

## 🧪 Testing

Backend unit tests cover input validators, auth middleware, and the Express app itself (health check, JSON 404s, CORS enforcement).

```bash
cd backend
npm test        # runs node --test tests/*.test.js
```

Frontend verification:

```bash
cd frontend
npm run lint    # oxlint
npm run build   # production build
```

---

## 🏃 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in MONGO_URI and JWT_SECRET
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `PORT` | — | API port (default 5000) |
| `CLIENT_URL` | — | Allowed CORS origin (default `http://localhost:5173`) |
| `LOW_STOCK_WEBHOOK_URL` | — | Optional webhook for low-stock alerts |

---

## 👨‍💻 About the Maker

Developed by **Sajid Asim**, this application was crafted to streamline retail operations, bridge inventory tracking between warehouse operators and cashiers, and provide high-level administrative oversight.

- **Developer**: Sajid Asim
- **Tech Stack**: React.js, Node.js, Express, MongoDB, Tailwind CSS, Lucide React, and `html5-qrcode`.
- **Focus**: Responsive UI component architecture, flexible grid/flexbox layouts, role-based workflows, and real-time inventory management.
