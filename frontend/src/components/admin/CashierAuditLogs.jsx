import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { UserCheck, RefreshCw, Clock, CreditCard, X } from 'lucide-react';

const CashierAuditLogs = ({ isOpen, onClose, selectedCashier = null }) => {
  const [cashierLogs, setCashierLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.get('/sales/cashier-logs');
      setCashierLogs(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch cashier audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter logs if a specific cashier is selected
  const filteredLogs = selectedCashier
    ? cashierLogs.filter(
        (log) => (log.cashier?._id || log.cashier) === selectedCashier.cashierId
      )
    : cashierLogs;

  const totalFilteredSales = filteredLogs.reduce((sum, log) => sum + (log.totalAmount || 0), 0);

  return (
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
                  ? `Audit Logs: ${selectedCashier.cashierName}`
                  : 'All Cashier Audit Logs'}
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
              title="Refresh Audit Logs"
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center p-8 text-slate-400">
                      Loading Audit Logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center p-8 text-slate-400">
                      No logs found {selectedCashier ? `for ${selectedCashier.cashierName}` : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
  );
};

export default CashierAuditLogs;