import React from 'react';
import { CreditCard } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const CheckoutSection = ({
  paymentMethod,
  setPaymentMethod,
  cartTotal,
  handleCheckout,
  cartLength,
  loading,
  customerName = '',
  setCustomerName = () => {},
}) => {
  const { settings, formatCurrency, taxAmountFor } = useSettings();
  const taxAmount = taxAmountFor(cartTotal);
  const grandTotal = cartTotal + taxAmount;

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

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Customer name{' '}
          <span className="font-normal text-slate-400">(optional — printed on the receipt)</span>
        </label>
        <input
          type="text"
          value={customerName}
          maxLength={80}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Priya Sharma"
          className="w-full border rounded-lg p-2.5 bg-white font-medium text-xs text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(cartTotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Tax ({settings.taxRate}%)</span>
          <span>{formatCurrency(taxAmount)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between font-bold text-slate-900 text-sm">
          <span>Total Amount</span>
          <span className="text-emerald-600 text-lg">{formatCurrency(grandTotal)}</span>
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
