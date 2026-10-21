import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { X, Edit3, Package, RefreshCw, Tag, DollarSign, Building, QrCode } from 'lucide-react';
import ImageUploadField from './ImageUploadField';

const EditProductModal = ({ product, onClose, onSaveSuccess }) => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();
  const isOperator = currentUser?.role === 'Operator';

  const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    category: product?.category || '',
    price: product?.price || 0,
    stockQuantity: product?.stockQuantity ?? 0,
    branchNumber: product?.branchNumber || '101',
    reason: 'Product Information Update',
  });
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku || '',
        name: product.name || '',
        category: product.category || '',
        price: product.price || 0,
        stockQuantity: product.stockQuantity ?? 0,
        branchNumber: product.branchNumber || '101',
        reason: 'Product Information Update',
      });
      setImage('');
      setError('');
    }
  }, [product]);

  // Hooks must run unconditionally in the same order on every render, so the
  // early return is placed after all hook calls.
  if (!product) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const needsPhoto = isOperator && !product.imageUrl && !image;
    if (needsPhoto) {
      setError('This product has no photo yet. Operators must upload one before saving edits.');
      return;
    }

    setLoading(true);

    try {
      // 1. Update basic product details (a freshly picked photo rides along)
      const payload = {
        sku: form.sku.toUpperCase().trim(),
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        branchNumber: form.branchNumber,
      };
      if (isOperator && image) payload.image = image;

      await API.put(`/products/${product._id}`, payload);

      // 2. If stock quantity was modified, record a stock history adjustment
      const newStock = parseInt(form.stockQuantity, 10);
      if (newStock !== product.stockQuantity) {
        await API.put(`/products/${product._id}/stock`, {
          quantityChanged: newStock,
          adjustmentType: 'CORRECTION',
          reason: form.reason || 'Stock Adjustment via Edit Modal',
        });
      }

      onSaveSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-slate-100 p-5 bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Edit Product</h3>
              <p className="text-xs text-slate-500">SKU: <span className="font-mono font-bold text-slate-700">{product.sku}</span></p>
            </div>
          </div>
          <button 
            onClick={onClose} 
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
                <span>SKU Code</span>
              </label>
              <input
                type="text"
                required
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
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Building className="h-3.5 w-3.5 text-slate-400" />
                  <span>Branch Allocation</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.branchNumber}
                  onChange={(e) => setForm({ ...form, branchNumber: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Package className="h-3.5 w-3.5 text-slate-400" />
                  <span>Stock Quantity</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {isOperator ? (
              <ImageUploadField
                value={image}
                existingUrl={product.imageUrl || ''}
                onChange={setImage}
                required={!product.imageUrl}
              />
            ) : null}

            {/* Audit reason input triggered when stock changes */}
            {parseInt(form.stockQuantity, 10) !== product.stockQuantity && (
              <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 space-y-1 animate-in fade-in">
                <label className="block font-bold text-amber-800 flex items-center space-x-1">
                  <RefreshCw className="h-3 w-3 text-amber-600" />
                  <span>Stock Adjustment Reason (System Log)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical inventory count / stock recount"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full border border-amber-300 rounded-lg p-2 bg-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {loading ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditProductModal;