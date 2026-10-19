import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import ScanInputSection from '../components/pos/ScanInputSection';
import CartTable from '../components/pos/CartTable';
import CheckoutSection from '../components/pos/CheckoutSection';
import ScannerSourceSelector from '../components/pos/ScannerSourceSelector';
import RecentTransactions from '../components/pos/RecentTransactions';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, CheckCircle, WifiOff, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import {
  cacheProduct,
  getCachedProduct,
  queueSale,
  flushQueue,
  cacheRecentSales,
  getCachedRecentSales,
  getQueueCount,
  isNetworkError,
} from '../services/offline';

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [{ key: 'pos', label: 'POS Terminal / Cashier', icon: ShoppingCart }],
  },
  {
    label: 'Settings',
    items: [{ key: 'scanner', label: 'Store & Scanner Settings', icon: SlidersHorizontal }],
  },
];

const CashierDashboard = () => {
  const { formatCurrency, taxAmountFor } = useSettings();
  const [cart, setCart] = useState([]);
  const [qrInput, setQrInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recentSales, setRecentSales] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(() => !navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [activeNav, setActiveNav] = useState('pos');
  // Input source: 'hardware' (keyboard-wedge scanner) or 'camera' (webcam feed)
  const [scannerMode, setScannerMode] = useState('hardware');
  const [cameraId, setCameraId] = useState(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const scanInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraScannerRef = useRef(null);

  // Stop an active camera feed (used when switching back to hardware mode or unmounting).
  const stopCameraScanner = useCallback(async () => {
    const scanner = cameraScannerRef.current;
    cameraScannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // already stopped
    }
    try {
      scanner.clear();
    } catch {
      // no video element to clear
    }
  }, []);


  const handleNav = (key) => {
    if (key === 'scanner') {
      setActiveNav('scanner');
      setIsScannerModalOpen(true);
    } else {
      setActiveNav(key);
    }
  };

  const refreshQueueCount = useCallback(() => {
    getQueueCount().then(setQueuedCount).catch(() => {});
  }, []);

  const fetchRecentSales = useCallback(async () => {
    try {
      const { data } = await API.get('/sales/my-sales');
      setRecentSales(data);
      cacheRecentSales(data);
      setOfflineMode(false);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflineMode(true);
        const cached = await getCachedRecentSales();
        if (cached.length) setRecentSales(cached);
      }
      console.error('Failed to load sales history:', err);
    }
  }, []);

  // Push any queued offline sales to the server (on mount and when back online).
  const flushOfflineQueue = useCallback(async () => {
    refreshQueueCount();
    try {
      const { sent } = await flushQueue(async (payload) => {
        await API.post('/sales', payload);
      });
      if (sent > 0) {
        setSuccessMsg(`${sent} offline sale(s) synced to the server.`);
        fetchRecentSales();
      }
    } catch (err) {
      console.error('Failed to sync offline queue:', err);
    } finally {
      refreshQueueCount();
    }
  }, [fetchRecentSales, refreshQueueCount]);

  useEffect(() => {
    fetchRecentSales();
    flushOfflineQueue();

    const handleOnline = () => {
      setOfflineMode(false);
      flushOfflineQueue();
    };
    const handleOffline = () => setOfflineMode(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchRecentSales, flushOfflineQueue]);

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

      // Cache the product so it can still be looked up while offline.
      cacheProduct(product);

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
      setOfflineMode(false);
    } catch (err) {
      if (isNetworkError(err)) {
        // Offline fallback: serve the product from the IndexedDB cache.
        const cached = await getCachedProduct(rawString);
        if (cached) {
          setOfflineMode(true);
          setCart((prevCart) => {
            const existingIndex = prevCart.findIndex((item) => item._id === cached._id);
            if (existingIndex > -1) {
              const updated = [...prevCart];
              updated[existingIndex].quantity += 1;
              return updated;
            }
            return [
              ...prevCart,
              {
                _id: cached._id,
                sku: cached.sku,
                name: cached.name,
                price: cached.price,
                quantity: 1,
                maxStock: cached.stockQuantity ?? 999,
                branchNumber: cached.branchNumber,
                offlineData: true,
              },
            ];
          });
          setQrInput('');
          setError('Offline: using cached product data. Stock may be out of date.');
          return;
        }
        setError(`Offline and "${rawString}" is not in the local cache. Reconnect to look up new products.`);
        return;
      }
      setError(err.response?.data?.message || `Product not found for "${rawString}".`);
    } finally {
      if (scanInputRef.current) scanInputRef.current.focus();
    }
  };


  // Start live camera scanning; every decoded code is routed to product lookup.
  const startCameraScanner = useCallback(
    async (deviceId) => {
      await stopCameraScanner();
      const scanner = new Html5Qrcode('camera-scan-reader-holder');
      cameraScannerRef.current = scanner;
      try {
        await scanner.start(
          deviceId,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            processProductLookup(decodedText);
          },
          () => {
            // per-frame decode misses are expected; ignore
          }
        );
      } catch (err) {
        cameraScannerRef.current = null;
        setError(err.message || 'Failed to start the selected camera.');
        setScannerMode('hardware');
        setCameraId(null);
      }
    },
    [stopCameraScanner]
  );

  const handleScannerSelect = ({ mode, cameraId: selectedCamera }) => {
    setIsScannerModalOpen(false);
    setActiveNav('pos');
    if (mode === 'camera' && selectedCamera) {
      setScannerMode('camera');
      setCameraId(selectedCamera);
      startCameraScanner(selectedCamera);
    } else {
      setScannerMode('hardware');
      setCameraId(null);
      stopCameraScanner();
    }
  };

  // Stop the camera feed on unmount.
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);
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
    } catch {
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
    };

    try {
      await API.post('/sales', salePayload);
      const grandTotal = cartTotal + taxAmountFor(cartTotal);
      setSuccessMsg(
        `Transaction completed successfully! Total: ${formatCurrency(grandTotal)}`
      );
      setCart([]);
      setOfflineMode(false);
      fetchRecentSales();
    } catch (err) {
      if (isNetworkError(err)) {
        // Queue the sale locally; it will sync automatically when back online.
        await queueSale(salePayload);
        setSuccessMsg(
          `You are offline - sale for ${formatCurrency(cartTotal)} was queued and will sync automatically.`
        );
        setCart([]);
        setOfflineMode(true);
        refreshQueueCount();
      } else {
        setError(err.response?.data?.message || err.message || 'Checkout failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout navGroups={NAV_GROUPS} activeKey={activeNav} onNavigate={handleNav}>
      <div id="qr-reader-temp-holder" className="hidden"></div>

      {/* Live camera feed holder (only present while camera mode is active) */}
      <div
        id="camera-scan-reader-holder"
        className={scannerMode === 'camera' ? 'block' : 'hidden'}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cashier POS Terminal</h1>
          <p className="text-xs text-slate-500">
            Scan QR code, enter SKU, or upload QR image to process checkout orders.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scanner / camera source indicator + selector trigger */}
          <button
            onClick={() => {
              setActiveNav('scanner');
              setIsScannerModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full transition"
            title="Select Scanner / Camera Source"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {scannerMode === 'camera' ? 'Camera source' : 'Hardware scanner'}
          </button>
          {offlineMode && (
            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full">
              <WifiOff className="h-3.5 w-3.5" />
              Offline mode
              {queuedCount > 0 && ` - ${queuedCount} sale(s) queued`}
            </span>
          )}
        </div>
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

      <ScannerSourceSelector
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false);
          setActiveNav('pos');
        }}
        mode={scannerMode}
        cameraId={cameraId}
        onSelect={handleScannerSelect}
      />
    </Layout>
  );
};

export default CashierDashboard;
