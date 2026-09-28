import React from 'react';
import { CreditCard } from 'lucide-react';

const CheckoutSection = ({
  paymentMethod,
  setPaymentMethod,
  cartTotal,
  handleCheckout,
  cartLength,
  loading,
}) => {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-center space-x-2 border-b pb-3">
        <CreditCard className="h-5 w-5 text-blue-600" />
        <h3 className="font-bold text-slate-800">Payment & Checkout</h3>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full border rounded-lg p-2.5 bg-white font-medium text-xs text-slate-700"
        >
          <option value="cash">Cash Payment</option>
          <option value="card">Credit / Debit Card</option>
          <option value="mobile">Mobile Banking / UPI</option>
        </select>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>${cartTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Tax (0%)</span>
          <span>$0.00</span>
        </div>
        <div className="border-t pt-2 flex justify-between font-bold text-slate-900 text-sm">
          <span>Total Amount</span>
          <span className="text-emerald-600 text-lg">${cartTotal.toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={cartLength === 0 || loading}
        className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm text-sm"
      >
        {loading ? 'Processing Sale...' : 'Complete Checkout'}
      </button>
    </div>
  );
};

export default CheckoutSection;