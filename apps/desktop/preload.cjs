const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,

  // --- printing ---
  printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
  printHtml: (options) => ipcRenderer.invoke('print-html', options),
  printEscPosNetwork: (options) => ipcRenderer.invoke('print-escpos-network', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getEscPosPort: () => ipcRenderer.invoke('get-escpos-port'),

  // --- app / desktop settings ---
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getAutoLaunch: () => ipcRenderer.invoke('desktop:getAutoLaunch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('desktop:setAutoLaunch', enabled),

  // --- sync engine ---
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  setSyncToken: (token) => ipcRenderer.invoke('sync:setToken', token),
  flushSync: () => ipcRenderer.invoke('sync:flush'),

  // --- API endpoint ---
  getApiBase: () => ipcRenderer.invoke('settings:getApiBase'),
  setApiBase: (url) => ipcRenderer.invoke('settings:setApiBase', url),

  // --- SQLite offline store ---
  sqlite: {
    upsertProduct: (product) => ipcRenderer.invoke('sqlite:upsertProduct', product),
    getProductBySku: (sku) => ipcRenderer.invoke('sqlite:getProductBySku', sku),
    getAllProducts: () => ipcRenderer.invoke('sqlite:getAllProducts'),
    queueSale: (payload) => ipcRenderer.invoke('sqlite:queueSale', payload),
    getQueuedSales: () => ipcRenderer.invoke('sqlite:getQueuedSales'),
    removeQueuedSale: (id) => ipcRenderer.invoke('sqlite:removeQueuedSale', id),
    getQueueCount: () => ipcRenderer.invoke('sqlite:getQueueCount'),
    cacheSales: (sales) => ipcRenderer.invoke('sqlite:cacheSales', sales),
    getCachedSales: () => ipcRenderer.invoke('sqlite:getCachedSales'),
    setSyncMeta: (key, value) => ipcRenderer.invoke('sqlite:setSyncMeta', key, value),
    getSyncMeta: (key) => ipcRenderer.invoke('sqlite:getSyncMeta', key),
    saveActiveCart: (id, cart) => ipcRenderer.invoke('sqlite:saveActiveCart', id, cart),
    getActiveCart: (id) => ipcRenderer.invoke('sqlite:getActiveCart', id),
    getActiveCarts: () => ipcRenderer.invoke('sqlite:getActiveCarts'),
    removeActiveCart: (id) => ipcRenderer.invoke('sqlite:removeActiveCart', id),
  },
});
