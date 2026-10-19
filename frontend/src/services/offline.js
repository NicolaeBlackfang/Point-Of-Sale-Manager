// Minimal IndexedDB wrapper for offline product cache + queued sales.
// No external dependencies - raw IndexedDB API with promise helpers.

const DB_NAME = 'openpos-offline';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products'; // keyed by SKU (uppercase)
const STORE_SALES_QUEUE = 'salesQueue'; // autoIncrement keys
const STORE_SALES_CACHE = 'salesCache'; // recent sales for history view

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, { keyPath: 'sku' });
      }
      if (!db.objectStoreNames.contains(STORE_SALES_QUEUE)) {
        db.createObjectStore(STORE_SALES_QUEUE, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SALES_CACHE)) {
        db.createObjectStore(STORE_SALES_CACHE, { keyPath: '_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open offline database'));
  });

  return dbPromise;
}

function withStore(storeName, mode, operation) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = operation(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB operation failed'));
      })
  );
}

// --- Product cache (offline SKU lookups) ---

export async function cacheProduct(product) {
  if (!product?.sku) return;
  try {
    await withStore(STORE_PRODUCTS, 'readwrite', (store) =>
      store.put({
        sku: String(product.sku).toUpperCase(),
        _id: product._id,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
        branchNumber: product.branchNumber,
        cachedAt: Date.now(),
      })
    );
  } catch (error) {
    console.error('Failed to cache product offline:', error);
  }
}

export async function getCachedProduct(sku) {
  try {
    return await withStore(STORE_PRODUCTS, 'readonly', (store) =>
      store.get(String(sku).toUpperCase())
    );
  } catch (error) {
    console.error('Failed to read cached product:', error);
    return null;
  }
}

// --- Offline sales queue ---

export async function queueSale(salePayload) {
  await withStore(STORE_SALES_QUEUE, 'readwrite', (store) =>
    store.put({ payload: salePayload, queuedAt: Date.now() })
  );
  return getQueueCount();
}

export async function getQueuedSales() {
  try {
    const keys = await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.getAllKeys());
    const sales = await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.getAll());
    return sales.map((sale, index) => ({ key: keys[index], ...sale }));
  } catch (error) {
    console.error('Failed to read sales queue:', error);
    return [];
  }
}

export async function removeQueuedSale(key) {
  return withStore(STORE_SALES_QUEUE, 'readwrite', (store) => store.delete(key));
}

export async function getQueueCount() {
  try {
    return await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

// Attempts to POST every queued offline sale. Stops on network failure.
export async function flushQueue(postSale) {
  const queued = await getQueuedSales();
  let sent = 0;

  for (const entry of queued) {
    try {
      await postSale(entry.payload);
      await removeQueuedSale(entry.key);
      sent += 1;
    } catch {
      // Still offline (or server error) - keep the remaining queue intact.
      break;
    }
  }

  return { sent, remaining: queued.length - sent };
}

// --- Recent sales cache (offline history view) ---

export async function cacheRecentSales(sales) {
  try {
    const store = await openDB();
    const tx = store.transaction(STORE_SALES_CACHE, 'readwrite');
    const objectStore = tx.objectStore(STORE_SALES_CACHE);
    objectStore.clear();
    (sales || []).slice(0, 50).forEach((sale) => {
      if (sale && sale._id) objectStore.put(sale);
    });
  } catch (error) {
    console.error('Failed to cache sales history:', error);
  }
}

export async function getCachedRecentSales() {
  try {
    const sales = await withStore(STORE_SALES_CACHE, 'readonly', (store) => store.getAll());
    return (sales || []).sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  } catch {
    return [];
  }
}

// True when axios failed because the network/server is unreachable.
export function isNetworkError(error) {
  if (!error) return false;
  if (error.response) return false; // got an HTTP response - not an offline problem
  return (
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    error.message === 'Network Error' ||
    !error.response
  );
}
