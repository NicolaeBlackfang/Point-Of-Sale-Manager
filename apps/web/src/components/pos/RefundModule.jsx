import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Receipt as ReceiptIcon,
  Undo2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import API from '../../services/api';
import { useSettings } from '../../context/SettingsContext';

/**
 * Cashier Refund & Return tool.
 * Looks up an active receipt (by transaction id or from the recent list),
 * validates the 7-day window server-side, restocks the items and writes a
 * REFUND_EXECUTED audit event.
 */
const RefundModule = ({ onOpenReceipt }) => {
  const { formatCurrency } = useSettings();
  const [query, setQuery] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRecent = useCallback(async () => {
    try {
      const { data } = await API.get('/sales/receipts?limit=10');
      setReceipts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load receipts:', err);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const handleLookup = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;

    setLooking(true);
    setError('');
    setSuccess('');
    setSelected(null);
    setConfirming(false);

    try {
      const { data } = await API.get(
        `/sales/receipts/${encodeURIComponent(term)}`
      );
      setSelected(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Receipt not found.');
    } finally {
      setLooking(false);
    }
  };

  const selectReceipt = (receipt) => {
    setSelected(receipt);
    setQuery(receipt.transactionId);
    setError('');
    setSuccess('');
    setConfirming(false);
  };

  const handleRefund = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await API.post(
        `/sales/receipts/${encodeURIComponent(selected.transactionId)}/refund`,
        { reason: reason.trim() }
      );
      setSuccess(
        `Refunded ${formatCurrency(data.refundAmount)} — ${data.restocked.length} line(s) restocked.`
      );
      setSelected(data.sale);
      setConfirming(false);
      setReason('');
      loadRecent();
      if (onOpenReceipt) onOpenReceipt(data.sale);
    } catch (err) {
      setError(err.response?.data?.message || 'Refund failed.');
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  const isRefunded = selected?.refundStatus === 'Refunded';

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-3">
          <div className="flex items-center space-x-2">
            <Undo2 className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">Refund &amp; Return</h2>
            <span className="text-xs bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-slate-600">
              7-day window
            </span>
          </div>
          <button
            type="button"
            onClick={loadRecent}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <form onSubmit={handleLookup} className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan or paste a Transaction ID (TXN-…)"
              className="w-full pl-9 pr-3 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={looking || !query.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
          >
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look up receipt
          </button>
        </form>

        {error ? (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent receipts (branch-scoped server side) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <ReceiptIcon className="h-4 w-4 text-blue-600" />
            Recent receipts (last 7 days)
          </h3>

          {receipts.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No receipts in the retention window yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {receipts.map((receipt) => (
                <li key={receipt._id || receipt.transactionId}>
                  <button
                    type="button"
                    onClick={() => selectReceipt(receipt)}
                    className={`w-full text-left px-2 py-2.5 hover:bg-slate-50 transition ${
                      selected?.transactionId === receipt.transactionId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-blue-700 truncate">
                        {receipt.transactionId}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {formatCurrency(receipt.totalWithTax ?? receipt.totalAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">
                        {receipt.customerName || receipt.cashierName || 'Walk-in'}
                      </span>
                      <span>{new Date(receipt.createdAt).toLocaleDateString()}</span>
                    </div>
                    {receipt.refundStatus === 'Refunded' ? (
                      <span className="inline-block mt-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                        Refunded
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Selected receipt + refund action */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">Receipt details</h3>

          {!selected ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              Look up a transaction id or pick a receipt from the list.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-blue-700 break-all">
                  {selected.transactionId}
                </span>
                <span
                  className={`font-bold px-2 py-0.5 rounded ${
                    isRefunded
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isRefunded ? 'Refunded' : 'Active'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <p>Date: {new Date(selected.createdAt).toLocaleString()}</p>
                <p>Cashier: {selected.cashierName || '—'}</p>
                <p>Branch: #{selected.branchNumber || '—'}</p>
                <p>Customer: {selected.customerName || 'Walk-in'}</p>
              </div>

              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {(selected.items || []).map((item, index) => (
                  <li key={`${item.sku || index}-${index}`} className="flex justify-between py-1.5 px-2">
                    <span className="text-slate-700">
                      {item.name}{' '}
                      <span className="text-slate-400">
                        ×{item.quantity} @ {Number(item.price).toFixed(2)}
                      </span>
                    </span>
                    <span className="font-semibold text-slate-800">
                      {Number(item.subtotal).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex justify-between font-bold text-slate-800 text-sm border-t border-slate-200 pt-2">
                <span>Total paid</span>
                <span>{formatCurrency(selected.totalWithTax ?? selected.totalAmount)}</span>
              </div>

              {!isRefunded ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    placeholder="Reason (optional) — e.g. faulty item"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />

                  {!confirming ? (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition text-xs"
                    >
                      <Undo2 className="h-4 w-4" />
                      Refund &amp; restock items
                    </button>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                      <p className="text-[11px] text-red-700 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        This returns every item to stock and removes the sale from revenue
                        metrics. Continue?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleRefund}
                          disabled={loading}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {loading ? 'Processing…' : 'Yes, refund now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          disabled={loading}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 font-semibold text-xs hover:bg-white transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
                  This receipt was already refunded
                  {selected.refundedAt
                    ? ` on ${new Date(selected.refundedAt).toLocaleString()}`
                    : ''}
                  . Items were returned to stock at that time.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RefundModule;
