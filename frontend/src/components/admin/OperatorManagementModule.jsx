import React, { useState } from 'react';
import API from '../../services/api';
import { UserCheck, Edit3, Trash2, Shield, Save, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

const OperatorManagementModule = ({ operators, onRefresh }) => {
  const [editingOperator, setEditingOperator] = useState(null);
  const [editForm, setEditForm] = useState({ roleTakerName: '', branchNumber: '', operatorId: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Modal state for deletion confirmation
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const startEdit = (operator) => {
    setEditingOperator(operator._id);
    setEditForm({
      roleTakerName: operator.roleTakerName || '',
      branchNumber: operator.branchNumber || '101',
      operatorId: operator.operatorId || '',
    });
  };

  const handleUpdate = async (id) => {
    setLoading(true);
    try {
      await API.put(`/analytics/staff/${id}`, editForm);
      setMessage({ type: 'success', text: 'Operator updated successfully.' });
      setEditingOperator(null);
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update operator' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    try {
      await API.delete(`/analytics/staff/${deleteTarget.id}`);
      setMessage({ type: 'success', text: `Operator '${deleteTarget.name}' deleted successfully.` });
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete operator' });
    } finally {
      setLoading(false);
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
          <h3 className="font-bold text-slate-800 text-sm">Inventory Operators List</h3>
          <span className="text-slate-500 font-mono text-xs">{operators.length} Active Operators</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                <th className="p-3">Operator Name</th>
                <th className="p-3">Username</th>
                <th className="p-3">Operator ID</th>
                <th className="p-3">Assigned Branch</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operators.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-slate-400">
                    No active operators found.
                  </td>
                </tr>
              ) : (
                operators.map((op) => (
                  <tr key={op._id} className="hover:bg-slate-50/80">
                    {editingOperator === op._id ? (
                      <>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.roleTakerName}
                            onChange={(e) => setEditForm({ ...editForm, roleTakerName: e.target.value })}
                            className="w-full border rounded-lg p-1.5"
                          />
                        </td>
                        <td className="p-3 font-mono text-slate-500">{op.username}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.operatorId}
                            onChange={(e) => setEditForm({ ...editForm, operatorId: e.target.value })}
                            className="w-full border rounded-lg p-1.5"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editForm.branchNumber}
                            onChange={(e) => setEditForm({ ...editForm, branchNumber: e.target.value })}
                            className="w-full border rounded-lg p-1.5"
                          />
                        </td>
                        <td className="p-2 text-right space-x-1">
                          <button
                            onClick={() => handleUpdate(op._id)}
                            disabled={loading}
                            className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingOperator(null)}
                            className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 font-bold text-slate-800">{op.roleTakerName}</td>
                        <td className="p-3 font-mono text-slate-600">{op.username}</td>
                        <td className="p-3 font-mono text-slate-700 font-semibold">{op.operatorId || 'N/A'}</td>
                        <td className="p-3 font-mono text-slate-700">#{op.branchNumber || '101'}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => startEdit(op)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition font-medium"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: op._id, name: op.roleTakerName })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition font-medium"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DYNAMIC DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-rose-100">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Confirm Operator Deletion</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete Operator <strong className="text-slate-800">{deleteTarget.name}</strong>? This action cannot be undone.
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
                disabled={loading}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg transition"
              >
                {loading ? 'Deleting...' : 'Delete Operator'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorManagementModule;