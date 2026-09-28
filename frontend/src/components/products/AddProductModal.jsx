import React, { useState } from 'react';
import API from '../../services/api';
import { X, PlusCircle, QrCode, Tag, DollarSign, Package, Building } from 'lucide-react';

const AddProductModal = ({ isOpen, onClose, onSuccess }) => {
  if (!isOpen) return null;

  // Retrieve logged-in user to default the branchNumber if available
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    price: '',
    stockQuantity: '',
    branchNumber: currentUser?.branchNumber || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setForm({
      sku: '',
      name: '',
      category: '',
      price: '',
      stockQuantity: '',
      branchNumber: currentUser?.branchNumber || '',
    });
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        sku: form.sku.toUpperCase().trim(),
        name: form.name.trim(),
        category: form.category.trim(),
        price: parseFloat(form.price),
        stockQuantity: parseInt(form.stockQuantity, 10) || 0,
        branchNumber: form.branchNumber.trim() || currentUser?.branchNumber || '101',
      };

      await API.post('/products', payload);

      if (onSuccess) onSuccess();
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 p-5 bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Add New Product</h3>
              <p className="text-xs text-slate-500">Generates unique QR Payload and initial inventory entry</p>
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                <QrCode className="h-3.5 w-3.5 text-slate-400" />
                <span>SKU Code (Must be unique)</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. PROD-1001"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 uppercase font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                <span>Product Name</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Wireless Ergonomic Mouse"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <span>Category</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electronics"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                  <span>Price ($)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="29.99"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Package className="h-3.5 w-3.5 text-slate-400" />
                  <span>Initial Stock Quantity</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="50"
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Building className="h-3.5 w-3.5 text-slate-400" />
                  <span>Branch Number</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 101"
                  value={form.branchNumber}
                  onChange={(e) => setForm({ ...form, branchNumber: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {loading ? 'Generating QR...' : 'Save & Generate QR'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddProductModal;