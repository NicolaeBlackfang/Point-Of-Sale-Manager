import React from 'react';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';

const CartTable = ({ cart, updateQuantity, removeFromCart }) => {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShoppingCart className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-sm">Current Order Items</h2>
        </div>
        <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-medium">
          {totalQuantity} Items
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b text-slate-600 text-xs uppercase">
              <th className="p-3">SKU</th>
              <th className="p-3">Product</th>
              <th className="p-3">Available Stock</th>
              <th className="p-3">Unit Price</th>
              <th className="p-3 text-center">Quantity</th>
              <th className="p-3 text-right">Subtotal</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cart.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center p-8 text-slate-400 text-xs">
                  Cart is empty. Type an SKU, scan a code, or upload a QR image above.
                </td>
              </tr>
            ) : (
              cart.map((item) => {
                const remainingStock = item.maxStock - item.quantity;
                const isLowStock = remainingStock <= 2;

                return (
                  <tr key={item._id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs font-bold text-slate-700">{item.sku}</td>
                    <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                    
                    {/* Stock level visibility */}
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          isLowStock
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.maxStock} in stock ({remainingStock} left)
                      </span>
                    </td>

                    <td className="p-3 text-slate-600">${item.price.toFixed(2)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => updateQuantity(item._id, -1)}
                          className="p-1 border rounded hover:bg-slate-100"
                        >
                          <Minus className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item._id, 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="p-1 border rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={item.quantity >= item.maxStock ? 'Maximum stock reached' : ''}
                        >
                          <Plus className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-800">
                      ${(item.price * item.quantity).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => removeFromCart(item._id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CartTable;