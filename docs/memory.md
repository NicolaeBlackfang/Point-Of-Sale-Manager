# OpenPOS — Memory

Durable technical knowledge: **decisions that were made, why they were made, and the gotchas
that will bite you**. This is not a changelog — it is the thing you read *before* you change
something that looks obvious.

---

## 1. Repository Layout

The repo is organised as three concerns:

```
apps/desktop/   Electron main process (client-only)
apps/web/       React SPA — serves BOTH the website and the desktop renderer
server/         Express + MongoDB API
```

**Why:** the product ships in two forms (a website and a desktop app). Making the split explicit
prevents the classic mistake of letting desktop-only code leak into the web bundle, and keeps
"server" code from being dragged into the desktop installer.

**Gotcha:** the folder names changed in this release (`backend/`→`server/`, `frontend/`→`apps/web/`,
`electron/`→`apps/desktop/`). Any script, CI job, or documentation still naming the old paths is
stale. `git grep -n "backend/\|frontend/"` to find leftovers.

---

## 2. Electron: `node-sqlite3-wasm`, not `better-sqlite3`

**Decision:** use `node-sqlite3-wasm` (a WebAssembly build of SQLite) for the local database.

**Why:** `better-sqlite3` is a native addon. Every Electron upgrade changes the Node ABI, which
means `electron-rebuild` must run again, which breaks on machines without a C++ toolchain, and
which produced a hard crash (`NODE_MODULE_VERSION` mismatch) the first time the app was launched.
The WASM build has **no ABI at all** — the exact same file works in plain Node (unit tests) and
inside Electron, and it never needs rebuilding.

**Gotchas:**
- `electron-builder` still runs `electron-rebuild`; there is simply nothing to rebuild.
- `asarUnpack` in `package.json` must reference `node-sqlite3-wasm`, not `better-sqlite3`.
- The `.wasm` file must be inside the asar — it is, and `7z l` on the packaged asar confirms it.

---

## 3. Electron: the Windows installer can be built without Wine

**Problem:** `electron-builder --win` on Linux fails with *"wine is required"*. The NSIS target
needs the uninstaller, which it normally extracts by **running the intermediate installer under
Wine**.

**Root cause:** electron-builder has a **pure-JS** `UninstallerReader` that can extract the
uninstaller from the PE binary — but it is only used when `isMacOsCatalina()` returns `true`.
On every other platform it falls through to `execWine`.

**Decision:** `scripts/nsis-no-wine.cjs` monkey-patches `isMacOsCatalina()` to return `true` via
a `Module._load` hook, so the pure-JS path runs on Linux.

**Usage:**

```bash
npm run electron:build:win          # Linux → Windows, no Wine
npm run electron:build:win:native   # on Windows, with rcedit metadata
```

**Gotchas:**
- The Linux build must also pass `--config.win.signAndEditExecutable=false`, because `rcedit`
  (which writes the icon/version metadata into the exe) is itself a Windows binary.
- **Consequence:** a Windows build produced on Linux has the **default Electron icon and metadata**.
  Build on Windows (or CI) for a polished installer.
- Do not "fix" this by re-adding a Wine dependency — that is the exact problem being avoided.

---

## 4. Electron: the app is client-only

**Decision:** the desktop app **never** bundles or starts the API server.

**Why:** the user's deployment model is "one MongoDB-backed server, many counters". Bundling the
server into the installer would bloat it (~90 MB of server source with no `node_modules`, so
non-functional anyway) and create two sources of truth.

**Consequence:** the `build.files` list in `package.json` includes only `apps/desktop/**` and
`apps/web/dist/**` — **not** the server. Earlier revisions shipped `backend/**` in the asar;
that was dead weight and has been removed.

**Gotcha:** the desktop app needs a reachable server URL. It is configured at runtime in
**Desktop Settings → Backend server**, and stored in **two** places that must agree:
`localStorage.openpos.apiBase` (renderer) and `sync_meta.apiBase` (SQLite, main process).

---

## 5. Sync: the 4xx/5xx/401 matrix

This is the single most important behaviour in the product. Getting it wrong **loses sales**.

| Server response | Action | Reason |
|---|---|---|
| `2xx` | Remove from queue, `sent++` | The server has it. |
| `401` / `403` | **Stop the pass, keep the queue** | The JWT expired. The sale is retried after the cashier signs in again. |
| `4xx` (other) | **Drop only this sale, continue** | The payload is permanently invalid. Keeping it would wedge the queue forever. |
| `5xx` / network error | **Stop the pass, keep the queue** | Transient. Preserve FIFO order. |

**Gotcha:** the original implementation dropped *any* 4xx, which silently destroyed queued sales
whenever the token was missing. `401`/`403` now retain the queue.

**Gotcha:** the original implementation *also* kept the queue on a 400, which meant a single bad
payload could block every sale behind it forever. Rejected payloads are now dropped individually.

---

## 6. Sync: the main process needs the JWT

**Problem:** the background sync engine runs in the **main process** (so it keeps working when the
window is closed) but the JWT lives in the **renderer's** `localStorage`.

**Decision:** the axios request interceptor in `apps/web/src/services/api.js` calls
`setSyncToken(token)` on every authenticated request. The main process stores it in a module
variable and attaches `Authorization: Bearer <token>` to its own `POST /sales` calls.

**Why that path:** any request already carries the token, so this needs no login hook, no token
polling, and no disk read of credentials.

**Gotcha:** the main process must **never** read the token from disk — that would be a credential
at rest outside the OS keychain. It is held in memory only.

---

## 7. The renderer also flushes the queue

**Decision:** the renderer runs its own flush on mount, on the `online` event, and every 30 s —
in addition to the main-process engine.

**Why:** the web build has no main process, so the renderer flush is the *only* sync path in the
browser. Sharing one code path keeps behaviour identical across surfaces.

**Gotcha:** both paths can run concurrently. This is safe because the server deduplicates by
`transactionId`. Do not add client-side "locking" that depends on a single process — it would
break the web build.

---

## 8. Offline storage: one API, two backends

`apps/web/src/services/offline.js` is the **only** module that touches local storage. It picks a
backend at runtime:

| Surface | Backend | Module |
|---|---|---|
| Desktop | SQLite | `apps/desktop/sqlite-store.cjs` (via IPC) |
| Browser | IndexedDB | inline in `offline.js` |

**Why:** feature code must never branch on "am I in Electron?" — that leaks platform concerns
into the UI and breaks the web build.

**Gotcha:** the IndexedDB version is `2`; bumping it requires adding the new object store to the
`onupgradeneeded` handler. The SQLite side uses `CREATE TABLE IF NOT EXISTS`, so it self-migrates.

---

## 9. Active carts are persisted

**Decision:** the in-progress cart is written to `active_carts` (SQLite) / the `activeCarts`
store (IndexedDB) on a 400 ms debounce, and restored on launch.

**Why:** the requirement is that a crash or power loss must never lose a basket. A cashier who
loses a 20-item cart at the counter will blame the software, not the outage.

**Gotchas:**
- The cart id is stored in `localStorage.openpos.activeCartId` so the same cart is found again
  after a restart.
- The cart is cleared when the checkout succeeds (`setCart([])` → the persistence effect calls
  `removeActiveCart`).
- The unmount cleanup reads from a ref (`cartStateRef`) — reading `cart` directly there would
  capture a stale closure value.

---

## 10. The API base URL must be runtime-configurable

**Problem:** `import.meta.env.VITE_API_URL` is baked in at build time. One installer would be
locked to one server, and the main process used a *different* source (`OPENPOS_API_URL`) — so the
UI and the background sync could point at different servers.

**Decision:**
- `apps/web/src/services/api.js` exports `getApiBase()` / `setApiBase(url)`. The Axios instance
  reads a module-level `apiBase`; `setApiBase` mutates `API.defaults.baseURL` and persists to
  `localStorage`.
- `apps/desktop/main.cjs` exposes `settings:getApiBase` / `settings:setApiBase`, backed by
  `sync_meta.apiBase` in SQLite, and the sync engine reads it through `getApiBase()`.
- The Desktop Settings panel has a "Backend server" field that calls both.

**Gotcha:** `assetUrl()` used to close over a constant `API_ORIGIN`. It now calls
`getApiOrigin()` so product images resolve against the *current* server.

---

## 11. The desktop build must use relative assets and hash routing

**Decision:** `VITE_DESKTOP=true` switches Vite's `base` to `'./'` and the router to
`HashRouter`.

**Why:** the packaged app loads the bundle over `file://` (`loadFile`). Absolute asset paths
(`/assets/index-abc.js`) resolve to the filesystem root and 404. `BrowserRouter` needs a real
HTTP server for history fallback; `HashRouter` works over `file://`.

**Gotcha:** `import.meta.env` is a **build-time** constant. Anything that must change per
installation (the server URL) has to be resolved at runtime, not via `VITE_*`.

---

## 12. Security invariants that must not be relaxed

| Invariant | Where |
|---|---|
| Server recomputes all prices, tax, and totals | `server/controllers/salesController.js` |
| `sanitizeMiddleware` is the first custom middleware | `server/app.js` |
| 10 kB body limit | `server/app.js` |
| `contextIsolation: true`, `nodeIntegration: false` | `apps/desktop/main.cjs` |
| The preload bridge is a whitelist (no generic `invoke`) | `apps/desktop/preload.cjs` |
| Role + branch scope on every mutating route | `server/middleware/authMiddleware.js` |
| `.env` is git-ignored; `VITE_*` variables are public | `.gitignore` |
| Password policy is enforced in the request layer | `server/utils/security.js` |
| Outbound requests (webhook, SMTP) are validated before use | `server/utils/lowStock.js`, `server/utils/mailer.js` |
| Every value in a generated document is escaped | `apps/web/src/utils/reports.js`, `apps/web/src/utils/printer.js` |
| Stock changes are atomic and conditional | `server/controllers/productController.js`, `server/controllers/salesController.js` |

**Gotcha:** adding a route *before* `sanitizeMiddleware`, or skipping `authMiddleware`, silently
reintroduces NoSQL injection or IDOR. The unit tests in `server/tests/sanitize.middleware.test.js`
and `auth.middleware.test.js` exist to catch this.

**See also:** §26 documents the full security model of the 2026-10-21 audit.

---

## 13. Server-side receipt retention is 7 days

Receipts expire **7 days** after `createdAt`. This is computed, not stored, and it gates the
refund path. If a receipt is gone, the refund is gone — that is intended, not a bug.

---

## 14. Product images are mandatory

A product cannot be created without an image. Enforced **server-side** in
`server/utils/productImage.js` (data-URL MIME/size validation) and mirrored in the UI.

**Why:** a product list without images is unreadable on a touchscreen counter, and the receipt
QR/print layout assumes a consistent product record.

**Gotcha:** the image is stored as a **data URL** in the product document, not as a file on
disk. `server/uploads/` is git-ignored runtime scratch space.

---

## 15. SKU is editable and unique

SKU was previously read-only in the Operator UI, which made duplicate SKUs unavoidable because
they were auto-generated. The Operator can now edit it, and uniqueness is enforced in the model
(case-insensitive). The SQLite product cache upper-cases SKUs for its own uniqueness index —
`getProductBySku` must use the same normalisation.

---

## 16. Testing constraints

- `server/` tests use `node:test` and run with **no database** and **no network**. A test that
  needs MongoDB does not belong in the unit suite.
- The desktop main-process modules are plain `.cjs` **specifically so they can be unit-tested**
  without booting Electron. Keeping them CommonJS is a requirement, not a style choice.
- `withTempDb()` in `server/tests/electron.desktop.test.js` swaps the module-level SQLite handle
  for a temp file. If you add a table, add it to the temp schema in that helper too.
- CI: `server/` → `npm test`; `apps/web/` → `npm run lint` + `npm run build`.

---

## 17. Build and packaging commands

```bash
npm run install:all            # install all three packages
npm run build:web              # website bundle       → apps/web/dist
npm run build:desktop          # desktop bundle       → apps/web/dist (VITE_DESKTOP=true)
npm run electron:build:linux   # AppImage + deb
npm run electron:build:win     # NSIS .exe (no Wine)
npm run electron:build:win:native
npm run electron:pack          # unpacked directory only
```

**Gotchas:**
- `dist-electron/` is git-ignored — never commit installers.
- The AppImage needs FUSE to run. In a container without FUSE, use
  `./OpenPOS-1.0.0.AppImage --appimage-extract` and run `squashfs-root/openpos`.
- A Windows build produced on Linux has the default Electron icon (see §3).
- `package.json` needs an `author.email` or the `.deb` target fails with
  *"Please specify author 'email'"*.

---

## 18. Local development

```bash
npm run server     # API on :5000
npm run web        # Vite on :5173
npm run electron:dev  # both + Electron with DevTools
```

**Gotcha:** `npm run electron:dev` uses `wait-on tcp:5000 tcp:5173` — the Electron window will
not open until both are listening.

**Gotcha:** the desktop app in dev mode loads `VITE_DEV_SERVER_URL` and opens DevTools. In a
packaged build it loads `apps/web/dist/index.html` from disk.

---

## 19. Known limitations (as of 2026-10-21)

| Limitation | Impact |
|---|---|
| No FUSE in some containers | The AppImage must be extracted to run |
| Windows installers built on Linux have the default Electron icon | Cosmetic; build on Windows for a polished installer |
| No physical thermal printer was available for testing | Print transports are code/unit-verified only |
| Stock conflicts across offline terminals are last-write-wins | Two terminals can oversell the same SKU offline |
| The desktop app cannot be used fully air-gapped | It needs a reachable server; there is no bundled local server |
| The web build caches products in IndexedDB but the "get all cached products" path returns `[]` | Only affects the browser build's offline browse; the desktop build returns the full SQLite set |

---

## 20. Packaging metadata must be real

`electron-builder` refuses to build a `.deb` without `author.email`, so `package.json` carries an
`author` block. It must hold a **real** address — the one used in the Git history
(`sajidasim506@gmail.com`) — not a placeholder domain, because the value is baked into the
`.deb` control file as `Maintainer:` and ends up in the user's package manager.

```bash
dpkg-deb -f dist-electron/openpos_1.0.0_amd64.deb Maintainer
```

**Gotcha:** `appId` (`com.openpos.app`) is only a bundle identifier, not a domain that has to
resolve — it is fine to keep it even when no such host exists.

---

## 21. The API has a public health endpoint

`GET /api/health` returns `{ status, service, uptime, timestamp }` and **never touches the
database**, so it works even when MongoDB is down. Use it for load-balancer checks and for the
"verify the server" step of the install guide:

```bash
curl http://localhost:5000/api/health
```

It is registered in `server/app.js` *after* the rate limiter, so it shares the general `/api`
limit but needs no auth.

---

## 22. The POS scan bar is a real component, not inline markup

`apps/web/src/components/pos/ScanInputSection.jsx` owns the SKU field, the **Upload QR** button
and the global "type anywhere to refocus the scan field" behaviour. `CashierDashboard.jsx` must
render it — it is **not** inlined into the page.

The same applies to `RecentTransactions.jsx` (props: `recentSales`, `onSelect`), which renders the
"Recent Shift Transactions" list and opens a receipt on click.

**Why this matters:** both components were once fully written and wired (`qrInput`,
`handleScanSubmit`, `handleFileUpload`, `fileInputRef`, `scanInputRef`, `fetchRecentSales`,
`openReceiptFromSale` all existed) but were **not rendered**, so the POS terminal silently lost
the scan field, the QR-upload button and the recent-transactions panel. The only symptom was six
`no-unused-vars` lint warnings.

**Rule:** an unused import of a whole POS component is a bug, not a lint nit. Fix it by rendering
the component with the props it already declares — do not delete the component and leave the
handlers dangling.

---

## 23. Linux sandbox: `chrome-sandbox` must be 4755, and the AppImage needs AppArmor

### The bug

The packaged app aborted on launch on Ubuntu 23.10+ (incl. 24.04/26.04):

```
FATAL:setuid_sandbox_host.cc The SUID sandbox helper binary was found, but is
not configured correctly. You need to make sure that <path>/chrome-sandbox is
owned by root and has mode 4755.
```

Two separate causes, both fixed:

**1. The `.deb` shipped `chrome-sandbox` as 0755.** electron-builder stages the Electron runtime
with mode 0755 and fpm preserves whatever it finds. `scripts/after-pack.cjs` (wired via
`build.afterPack`) chmods it to 4755 before packaging.

**2. The generated `postinst` downgraded it back to 0755.** electron-builder's
`after-install.tpl` probes user namespaces with `unshare --user true` and, if that "works",
sets 0755 expecting Chromium to use the namespace sandbox. But:

- the probe runs **as root**, and root can always create a user namespace — so the probe
  succeeds on every machine and proves nothing;
- `unshare --user true` is not even the right test: Chromium's namespace sandbox also needs
  to map the uid to root (`unshare --user --map-root-user`), and **that** is what AppArmor's
  `kernel.apparmor_restrict_unprivileged_userns=1` blocks.

So the namespace sandbox is unavailable and the SUID sandbox was downgraded — the worst of
both. `scripts/deb-after-install.tpl` (wired via `build.deb.afterInstall`) unconditionally sets
**4755** instead of probing.

**Verify after any packaging change:**

```bash
dpkg-deb -c dist-electron/openpos_1.0.0_amd64.deb | grep chrome-sandbox
# expect: -rwsr-xr-x 0/0  ... ./opt/OpenPOS/chrome-sandbox
ls -la /opt/OpenPOS/chrome-sandbox   # after install
```

### The AppImage cannot use the SUID helper

An AppImage's files belong to the extracting user, so the setuid bit is ignored, and the FUSE
mount is `nosuid`. With the namespace sandbox blocked by AppArmor, the AppImage has **no**
working sandbox unless an AppArmor profile allows `userns`:

```bash
sudo install -m 644 scripts/openpos-apparmor.profile /etc/apparmor.d/openpos
sudo apparmor_parser -r /etc/apparmor.d/openpos
```

**Gotcha:** AppArmor profile names must be unique — three profiles sharing the name `openpos`
make `apparmor_parser` bail out with *"Multiple definitions for profile openpos exist"*. The
shipped profile therefore uses `openpos-appimage`, `openpos-deb`, and `openpos-extracted`.

**Gotcha:** the profile must match the **AppImage's** path (`/tmp/.mount_*/openpos`), not the
`/opt/OpenPOS/openpos` path of the deb install.

---

## 24. The server `.env` seed credentials may not exist

`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in `server/.env` describe the account that
`npm run seed` **would** create. They are not guaranteed to exist in the target database, and
the password is not verifiable from the config. The live database may hold other accounts
(e.g. `admin`, or email-style usernames).

**Do not** reset an existing user's password to "check" the login flow. Create a temporary user,
verify, and delete it:

```js
await db.collection('users').deleteOne({ username: U });
await db.collection('users').insertOne({ username: U, password: await bcrypt.hash(pw, 10), role: 'Superadmin', roleTakerName: 'Smoke Test', isActive: true, createdAt: new Date() });
// ... login + call protected routes ...
await db.collection('users').deleteOne({ username: U });
```

**Gotcha:** `POST /api/auth/login` returns a **flat** object
(`{ _id, username, role, roleTakerName, branchNumber, storeAddress, operatorId, token }`) — the
user fields are *not* nested under a `user` key. The frontend stores that whole object as the
user.

---

## 25. `trust proxy` and the rate limiter

`server/app.js` sets `app.set('trust proxy', 1)`, and the Nginx vhost sets
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Together these make
`req.ip` the **real** client IP, so the express-rate-limit bucket is per client and not shared
by everyone behind Nginx.

**Verified live** (nginx → node, 320 requests from 250 distinct loopback source IPs): 319 × 200,
1 × 429 — the single 429 was `127.0.0.1`, whose bucket had already been drained by an earlier
test. A fresh IP reported `RateLimit-Remaining: 297`, i.e. a 300-request budget for that one
IP. If `trust proxy` were broken, all 320 would have shared one bucket and 429'd after 300.

**Gotcha:** `$proxy_add_x_forwarded_for` *appends* to any `X-Forwarded-For` the client already
sent. A client that sends its own header produces a two-entry chain, and with `trust proxy = 1`
Express takes the **rightmost** entry — the proxy's address, not the client's. Do not "test"
this by injecting an `X-Forwarded-For` header from the client; that changes the topology. Use
distinct real source addresses instead (`curl --interface 127.0.0.N`).

**Gotcha:** behind a CDN, `trust proxy = 1` is one hop short. Raise it to the number of
trusted hops, and no further — a higher value lets a client spoof its IP and dodge the limiter.

---

## 26. Security model — the rules the API and the clients actually enforce

The 2026-10-21 audit hardened every layer. The decisions below are the ones that are easy to
undo by accident, so they are written down here.

### 26.1 The password policy lives in the request layer, not in the model

`User.password` has a mongoose `minlength: 6` validator — but the pre-save hook hashes the
password to a 60-character bcrypt string, so the validator always passes and never sees the
plaintext. The real policy (`validatePasswordStrength`: ≥ 8 characters, at least one letter, at
least one digit) is enforced in `server/utils/security.js` and called from the request layer:
`registerStaff`, `updateStaff` and the seed script. **Gotcha:** a new endpoint that creates or
changes a password must call it too.

### 26.2 Logins must not leak whether a user exists

`POST /api/auth/login` runs a bcrypt compare against a dummy hash when the username is
unknown, so the response time of "no such user" matches "wrong password". The failure message
is identical for both cases. Never branch the response on `userFound`.

### 26.3 Sales never trust the client

`normalizeSaleItems` accepts only a product reference and a quantity (≤ 200 lines, ≤ 1000 units
per line, strict 24-hex ObjectIds). Prices, taxes and totals are recomputed server-side from
the product documents. The branch and the store address come from the authenticated user, not
from the request body (a Superadmin may still post a sale for another branch on purpose).

### 26.4 Outbound requests are the server's SSRF surface

Two features make the server call out: the low-stock webhook and the SMTP notifications.

- **Webhook** — `isSafeOutboundUrl` (http/https only, no embedded credentials, no private or
  metadata host) plus `assertPublicHost` (resolves the name right before the request so DNS
  rebinding cannot smuggle it into the LAN), `redirect: 'error'` and a 5 s timeout. The URL is
  validated both when it is saved *and* when it is used.
- **SMTP** — the host must be a bare hostname or IP (no scheme, port or path), the user name
  must not contain control characters and the envelope values are stripped of CR/LF before they
  reach the SMTP conversation. Private addresses are allowed on purpose: an on-premise store
  commonly runs its relay on the LAN.

**Gotcha:** `sanitizeSmtpValue` replaces CR/LF with a space, so a rejected user name silently
becomes a different (valid) one. The settings validator rejects control characters up front;
the sanitiser is the second line of defence, not the first.

### 26.5 The printable report is a document, not a template

`buildReportHtml` / `buildSalesCsv` (`apps/web/src/utils/reports.js`) escape **every** value
they interpolate — cashier names, branch labels, transaction ids all come from user input. The
document carries a strict CSP (`default-src 'none'`) and the print button is wired from the
opener window instead of an inline `onclick`, because an inline handler would need
`script-src 'unsafe-inline'`.

**Gotcha:** `escapeHtml` turns `'` into `&#39;`. Inside the CSP `<meta content="...">` that is
fine — the HTML parser decodes the entity before the CSP is parsed. Anywhere else, an
entity-encoded apostrophe in a JS string would be wrong.

### 26.6 The Electron window is a security boundary

`apps/desktop/main.cjs` runs the renderer with `sandbox: true` and
`contextIsolation: true`, denies every `window.open`, blocks navigation and redirects away from
the app origin, and refuses to attach webviews. DevTools are only opened in development. The
API base is validated to `http(s)` in the main process, in the sync engine and in the web
client, so a tampered setting cannot point the token at another scheme.

**Gotcha:** the packaged app loads the UI from `file://`, so the origin check accepts only
paths inside `apps/web/dist`. A packaged build that loads a remote page would hand that page
the whole preload bridge (SQLite, sync token, printers).

### 26.7 The web app needs its own security headers

The API sets Helmet headers for its own responses, but the **web app is served by Nginx**, and
Nginx does not inherit them. `deploy/openpos-security-headers.conf` carries the CSP (with the
API origin in `connect-src`/`img-src`), HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy`.

**Gotcha:** an Nginx `location` block that declares its own `add_header` (e.g. the
`Cache-Control` on `/assets/`) **drops every inherited header**. The snippet is therefore
included in each such block as well. **Replace `https://api.example.com` in the snippet with
the real API origin** or the browser blocks every request to the backend.

### 26.8 Stock changes are atomic, not read-then-write

Sales use a conditional `findOneAndUpdate({ _id, stockQuantity: { $gte: qty } }, { $inc: ... })`
and roll the already-applied decrements back if a later line fails. Manual adjustments follow
the same rule: a deduction carries the `$gte` guard, a correction sets the absolute quantity.
A read-then-write would let two concurrent requests oversell the same SKU.

### 26.9 What is deliberately *not* fixed

| Item | Why it stays |
|---|---|
| The JWT lives in `localStorage` | Moving it to a cookie requires CSRF protection on every route — a large refactor. The CSP is the mitigation. |
| A Superadmin may create a product without a photo | Product photos are an Operator responsibility by design (`isOperator` check in `productController.js`). |
| Offline terminals use last-write-wins stock updates | Needs a server-side reservation model; tracked in `tracker.md` §3. |
| `registerStaff` requires `operatorId` (Operator) / `storeAddress` (Cashier) | Mirrors the mongoose `required` rules on `User`; the staff form marks both fields required. |

---

## 27. Related Documents

- [`prd.md`](./prd.md) — requirements
- [`rules.md`](./rules.md) — engineering rules
- [`architecture.md`](./architecture.md) — architecture
- [`design.md`](./design.md) — design system
- [`tracker.md`](./tracker.md) — work tracker
- [`vps-deployment.md`](./vps-deployment.md) — VPS hosting & deployment guide
- [`desktop-app.md`](./desktop-app.md) — desktop app install & usage guide
- [`website.md`](./website.md) — website install & usage guide
- [`server.md`](./server.md) — web server install & operations guide
