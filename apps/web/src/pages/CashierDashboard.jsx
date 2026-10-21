import React, { useState, useEffect, useRef, useCallback } from 'react';
import API from '../services/api';
import Layout from '../components/ui/Layout';
import ScanInputSection from '../components/pos/ScanInputSection';
import ProductGrid from '../components/pos/ProductGrid';
import CartModal from '../components/pos/CartModal';
import ScannerSourceSelector from '../components/pos/ScannerSourceSelector';
import RecentTransactions from '../components/pos/RecentTransactions';
import ReceiptDocument from '../components/pos/ReceiptDocument';
import RefundModule from '../components/pos/RefundModule';
import ThermalPrinterPanel from '../components/settings/ThermalPrinterPanel';
import DesktopSettingsPanel from '../components/settings/DesktopSettingsPanel';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertCircle,
  CheckCircle,
  WifiOff,
  ShoppingCart,
  SlidersHorizontal,
  Printer,
  Undo2,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import {
  getPrinterConfig,
  buildEscPosReceipt,
  sendToPrinter,
} from '../utils/printer';
import {
  cacheProduct,
  getCachedProduct,
  queueSale,
  flushQueue,
  cacheRecentSales,
  getCachedRecentSales,
  getQueueCount,
  isNetworkError,
  saveActiveCart,
  getActiveCart,
  removeActiveCart,
} from '../services/offline';

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [{ key: 'pos', label: 'POS Terminal / Cashier', icon: ShoppingCart }],
  },
  {
    label: 'Refunds',
    items: [{ key: 'refund', label: 'Refund & Return', icon: Undo2 }],
  },
  {
    label: 'Settings',
    items: [
      { key: 'scanner', label: 'Store & Scanner Settings', icon: SlidersHorizontal },
      { key: 'printer', label: 'Thermal Printer', icon: Printer },
    ],
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
  // Optional buyer name captured at checkout and printed on the receipt.
  const [customerName, setCustomerName] = useState('');
  // Post-payment receipt (checkout), plus the source that opened the viewer.
  const [receiptView, setReceiptView] = useState(null);
  const [receiptSource, setReceiptSource] = useState('checkout');
  const [isCartOpen, setIsCartOpen] = useState(false);
  // Input source: 'hardware' (keyboard-wedge scanner) or 'camera' (webcam feed)
  const [scannerMode, setScannerMode] = useState('hardware');
  const [cameraId, setCameraId] = useState(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const scanInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraScannerRef = useRef(null);

  // A stable id so a resumed cart is found again after an app restart.
  const cartIdRef = useRef(
    (() => {
      try {
        const existing = localStorage.getItem('openpos.activeCartId');
        if (existing) return existing;
        const created = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('openpos.activeCartId', created);
        return created;
      } catch {
        return 'cart-default';
      }
    })()
  );

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
      return;
    }

    // Leaving the terminal stops any live camera feed so background scans
    // cannot add to the cart while the operator is on another panel.
    if (key !== 'pos') {
      stopCameraScanner();
      setScannerMode('hardware');
      setCameraId(null);
    }
    setActiveNav(key);
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

    // The desktop app also retries the queue from the main process, but a
    // periodic pass here keeps the browser build in sync too.
    const interval = window.setInterval(flushOfflineQueue, 30_000);

    const handleOnline = () => {
      setOfflineMode(false);
      flushOfflineQueue();
    };
    const handleOffline = () => setOfflineMode(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchRecentSales, flushOfflineQueue]);

  // Restore a cart that was left open when the app was closed, then keep
  // persisting it so a crash or power loss never loses the basket.
  const cartStateRef = useRef({ cart, customerName, paymentMethod });
  cartStateRef.current = { cart, customerName, paymentMethod };

  useEffect(() => {
    const cartId = cartIdRef.current;
    let restored = false;
    getActiveCart(cartId)
      .then((saved) => {
        if (saved && Array.isArray(saved.items) && saved.items.length > 0) {
          setCart(saved.items);
          if (saved.customerName) setCustomerName(saved.customerName);
          if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
          setSuccessMsg('Recovered an unsaved cart from your last session.');
        }
        restored = true;
      })
      .catch(() => {
        restored = true;
      });

    return () => {
      // Persist the latest state when the component unmounts.
      if (restored) {
        const { cart: current, customerName: name, paymentMethod: method } = cartStateRef.current;
        if (current.length === 0) {
          removeActiveCart(cartId);
          return;
        }
        saveActiveCart(cartId, { items: current, customerName: name, paymentMethod: method });
      }
    };
    // Only on mount/unmount - the dedicated effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the cart on every change (debounced by the storage layer).
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (cart.length === 0) {
        removeActiveCart(cartIdRef.current);
        return;
      }
      saveActiveCart(cartIdRef.current, {
        items: cart,
        customerName,
        paymentMethod,
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [cart, customerName, paymentMethod]);

  // Single entry point for adding a product to the cart — used by scanning,
  // manual SKU entry and the product card grid.
  const addProductToCart = (product, { offlineData = false } = {}) => {
    if (!product) return;

    const stock = Number(product.stockQuantity ?? 0);
    if (stock <= 0) {
      setError(`Product "${product.name}" is out of stock!`);
      return;
    }

    const productId = product._id || product.id;
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item._id === productId);

      if (existingIndex > -1) {
        const updated = [...prevCart];
        if (updated[existingIndex].quantity + 1 > stock) {
          setError(`Cannot add more. Only ${stock} units available.`);
          return prevCart;
        }
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }

      return [
        ...prevCart,
        {
          _id: productId,
          sku: product.sku,
          name: product.name,
          price: product.price,
          quantity: 1,
          maxStock: stock,
          branchNumber: product.branchNumber,
          ...(offlineData ? { offlineData: true } : {}),
        },
      ];
    });
  };

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

      addProductToCart(product);
      setQrInput('');
      setOfflineMode(false);
    } catch (err) {
      if (isNetworkError(err)) {
        // Offline fallback: serve the product from the IndexedDB cache.
        const cached = await getCachedProduct(rawString);
        if (cached) {
          setOfflineMode(true);
          addProductToCart(cached, { offlineData: true });
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
    const trimmedCustomerName = customerName.trim();
    if (trimmedCustomerName) salePayload.customerName = trimmedCustomerName.slice(0, 80);

    try {
      const { data: createdSale } = await API.post('/sales', salePayload);
      const grandTotal = cartTotal + taxAmountFor(cartTotal);
      setSuccessMsg(
        `Transaction completed successfully! Total: ${formatCurrency(createdSale.totalWithTax ?? grandTotal)}`
      );
      setCart([]);
      setCustomerName('');
      setOfflineMode(false);
      setIsCartOpen(false);
      fetchRecentSales();

      // Post-payment receipt (contains the transaction id + QR for reprint/refund).
      setReceiptSource('checkout');
      setReceiptView(createdSale);
    } catch (err) {
      if (isNetworkError(err)) {
        // Queue the sale locally; it will sync automatically when back online.
        await queueSale(salePayload);
        setSuccessMsg(
          `You are offline - sale for ${formatCurrency(cartTotal)} was queued and will sync automatically.`
        );
        setCart([]);
        setCustomerName('');
        setOfflineMode(true);
        refreshQueueCount();
        setIsCartOpen(false);
      } else {
        setError(err.response?.data?.message || err.message || 'Checkout failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-print (opt-in in Thermal Printer settings): system print opens the
  // dialog for the receipt on screen, hardware transports get the ESC/POS bytes.
  useEffect(() => {
    if (!receiptView || receiptSource !== 'checkout') return;
    const config = getPrinterConfig();
    if (!config.autoPrint) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (config.transport === 'system') {
        window.print();
        return;
      }
      const bytes = buildEscPosReceipt(receiptView, {
        paperWidth: config.paperWidth,
        includeQr: config.includeQr,
        currencySymbol: receiptView.currency === settings.currencyCode ? settings.currencySymbol : '$',
      });
      const result = await sendToPrinter(bytes, config, receiptView);
      if (!cancelled && !result.ok) setError(result.message);
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [receiptView, receiptSource]);

  const closeReceipt = () => {
    setReceiptView(null);
    if (receiptSource === 'checkout') {
      setActiveNav('pos');
    }
  };

  const openReceiptFromSale = async (sale) => {
    setError('');
    setSuccessMsg('');
    if (sale.transactionId) {
      try {
        const { data } = await API.get(
          `/sales/receipts/${encodeURIComponent(sale.transactionId)}`
        );
        setReceiptSource('history');
        setReceiptView(data);
        return;
      } catch {
        /* fall through */
      }
    }
    setReceiptSource('history');
    setReceiptView(sale);
  };

  return (
    <Layout navGroups={NAV_GROUPS} activeKey={activeNav} onNavigate={handleNav}>
      <div id="qr-reader-temp-holder" className="hidden"></div>

      {/* Live camera feed holder (only present while camera mode is active) */}
      <div
        id="camera-scan-reader-holder"
        className={scannerMode === 'camera' ? 'block' : 'hidden'}
      />

      {activeNav === 'pos' ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Cashier POS Terminal</h1>
              <p className="text-xs text-slate-500">
                Scan QR code, enter SKU, or use the product grid to process checkout orders.
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
              <button
                onClick={() => setIsCartOpen(true)}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Cart ({cart.length})
                {cartTotal ? ` · ${formatCurrency(cartTotal)}` : ''}
              </button>
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

          <div className="space-y-6">
            <ScanInputSection
              qrInput={qrInput}
              setQrInput={setQrInput}
              handleScanSubmit={handleScanSubmit}
              handleFileUpload={handleFileUpload}
              scanInputRef={scanInputRef}
              fileInputRef={fileInputRef}
            />
            <ProductGrid onAddProduct={addProductToCart} disabled={loading} />
            <RecentTransactions recentSales={recentSales} onSelect={openReceiptFromSale} />
          </div>
        </>
      ) : null}

      {activeNav === 'refund' ? <RefundModule onOpenReceipt={openReceiptFromSale} /> : null}
      {activeNav === 'printer' ? (
        <div className="space-y-6">
          <ThermalPrinterPanel />
          <DesktopSettingsPanel />
        </div>
      ) : null}

      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        cartTotal={cartTotal}
        handleCheckout={() => {
          handleCheckout();
          setIsCartOpen(false);
        }}
        cartLength={cart.length}
        loading={loading}
        customerName={customerName}
        setCustomerName={setCustomerName}
      />

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

      {receiptView ? (
        <ReceiptDocument
          sale={receiptView}
          onClose={closeReceipt}
          closeLabel={receiptSource === 'checkout' ? 'New sale' : 'Close'}
          actionLabel={receiptView.refundStatus !== 'Refunded' ? 'Refund / Return' : null}
          onAction={
            receiptView.refundStatus !== 'Refunded'
              ? () => {
                  setReceiptView(null);
                  setActiveNav('refund');
                }
              : null
          }
        />
      ) : null}
    </Layout>
  );
};

export default CashierDashboard;
