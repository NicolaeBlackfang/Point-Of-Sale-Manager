import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Search, X, Eye, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const OperatorProductModule = ({ auditLogs, onSelectProduct, onDeleteProduct }) => {
  const [skuSearch, setSkuSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter products by SKU in real time
  const filteredProducts = useMemo(() => {
    if (!skuSearch.trim()) return auditLogs;
    const search = skuSearch.toLowerCase().trim();
    return auditLogs.filter((p) => p.sku?.toLowerCase().includes(search));
  }, [auditLogs, skuSearch]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [skuSearch]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-3">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-slate-800">Operator Audit & Product Control</h2>
          <span className="text-xs bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-slate-600">
            {filteredProducts.length} Items Found
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[260px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by SKU (e.g. PROD...)"
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          />
          {skuSearch && (
            <button
              onClick={() => setSkuSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b text-slate-600 text-xs uppercase">
              <th className="p-3">SKU</th>
              <th className="p-3">Product Name</th>
              <th className="p-3">Uploaded By Operator</th>
              <th className="p-3">Created Date</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                  No matching products found for SKU filter:{' '}
                  <strong className="font-mono text-slate-600">"{skuSearch}"</strong>
                </td>
              </tr>
            ) : (
              paginatedProducts.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-blue-600">{p.sku}</td>
                  <td className="p-3 text-slate-800 font-medium">{p.name}</td>
                  <td className="p-3 text-slate-600">
                    {p.createdByOperatorId?.roleTakerName || p.createdByOperatorId?.name || 'N/A'}{' '}
                    <span className="text-xs text-slate-400">({p.createdByOperatorId?.username})</span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-xs">
                    {p.isDeleted ? (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">
                        Deleted
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-semibold">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => onSelectProduct(p)}
                      className="inline-flex items-center space-x-1 text-xs bg-slate-800 text-white hover:bg-slate-900 px-3 py-1.5 rounded-lg transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Audit</span>
                    </button>

                    {!p.isDeleted && (
                      <button
                        onClick={() => onDeleteProduct(p._id, p.name)}
                        className="inline-flex items-center space-x-1 text-xs bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded-lg transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {filteredProducts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between border-t pt-4 text-xs text-slate-500 gap-3">
          <div>
            Showing <strong className="text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to{' '}
            <strong className="text-slate-800">
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}
            </strong>{' '}
            of <strong className="text-slate-800">{filteredProducts.length}</strong> products
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`px-3 py-1 rounded-lg font-semibold transition ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorProductModule;