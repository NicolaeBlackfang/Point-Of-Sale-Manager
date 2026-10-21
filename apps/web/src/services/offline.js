// Offline product cache + queued sales.
// The storage backend is chosen at runtime:
//   - Electron desktop app → SQLite (apps/desktop/sqlite-store.cjs, via IPC)
//   - Browser / web build   → IndexedDB (no extra dependencies)
// Both backends expose the same tiny async API so the rest of the app does
// not care which one is active.

import { sqlite } from './electron';

// ---------------------------------------------------------------------------
// IndexedDB backend (browser fallback)
// ---------------------------------------------------------------------------

const DB_NAME = 'openpos-offline';
const DB_VERSION = 2;
const STORE_PRODUCTS = 'products'; // keyed by SKU (uppercase)
const STORE_SALES_QUEUE = 'salesQueue'; // autoIncrement keys
const STORE_SALES_CACHE = 'salesCache'; // recent sales for history view
const STORE_ACTIVE_CARTS = 'activeCarts'; // in-progress baskets, keyed by id

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
      if (!db.objectStoreNames.contains(STORE_ACTIVE_CARTS)) {
        db.createObjectStore(STORE_ACTIVE_CARTS, { keyPath: 'id' });
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

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

let sqliteBackend = null;

/** Lazily resolves the SQLite bridge (Electron) or null for IndexedDB. */
async function getBackend() {
  if (sqliteBackend) return sqliteBackend;
  try {
    if (sqlite.available()) {
      sqliteBackend = sqlite;
    }
  } catch {
    /* no electron bridge in the web build */
  }
  return sqliteBackend;
}

/** True when running inside the Electron desktop app with SQLite storage. */
export async function isSqliteBackend() {
  return Boolean(await getBackend());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function cacheProduct(product) {
  if (!product?.sku) return;
  const backend = await getBackend();
  try {
    if (backend) {
      await backend.upsertProduct({
        _id: product._id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
        branchNumber: product.branchNumber,
        imageUrl: product.imageUrl,
      });
      return;
    }
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
  const backend = await getBackend();
  try {
    if (backend) return await backend.getProductBySku(sku);
    return await withStore(STORE_PRODUCTS, 'readonly', (store) =>
      store.get(String(sku).toUpperCase())
    );
  } catch (error) {
    console.error('Failed to read cached product:', error);
    return null;
  }
}

export async function getCachedProducts() {
  const backend = await getBackend();
  try {
    if (backend) return await backend.getAllProducts();
    return [];
  } catch {
    return [];
  }
}

export async function queueSale(salePayload) {
  const backend = await getBackend();
  if (backend) {
    await backend.queueSale(salePayload);
    return getQueueCount();
  }
  await withStore(STORE_SALES_QUEUE, 'readwrite', (store) =>
    store.put({ payload: salePayload, queuedAt: Date.now() })
  );
  return getQueueCount();
}

export async function getQueuedSales() {
  const backend = await getBackend();
  try {
    if (backend) return await backend.getQueuedSales();
    const keys = await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.getAllKeys());
    const sales = await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.getAll());
    return sales.map((sale, index) => ({ key: keys[index], ...sale }));
  } catch (error) {
    console.error('Failed to read sales queue:', error);
    return [];
  }
}

export async function removeQueuedSale(key) {
  const backend = await getBackend();
  if (backend) {
    await backend.removeQueuedSale(key);
    return;
  }
  return withStore(STORE_SALES_QUEUE, 'readwrite', (store) => store.delete(key));
}

export async function getQueueCount() {
  const backend = await getBackend();
  try {
    if (backend) return await backend.getQueueCount();
    return await withStore(STORE_SALES_QUEUE, 'readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

/**
 * Attempts to POST every queued offline sale. Stops on network failure so the
 * remaining queue keeps its original order.
 */
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
  const backend = await getBackend();
  try {
    if (backend) {
      await backend.cacheSales(sales || []);
      return;
    }
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
  const backend = await getBackend();
  try {
    if (backend) return await backend.getCachedSales();
    const sales = await withStore(STORE_SALES_CACHE, 'readonly', (store) => store.getAll());
    return (sales || []).sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  } catch {
    return [];
  }
}

// --- Active cart persistence (in-progress basket) ---

export async function saveActiveCart(id, cart) {
  if (!id) return;
  const backend = await getBackend();
  try {
    if (backend) {
      await backend.saveActiveCart(id, cart);
      return;
    }
    await withStore(STORE_ACTIVE_CARTS, 'readwrite', (store) =>
      store.put({ id: String(id), cart, updatedAt: Date.now() })
    );
  } catch (error) {
    console.error('Failed to persist active cart:', error);
  }
}

export async function getActiveCart(id) {
  if (!id) return null;
  const backend = await getBackend();
  try {
    if (backend) return await backend.getActiveCart(id);
    const record = await withStore(STORE_ACTIVE_CARTS, 'readonly', (store) => store.get(String(id)));
    return record?.cart ?? null;
  } catch (error) {
    console.error('Failed to read active cart:', error);
    return null;
  }
}

export async function getActiveCarts() {
  const backend = await getBackend();
  try {
    if (backend) return await backend.getActiveCarts();
    const records = await withStore(STORE_ACTIVE_CARTS, 'readonly', (store) => store.getAll());
    return (records || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (error) {
    console.error('Failed to list active carts:', error);
    return [];
  }
}

export async function removeActiveCart(id) {
  if (!id) return;
  const backend = await getBackend();
  try {
    if (backend) {
      await backend.removeActiveCart(id);
      return;
    }
    await withStore(STORE_ACTIVE_CARTS, 'readwrite', (store) => store.delete(String(id)));
  } catch (error) {
    console.error('Failed to remove active cart:', error);
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
