// Thin bridge to the Electron preload API. In the browser (web build) the
// `window.electron` object is undefined and every helper degrades gracefully.

export const isDesktop = () =>
  typeof window !== 'undefined' && Boolean(window.electron && window.electron.isDesktop);

const electronApi = () => (typeof window !== 'undefined' ? window.electron : null);

/** Lists OS printers. Returns [] in the browser. */
export async function listSystemPrinters() {
  const api = electronApi();
  if (!api?.getPrinters) return [];
  try {
    return await api.getPrinters();
  } catch {
    return [];
  }
}

/** Silent native print of an HTML receipt. */
export async function printHtmlReceipt(options) {
  const api = electronApi();
  if (!api?.printHtml) return { ok: false, message: 'Native printing requires the desktop app.' };
  try {
    return await api.printHtml(options);
  } catch (error) {
    return { ok: false, message: error?.message || 'Native print failed.' };
  }
}

/** Raw ESC/POS over the network to a POS printer (host:9100). */
export async function printEscPosOverNetwork(options) {
  const api = electronApi();
  if (!api?.printEscPosNetwork) {
    return { ok: false, message: 'Network printing requires the desktop app.' };
  }
  try {
    return await api.printEscPosNetwork(options);
  } catch (error) {
    return { ok: false, message: error?.message || 'Network print failed.' };
  }
}

/** Default ESC/POS port used by networked receipt printers. */
export async function getEscPosPort() {
  const api = electronApi();
  if (!api?.getEscPosPort) return 9100;
  try {
    return await api.getEscPosPort();
  } catch {
    return 9100;
  }
}

/** App metadata (version, platform). */
export async function getAppInfo() {
  const api = electronApi();
  if (!api?.getAppInfo) return null;
  try {
    return await api.getAppInfo();
  } catch {
    return null;
  }
}

/** Whether the app is registered to launch on system startup. */
export async function getAutoLaunch() {
  const api = electronApi();
  if (!api?.getAutoLaunch) return { enabled: false };
  try {
    return await api.getAutoLaunch();
  } catch {
    return { enabled: false };
  }
}

/** Registers / unregisters the app for launch on system startup. */
export async function setAutoLaunch(enabled) {
  const api = electronApi();
  if (!api?.setAutoLaunch) return { ok: false, error: 'Not available in the browser build.' };
  try {
    return await api.setAutoLaunch(enabled);
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not change the startup setting.' };
  }
}

/** Status of the background auto-sync engine. */
export async function getSyncStatus() {
  const api = electronApi();
  if (!api?.getSyncStatus) return null;
  try {
    return await api.getSyncStatus();
  } catch {
    return null;
  }
}

/** Hands the JWT to the main process so background sync can authenticate. */
export async function setSyncToken(token) {
  const api = electronApi();
  if (!api?.setSyncToken) return { ok: false };
  try {
    return await api.setSyncToken(token || '');
  } catch {
    return { ok: false };
  }
}

/** Reads the API endpoint configured for the desktop app. */
export async function getDesktopApiBase() {
  const api = electronApi();
  if (!api?.getApiBase) return null;
  try {
    return await api.getApiBase();
  } catch {
    return null;
  }
}

/** Stores the API endpoint so the renderer and the background sync agree. */
export async function setDesktopApiBase(url) {
  const api = electronApi();
  if (!api?.setApiBase) return { ok: false, apiBase: null };
  try {
    return await api.setApiBase(url);
  } catch {
    return { ok: false, apiBase: null };
  }
}

/** Forces an immediate sync pass of the offline queue. */
export async function flushSync() {
  const api = electronApi();
  if (!api?.flushSync) return { sent: 0, remaining: 0 };
  try {
    return await api.flushSync();
  } catch {
    return { sent: 0, remaining: 0 };
  }
}

// --- SQLite offline storage -----------------------------------------------

const sqliteApi = () => {
  const api = electronApi();
  return api?.sqlite || null;
};

export const sqlite = {
  available: () => Boolean(sqliteApi()),
  upsertProduct: async (product) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.upsertProduct(product);
  },
  getProductBySku: async (sku) => {
    const s = sqliteApi();
    if (!s) return null;
    return s.getProductBySku(sku);
  },
  getAllProducts: async () => {
    const s = sqliteApi();
    if (!s) return [];
    return s.getAllProducts();
  },
  queueSale: async (payload) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.queueSale(payload);
  },
  getQueuedSales: async () => {
    const s = sqliteApi();
    if (!s) return [];
    return s.getQueuedSales();
  },
  removeQueuedSale: async (id) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.removeQueuedSale(id);
  },
  getQueueCount: async () => {
    const s = sqliteApi();
    if (!s) return 0;
    return s.getQueueCount();
  },
  cacheSales: async (sales) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.cacheSales(sales);
  },
  getCachedSales: async () => {
    const s = sqliteApi();
    if (!s) return [];
    return s.getCachedSales();
  },
  setSyncMeta: async (key, value) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.setSyncMeta(key, value);
  },
  getSyncMeta: async (key) => {
    const s = sqliteApi();
    if (!s) return null;
    return s.getSyncMeta(key);
  },
  saveActiveCart: async (id, cart) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.saveActiveCart(id, cart);
  },
  getActiveCart: async (id) => {
    const s = sqliteApi();
    if (!s) return null;
    return s.getActiveCart(id);
  },
  getActiveCarts: async () => {
    const s = sqliteApi();
    if (!s) return [];
    return s.getActiveCarts();
  },
  removeActiveCart: async (id) => {
    const s = sqliteApi();
    if (!s) return { ok: false };
    return s.removeActiveCart(id);
  },
};
