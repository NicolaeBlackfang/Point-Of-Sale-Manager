# OpenPOS — Engineering Rules

These are the **binding rules** for working on this repository. They exist so that the web server
and the desktop application stay consistent with each other and so that any future contributor
can predict how a change should be made.

Enforcement order when rules conflict: **Security → Data integrity → Consistency → Convenience.**

---

## 1. Repository Layout Rules

The repository is split into three top-level concerns. **Do not mix them.**

```
openpos/
├── apps/
│   ├── desktop/     # Electron application (main process, preload, native services)
│   └── web/         # React SPA — the website, ALSO the desktop renderer
├── server/          # Express + MongoDB API — the web server
├── build/           # App icons consumed by electron-builder
├── scripts/         # Build tooling (e.g. the wine-free NSIS patch)
└── docs/            # prd / rules / architecture / design / memory / tracker
```

| Rule | Statement |
|---|---|
| **R-1.1** | `server/` contains **only** server code. It must never import from `apps/`. |
| **R-1.2** | `apps/web/` contains **only** web/renderer code. It must never import from `server/`. |
| **R-1.3** | `apps/desktop/` contains **only** Electron main-process code (`.cjs`). It must never import from `apps/web/` or `server/`. |
| **R-1.4** | The only shared contract between `server/` and `apps/web/` is **HTTP + JSON**. There is no shared code folder. |
| **R-1.5** | `apps/web/` is the single source of truth for the UI. The desktop app renders it; it does not fork it. |
| **R-1.6** | `dist-electron/` is build output. It is git-ignored and must never be committed. |
| **R-1.7** | `build/` holds **source** assets (icons). Generated artefacts go to `dist-electron/`. |

---

## 2. The Two Deliverables Rule

OpenPOS ships as a **web server** and a **software application**. They are not alternatives — they
are the same product with two shells.

| Rule | Statement |
|---|---|
| **R-2.1** | Any feature added to the checkout UI must work in **both** the browser and the desktop app. If it needs native capability, it must degrade gracefully in the browser. |
| **R-2.2** | Native-only features are reached through `apps/web/src/services/electron.js`, which is a thin, always-present-safe wrapper. Feature code must never touch `window.electron` directly. |
| **R-2.3** | The desktop app is **client-only**. It never bundles or starts the API server. It always talks to a remote server over HTTP. |
| **R-2.4** | The API base URL must be resolvable at **runtime** (Desktop Settings → "Backend server"), not only at build time. The renderer and the main process must read the **same** value. |
| **R-2.5** | The web build uses `BrowserRouter`; the desktop build uses `HashRouter` and relative asset paths (`base: './'`). The router choice is switched by `VITE_DESKTOP=true`. |

---

## 3. Security Rules

These are non-negotiable. A change that weakens any of them is a regression.

| Rule | Statement |
|---|---|
| **R-3.1** | **Never trust the client.** Prices, totals, tax, and stock are always recomputed on the server. The client sends intent, never amounts. |
| **R-3.2** | Every mutating route requires a verified JWT **and** a role check **and** a branch-scope check. IDOR protection is mandatory. |
| **R-3.3** | Never commit `.env`, credentials, Atlas URIs, or JWT secrets. `server/.env` is git-ignored. |
| **R-3.4** | The NoSQL-injection sanitiser must remain the **first** middleware in the chain. Never add a route that bypasses it. |
| **R-3.5** | Body size limits (10 kB) and rate limits stay in place. Raise them only with a documented reason. |
| **R-3.6** | Electron runs with `contextIsolation: true` and `nodeIntegration: false`. All privileged work goes through the preload bridge. |
| **R-3.7** | The preload bridge is a **whitelist**. Never expose a generic `invoke(channel, …)` to the renderer. |
| **R-3.8** | Secrets never reach the renderer bundle. `VITE_*` variables are public by definition. |
| **R-3.9** | Passwords are hashed with bcrypt. Never log, echo, or return a password hash. |

---

## 4. Offline & Sync Rules

The offline path is the reason this product exists. These rules protect it.

| Rule | Statement |
|---|---|
| **R-4.1** | A sale is only removed from the offline queue when the server has **confirmed** it (`2xx`). |
| **R-4.2** | `401`/`403` must **retain** the queue and stop the pass. The sale is retried after the cashier signs in again. |
| **R-4.3** | `4xx` (other than 401/403) drops **only the offending sale** and continues with the next one, so one bad payload cannot wedge the queue. |
| **R-4.4** | `5xx` and network errors **retain** the queue and abort the pass, preserving FIFO order. |
| **R-4.5** | The queue is strictly FIFO. Never reorder, coalesce, or batch-reorder sales. |
| **R-4.6** | The background sync engine authenticates with the **same JWT** the UI uses. It must receive that token explicitly — never read it from disk. |
| **R-4.7** | The sync engine must be safe to run concurrently with the renderer's own flush. Both are idempotent (server-side dedup by transaction id). |
| **R-4.8** | The local database must be readable/writable without a running server. SQLite (desktop) and IndexedDB (browser) are the only two permitted backends. |
| **R-4.9** | The active cart is persisted continuously (debounced) and restored on launch. A crash must never lose a basket. |

---

## 5. Data Model Rules

| Rule | Statement |
|---|---|
| **R-5.1** | Prices are stored as **numbers** with explicit rounding, never as formatted strings. |
| **R-5.2** | SKU is unique (case-insensitive) across the store. Enforced in the model, not just the UI. |
| **R-5.3** | A product cannot be created or saved without an image. Enforced server-side. |
| **R-5.4** | Every document that represents a business event carries `createdAt`. |
| **R-5.5** | Sales, receipts, and audit records are **append-only** in practice. Corrections happen via refunds, never by mutating history. |
| **R-5.6** | Receipt retention is 7 days. Expiry is computed, not stored. |
| **R-5.7** | Every mutating operation writes an audit entry with a human-readable description. |
| **R-5.8** | Mongoose schemas declare `timestamps`. Do not hand-roll date fields. |

---

## 6. API Rules

| Rule | Statement |
|---|---|
| **R-6.1** | All routes are mounted under `/api`. |
| **R-6.2** | Route files declare only the route; handlers live in `server/controllers/`. |
| **R-6.3** | Every response has a stable shape. Errors use `{ message }` and an appropriate status code. |
| **R-6.4** | Validation lives in `server/utils/validators.js` and is reused, not re-implemented per route. |
| **R-6.5** | List endpoints support pagination and filtering. |
| **R-6.6** | New API fields are added **backwards-compatibly** — the desktop app and the web app are versioned independently and may be on different builds. |
| **R-6.7** | No endpoint may be added without an auth check unless it is explicitly public (`/api/auth/login`, health). |

---

## 7. Frontend Rules

| Rule | Statement |
|---|---|
| **R-7.1** | The renderer is React 19 + Vite + Tailwind CSS v4. No new CSS frameworks, no new UI kits. |
| **R-7.2** | Tailwind utility classes are the default. A component adds a plain `.css` file only for something utilities cannot express (e.g. `@page` print rules). |
| **R-7.3** | Icons come from `lucide-react` only. |
| **R-7.4** | All HTTP access goes through `apps/web/src/services/api.js`. No component calls `axios` directly. |
| **R-7.5** | All offline storage goes through `apps/web/src/services/offline.js`. No component touches IndexedDB or SQLite directly. |
| **R-7.6** | Role-based UI is a **convenience**, not a security control. The server remains the authority. |
| **R-7.7** | Context is provided by `AuthProvider`, `SettingsProvider`, `ThemeProvider`. Do not introduce a fourth global context without a design note. |
| **R-7.8** | Components stay under ~500 lines. Split by domain folder (`pos`, `inventory`, `staff`, `reports`, `settings`, `logs`). |
| **R-7.9** | Every new receipt template field needs a default in `DEFAULT_RECEIPT_TEMPLATE` and a token in `RECEIPT_TEMPLATE_TOKENS`. |

---

## 8. Desktop / Electron Rules

| Rule | Statement |
|---|---|
| **R-8.1** | Main-process files are `.cjs` and are plain CommonJS so they can be unit-tested in Node without booting Electron. |
| **R-8.2** | `node-sqlite3-wasm` is used instead of a native SQLite binding — no `electron-rebuild`, no ABI juggling, identical behaviour in tests and in the app. |
| **R-8.3** | New native capability requires: (a) a function in `apps/desktop/`, (b) an IPC handler in `main.cjs`, (c) a preload entry, (d) a wrapper in `services/electron.js`, (e) a browser fallback. |
| **R-8.4** | `contextBridge.exposeInMainWorld` is a whitelist. |
| **R-8.5** | The app must launch with no network and no server running. |
| **R-8.6** | Build output for both platforms must come from **one** command per platform. |
| **R-8.7** | `scripts/nsis-no-wine.cjs` exists so Linux can cross-build the Windows installer. Do not "fix" the Wine dependency by re-adding it. |

---

## 9. Testing Rules

| Rule | Statement |
|---|---|
| **R-9.1** | Backend tests use `node:test` and must run **without a database**. A test that needs MongoDB belongs in an integration suite, not the unit suite. |
| **R-9.2** | New logic in `server/utils/`, `server/middleware/`, or `apps/desktop/` requires a unit test. |
| **R-9.3** | Sync-engine tests must cover the 2xx / 4xx / 401 / 5xx matrix. |
| **R-9.4** | Frontend lint must report **0 errors**. Warnings are tolerated but new ones are not. |
| **R-9.5** | CI runs on every push: backend tests, frontend lint, frontend build. |
| **R-9.6** | A change is not done until `npm test`, `npm run lint`, and both builds pass locally. |

---

## 10. Git & Commit Rules

| Rule | Statement |
|---|---|
| **R-10.1** | Conventional Commit prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`. |
| **R-10.2** | One logical change per commit. |
| **R-10.3** | Never commit `dist-electron/`, `node_modules/`, `.env`, or `server/uploads/`. |
| **R-10.4** | Lockfiles **are** committed — CI uses `npm ci`. |
| **R-10.5** | Never force-push a shared branch; never rewrite history that has been pushed. |
| **R-10.6** | The repository owner handles publishing/releases; assistants do not push without an explicit instruction. |

---

## 11. Documentation Rules

| Rule | Statement |
|---|---|
| **R-11.1** | `docs/prd.md` is updated when a requirement's scope changes. |
| **R-11.2** | `docs/architecture.md` is updated when a module, boundary, or data flow changes. |
| **R-11.3** | `docs/design.md` is updated when a visual or interaction pattern changes. |
| **R-11.4** | `docs/memory.md` records a **durable** decision or gotcha — not a changelog. |
| **R-11.5** | `docs/tracker.md` is the single source of truth for "what is in flight". |
| **R-11.6** | `README.md` is the entry point: what it is, how to start it, and links to the guides in `docs/`. It stays short — the detail lives in `docs/desktop-app.md`, `docs/website.md`, and `docs/server.md`. |

---

## 12. Definition of Done

A task is **done** when all of these are true:

- [ ] The requirement is implemented and the behaviour matches `docs/prd.md`.
- [ ] Unit tests added for new logic; full suite green.
- [ ] `npm run lint` → 0 errors.
- [ ] `npm run build:web` and `npm run build:desktop` succeed.
- [ ] Works in **both** the browser and the desktop app, or the divergence is documented.
- [ ] Offline behaviour verified for anything checkout-related.
- [ ] No secrets, no dead code, no commented-out blocks.
- [ ] `docs/` updated where the change is structural.
- [ ] Committed with a Conventional Commit message (only when asked).
