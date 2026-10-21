import React, { useState, useEffect } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import { useSettings } from '../context/SettingsContext';
import CashierPerformanceModule from '../components/staff/CashierPerformanceModule';
import OperatorProductModule from '../components/inventory/OperatorProductModule';
import OperatorManagementModule from '../components/staff/OperatorManagementModule';
import SystemConfigModule from '../components/settings/SystemConfigModule';
import ReceiptTemplateEditor from '../components/settings/ReceiptTemplateEditor';
import ThermalPrinterPanel from '../components/settings/ThermalPrinterPanel';
import DesktopSettingsPanel from '../components/settings/DesktopSettingsPanel';
import AddStaffForm from '../components/staff/AddStaffForm';
import ProductDetailsModal from '../components/inventory/ProductDetailsModal';
import CashierAuditLogs from '../components/logs/CashierAuditLogs';
import FinancialExportModule from '../components/reports/FinancialExportModule';
import AnalyticsCharts from '../components/reports/AnalyticsCharts';
import AuditLogViewer from '../components/reports/AuditLogViewer';
import SalesLogModule from '../components/reports/SalesLogModule';
import StoreSettingsPanel from '../components/settings/StoreSettingsPanel';

import {
  Users,
  DollarSign,
  ShoppingBag,
  RotateCcw,
  UserPlus,
  AlertTriangle,
  X,
  UserCheck,
  Download,
  BarChart3,
  History,
  PackageSearch,
  Package,
  Store,
  Receipt
} from 'lucide-react';

// Sidebar module navigation for the Superadmin role
const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { key: 'products', label: 'Inventory & Catalog', icon: Package },
      { key: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Management',
    items: [
      { key: 'cashiers', label: 'Cashiers', icon: Users },
      { key: 'operators', label: 'Operators', icon: UserCheck },
      { key: 'addStaff', label: 'Register Staff', icon: UserPlus },
    ],
  },
  {
    label: 'Reports',
    items: [
      { key: 'export', label: 'Financial Exports', icon: Download },
      { key: 'saleslog', label: 'Sales Log', icon: Receipt },
    ],
  },
  {
    label: 'Settings',
    items: [
      { key: 'audit', label: 'System Logs', icon: History },
      { key: 'config', label: 'Store & Scanner Settings', icon: Store },
    ],
  },
];

const SuperadminDashboard = () => {
  const { settings } = useSettings();
  const [analytics, setAnalytics] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [operators, setOperators] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [lowStock, setLowStock] = useState(null);

  // Tab State: 'products' | 'cashiers' | 'operators' | 'config' | 'addStaff' | 'export' | 'analytics' | 'saleslog' | 'audit'
  const [activeTab, setActiveTab] = useState('products');

  // Modal & Popup states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedCashierFilter, setSelectedCashierFilter] = useState(null);
  const [resetConfirmation, setResetConfirmation] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadDashboardData = async () => {
    try {
      const [analyticsRes, cashiersRes, auditRes, lowStockRes] = await Promise.all([
        API.get('/analytics'),
        API.get('/analytics/cashiers-monthly'),
        API.get('/products/audit/logs'),
        API.get('/analytics/low-stock'),
      ]);
      setAnalytics(analyticsRes.data);
      setCashiers(cashiersRes.data);
      if (analyticsRes.data.operators) {
        setOperators(analyticsRes.data.operators);
      }
      setAuditLogs(auditRes.data);
      setLowStock(lowStockRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleConfirmResetCashier = async () => {
    if (!resetConfirmation) return;

    const { cashierId, cashierName } = resetConfirmation;
    try {
      const { data } = await API.delete(`/analytics/reset-cashier-sales/${cashierId}`);
      setMessage({
        type: 'success',
        text: `${cashierName}'s monthly sales were reset (${data.deletedCount || 0} transactions updated).`
      });
      loadDashboardData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to reset cashier sales'
      });
    } finally {
      setResetConfirmation(null);
    }
  };

  const handleDeleteProduct = async (productId, productName) => {
    if (!window.confirm(`Are you sure you want to delete product '${productName}'? This action will mark it as soft-deleted.`)) {
      return;
    }

    try {
      await API.delete(`/products/${productId}`);
      setMessage({ type: 'success', text: `Product '${productName}' deleted and recorded in System Logs.` });
      loadDashboardData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete product' });
    }
  };

  const handleHardDeleteProduct = async (product) => {
    const typed = window.prompt(
      `HARD DELETE: This permanently erases product '${product.name}' and its history from the database.\n\nType the product SKU to confirm:`
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== String(product.sku || '').toUpperCase()) {
      setMessage({ type: 'error', text: 'Confirmation SKU did not match. Nothing was deleted.' });
      return;
    }

    try {
      await API.delete(`/products/${product._id}/hard`);
      setMessage({ type: 'success', text: `Product '${product.name}' permanently deleted and recorded in System Logs.` });
      loadDashboardData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to hard delete product' });
    }
  };

  const handleOpenCashierModal = (cashier = null) => {
    setSelectedCashierFilter(cashier);
    setIsLogModalOpen(true);
  };

  return (
    <Layout navGroups={NAV_GROUPS} activeKey={activeTab} onNavigate={setActiveTab}>
      {/* Header Section */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Superadmin Control Panel</h1>
        <p className="text-xs text-slate-500">Manage staff access, review system logs, and oversee monthly & annual branch metrics.</p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Annual Revenue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 rounded-lg">
            <DollarSign className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Annual Revenue</p>
            <h3 className="text-xl font-bold text-slate-800">
              {settings.currencySymbol + (analytics?.summary?.totalRevenue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00')}
            </h3>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-100 rounded-lg">
            <DollarSign className="h-7 w-7 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Monthly Revenue</p>
            <h3 className="text-xl font-bold text-slate-800">
              {settings.currencySymbol + (analytics?.summary?.totalMonthlyRevenue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00')}
            </h3>
          </div>
        </div>

        {/* Total Transactions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <ShoppingBag className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Transactions</p>
            <h3 className="text-xl font-bold text-slate-800">
              {analytics?.summary?.totalTransactions || 0}
            </h3>
          </div>
        </div>

        {/* Active Branches */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Users className="h-7 w-7 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Active Branches</p>
            <h3 className="text-xl font-bold text-slate-800">
              {analytics?.branchPerformance?.length || 0}
            </h3>
          </div>
        </div>
      </div>

      {/* Global Alert Messages */}
      {message.text && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between ${message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
            }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Low-stock alert banner */}
      {lowStock && lowStock.products && lowStock.products.length > 0 && (
        <div className="p-4 rounded-xl border bg-amber-50 text-amber-900 border-amber-200 text-xs font-medium flex items-start space-x-2">
          <PackageSearch className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">
              Low stock alert: {lowStock.products.length} product(s) at or below {lowStock.threshold} unit(s).
            </span>
            <span className="block mt-1 text-amber-800">
              {lowStock.products.slice(0, 8).map((p) => `${p.sku} (${p.stockQuantity})`).join(', ')}
              {lowStock.products.length > 8 ? ' ...' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Modular View Renderer */}
      {activeTab === 'products' && (
        <OperatorProductModule
          auditLogs={auditLogs}
          onSelectProduct={(product) => setSelectedProduct(product)}
          onDeleteProduct={handleDeleteProduct}
          onHardDeleteProduct={handleHardDeleteProduct}
        />
      )}

      {activeTab === 'cashiers' && (
        <CashierPerformanceModule
          cashiers={cashiers}
          onRefresh={loadDashboardData}
          onOpenLogModal={handleOpenCashierModal}
          onRequestReset={(cashierId, cashierName) => setResetConfirmation({ cashierId, cashierName })}
        />
      )}

      {activeTab === 'operators' && (
        <OperatorManagementModule
          operators={operators}
          onRefresh={loadDashboardData}
        />
      )}

      {activeTab === 'export' && (
        <FinancialExportModule />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsCharts />
      )}

      {activeTab === 'saleslog' && (
        <SalesLogModule />
      )}

      {activeTab === 'audit' && (
        <AuditLogViewer />
      )}

      {activeTab === 'config' && (
        <div className="space-y-6">
          <StoreSettingsPanel />
          <ReceiptTemplateEditor />
          <ThermalPrinterPanel />
          <DesktopSettingsPanel />
          <SystemConfigModule onRefresh={loadDashboardData} />
        </div>
      )}

      {activeTab === 'addStaff' && (
        <div className="flex justify-center w-full">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-2xl w-full">
            <div className="border-b pb-3">
              <h2 className="font-bold text-slate-800 text-base">Register New System Staff</h2>
              <p className="text-xs text-slate-500">Create access privileges for new Branch Cashiers or Operators.</p>
            </div>
            <AddStaffForm
              onSuccess={() => {
                setMessage({ type: 'success', text: 'New staff member registered successfully!' });
                loadDashboardData();
                setActiveTab('cashiers');
              }}
              onCancel={() => setActiveTab('products')}
            />
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {resetConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Reset Monthly Sales?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to reset all monthly sales records for cashier{' '}
                  <span className="font-bold text-slate-800">
                    "{resetConfirmation.cashierName}"
                  </span>
                  ? Annual stats will remain untouched.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setResetConfirmation(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetCashier}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Yes, Reset Sales</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CashierAuditLogs
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        selectedCashier={selectedCashierFilter}
      />
      <ProductDetailsModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </Layout>
  );
};

export default SuperadminDashboard;