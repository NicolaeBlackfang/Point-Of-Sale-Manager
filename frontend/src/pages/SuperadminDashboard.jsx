import React, { useState, useEffect } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import CashierPerformanceModule from '../components/admin/CashierPerformanceModule';
import OperatorProductModule from '../components/admin/OperatorProductModule';
import OperatorManagementModule from '../components/admin/OperatorManagementModule';
import SystemConfigModule from '../components/admin/SystemConfigModule';
import AddStaffForm from '../components/admin/AddStaffForm';
import ProductDetailsModal from '../components/products/ProductDetailsModal';
import CashierAuditLogs from '../components/admin/CashierAuditLogs';
import FinancialExportModule from '../components/admin/FinancialExportModule';

import {
  Users,
  DollarSign,
  ShoppingBag,
  RotateCcw,
  UserPlus,
  ShieldAlert,
  AlertTriangle,
  X,
  Settings,
  UserCheck,
  Download
} from 'lucide-react';

const SuperadminDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [operators, setOperators] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Tab State: 'products' | 'cashiers' | 'operators' | 'config' | 'addStaff' | 'export'
  const [activeTab, setActiveTab] = useState('products');

  // Modal & Popup states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [selectedCashierFilter, setSelectedCashierFilter] = useState(null);
  const [resetConfirmation, setResetConfirmation] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadDashboardData = async () => {
    try {
      const [analyticsRes, cashiersRes, auditRes] = await Promise.all([
        API.get('/analytics'),
        API.get('/analytics/cashiers-monthly'),
        API.get('/products/audit/logs'),
      ]);
      setAnalytics(analyticsRes.data);
      setCashiers(cashiersRes.data);
      if (analyticsRes.data.operators) {
        setOperators(analyticsRes.data.operators);
      }
      setAuditLogs(auditRes.data);
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
      setMessage({ type: 'success', text: `Product '${productName}' deleted and logged in audit history.` });
      loadDashboardData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete product' });
    }
  };

  const handleOpenCashierModal = (cashier = null) => {
    setSelectedCashierFilter(cashier);
    setIsLogModalOpen(true);
  };

  return (
    <Layout>
      {/* Header Section */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Superadmin Control Panel</h1>
        <p className="text-xs text-slate-500">Manage staff access, audit product movements, and oversee monthly & annual branch metrics.</p>
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
              ${analytics?.summary?.totalRevenue?.toLocaleString() || '0.00'}
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
              ${analytics?.summary?.totalMonthlyRevenue?.toLocaleString() || '0.00'}
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

      {/* Tab Navigation Controls */}
      <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'products'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>Product Audit & Controls</span>
        </button>

        <button
          onClick={() => setActiveTab('cashiers')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'cashiers'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <Users className="h-4 w-4" />
          <span>Cashier Performance</span>
        </button>

        <button
          onClick={() => setActiveTab('operators')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'operators'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Operators Management</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'export'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <Download className="h-4 w-4" />
          <span>Financial Exports & Reset</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'config'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <Settings className="h-4 w-4" />
          <span>System Config</span>
        </button>

        <button
          onClick={() => setActiveTab('addStaff')}
          className={`flex items-center space-x-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition whitespace-nowrap ${activeTab === 'addStaff'
            ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <UserPlus className="h-4 w-4" />
          <span>Quick Add Staff</span>
        </button>
      </div>

      {/* Modular View Renderer */}
      {activeTab === 'products' && (
        <OperatorProductModule
          auditLogs={auditLogs}
          onSelectProduct={(product) => setSelectedProduct(product)}
          onDeleteProduct={handleDeleteProduct}
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

      {activeTab === 'config' && (
        <SystemConfigModule onRefresh={loadDashboardData} />
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