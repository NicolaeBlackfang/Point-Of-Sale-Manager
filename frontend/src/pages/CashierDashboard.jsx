import React, { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import ScanInputSection from '../components/pos/ScanInputSection';
import CartTable from '../components/pos/CartTable';
import CheckoutSection from '../components/pos/CheckoutSection';
import RecentTransactions from '../components/admin/RecentTransactions';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, CheckCircle } from 'lucide-react';

const CashierDashboard = () => {
  const [cart, setCart] = useState([]);
  const [qrInput, setQrInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recentSales, setRecentSales] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const scanInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchRecentSales = async () => {
    try {
      const { data } = await API.get('/sales/my-sales');
      setRecentSales(data);
    } catch (err) {
      console.error('Failed to load sales history:', err);
    }
  };

  useEffect(() => {
    fetchRecentSales();
  }, []);

  const processProductLookup = async (input) => {
    if (!input) return;

    let rawString = typeof input === 'object' ? input.text || input.decodedText || input.sku || input.data || '' : input;
    rawString = String(rawString).trim();

    if (!rawString || rawString === 'undefined' || rawString === 'null') {
      setError('Invalid or unreadable QR code / SKU.');
      return;
    }

    setError('');
    try {
      const { data: product } = await API.get(`/products/scan/${encodeURIComponent(rawString)}`);

      if (product.stockQuantity <= 0) {
        setError(`Product "${product.name}" is out of stock!`);
        return;
      }

      setCart((prevCart) => {
        const productId = product._id || product.id;
        const existingIndex = prevCart.findIndex((item) => item._id === productId);

        if (existingIndex > -1) {
          const updated = [...prevCart];
          if (updated[existingIndex].quantity + 1 > product.stockQuantity) {
            setError(`Cannot add more. Only ${product.stockQuantity} units available.`);
            return prevCart;
          }
          updated[existingIndex].quantity += 1;
          return updated;
        } else {
          return [
            ...prevCart,
            {
              _id: productId,
              sku: product.sku,
              name: product.name,
              price: product.price,
              quantity: 1,
              maxStock: product.stockQuantity,
              branchNumber: product.branchNumber,
            },
          ];
        }
      });

      setQrInput('');
    } catch (err) {
      setError(err.response?.data?.message || `Product not found for "${rawString}".`);
    } finally {
      if (scanInputRef.current) scanInputRef.current.focus();
    }
  };

  const handleScanSubmit = (e) => {
    e.preventDefault();
    processProductLookup(qrInput);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-temp-holder');
      const result = await html5QrCode.scanFile(file, true);
      const decodedText = typeof result === 'string' ? result : (result?.decodedText || result?.text);

      if (decodedText) {
        await processProductLookup(decodedText);
      } else {
        setError('Failed to extract text from QR code image.');
      }

      html5QrCode.clear();
    } catch (err) {
      setError('Could not decode QR code from image. Please try entering SKU manually.');
    } finally {
      e.target.value = '';
    }
  };

  const updateQuantity = (id, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item._id === id) {
            const newQty = item.quantity + delta;
            if (newQty > item.maxStock) {
              setError(`Maximum available stock reached (${item.maxStock}).`);
              return item;
            }
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item._id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const itemsPayload = cart.map((item) => ({
        product: item._id || item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
      }));

      const salePayload = {
        items: itemsPayload,
        totalAmount: cartTotal,
        paymentMethod: paymentMethod.toLowerCase(),
        branchNumber: cart[0]?.branchNumber || '101',
      };

      await API.post('/sales', salePayload);
      setSuccessMsg(`Transaction completed successfully! Total: $${cartTotal.toFixed(2)}`);
      setCart([]);
      fetchRecentSales();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Checkout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div id="qr-reader-temp-holder" className="hidden"></div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Cashier POS Terminal</h1>
        <p className="text-xs text-slate-500">
          Scan QR code, enter SKU, or upload QR image to process checkout orders.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ScanInputSection
            qrInput={qrInput}
            setQrInput={setQrInput}
            handleScanSubmit={handleScanSubmit}
            handleFileUpload={handleFileUpload}
            scanInputRef={scanInputRef}
            fileInputRef={fileInputRef}
          />

          <CartTable
            cart={cart}
            updateQuantity={updateQuantity}
            removeFromCart={removeFromCart}
          />
        </div>

        <div className="space-y-6">
          <CheckoutSection
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            cartTotal={cartTotal}
            handleCheckout={handleCheckout}
            cartLength={cart.length}
            loading={loading}
          />

          <RecentTransactions recentSales={recentSales} />
        </div>
      </div>
    </Layout>
  );
};

export default CashierDashboard;