import React, { useState, useEffect } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import AddProductModal from '../components/products/AddProductModal';
import EditProductModal from '../components/products/EditProductModal';
import { Package, Plus, Search, Edit3, Trash2, Download, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, X } from 'lucide-react';

const OperatorDashboard = () => {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchProducts = async () => {
    try {
      const { data } = await API.get('/products');
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await API.delete(`/products/${deleteTarget.id}`);
      setMessage({ type: 'success', text: `Product '${deleteTarget.name}' deleted successfully.` });
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete product' });
    }
  };

  const myProducts = products.filter((p) => {
    const operatorId = p.createdByOperatorId?._id || p.createdByOperatorId || p.createdBy;
    return operatorId === user._id || operatorId === user.id;
  });

  const filteredProducts = myProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <Layout>
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Operator Workspace</h1>
          <p className="text-xs text-slate-500">
            Manage your uploaded product listings, track stock adjustments, and print unique product QR codes.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Dynamic Alert Banner */}
      {message.text && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search your uploaded products by SKU, name, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm outline-none text-slate-700 placeholder-slate-400"
        />
      </div>

      {/* Products Grid Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5 text-blue-600" />
            <h2 className="font-bold text-slate-800 text-sm">My Uploaded Products ({filteredProducts.length})</h2>
          </div>
          {filteredProducts.length > 0 && (
            <span className="text-xs text-slate-500 font-medium">
              Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b text-slate-600 text-xs uppercase">
                <th className="p-3">QR Code</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Branch</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center p-8 text-slate-400 text-xs">
                    No products found. Click "Add New Product" to upload products to your inventory.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product._id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <img
                        src={product.qrCodeDataUrl}
                        alt={`QR for ${product.name}`}
                        className="w-12 h-12 border rounded-lg bg-white p-0.5"
                      />
                    </td>
                    <td className="p-3 font-mono text-xs font-bold text-slate-800">{product.sku}</td>
                    <td className="p-3 font-semibold text-slate-800">{product.name}</td>
                    <td className="p-3 text-slate-600 text-xs">{product.category}</td>
                    <td className="p-3 font-bold text-emerald-600">${product.price?.toFixed(2)}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          product.stockQuantity < 10
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {product.stockQuantity} units
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">#{product.branchNumber}</td>
                    <td className="p-3 text-right space-x-2">
                      <a
                        href={product.qrCodeDataUrl}
                        download={`QR_${product.sku}.png`}
                        className="inline-flex items-center space-x-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition"
                        title="Download QR"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="inline-flex items-center space-x-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: product._id, name: product.name })}
                        className="inline-flex items-center space-x-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t bg-slate-50/50 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    currentPage === page
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-rose-100">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Confirm Deletion</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete <strong className="text-slate-800">{deleteTarget.name}</strong>? This action cannot be undone.
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
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition"
              >
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setMessage({ type: 'success', text: 'Product created successfully with generated QR!' });
          fetchProducts();
        }}
      />

      <EditProductModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaveSuccess={() => {
          setMessage({ type: 'success', text: 'Product updated successfully!' });
          fetchProducts();
        }}
      />
    </Layout>
  );
};

export default OperatorDashboard;