import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import {
  X,
  Package,
  Clock,
  User,
  PlusCircle,
  MinusCircle,
  History,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  RefreshCw,
  QrCode,
  Building,
  Tag,
  Edit3,
} from 'lucide-react';

const ProductDetailsModal = ({ product: initialProduct, onClose, onStockUpdated }) => {
  const [product, setProduct] = useState(initialProduct);
  const [quantityInput, setQuantityInput] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('ADDITION'); // 'ADDITION', 'DEDUCTION', 'CORRECTION'
  const [reasonInput, setReasonInput] = useState('Manual Inventory Adjustment');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Keep state synchronized if target product prop updates externally
  useEffect(() => {
    setProduct(initialProduct);
    setErrorMessage('');
    setSuccessMessage('');
  }, [initialProduct]);

  if (!product) return null;

  // Handle stock adjustments directly within the audit modal
  const handleStockUpdate = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const qty = parseInt(quantityInput, 10);
    if (!qty || qty <= 0) {
      setErrorMessage('Please enter a valid stock quantity greater than 0.');
      return;
    }

    if (adjustmentType === 'DEDUCTION' && qty > product.stockQuantity) {
      setErrorMessage(`Cannot deduct ${qty} units. Current stock quantity is only ${product.stockQuantity}.`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await API.put(`/products/${product._id}/stock`, {
        quantityChanged: qty,
        adjustmentType,
        reason: reasonInput || 'Manual Inventory Adjustment',
      });

      setProduct(data);
      setQuantityInput('');
      setSuccessMessage(`Stock successfully updated (${adjustmentType}).`);
      if (onStockUpdated) onStockUpdated(data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to update stock quantity.');
    } finally {
      setLoading(false);
    }
  };

  // Safe accessor helper for user display names across populated schema structures
  const getUserDisplayName = (userObj) => {
    if (!userObj) return 'System / Unknown User';
    if (typeof userObj === 'string') return userObj;
    return userObj.roleTakerName || userObj.name || userObj.username || 'Unknown User';
  };

  const creatorName = getUserDisplayName(product.createdByOperatorId);
  const creatorUsername = product.createdByOperatorId?.username;
  const creatorRole = product.createdByOperatorId?.role;

  const deleterName = getUserDisplayName(product.deletedBy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Dynamic Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-800">{product.name}</h2>
                <span className="font-mono text-xs bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                  {product.sku}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Created by: <span className="font-semibold text-slate-700">{creatorName}</span>
                {creatorUsername && <span className="text-slate-400"> ({creatorUsername})</span>}
                {creatorRole && (
                  <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono uppercase">
                    {creatorRole}
                  </span>
                )}
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

        {/* Product Details Bar */}
        <div className="px-6 py-3 bg-slate-100/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-slate-500">Price: </span>
              <span className="font-bold text-slate-800">${product.price?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500">Stock Quantity: </span>
              <span className={`font-bold ${product.stockQuantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {product.stockQuantity} units
              </span>
            </div>
            <div className="flex items-center space-x-1 text-slate-600">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>Category: <strong className="text-slate-800">{product.category || 'N/A'}</strong></span>
            </div>
            <div className="flex items-center space-x-1 text-slate-600">
              <Building className="h-3.5 w-3.5 text-slate-400" />
              <span>Branch: <strong className="text-slate-800">#{product.branchNumber || 'N/A'}</strong></span>
            </div>
          </div>

          {/* Status & Delete Info Badges */}
          <div className="flex items-center space-x-2">
            {product.isDeleted ? (
              <span className="bg-red-100 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center">
                <AlertOctagon className="h-3 w-3 mr-1" />
                Deleted
              </span>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </span>
            )}

            {/* Deletion Details */}
            {product.isDeleted && (
              <div className="flex items-center space-x-1 bg-red-50 text-red-800 border border-red-200 px-2.5 py-0.5 rounded-full text-[10px]">
                <Calendar className="h-3 w-3 text-red-500" />
                <span>
                  Deleted on{' '}
                  {product.deletedAt
                    ? new Date(product.deletedAt).toLocaleString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/A'}
                </span>
                {product.deletedBy && (
                  <span className="font-semibold"> by {deleterName}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* QR Code Visualizer */}
            {product.qrCodeDataUrl && (
              <div className="md:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
                <img
                  src={product.qrCodeDataUrl}
                  alt={`QR Code for ${product.sku}`}
                  className="w-32 h-32 object-contain rounded-lg border bg-white p-2 shadow-sm"
                />
                <div className="flex items-center space-x-1 text-[11px] text-slate-500 font-mono">
                  <QrCode className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[120px]">{product.sku}</span>
                </div>
              </div>
            )}

            {/* Quick Stock Adjustment Panel */}
            <div className={product.qrCodeDataUrl ? "md:col-span-3" : "md:col-span-4"}>
              {!product.isDeleted ? (
                <form onSubmit={handleStockUpdate} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                    <span>Adjust Inventory Quantity</span>
                  </h3>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setAdjustmentType('ADDITION')}
                        className={`px-3 py-1.5 text-xs font-semibold flex items-center space-x-1 transition ${
                          adjustmentType === 'ADDITION' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>Addition</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentType('DEDUCTION')}
                        className={`px-3 py-1.5 text-xs font-semibold flex items-center space-x-1 transition ${
                          adjustmentType === 'DEDUCTION' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <MinusCircle className="h-3.5 w-3.5" />
                        <span>Deduction</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentType('CORRECTION')}
                        className={`px-3 py-1.5 text-xs font-semibold flex items-center space-x-1 transition ${
                          adjustmentType === 'CORRECTION' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Correction</span>
                      </button>
                    </div>

                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <input
                      type="text"
                      placeholder="Reason for adjustment"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Apply Update'}
                    </button>
                  </div>

                  {errorMessage && <p className="text-xs text-red-600 font-medium">{errorMessage}</p>}
                  {successMessage && <p className="text-xs text-emerald-600 font-medium">{successMessage}</p>}
                </form>
              ) : (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-xs text-red-700 flex items-center space-x-2">
                  <AlertOctagon className="h-4 w-4 text-red-500" />
                  <span>This product has been soft-deleted. Stock modifications are disabled.</span>
                </div>
              )}
            </div>
          </div>

          {/* Stock Adjustment History Table */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 border-b pb-2">
              <History className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Stock Adjustment Logs</h3>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                {product.stockHistory?.length || 0} Entries
              </span>
            </div>

            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b text-slate-600 uppercase font-semibold">
                    <th className="p-3">Type</th>
                    <th className="p-3">Qty Changed</th>
                    <th className="p-3">Prev / New Stock</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Performed By</th>
                    <th className="p-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!product.stockHistory || product.stockHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center p-6 text-slate-400">
                        No stock adjustment logs recorded for this product.
                      </td>
                    </tr>
                  ) : (
                    [...product.stockHistory].reverse().map((log, index) => {
                      const performedByName = getUserDisplayName(log.performedBy);
                      const userRole = log.performedBy?.role;

                      return (
                        <tr key={log._id || index} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-semibold">
                            {log.adjustmentType === 'ADDITION' && (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center">
                                <PlusCircle className="h-3 w-3 mr-1" /> Addition
                              </span>
                            )}
                            {log.adjustmentType === 'DEDUCTION' && (
                              <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 inline-flex items-center">
                                <MinusCircle className="h-3 w-3 mr-1" /> Deduction
                              </span>
                            )}
                            {log.adjustmentType === 'CORRECTION' && (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-flex items-center">
                                <Edit3 className="h-3 w-3 mr-1" /> Correction
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-800 text-sm">
                            {log.adjustmentType === 'ADDITION' ? `+${log.quantityChanged}` : `-${log.quantityChanged}`}
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-[11px]">
                            {log.previousQuantity ?? 'N/A'} &rarr;{' '}
                            <span className="font-bold text-slate-800">{log.newQuantity ?? 'N/A'}</span>
                          </td>
                          <td className="p-3 text-slate-600 max-w-[180px] truncate" title={log.reason}>
                            {log.reason || 'Manual Adjustment'}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-800">{performedByName}</span>
                              {userRole && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded uppercase font-mono">
                                  {userRole}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500 text-[11px]">
                            <div className="flex items-center justify-end space-x-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>
                                {log.timestamp
                                  ? new Date(log.timestamp).toLocaleString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'N/A'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition"
          >
            Close Audit Modal
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailsModal;