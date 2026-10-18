import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { History, Package, Settings, Filter } from 'lucide-react';

const ACTION_LABELS = {
  CREATE_PRODUCT: { label: 'Product Created', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  UPDATE_PRODUCT: { label: 'Product Updated', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  DELETE_PRODUCT: { label: 'Product Deleted', tone: 'bg-red-50 text-red-800 border-red-200' },
  UPDATE_STOCK: { label: 'Stock Adjusted', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  UPDATE_SETTINGS: { label: 'Settings Changed', tone: 'bg-purple-50 text-purple-800 border-purple-200' },
};

const formatDetails = (details) => {
  if (!details || typeof details !== 'object') return null;

  if (details.changes) {
    return Object.entries(details.changes)
      .map(([field, change]) => `${field}: ${change.from} → ${change.to}`)
      .join(' · ');
  }

  if (details.adjustmentType) {
    return `${details.adjustmentType} ${details.quantityChanged} (was ${details.previousQuantity}, now ${details.newQuantity})${details.reason ? ` - ${details.reason}` : ''}`;
  }

  if (details.name) {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' · ');
  }

  return JSON.stringify(details);
};

const AuditLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? {} : { entityType: filter };
      const { data } = await API.get('/audit-logs', { params });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <History className="h-5 w-5 text-blue-600" />
          <h3 className="font-bold text-slate-800 text-sm">Change Audit Log</h3>
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="all">All activity</option>
            <option value="Product">Products</option>
            <option value="Settings">Settings</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Loading audit history...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No audit entries recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b text-slate-600 uppercase">
                <th className="p-3">When</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entity</th>
                <th className="p-3">By</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, tone: 'bg-slate-100 text-slate-700 border-slate-200' };
                return (
                  <tr key={log._id} className="hover:bg-slate-50 align-top">
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${actionInfo.tone}`}>
                        {actionInfo.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        {log.entityType === 'Settings' ? (
                          <Settings className="h-3.5 w-3.5 text-purple-500" />
                        ) : (
                          <Package className="h-3.5 w-3.5 text-blue-500" />
                        )}
                        <span className="font-mono">{log.entityLabel || log.entityId}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">
                      {log.performedByName}
                      <span className="block text-[10px] text-slate-400">{log.role}</span>
                    </td>
                    <td className="p-3 text-slate-600 max-w-md">
                      <span className="break-words">{formatDetails(log.details)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
