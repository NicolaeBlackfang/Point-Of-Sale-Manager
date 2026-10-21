# OpenPOS — Design System

**Version:** 1.0.0
**Last updated:** 2026-10-21

This document covers the **visual language**, the **interaction patterns**, and the **specific
screens** of OpenPOS — the website (`apps/web/`) and the desktop application (`apps/desktop/`),
which share one design system because they share one React codebase.

---

## 1. Design Principles

| # | Principle | Meaning in practice |
|---|---|---|
| 1 | **The counter is the priority** | The checkout screen is the densest, fastest surface. Everything else is secondary navigation. |
| 2 | **Readable at arm's length** | 80 mm thermal paper is ~3 inches wide. Type, spacing, and contrast are tuned for that reality. |
| 3 | **Nothing destructive without a step** | Deletes, purges, and refunds require an explicit confirmation. |
| 4 | **Honest state** | Offline, queued, and syncing states are always visible — never hidden. |
| 5 | **One component, both surfaces** | A component is either usable in the browser and the desktop app, or it is explicitly native-only. |
| 6 | **Keyboard-first** | The scanner *is* a keyboard. Focus order, Enter-to-submit, and shortcuts are first-class. |

---

## 2. Foundations

### 2.1 Colour

Tailwind's default palette is used directly — no custom colour ramp.

| Role | Token | Usage |
|---|---|---|
| Page background | `bg-slate-100` | App canvas |
| Surface | `bg-white` | Cards, panels, tables |
| Primary action | `bg-slate-800` / `bg-slate-900` | Checkout, Save, Sync |
| Brand / info | `bg-blue-600`, `sky-600` | Links, API endpoint, informational |
| Success | `bg-emerald-50` / `text-emerald-600` | Payment success, healthy status |
| Warning | `bg-amber-50` / `text-amber-600` | Low stock |
| Danger | `bg-rose-50` / `text-rose-600` | Refund, delete, error |
| Accent (settings) | `bg-violet-600` | Desktop settings accents |

Status colour is **always** paired with an icon or a label so it is not the only signal.

### 2.2 Typography

| Context | Class | Notes |
|---|---|---|
| Page title | `text-base font-bold text-slate-800` | |
| Section heading | `text-xs font-bold text-slate-800` | Uppercase in receipts |
| Body | `text-xs text-slate-600` | |
| Label / meta | `text-[11px] text-slate-500` | |
| Faint / helper | `text-[11px] text-slate-400` | |
| Monospace (SKUs, IDs, receipts) | `font-mono` | Transaction IDs and receipt bodies |
| Receipt | `font-mono text-[11px]` | `paper-58` modifier for 58 mm stock |

### 2.3 Spacing & shape

| Element | Radius | Padding |
|---|---|---|
| Card / panel | `rounded-xl` (or `rounded-2xl` for modals) | `p-4` … `p-6` |
| Button | `rounded-xl` | `px-4 py-2` |
| Input | `rounded-lg` | `px-3 py-2` |
| Badge / chip | `rounded-full` | `px-2 py-0.5` |
| Modal | `rounded-2xl` | `p-5` / `p-6` |

### 2.4 Elevation

| Level | Use | Class |
|---|---|---|
| 0 | Inline content, table rows | — |
| 1 | Cards, panels | `shadow-sm` |
| 2 | Dropdowns, popovers | `shadow-lg` |
| 3 | Modals, receipt viewer | `shadow-2xl` |

### 2.5 Icons

`lucide-react` only. Typical sizes: `h-3.5 w-3.5` inline/labels, `h-4 w-4` buttons,
`h-5 w-5` section headers, `h-7 w-7` large empty states.

---

## 3. Application Shell

### 3.1 Layout

```
┌──────────────┬───────────────────────────────────────────────────────┐
│              │  Header: page title, branch, user, status chips      │
│   Sidebar    ├───────────────────────────────────────────────────────┤
│  (collapsible│                                                       │
│   260px)     │                  Page content                         │
│              │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

- The sidebar is **collapsible** (`w-64` → icon rail) and its state is persisted.
- Navigation is **grouped** (Main, Inventory, Reports, Staff, Settings) with a label above each
  group.
- The header carries live status chips: offline indicator, queued-sales count, last sync.

### 3.2 Responsive behaviour

- Desktop terminals: `min-w-[1024px]`, tables and grids use the full width.
- `ViewportGuard` blocks viewports narrower than the supported minimum with an explanatory
  message rather than letting the layout break.
- Below `sm`, single-column grids and stacked tables.

### 3.3 Theming

`ThemeProvider` supplies a light/dark preference. Components use semantic Tailwind classes so
the theme switch is a class swap on the root element.

---

## 4. Role Surfaces

| Role | Primary surface | Navigation |
|---|---|---|
| **Cashier** | POS terminal | POS Terminal, Refund & Return, Settings (Store & Scanner, Thermal Printer) |
| **Operator** | Inventory | Inventory, Sales Logs, Staff, Settings (+ Receipt Template, Thermal Printer, Desktop) |
| **Superadmin** | Overview | Everything, plus Store Settings, System Config, Analytics, Audit Logs |

Role gating is a **UI convenience**; the server remains the authority (`docs/rules.md` R-7.6).

---

## 5. The POS Terminal (the critical screen)

### 5.1 Layout

```
┌─────────────────────────────────────────────┬──────────────────────┐
│  SCAN INPUT  (autofocus, keyboard-wedge)    │                      │
├─────────────────────────────────────────────┤   CART               │
│  PRODUCT GRID  (cards with image, name,     │   ┌──────────────┐   │
│  price, stock badge)                        │   │ line items   │   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │   ├──────────────┤   │
│  │img │ │img │ │img │ │img │               │   │ qty controls │   │
│  └────┘ └────┘ └────┘ └────┘               │   ├──────────────┤   │
│                                             │   │ TOTAL        │   │
├─────────────────────────────────────────────┤   │ [ PAYMENT ]  │   │
│  Cart (n)   |  Customer name  |  Payment    │   └──────────────┘   │
└─────────────────────────────────────────────┴──────────────────────┘
```

### 5.2 Interaction rules

| Rule | Detail |
|---|---|
| **Scan focus** | The scan input is autofocused on mount and reclaims focus after every add. The scanner is a keyboard wedge — it types the SKU and presses Enter. |
| **Add animation** | The matching product card flashes so the cashier sees *what* was added, not just that something was. |
| **Scan sources** | Hardware (keyboard wedge), Camera (webcam QR via `html5-qrcode`), QR image upload, Manual entry — selectable in Store & Scanner settings. |
| **Quantity** | +/- steppers and a direct numeric field per line. |
| **Stock guard** | Quantity cannot exceed the cached `stockQuantity`; the button disables and the badge turns amber. |
| **Total** | Live subtotal + tax, formatted by the store currency. |
| **Offline banner** | A persistent amber strip: *"You are offline — sales will be queued and synced automatically."* |
| **Queued badge** | The header shows the pending-sync count; it disappears when the queue empties. |
| **Cart recovery** | On launch, a saved cart is restored with a *"Recovered an unsaved cart from your last session."* notice. |

### 5.3 Checkout

`POST /api/sales` sends **intent only** (product ids, quantities, payment method, customer name).
The server recomputes prices, tax, and totals. On success the receipt viewer opens; on a network
error the sale is queued locally and the cashier sees a clear confirmation.

---

## 6. Receipt Design

### 6.1 Screen/print receipt (`ReceiptDocument.jsx`)

```
┌────────────────────────────┐
│      [ LOGO, optional ]    │
│        STORE NAME          │
│        Address             │
│        Phone               │
│        Tax ID              │
│        Branch #1           │
│        21/10/2026 14:22    │
│        Cashier: Jane       │
├────────────────────────────┤  ← dashed
│ Transaction ID   ┌──────┐  │
│ Payment: CASH    │  QR  │  │
│ Status: Completed└──────┘  │
├────────────────────────────┤  ← dashed
│ Item        Qty     Amount │
│ Widget        2 × 4.50  9.00│
├────────────────────────────┤  ← dashed
│ Subtotal            $9.00  │
│ Tax (0%)             $0.00  │
│ TOTAL              $9.00  │
├────────────────────────────┤  ← dashed
│     <header message>       │
│     <footer message>       │
│   Thank you for shopping!  │
│      Powered by OpenPOS    │
└────────────────────────────┘
```

The paper block carries `id="receipt-print-area"` so the print stylesheet can isolate exactly it.

### 6.2 Receipt template editor

A **structured form builder** (not free-form rich text), because a structured template is
printable on 58 mm and exportable/importable as JSON.

| Section | Fields |
|---|---|
| **Store** | Name, branch address, phone, tax ID |
| **Branding** | Logo (upload → data URL), show/hide logo |
| **Messages** | Header message, footer message |
| **Paper** | 58 mm / 80 mm, show QR code |
| **Advanced** | Custom CSS |
| **Dynamic tokens** | 14 chips: `{{store_name}}`, `{{branch_address}}`, `{{phone}}`, `{{tax_id}}`, `{{transaction_id}}`, `{{customer_name}}`, `{{date_time}}`, `{{subtotal}}`, `{{tax_amount}}`, `{{total_amount}}`, `{{cashier_name}}`, `{{branch_number}}`, `{{payment_method}}`, `{{item_list}}` |
| **Portability** | Export template (JSON) / Import template (JSON) |
| **Preview** | Live preview pane |

Tokens are resolved at render time against the sale, in both the screen receipt and the native
print HTML.

---

## 7. Printing UX

The **Thermal Printer** panel (Operator, Superadmin, Cashier) contains:

| Control | Detail |
|---|---|
| Transport | `system` / `native` / `escpos-network` / `webusb` / `webserial` / `webbluetooth` |
| Device | OS printer dropdown (desktop) or device picker per transport |
| Network host/port | For `escpos-network`, default port `9100` |
| Paper width | 58 mm / 80 mm |
| Include QR | Toggle |
| Auto-print | Opt-in print immediately after a successful checkout |
| Test print | Prints a sample receipt |

Failure messages are explicit ("Printer not reachable at 192.168.1.50:9100") rather than a
generic error.

---

## 8. Settings Surfaces

| Panel | Audience | Contents |
|---|---|---|
| **Store & Scanner** | All | Currency, tax rate, low-stock threshold, timezone, scan source, camera device |
| **Thermal Printer** | All | See §7 |
| **Receipt Template** | Operator, Superadmin | See §6.2 |
| **Desktop Application** | Operator, Superadmin | Auto-launch, backend server URL, local DB type, queued sales, last sync, manual sync |

The **Desktop Application** panel is the desktop-only surface. In the browser it renders a short
explanatory note instead of empty controls.

---

## 9. Feedback & States

| Situation | Treatment |
|---|---|
| Success | Green pill with a `CheckCircle2` icon, auto-dismissed |
| Error | Red pill with the server's `message`, persistent until dismissed |
| Offline | Amber strip under the header, plus an amber badge on the queued count |
| Queued sales | Amber badge with the count; tooltip explains "waiting to sync" |
| Empty state | Centred icon + one-line explanation + the primary action |
| Loading | `Loader2` spinner with `animate-spin` in place of the button label |
| Destructive confirm | Modal with the consequence in plain language and a red confirm button |

Every destructive action states its consequence, e.g. *"This will permanently delete the product
and its stock history."*

---

## 10. Accessibility

| Rule | Implementation |
|---|---|
| Contrast | Body text on white stays at or above WCAG AA (slate-600+ on white). |
| Focus | Visible focus rings on inputs and buttons (`focus:ring-*`). |
| Keyboard | All actions reachable by keyboard; the scan input is autofocused. |
| Icons | Icon-only buttons carry `aria-label`. |
| Motion | `animate-spin` is limited to loading indicators. |
| Forms | Labels are associated; errors are textual, not colour-only. |

---

## 11. Print Styling

`index.css` defines the print rules:

- `@page` margin is zeroed for receipt stock.
- Only `#receipt-print-area` is printed — the app chrome is hidden with `print:hidden`.
- The receipt keeps a monospace stack so columns align on thermal paper.
- `.paper-58` narrows the receipt block for 58 mm stock.

---

## 12. Brand

- **Logo:** a rounded-square blue gradient badge with a white receipt and printed lines
  (`apps/web/public/favicon.svg`).
- **App icon:** the same mark rasterised to `build/icon.png`, `build/icons/*.png` (16→1024) and
  `build/icon.ico` for the Windows installer.
- **Application id:** `com.openpos.app` — product name `OpenPOS`.

---

## 13. Related Documents

- [`prd.md`](./prd.md) — requirements
- [`architecture.md`](./architecture.md) — system architecture
- [`rules.md`](./rules.md) — engineering rules
- [`memory.md`](./memory.md) — technical decisions
- [`tracker.md`](./tracker.md) — work tracker
