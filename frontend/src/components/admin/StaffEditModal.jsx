import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { UserCog, Save, X, KeyRound, ShieldCheck } from 'lucide-react';

// Superadmin master edit modal: profile fields, role switch, credential reset,
// and account activation - all in one place. Changes are audit-logged server-side.
const StaffEditModal = ({ staff, onClose, onSaved }) => {
  const [form, setForm] = useState({
    roleTakerName: '',
    branchNumber: '',
    storeAddress: '',
    operatorId: '',
    role: 'Cashier',
    isActive: true,
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!staff) return;
    setForm({
      roleTakerName: staff.roleTakerName || '',
      branchNumber: staff.branchNumber || '',
      storeAddress: staff.storeAddress || '',
      operatorId: staff.operatorId || '',
      role: staff.role || 'Cashier',
      isActive: staff.isActive !== false,
      password: '',
    });
    setMessage('');
  }, [staff]);

  if (!staff) return null;

  const isCashier = form.role === 'Cashier';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        roleTakerName: form.roleTakerName,
        branchNumber: form.branchNumber,
        role: form.role,
        isActive: form.isActive,
      };
      if (isCashier) payload.storeAddress = form.storeAddress;
      else payload.operatorId = form.operatorId;
      if (form.password) payload.password = form.password;

      const { data } = await API.put(`/analytics/staff/${staff._id}`, payload);
      if (onSaved) onSaved(data.message || 'Staff member updated.');
      onClose();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to update staff member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Edit Staff Account</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {staff.username} · {staff.role}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {message && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {message}
            </div>
          )}

          {/* Profile fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Role Taker Name
              </label>
              <input
                type="text"
                required
                value={form.roleTakerName}
                onChange={(e) => setForm({ ...form, roleTakerName: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Branch Number
              </label>
              <input
                type="text"
                required
                value={form.branchNumber}
                onChange={(e) => setForm({ ...form, branchNumber: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {isCashier ? (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Store Address
              </label>
              <input
                type="text"
                required
                value={form.storeAddress}
                onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Operator ID
              </label>
              <input
                type="text"
                required
                value={form.operatorId}
                onChange={(e) => setForm({ ...form, operatorId: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Role + activation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1 flex items-center space-x-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Role</span>
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="Cashier">Cashier</option>
                <option value="Operator">Operator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Account Status
              </label>
              <select
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Credential reset */}
          <div className="border-t pt-4">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1 flex items-center space-x-1">
              <KeyRound className="h-3.5 w-3.5 text-amber-600" />
              <span>Reset Password (leave blank to keep current)</span>
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="New password (min 6 characters)"
              minLength={6}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StaffEditModal;
