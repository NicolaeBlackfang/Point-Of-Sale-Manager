# Multi-Branch Point of Sale (POS) System

A modern, full-stack Point of Sale and Inventory Management solution built with React, Node.js/Express, MongoDB, and Tailwind CSS. The platform features role-based access control (RBAC), multi-branch inventory tracking, real-time sales terminal processing, and QR code integration for quick product scanning.

---

## 🚀 Features

### 👑 Superadmin Dashboard
- **Executive Metrics**: High-level annual and monthly revenue tracking, transaction totals, and active branch counts.
- **Product Audit & Controls**: Oversight of product listings across all branches with soft-delete capabilities.
- **Cashier Performance**: Track sales per cashier, view detailed transaction audit logs, and execute monthly sales resets.
- **Operator Management**: Monitor active inventory operators and their branch assignments.
- **Financial Exports**: Export financial logs and reset monthly branch metrics.
- **Staff Registration**: Quick-register new System Cashiers or Inventory Operators.

### 📦 Operator Workspace
- **Inventory Management**: Create, edit, and soft-delete product listings tied to specific branches.
- **QR Code Generator**: Automatically generates downloadable QR codes for newly added products based on SKU.
- **Stock Tracking**: Real-time stock status monitoring with low-stock alerts.
- **Paginated Product Catalog**: Search and filter inventory by SKU, product name, or category.

### 🛒 Cashier POS Terminal
- **Multi-Modal Product Lookup**: Scan QR codes via physical scanner, upload QR image files, or manually enter SKUs.
- **Cart Management**: Real-time stock availability checks, quantity adjustments, and auto-subtotal calculation.
- **Multi-Payment Support**: Flexible checkout workflows supporting Cash and Card payment methods.
- **Recent Transactions**: Quick view of cashier-specific recent transaction history.

---

## 👨‍💻 About the Maker

Developed by **Sajid Asim**, this application was crafted to streamline retail operations, bridge inventory tracking between warehouse operators and cashiers, and provide high-level administrative oversight.

- **Developer**: Sajid Asim
- **Tech Stack**: React.js, Node.js, Express, MongoDB, Tailwind CSS, Lucide React, and `html5-qrcode`.
- **Focus**: Responsive UI component architecture, flexible grid/flexbox layouts, role-based workflows, and real-time inventory management.