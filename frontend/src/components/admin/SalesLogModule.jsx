import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../../services/api';
import Pagination, { PAGE_SIZE } from '../ui/Pagination';
import {
  Receipt,
  Search,
  RefreshCw,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const inputClass =
  'text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none';

// Superadmin Sales Log: full receipt history (older than the cashier terminal's
// 2-day view) with Branch / Cashier filters and single or bulk purge.
const SalesLogModule = () => {
  const { formatCurrency } = useSettings();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  const [filters, setFilters] = useState({ branch: '', cashierName: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);

  const [selected, setSelected] = useState(new Set());
  const [detailSale, setDetailSale] = useState(null);
  const [purgeTarget, setPurgeTarget] = useState(null); // 'bulk' | sale object
  const [purging, setPurging] = useState(false);

  // Pure fetch (no setState) so the effect below can stay side-effect free.
  const fetchSales = useCallback(async (filterSet) => {
    const params = {};
    if (filterSet.branch.trim()) params.branch = filterSet.branch.trim();
    if (filterSet.cashierName.trim()) params.cashierName = filterSet.cashierName.trim();
    if (filterSet.from) params.from = filterSet.from;
    if (filterSet.to) params.to = filterSet.to;
    const { data } = await API.get('/sales', { params });
    return Array.isArray(data) ? data : [];
  }, []);

  // Initial / filter-driven load. All setState happens in async callbacks.
  useEffect(() => {
    let cancelled = false;
    fetchSales(applied)
      .then((rows) => {
        if (cancelled) return;
        setSales(rows);
        setPage(0);
        setSelected(new Set());
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load sales log.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, fetchSales]);

  // Manual refresh (event handler: sync setState is fine here).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchSales(applied);
      setSales(rows);
      setPage(0);
      setSelected(new Set());
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sales log.');
    } finally {
      setLoading(false);
    }
  }, [applied, fetchSales]);

  const applyFilters = () => {
    setLoading(true);
    setApplied({ ...filters });
  };
  const clearFilters = () => {
    const empty = { branch: '', cashierName: '', from: '', to: '' };
    setFilters(empty);
    setLoading(true);
    setApplied(empty);
  };

  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sales.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sales, page]
  );

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s._id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((s) => next.delete(s._id));
      else pageRows.forEach((s) => next.add(s._id));
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmPurge = async () => {
    setPurging(true);
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const ids =
        purgeTarget === 'bulk'
          ? [...selected]
          : [purgeTarget._id];
      const { data } = await API.delete('/sales', { data: { saleIds: ids } });
      setMessage(data.message || `${ids.length} receipt(s) purged.`);
      setPurgeTarget(null);
      setDetailSale(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to purge receipts.');
      setPurgeTarget(null);
    } finally {
      setPurging(false);
    }
  };

  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || '')
      : date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center space-x-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">Sales Log (All Receipts)</h3>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Branch ID</label>
            <input
              type="text"
              value={filters.branch}
              onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="101"
              className={`${inputClass} w-full font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cashier Name</label>
            <input
              type="text"
              value={filters.cashierName}
              onChange={(e) => setFilters((f) => ({ ...f, cashierName: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Exact name"
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={applyFilters}
              className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-lg transition flex-1 justify-center"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Apply</span>
            </button>
            <button
              onClick={clearFilters}
              className="text-slate-600 hover:text-slate-800 font-semibold px-3 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              Clear
            </button>
          </div>
        </div>

        {message && (
          <div className="p-3 rounded-lg border bg-emerald-50 text-emerald-800 border-emerald-200 font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg border bg-red-50 text-red-800 border-red-200 font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Bulk actions */}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">
            {loading ? 'Loading...' : `${sales.length} receipt(s)`}
            {selected.size > 0 ? ` · ${selected.size} selected` : ''}
          </span>
          <button
            onClick={() => setPurgeTarget('bulk')}
            disabled={selected.size === 0}
            className="inline-flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Purge Selected ({selected.size})</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="p-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all on page"
                  />
                </th>
                <th className="p-2.5">Date</th>
                <th className="p-2.5">Receipt</th>
                <th className="p-2.5">Cashier</th>
                <th className="p-2.5">Branch</th>
                <th className="p-2.5">Items</th>
                <th className="p-2.5">Payment</th>
                <th className="p-2.5 text-right">Total</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((sale) => (
                <tr key={sale._id} className="hover:bg-slate-50">
                  <td className="p-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(sale._id)}
                      onChange={() => toggleOne(sale._id)}
                      aria-label={`Select receipt ${sale.transactionId || sale._id}`}
                    />
                  </td>
                  <td className="p-2.5 text-slate-600 whitespace-nowrap">
                    {formatDate(sale.createdAt)}
                  </td>
                  <td className="p-2.5 font-mono text-slate-700">
                    {sale.transactionId || String(sale._id).slice(-8)}
                  </td>
                  <td className="p-2.5 text-slate-700">{sale.cashierName || '—'}</td>
                  <td className="p-2.5 font-mono text-slate-600">
                    {sale.branchNumber || sale.cashier?.branchNumber || '—'}
                  </td>
                  <td className="p-2.5 text-slate-600 min-w-[220px]">
                    <span className="font-semibold text-slate-700">
                      {(sale.items || []).length} item(s)
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {(sale.items || []).slice(0, 3).map((item, idx) => (
                        <li key={`${item.sku || idx}-${idx}`} className="text-[10px] text-slate-500">
                          <span className="text-slate-600">{item.name}</span>{' '}
                          <span className="font-mono text-slate-400">[{item.sku || '—'}]</span>{' '}
                          <span className="text-slate-400">×{item.quantity}</span>
                        </li>
                      ))}
                      {(sale.items || []).length > 3 && (
                        <li className="text-[10px] text-slate-400">
                          +{(sale.items || []).length - 3} more…
                        </li>
                      )}
                    </ul>
                  </td>
                  <td className="p-2.5 uppercase text-slate-600">{sale.paymentMethod}</td>
                  <td className="p-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                    {formatCurrency(sale.totalAmount)}
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setDetailSale(sale)}
                      className="text-blue-600 hover:text-blue-800 font-semibold mr-3"
                    >
                      View
                    </button>
                    <button
                      onClick={() => setPurgeTarget(sale)}
                      className="text-rose-600 hover:text-rose-800 font-semibold"
                    >
                      Purge
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">
                    No receipts match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={page + 1}
          totalPages={totalPages}
          totalItems={sales.length}
          onPageChange={(p) => setPage(p - 1)}
          itemLabel="receipts"
        />
      </div>

      {/* Receipt detail modal */}
      {detailSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-800 text-sm">
                Receipt {detailSale.transactionId || String(detailSale._id).slice(-8)}
              </h4>
              <button onClick={() => setDetailSale(null)}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <span>Date: {formatDate(detailSale.createdAt)}</span>
              <span>Cashier: {detailSale.cashierName || '—'}</span>
              <span>Branch: {detailSale.branchNumber || detailSale.cashier?.branchNumber || '—'}</span>
              <span>Payment: {String(detailSale.paymentMethod || '').toUpperCase()}</span>
              <span>Status: {detailSale.paymentStatus || 'Completed'}</span>
              <span>Store: {detailSale.storeAddress || '—'}</span>
            </div>

            <table className="w-full text-xs border border-slate-200 rounded-lg">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit</th>
                  <th className="p-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(detailSale.items || []).map((item, index) => (
                  <tr key={`${item.sku || index}-${index}`}>
                    <td className="p-2 text-slate-700">{item.name}</td>
                    <td className="p-2 font-mono text-slate-500">{item.sku || '—'}</td>
                    <td className="p-2 text-right text-slate-600">{item.quantity}</td>
                    <td className="p-2 text-right text-slate-600">
                      {formatCurrency(item.price ?? item.unitPrice)}
                    </td>
                    <td className="p-2 text-right font-semibold text-slate-800">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t pt-3 text-xs">
              <span className="text-slate-500">
                Tax {detailSale.taxRate ?? 0}%: {formatCurrency(detailSale.taxAmount || 0)}
              </span>
              <span className="font-bold text-slate-800 text-sm">
                Total {formatCurrency(detailSale.totalWithTax ?? detailSale.totalAmount)}
              </span>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDetailSale(null)}
                className="px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={() => setPurgeTarget(detailSale)}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Purge Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge confirmation modal */}
      {purgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h4 className="font-bold text-sm">
                {purgeTarget === 'bulk'
                  ? `Purge ${selected.size} receipt(s)?`
                  : 'Purge this receipt?'}
              </h4>
            </div>
            <p className="text-xs text-slate-600">
              This permanently deletes the selected receipt(s) from the database. Sold stock is
              restored to inventory, and the purge is recorded in System Logs. This cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setPurgeTarget(null)}
                disabled={purging}
                className="px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmPurge}
                disabled={purging}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{purging ? 'Purging...' : 'Purge Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesLogModule;
