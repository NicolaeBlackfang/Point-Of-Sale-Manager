# Desktop Application — Installation & Guide

> The **desktop app** is the counter terminal. It is a pure client: it stores data locally in
> SQLite and syncs with your server. It keeps selling when the network goes down.
>
> Hosting the server this app talks to? See **[VPS deployment](./vps-deployment.md)**.

---

## 1. Install the app

### 1.1 Get the installer

| Platform | File | Notes |
|---|---|---|
| **Linux (glibc)** | `OpenPOS-1.0.0.AppImage` | Single file, no install needed |
| **Linux (glibc)** | `openpos_1.0.0_amd64.deb` | For Ubuntu / Debian |
| **Windows x64** | `OpenPOS Setup 1.0.0.exe` | NSIS assisted installer |

> Building them yourself? See [Building Installers](#6-building-installers).

### 1.2 Install

**Linux — AppImage**

```bash
chmod +x OpenPOS-1.0.0.AppImage
./OpenPOS-1.0.0.AppImage          # run it
sudo mv OpenPOS-1.0.0.AppImage /usr/local/bin/openpos   # optional: put it on PATH
```

> **No FUSE?** (containers, some servers) run it with
> `./OpenPOS-1.0.0.AppImage --appimage-extract && ./squashfs-root/openpos`.

> **"No usable sandbox!" on the AppImage?** Ubuntu 23.10+ (incl. 24.04/26.04) blocks
> unprivileged user namespaces through AppArmor, and an AppImage's files belong to the
> extracting user so the SUID sandbox helper cannot be used either. Install the AppArmor
> profile that ships with the project:
>
> ```bash
> sudo install -m 644 scripts/openpos-apparmor.profile /etc/apparmor.d/openpos
> sudo apparmor_parser -r /etc/apparmor.d/openpos
> ```
>
> The `.deb` does not need this — it uses the SUID helper and works out of the box.

**Linux — .deb**

```bash
sudo dpkg -i openpos_1.0.0_amd64.deb
# or: sudo apt install ./openpos_1.0.0_amd64.deb
```

**Windows**

Double-click `OpenPOS Setup 1.0.0.exe` and follow the wizard. Choose the install folder and
whether to install for the current user or all users. Desktop and Start-menu shortcuts are
created automatically.

### 1.3 Point the app at your server

1. Launch OpenPOS.
2. Sign in (the first sign-in needs a reachable server).
3. Go to **Settings → Desktop Application → Backend server**.
4. Enter your API address, e.g. `https://pos.example.com/api`, and press **Save server**.

The URL is stored locally, and both the interface *and* the background sync use it — you can
move a terminal between stores without reinstalling.

> **Offline note.** The app boots and sells with no network, but the *first* sign-in needs a
> reachable server. Once signed in the session is kept locally and the counter keeps working
> through outages.

### 1.4 Enable auto-start (optional)

**Settings → Desktop Application → Launch on system startup.** Registers an XDG autostart entry
on Linux or a Login Item on Windows.

### 1.5 Set up the printer

**Settings → Thermal Printer:**

| Transport | When to use |
|---|---|
| `system` | A printer already installed in the OS. |
| `native` | Desktop only — silent print via the OS printer list. |
| `escpos-network` | A networked POS printer. Set the IP; port defaults to `9100`. |
| `webusb` / `webserial` / `webbluetooth` | A USB or serial thermal printer plugged into the terminal. |

Then choose the paper width (**58 mm** or **80 mm**) and use **Test print** to verify.

### 1.6 Configure the receipt

**Settings → Receipt Template** (Operator and Superadmin): store name, address, phone, tax ID,
logo, header/footer messages, paper width, QR toggle, and custom CSS. Add dynamic tokens such as
`{{customer_name}}` or `{{total_amount}}` to the messages. Export/import templates as JSON to
roll them out to every terminal.

---

## 2. Where the data lives

| What | Where (Linux) |
|---|---|
| Offline database | `~/.config/openpos/openpos-offline.db` |
| Window bounds | `~/.config/openpos/window-bounds.json` |
| Auto-start entry | `~/.config/autostart/openpos.desktop` |

On Windows the same files live under `%APPDATA%\openpos\`.

The SQLite database holds five tables:

| Table | Purpose |
|---|---|
| `products` | Cached product catalogue (offline browsing) |
| `sales_queue` | Sales that still need to reach the server |
| `sales_cache` | Recently completed sales, for offline reprint |
| `sync_meta` | Sync bookkeeping and the configured API base |
| `active_carts` | The in-progress basket, restored after a crash |

---

## 3. How offline mode works

```
   ┌──────────────┐         offline          ┌──────────────┐
   │  Checkout    │ ───────────────────────▶  │  sales_queue │
   │  fails       │                           │  (SQLite)    │
   └──────────────┘                           └──────┬───────┘
                                                  │ every 30 s
                                                  ▼
                                        ┌──────────────────┐
                                        │  POST /api/sales │
                                        └────────┬─────────┘
                                                 │ 2xx → remove from queue
                                                 │ 401/403 → keep (re-login)
                                                 │ 4xx → drop that one sale
                                                 │ 5xx → keep, retry
                                                 ▼
                                          ┌──────────────────┐
                                          │  MongoDB (Sale)  │
                                          └──────────────────┘
```

- The header shows an **offline strip** and an amber **queued sales** badge.
- A failed checkout is confirmed to the cashier: *"You are offline — sale for $24.00 was queued
  and will sync automatically."*
- The queue is strictly FIFO, and the background engine syncs even while the window is closed.
- A basket in progress is written to `active_carts` 400 ms after every change and restored on
  the next launch.

---

## 4. Roles

| Role | Can do |
|---|---|
| **Superadmin** | Everything: analytics, audit logs, store settings, staff, inventory, desktop settings |
| **Operator** | Inventory, SKU editing, staff, sales logs, receipt template, printer + desktop settings |
| **Cashier** | POS terminal, refunds, store/scanner settings, thermal printer settings |

---

## 5. Keyboard

| Key | Action |
|---|---|
| `Enter` (in the scan field) | Add the scanned SKU to the cart |
| `Tab` | Move between fields |
| `Ctrl/Cmd + R` | Reload (desktop) |
| `Ctrl/Cmd + Q` | Quit (desktop) |

---

## 6. Desktop settings reference

| Setting | Effect |
|---|---|
| Launch on system startup | Registers an autostart entry / login item |
| Backend server | Repoints the app **and** the sync engine at a different API |
| Local database | Shows whether SQLite (desktop) or IndexedDB (browser) is active |
| Queued offline sales | Live count of unsynced sales |
| Last background sync | Timestamp of the last successful sync pass |
| Sync queued sales now | Runs an immediate sync pass |

---

## 7. Building installers

```bash
npm run install:all          # once
npm run build:desktop        # compile the desktop bundle

npm run electron:build:linux # → AppImage + .deb   (dist-electron/)
npm run electron:build:win   # → NSIS .exe          (dist-electron/)
npm run electron:pack        # unpacked directory only
```

| Script | Output |
|---|---|
| `electron:build:linux` | `OpenPOS-1.0.0.AppImage` (104 MB) + `openpos_1.0.0_amd64.deb` (73 MB) |
| `electron:build:win` | `OpenPOS Setup 1.0.0.exe` (79 MB) — **no Wine needed on Linux** |
| `electron:build:win:native` | Same, but run it **on Windows** for a correctly signed/icon'd exe |

Notes:

- `dist-electron/` is git-ignored — installers are never committed.
- The `.deb` target needs an `author.email` in `package.json`.
- A Windows build produced on Linux keeps the default Electron icon. Build on Windows (or CI)
  for a polished installer.
- `scripts/nsis-no-wine.cjs` patches electron-builder so the Windows installer can be
  cross-built on Linux without installing Wine.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Cannot reach the server" at launch | The backend URL is wrong. **Settings → Backend server**. |
| Sales stay in the queue | The token expired. Sign in again — a `401` deliberately keeps the queue. |
| No receipt printed | Check the transport in **Settings → Thermal Printer**, then **Test print**. |
| Fails to open the AppImage | No FUSE. Extract it (`--appimage-extract`) or use the `.deb`. |
| App forgets my window position | The `window-bounds.json` file is read-only; check folder permissions. |
