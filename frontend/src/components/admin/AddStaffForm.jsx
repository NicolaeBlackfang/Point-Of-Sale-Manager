import React, { useState } from 'react';
import API from '../../services/api';
import { UserPlus, User, Lock, Building, MapPin, BadgeCheck } from 'lucide-react';

const AddStaffForm = ({ onSuccess, onCancel }) => {
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'Operator',
    roleTakerName: '',
    storeAddress: '',
    operatorId: '',
    branchNumber: '101',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.value]: e.target.value, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        roleTakerName: form.roleTakerName.trim(),
        branchNumber: form.branchNumber.trim() || '101',
        ...(form.role === 'Cashier' ? { storeAddress: form.storeAddress.trim() } : {}),
        ...(form.role === 'Operator' ? { operatorId: form.operatorId.trim() } : {}),
      };

      await API.post('/auth/register-staff', payload);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register staff member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 font-medium">
          {error}
        </div>
      )}

      {/* Role Selection */}
      <div>
        <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
          <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>Staff Role</span>
        </label>
        <select
          name="role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="w-full border border-slate-300 rounded-xl p-2.5 bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="Operator">Inventory Operator</option>
          <option value="Cashier">Branch Cashier</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Role Taker Name */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span>Role Taker Name</span>
          </label>
          <input
            type="text"
            name="roleTakerName"
            required
            placeholder="e.g. John Doe"
            value={form.roleTakerName}
            onChange={(e) => setForm({ ...form, roleTakerName: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Username */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span>Username</span>
          </label>
          <input
            type="text"
            name="username"
            required
            placeholder="e.g. jdoe101"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Password */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>Password</span>
          </label>
          <input
            type="password"
            name="password"
            required
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Branch Number */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <Building className="h-3.5 w-3.5 text-slate-400" />
            <span>Branch Number</span>
          </label>
          <input
            type="text"
            name="branchNumber"
            placeholder="e.g. 101"
            value={form.branchNumber}
            onChange={(e) => setForm({ ...form, branchNumber: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Role Specific Inputs */}
      {form.role === 'Cashier' ? (
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            <span>Store / Cashier Address</span>
          </label>
          <input
            type="text"
            name="storeAddress"
            required
            placeholder="e.g. Counter 2 - Main Hall"
            value={form.storeAddress}
            onChange={(e) => setForm({ ...form, storeAddress: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      ) : (
        <div>
          <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
            <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
            <span>Operator ID</span>
          </label>
          <input
            type="text"
            name="operatorId"
            required
            placeholder="e.g. OP-8902"
            value={form.operatorId}
            onChange={(e) => setForm({ ...form, operatorId: e.target.value })}
            className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          <span>{loading ? 'Registering...' : 'Register Staff Member'}</span>
        </button>
      </div>
    </form>
  );
};

export default AddStaffForm;