### 🛒 Centralized Retail POS & Inventory Management System

A production-grade, full-stack **MERN (MongoDB, Express, React, Node.js)** enterprise application designed to manage point-of-sale workflows across multiple physical retail branches while providing real-time data aggregation for corporate administrators. Built to run seamlessly on both **Ubuntu Linux** and **Windows** environments using standard web engines. 

### 👥 Role-Based Architecture & System Controls

The application implements a strict authentication wall requiring an **ID/Username and Password** at entry. Upon successful validation, users are dynamically routed to their designated workspaces: 

* **👑 Superadmin (Managers / High-Ranking Officers):** 

  * **Staff Control & Audit Modules:** Monitor real-time cashier performance metrics alongside standalone forms to register Operators and Cashiers. Includes tools to edit assigned branches or completely remove personnel profiles if a branch shuts down.
  * **Data Retention Architecture:** Implements a split data-tracking layer. Clearing a cashier's monthly performance target drops their active dashboard counters back to zero while preserving company-wide annual financial summaries.
  * **System Controls:** Features a double-confirmed administrative override to reset global annual revenue tallies at fiscal closing, alongside a guarded "Hard Reset" interface to permanently clear out core transaction logs.
* **📦 Operator:** 

  * **Product Control Panel:** Handles global product lifecycles and dynamically tracks granular stock adjustment logs (how many items were altered, by whom, and exactly when).
  * **Validation Layer:** Generates unique QR codes saved directly inside product profiles, enforcing a strict database-level unique rule on all **SKU (Stock Keeping Unit)** codes.
* **🏪 Store Cashier:** 

  * **POS Workspace:** Features an integrated scanning engine compatible with physical USB hardware barcode scanners and webcams to search items instantly.
  * **Checkout Pipeline:** Computes item combinations, handles active inventory balances, and generates downloadable digital receipts for buyers.

### 📁 Finalized Directory Structure

text

retail-pos-system/
├── backend/
│   ├── config/             # MongoDB Atlas connection profile (db.js)
│   ├── controllers/        # Request routers (analytics, auth, product, sales)
│   ├── middleware/         # Security layers (authMiddleware, roleMiddleware)
│   ├── models/             # Mongoose schemas (Product, Sale, User)
│   ├── routes/             # Express endpoint managers
│   └── utils/              # Scheduled background systems (cleanupScheduler.js)
├── frontend/
│   ├── public/             # System icons & static favicons
│   └── src/
│       ├── assets/         # App-specific media, banners, and static vectors
│       ├── components/     # Decoupled UI modules
│       │   ├── AddProductModal.jsx       ├── AddStaffForm.jsx
│       │   ├── CartTable.jsx             ├── CashierAuditLogs.jsx
│       │   ├── CashierPerformanceModule.jsx ├── CheckoutSection.jsx
│       │   ├── EditProductModal.jsx      ├── FinancialExportModule.jsx
│       │   ├── Footer.jsx                ├── Layout.jsx
│       │   ├── Navbar.jsx                ├── OperatorManagementModule.jsx
│       │   ├── OperatorProductModule.jsx ├── ProductDetailsModal.jsx
│       │   ├── ProtectedRoute.jsx        ├── QRScanner.jsx
│       │   ├── ReceiptModal.jsx          ├── RecentTransactions.jsx
│       │   ├── ScanInputSection.jsx      └── SystemConfigModule.jsx
│       ├── context/        # Global authorization hooks (AuthContext.jsx)
│       ├── pages/          # App views (Cashier, Operator, Superadmin, Login)
│       └── services/       # Promise-based Axios pipelines (api.js)
├── .gitignore            # Multi-tier root repository filters
└── package.json            # Root multi-service manager orchestrator

Use code with caution.

### 🚀 Quick Start Setup & Installation

### 1. Clone the Repository

bash

git clone https://github.com/NicolaeBlackfang/Point-Of-Sale-Manager.git
cd retail-pos-system

Use code with caution.

### 2. Configure Local Environment Variables

Create a environment configuration file inside your backend/ directory: 

bash

touch backend/.env

Use code with caution.

Open backend/.env and paste your environment targets: 

env

PORT=5000
MONGODB_URI=mongodb+srv://<YOUR_MONGODB_USERNAME>:<YOUR_MONGODB_PASSWORD>@<YOUR_CLUSTER_URL>/retail_pos_system?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_token_key_here
NODE_ENV=development


Use code with caution.

### 3. Install Sub-tier Dependencies

Execute dependency extractions for both service modules from your root directory: 

bash

# Extract backend core utilities
cd backend && npm install
cd ../

# Extract frontend layout dependencies
cd frontend && npm install
cd ../

Use code with caution.

### 4. Seed the Master Superadmin Account

Navigate into your backend folder and trigger the account generator script to establish your master entry login: 

bash

cd backend
node seed.js
cd ..

Use code with caution.

* **Default Username:** admin
* **Default Password:** password123

### 5. Fire Up the Integrated Services

Run your single-command orchestrator right from the root directory to spin up your backend API and React web layout simultaneously: 

bash

npm run dev

Use code with caution.

* **Express API Server:** Running on http://localhost:5000
* **Vite React Frontend:** Running on http://localhost:5173

### 🛡️ Git & Security Rules

This project includes a comprehensive root .gitignore file that explicitly blocks all instances of node_modules/, lockfiles, runtime debug outputs, system background clutter, and your secret backend/.env files. This ensures your **MongoDB Atlas cloud password** stays completely hidden and protected when pushed live to GitHub.