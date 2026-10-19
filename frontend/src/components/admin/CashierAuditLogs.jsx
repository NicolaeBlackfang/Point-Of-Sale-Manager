import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import Pagination, { PAGE_SIZE } from '../ui/Pagination';
import { UserCheck, RefreshCw, Clock, CreditCard, X, Pencil, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';

const CashierAuditLogs = ({ isOpen, onClose, selectedCashier = null }) => {
  const [cashierLogs, setCashierLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Receipt edit / delete states (Superadmin master override)
  const [editTarget, setEditTarget] = useState(null); // sale row
  const [editForm, setEditForm] = useState({ paymentMethod: 'CASH', paymentStatus: 'Completed' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // sale row
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.get('/sales/cashier-logs');
      setCashierLogs(data);
      setCurrentPage(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch receipt logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const openEdit = (sale) => {
    setEditTarget(sale);
    setEditForm({
      paymentMethod: sale.paymentMethod || 'CASH',
      paymentStatus: sale.paymentStatus || 'Completed',
    });
    setActionMessage({ type: '', text: '' });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setActionMessage({ type: '', text: '' });
    try {
      const { data } = await API.put(`/sales/${editTarget._id}`, editForm);
      setActionMessage({ type: 'success', text: data.message || 'Receipt updated.' });
      setEditTarget(null);
      fetchLogs();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update receipt.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setActionMessage({ type: '', text: '' });
    try {
      const { data } = await API.delete(`/sales/${deleteTarget._id}`);
      setActionMessage({ type: 'success', text: data.message || 'Receipt deleted.' });
      setDeleteTarget(null);
      fetchLogs();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete receipt.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Filter logs if a specific cashier is selected
  const filteredLogs = selectedCashier
    ? cashierLogs.filter(
        (log) => (log.cashier?._id || log.cashier) === selectedCashier.cashierId
      )
    : cashierLogs;

  const totalFilteredSales = filteredLogs.reduce((sum, log) => sum + (log.totalAmount || 0), 0);

  const totalPages = Math.max(Math.ceil(filteredLogs.length / PAGE_SIZE), 1);
  const page = Math.min(currentPage, totalPages);
  const pageLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {selectedCashier
                  ? `Receipt Logs: ${selectedCashier.cashierName}`
                  : 'All Receipt Logs'}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCashier
                  ? `Showing detailed transaction history for ${selectedCashier.cashierName} (${selectedCashier.username})`
                  : 'Real-time transaction logs across all active cashiers.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              className="p-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition"
              title="Refresh Receipt Logs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Total Summary Banner */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-600">
            Total Transactions: <span className="text-slate-800">{filteredLogs.length}</span>
          </span>
          <span className="text-slate-600">
            Total Sales: <span className="text-emerald-600 font-bold">${totalFilteredSales.toFixed(2)}</span>
          </span>
        </div>

        {/* Master Override Action Banner */}
        {actionMessage.text && (
          <div
            className={`mx-6 mt-4 p-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b text-slate-600 uppercase font-semibold">
                  <th className="p-3">Cashier</th>
                  <th className="p-3">Branch / Address</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Purchased Items</th>
                  <th className="p-3 text-right">Total Amount</th>
                  <th className="p-3 text-right">Time Logged</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center p-8 text-slate-400">
                      Loading Receipt Logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center p-8 text-slate-400">
                      No logs found {selectedCashier ? `for ${selectedCashier.cashierName}` : ''}.
                    </td>
                  </tr>
                ) : (
                  pageLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50 transition">
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {log.cashierName || log.cashier?.roleTakerName || log.cashier?.username || 'Unknown Cashier'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {log.cashier?.email || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-slate-700 block">
                          Branch #{log.branchNumber || '101'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {log.storeAddress || 'Main Store'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold uppercase text-[10px] inline-flex items-center space-x-1">
                          <CreditCard className="h-3 w-3 mr-1" />
                          {log.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="space-y-0.5 max-h-16 overflow-y-auto">
                          {log.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between space-x-2 text-[11px]">
                              <span>• {item.name || item.sku}</span>
                              <span className="font-semibold text-slate-500">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600 text-sm">
                        ${log.totalAmount?.toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono text-[11px]">
                        <div className="flex items-center justify-end space-x-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        <button
                          onClick={() => openEdit(log)}
                          className="inline-flex items-center space-x-1 text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-lg transition font-medium"
                          title="Edit payment method / status"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget(log);
                            setActionMessage({ type: '', text: '' });
                          }}
                          className="inline-flex items-center space-x-1 text-[11px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded-lg transition font-medium"
                          title="Permanently delete receipt & restore stock"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredLogs.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredLogs.length}
              onPageChange={setCurrentPage}
              itemLabel="receipts"
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    {/* RECEIPT EDIT MODAL (payment method / status master override) */}
    {editTarget && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-indigo-200">
          <div className="flex items-center space-x-3 text-indigo-600">
            <Pencil className="h-5 w-5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Edit Receipt</h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {editTarget.transactionId || String(editTarget._id)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Payment Method</label>
              <select
                value={editForm.paymentMethod}
                onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="MOBILE">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Payment Status</label>
              <select
                value={editForm.paymentStatus}
                onChange={(e) => setEditForm({ ...editForm, paymentStatus: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-500">
              Total: <strong className="text-emerald-600">${editTarget.totalAmount?.toFixed(2)}</strong> — changes are recorded in System Logs.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              onClick={() => setEditTarget(null)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="inline-flex items-center space-x-1 px-3.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* RECEIPT DELETE CONFIRMATION MODAL (stock restored) */}
    {deleteTarget && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-rose-200">
          <div className="flex items-center space-x-3 text-rose-600">
            <Trash2 className="h-6 w-6 flex-shrink-0" />
            <h3 className="text-sm font-bold text-slate-800">Permanent Receipt Deletion</h3>
          </div>
          <p className="text-xs text-slate-600">
            Permanently delete receipt{' '}
            <strong className="font-mono text-slate-800">
              {deleteTarget.transactionId || String(deleteTarget._id)}
            </strong>{' '}
            (${deleteTarget.totalAmount?.toFixed(2)})? Sold stock will be restored to inventory and the action will be logged to System Logs.
          </p>
          <div className="flex justify-end space-x-2 pt-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg transition"
            >
              {saving ? 'Deleting...' : 'Delete Receipt'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CashierAuditLogs;