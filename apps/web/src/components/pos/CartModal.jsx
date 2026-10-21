import React, { useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import CartTable from './CartTable';
import CheckoutSection from './CheckoutSection';

/**
 * Cart modal for the cashier terminal.
 * Keeps the main page (product grid + scanner) clean and scrollable.
 */
const CartModal = ({
  isOpen,
  onClose,
  cart,
  updateQuantity,
  removeFromCart,
  paymentMethod,
  setPaymentMethod,
  cartTotal,
  handleCheckout,
  cartLength,
  loading,
  customerName,
  setCustomerName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-slate-50 w-full max-w-4xl max-h-[94vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Cart & Checkout</h2>
              <p className="text-xs text-slate-500">{cartLength} item(s) in cart</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <CartTable cart={cart} updateQuantity={updateQuantity} removeFromCart={removeFromCart} />
          </div>
          <div>
            <CheckoutSection
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              cartTotal={cartTotal}
              handleCheckout={handleCheckout}
              cartLength={cartLength}
              loading={loading}
              customerName={customerName}
              setCustomerName={setCustomerName}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartModal;
