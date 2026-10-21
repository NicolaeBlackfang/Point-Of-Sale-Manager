import React, { useEffect, useMemo, useState } from 'react';
import { Search, Package, PackageX, RefreshCw, Plus } from 'lucide-react';
import API, { assetUrl } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';

/**
 * Touch-friendly product card grid for the cashier terminal.
 * Tapping a card adds one unit to the cart (stock-checked by the parent).
 */
const ProductGrid = ({ onAddProduct, disabled = false }) => {
  const { formatCurrency } = useSettings();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const { data } = await API.get('/products');
      setProducts(Array.isArray(data) ? data : []);
      setLoadError('');
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load the product catalog.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    const active = products.filter((p) => !p.isDeleted);
    if (!term) return active;
    return active.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
    );
  }, [products, query]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center space-x-2">
          <Package className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-sm">Product Catalog</h2>
          <span className="text-xs bg-slate-100 font-bold px-2.5 py-0.5 rounded-full text-slate-600">
            {visibleProducts.length} item{visibleProducts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-[220px]">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, SKU or category…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>
          <button
            type="button"
            onClick={() => loadProducts({ silent: true })}
            title="Refresh catalog"
            className="p-2 border border-slate-300 rounded-xl text-slate-500 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs">Loading products…</div>
      ) : visibleProducts.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-xs">
          No products match “{query}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {visibleProducts.map((product) => {
            const outOfStock = product.stockQuantity <= 0;
            return (
              <button
                key={product._id}
                type="button"
                disabled={disabled || outOfStock}
                onClick={() => onAddProduct(product)}
                className={`group relative flex flex-col rounded-xl border text-left overflow-hidden transition ${
                  outOfStock
                    ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md active:scale-[0.98]'
                }`}
                title={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
              >
                <div className="aspect-square w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={assetUrl(product.imageUrl)}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-slate-300" />
                  )}
                </div>

                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug min-h-[2.2em]">
                    {product.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-700">
                      {formatCurrency(product.price)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        outOfStock
                          ? 'bg-red-100 text-red-700'
                          : product.stockQuantity <= 5
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {outOfStock ? 'Out of stock' : `${product.stockQuantity} left`}
                    </span>
                  </div>
                </div>

                {outOfStock ? (
                  <span className="absolute top-2 right-2 bg-white/90 border border-slate-200 rounded-lg p-1">
                    <PackageX className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                ) : (
                  <span className="absolute top-2 right-2 bg-blue-600 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductGrid;
