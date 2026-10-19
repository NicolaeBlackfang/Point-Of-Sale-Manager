import React, { useState, useEffect, useMemo } from 'react';
import API from '../../services/api';
import Pagination, { PAGE_SIZE } from '../ui/Pagination';
import formatLogDetails from '../../utils/formatLogDetails';
import {
  History,
  Package,
  Settings,
  Filter,
  Trash2,
  RefreshCw,
  AlertTriangle,
  X,
  ArrowUp,
  ArrowDown,
  UserCog,
  Receipt,
} from 'lucide-react';

const ACTION_LABELS = {
  CREATE_PRODUCT: { label: 'Product Created', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  UPDATE_PRODUCT: { label: 'Product Updated', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  DELETE_PRODUCT: { label: 'Product Deleted', tone: 'bg-red-50 text-red-800 border-red-200' },
  UPDATE_STOCK: { label: 'Stock Adjusted', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  UPDATE_SETTINGS: { label: 'Settings Changed', tone: 'bg-purple-50 text-purple-800 border-purple-200' },
  UPDATE_USER: { label: 'User Updated', tone: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  DELETE_USER: { label: 'User Deleted', tone: 'bg-red-50 text-red-800 border-red-200' },
  UPDATE_SALE: { label: 'Receipt Edited', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  DELETE_SALE: { label: 'Receipt Deleted', tone: 'bg-red-50 text-red-800 border-red-200' },
  PURGE_AUDIT_LOGS: { label: 'System Logs Purged', tone: 'bg-rose-100 text-rose-900 border-rose-300' },
  DELETE_AUDIT_LOG: { label: 'Log Entry Deleted', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
  PURGE_STOCK_LOGS: { label: 'Stock Logs Purged', tone: 'bg-rose-100 text-rose-900 border-rose-300' },
};

const ENTITY_ICONS = {
  Product: Package,
  Settings: Settings,
  User: UserCog,
  Sale: Receipt,
};

const AuditLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Sorting + pagination
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Delete / purge dialogs
  const [deleteTarget, setDeleteTarget] = useState(null); // log row
  const [purgeStage, setPurgeStage] = useState(0); // 0 closed, 1 first confirm, 2 second confirm

  // Stock-adjustment history purge (retention control)
  const [stockPurgeStage, setStockPurgeStage] = useState(0);
  const [stockPurgeMode, setStockPurgeMode] = useState('all');
  const [stockPurgeBefore, setStockPurgeBefore] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (entityFilter !== 'all') params.entityType = entityFilter;
      if (actionFilter !== 'all') params.action = actionFilter;
      const { data } = await API.get('/system-logs', { params });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load system logs:', err);
      setMessage(err.response?.data?.message || 'Failed to load system logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityFilter, actionFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [entityFilter, actionFilter, searchTerm, sortKey, sortDir]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return logs;
    return logs.filter(
      (log) =>
        (log.entityLabel || '').toLowerCase().includes(term) ||
        (log.performedByName || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.role || '').toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  const sortedLogs = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const pick = (log) => {
      switch (sortKey) {
        case 'action':
          return (log.action || '').toLowerCase();
        case 'entity':
          return (log.entityLabel || log.entityId || '').toLowerCase();
        case 'performedBy':
          return (log.performedByName || '').toLowerCase();
        case 'createdAt':
        default:
          return new Date(log.createdAt).getTime();
      }
    };
    return [...filteredLogs].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filteredLogs, sortKey, sortDir]);

  const totalPages = Math.max(Math.ceil(sortedLogs.length / PAGE_SIZE), 1);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sortedLogs.slice(pageStart, pageStart + PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ columnKey }) => {
    if (sortKey !== columnKey) return <ArrowUp className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600" />
    );
  };

  const handleDeleteEntry = async () => {
    if (!deleteTarget) return;
    try {
      await API.delete(`/system-logs/${deleteTarget._id}`);
      setMessage('System log entry deleted.');
      setDeleteTarget(null);
      loadLogs();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to delete log entry.');
      setDeleteTarget(null);
    }
  };

  const handlePurge = async () => {
    try {
      const { data } = await API.delete('/system-logs', { params: { confirm: 'PURGE' } });
      setMessage(data.message || 'All system logs purged.');
      setPurgeStage(0);
      loadLogs();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to purge system logs.');
      setPurgeStage(0);
    }
  };

  const handlePurgeStock = async () => {
    if (stockPurgeMode === 'before' && !stockPurgeBefore) {
      setMessage('Choose a cut-off date to purge stock logs before it.');
      return;
    }
    try {
      const params = { confirm: 'PURGE' };
      if (stockPurgeMode === 'before') {
        params.before = new Date(`${stockPurgeBefore}T00:00:00`).toISOString();
      }
      const { data } = await API.delete('/products/stock-history', { params });
      setMessage(data.message || 'Stock logs purged.');
      setStockPurgeStage(0);
      loadLogs();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to purge stock logs.');
      setStockPurgeStage(0);
    }
  };

  const hasActiveFilters = entityFilter !== 'all' || actionFilter !== 'all' || searchTerm !== '';  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      {/* Action toolbar */}
      <div className="border-b pb-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-sm">System Logs</h3>
            <span className="text-xs bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-slate-600">
              {sortedLogs.length} entries
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadLogs}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
              title="Refresh logs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => {
                setStockPurgeMode('all');
                setStockPurgeBefore('');
                setStockPurgeStage(1);
              }}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition"
              title="Purge embedded stock-adjustment history"
            >
              <Package className="h-3.5 w-3.5" />
              <span>Purge Stock Logs</span>
            </button>
            <button
              onClick={() => setPurgeStage(1)}
              disabled={logs.length === 0}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
              title="Purge all system logs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Purge System Logs</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2 flex-wrap">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All entities</option>
            <option value="Product">Products</option>
            <option value="Settings">Settings</option>
            <option value="User">Users</option>
            <option value="Sale">Sales</option>
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All actions</option>
            {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search entity, actor, action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white min-w-[200px]"
          />
          {hasActiveFilters && (
            <button
              onClick={() => {
                setEntityFilter('all');
                setActionFilter('all');
                setSearchTerm('');
              }}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Loading system logs...</p>
      ) : sortedLogs.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          No system log entries match the current filters.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b text-slate-600 uppercase">
                  <th
                    className="p-3 cursor-pointer select-none hover:text-slate-900"
                    onClick={() => toggleSort('createdAt')}
                  >
                    <span className="inline-flex items-center space-x-1">
                      <span>When</span>
                      <SortIcon columnKey="createdAt" />
                    </span>
                  </th>
                  <th
                    className="p-3 cursor-pointer select-none hover:text-slate-900"
                    onClick={() => toggleSort('action')}
                  >
                    <span className="inline-flex items-center space-x-1">
                      <span>Action</span>
                      <SortIcon columnKey="action" />
                    </span>
                  </th>
                  <th
                    className="p-3 cursor-pointer select-none hover:text-slate-900"
                    onClick={() => toggleSort('entity')}
                  >
                    <span className="inline-flex items-center space-x-1">
                      <span>Entity</span>
                      <SortIcon columnKey="entity" />
                    </span>
                  </th>
                  <th
                    className="p-3 cursor-pointer select-none hover:text-slate-900"
                    onClick={() => toggleSort('performedBy')}
                  >
                    <span className="inline-flex items-center space-x-1">
                      <span>By</span>
                      <SortIcon columnKey="performedBy" />
                    </span>
                  </th>
                  <th className="p-3">Details</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((log) => {
                  const actionInfo = ACTION_LABELS[log.action] || {
                    label: log.action,
                    tone: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  const EntityIcon = ENTITY_ICONS[log.entityType] || Package;
                  return (
                    <tr key={log._id} className="hover:bg-slate-50 align-top group">
                      <td className="p-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${actionInfo.tone}`}
                        >
                          {actionInfo.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <EntityIcon className="h-3.5 w-3.5 text-blue-500" />
                          <span className="font-mono">{log.entityLabel || log.entityId}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        {log.performedByName}
                        <span className="block text-[10px] text-slate-400">{log.role}</span>
                      </td>
                      <td className="p-3 text-slate-600 max-w-md">
                        <span className="break-words">{formatLogDetails(log.details)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setDeleteTarget(log)}
                          className="inline-flex items-center space-x-1 text-[10px] bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded-md transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete this log entry"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedLogs.length}
            onPageChange={setCurrentPage}
            itemLabel="entries"
          />
        </>
      )}

      {/* Single-entry delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Delete Log Entry?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This permanently removes the{' '}
                  <span className="font-bold text-slate-800">
                    {ACTION_LABELS[deleteTarget.action]?.label || deleteTarget.action}
                  </span>{' '}
                  entry for{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {deleteTarget.entityLabel || deleteTarget.entityId}
                  </span>
                  . The deletion itself will be recorded as a new audit event.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEntry}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Entry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Double-confirmation purge modal */}
      {purgeStage > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {purgeStage === 1 ? 'Purge All System Logs?' : 'Final Confirmation Required'}
                </h3>
                {purgeStage === 1 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    This will permanently delete{' '}
                    <span className="font-bold text-slate-800">{logs.length} log entr(ies)</span>.
                    This action cannot be undone. Proceed to the final confirmation?
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You are about to wipe the entire system log. A new entry recording this
                    purge will be created afterwards. Click <em>Purge Everything</em> to confirm.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <button
                onClick={() => setPurgeStage(0)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              {purgeStage === 1 ? (
                <button
                  onClick={() => setPurgeStage(2)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
                >
                  <span>Continue</span>
                </button>
              ) : (
                <button
                  onClick={handlePurge}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Purge Everything</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Stock-adjustment history purge (double confirmation) */}
      {stockPurgeStage > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-xl flex-shrink-0">
                <Package className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {stockPurgeStage === 1 ? 'Purge Stock Adjustment Logs' : 'Final Confirmation Required'}
                </h3>
                {stockPurgeStage === 1 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Stock history is stored on each product (capped at 500 entries). Removing it is
                    permanent and does not change current stock counts.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You are about to purge stock logs{' '}
                    <span className="font-bold text-slate-800">
                      {stockPurgeMode === 'before' && stockPurgeBefore
                        ? `before ${stockPurgeBefore}`
                        : 'in full (all entries)'}
                    </span>
                    . A new audit entry will record this purge.
                  </p>
                )}
              </div>
            </div>

            {stockPurgeStage === 1 && (
              <div className="space-y-3 border-t pt-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="stockPurgeMode"
                    checked={stockPurgeMode === 'all'}
                    onChange={() => setStockPurgeMode('all')}
                    className="accent-amber-600"
                  />
                  Purge all stock logs
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="radio"
                    name="stockPurgeMode"
                    checked={stockPurgeMode === 'before'}
                    onChange={() => setStockPurgeMode('before')}
                    className="accent-amber-600"
                  />
                  Purge logs before a date
                </label>
                {stockPurgeMode === 'before' && (
                  <input
                    type="date"
                    value={stockPurgeBefore}
                    onChange={(e) => setStockPurgeBefore(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 border-t pt-4">
              <button
                onClick={() => setStockPurgeStage(0)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              {stockPurgeStage === 1 ? (
                <button
                  onClick={() => {
                    if (stockPurgeMode === 'before' && !stockPurgeBefore) {
                      setMessage('Choose a cut-off date to purge stock logs before it.');
                      return;
                    }
                    setStockPurgeStage(2);
                  }}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
                >
                  <span>Continue</span>
                </button>
              ) : (
                <button
                  onClick={handlePurgeStock}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>Purge Stock Logs</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
