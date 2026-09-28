import React, { useState } from 'react';
import API from '../../services/api';
import { RefreshCw, Trash2, MapPin, DollarSign, ShoppingCart, UserX, AlertTriangle, CheckCircle2, X } from 'lucide-react';

const CashierPerformanceModule = ({ cashiers, onRefresh }) => {
  const [loadingId, setLoadingId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Modal Action States
  const [resetTarget, setResetTarget] = useState(null); // { id, name }
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const confirmResetMonthly = async () => {
    if (!resetTarget) return;

    setLoadingId(resetTarget.id);
    try {
      await API.post('/analytics/reset-monthly', { cashierId: resetTarget.id });
      setMessage({ type: 'success', text: `Monthly metrics for '${resetTarget.name}' reset to zero.` });
      setResetTarget(null);
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to reset cashier data' });
    } finally {
      setLoadingId(null);
    }
  };

  const confirmDeleteCashier = async () => {
    if (!deleteTarget) return;

    setLoadingId(deleteTarget.id);
    try {
      await API.delete(`/auth/staff/${deleteTarget.id}`);
      setMessage({ type: 'success', text: `Cashier '${deleteTarget.name}' removed from the system.` });
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete cashier' });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* DYNAMIC ALERT BANNER */}
      {message.text && (
        <div
          className={`p-3.5 rounded-xl border font-medium flex items-center justify-between transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm">Branch Cashiers Performance Overview</h3>
          <span className="text-slate-500 font-mono text-xs">{cashiers.length} Active Cashiers</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                <th className="p-3">Cashier / Address</th>
                <th className="p-3">Branch</th>
                <th className="p-3">Monthly Sales</th>
                <th className="p-3">Monthly Txns</th>
                <th className="p-3">Annual Sales</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashiers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-400">
                    No cashiers registered in system.
                  </td>
                </tr>
              ) : (
                cashiers.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/80">
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{c.roleTakerName}</div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <MapPin className="h-3 w-3" />
                        <span>{c.storeAddress || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-700">#{c.branchNumber}</td>
                    <td className="p-3 font-bold text-emerald-600">
                      ${(c.monthlySalesRevenue || 0).toFixed(2)}
                    </td>
                    <td className="p-3 font-semibold text-slate-700">
                      {c.monthlyTransactionsCount || 0}
                    </td>
                    <td className="p-3 font-bold text-blue-600">
                      ${(c.annualSalesRevenue || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setResetTarget({ id: c._id, name: c.roleTakerName })}
                        disabled={loadingId === c._id}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition font-medium text-[11px]"
                        title="Reset Monthly Counters"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingId === c._id ? 'animate-spin' : ''}`} />
                        <span>Monthly Reset</span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: c._id, name: c.roleTakerName })}
                        disabled={loadingId === c._id}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition font-medium text-[11px]"
                        title="Delete Cashier Account"
                      >
                        <UserX className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MONTHLY RESET CONFIRMATION MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-amber-200">
            <div className="flex items-center space-x-3 text-amber-600">
              <RefreshCw className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Reset Monthly Performance</h3>
            </div>
            <p className="text-xs text-slate-600">
              Reset MONTHLY performance counters for cashier <strong className="text-slate-800">{resetTarget.name}</strong>? Annual stats will remain intact.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setResetTarget(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmResetMonthly}
                disabled={loadingId === resetTarget.id}
                className="px-3.5 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition"
              >
                {loadingId === resetTarget.id ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CASHIER CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-rose-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <UserX className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Permanent Deletion Warning</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete Cashier <strong className="text-slate-800">{deleteTarget.name}</strong>? This should only be done if the branch is permanently closed.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCashier}
                disabled={loadingId === deleteTarget.id}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition"
              >
                {loadingId === deleteTarget.id ? 'Deleting...' : 'Delete Cashier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierPerformanceModule;