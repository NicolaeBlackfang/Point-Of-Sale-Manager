# Website — Installation & Guide

> The **website** is the React single-page app. It is a static bundle, so any static host
> works. The same interface also runs inside the desktop app.
>
> Hosting it on your own server? See **[VPS deployment](./vps-deployment.md)** for the full
> Nginx + TLS setup.

---

## 1. Install the website

### 1.1 Build it

```bash
cd apps/web
npm install
npm run build          # → apps/web/dist/
```

To point the bundle at a different API at build time:

```bash
echo "VITE_API_URL=https://pos.example.com/api" > apps/web/.env
npm run build
```

### 1.2 Serve it

**Nginx**

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

**Any static host** (Netlify, Vercel, S3 + CloudFront, GitHub Pages) works too — upload
`apps/web/dist/` and add a **rewrite of all unmatched routes to `/index.html`**.

### 1.3 Allow the website's origin

The API's CORS allow-list must include your website's origin. Set it in `server/.env`:

```ini
CLIENT_URL=https://pos.example.com
```

Restart the API afterwards.

---

## 2. Roles and screens

| Role | Screens |
|---|---|
| **Cashier** | POS Terminal · Refund & Return · Settings (Store & Scanner, Thermal Printer) |
| **Operator** | Inventory · Sales Logs · Staff · Settings (+ Receipt Template, Desktop) |
| **Superadmin** | Overview · Analytics · Inventory · Staff · Sales Logs · Audit Logs · Store Settings · System Config |

---

## 3. The POS terminal

1. **Scan** — the scan field is autofocused; a keyboard-wedge scanner types the SKU and presses
   Enter. A card grid is available for touch screens. You can also **upload a QR image**.
2. **Adjust the cart** — quantity steppers, removal, live totals with tax.
3. **Customer** — optionally capture a buyer name; it is printed on the receipt.
4. **Pay** — choose the payment method and complete the sale.

Type anywhere on the page and focus jumps back into the scan field.

### Recent transactions

The **Recent Shift Transactions** panel lists the current shift's sales. Click one to reopen its
printable receipt.

---

## 4. Reporting

- **Analytics** — daily revenue, top products, and payment mix as SVG charts.
- **Sales Logs** — every line item shows its **SKU**, the processing **branch**, and the cashier.
- **Financial Export** — CSV, PDF, or JSON.
- **Audit Logs** — a human-readable record of every stock and money movement.

---

## 5. Browser offline behaviour

The web build uses **IndexedDB** for the same product cache and sale queue as the desktop app's
SQLite. It syncs on mount, when the browser reports the network is back, and every 30 seconds.

Offline limits: the browser build cannot open a receipt for a sale that was never synced, and
its "browse all cached products" path returns an empty list. The desktop build has neither
restriction.

---

## 6. Configuration

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base URL baked into the bundle |
| `VITE_DESKTOP` | `false` | `true` produces the desktop bundle (relative assets + hash router) |

> `VITE_*` variables are **public** — never put a secret in one.
