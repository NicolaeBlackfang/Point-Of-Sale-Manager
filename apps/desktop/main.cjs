const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sqliteStore = require('./sqlite-store.cjs');
const printers = require('./printers.cjs');
const syncEngine = require('./sync-engine.cjs');

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || '';
const productionIndex = path.join(__dirname, '../web/dist/index.html');
let mainWindow = null;

// ---------------------------------------------------------------------------
// API endpoint
//
// The renderer and the background sync engine must talk to the same server,
// so the configured base URL is stored once (in the SQLite sync_meta table)
// and read back by both sides.
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE = 'http://localhost:5000/api';
const API_BASE_KEY = 'apiBase';

/**
 * Only http(s) endpoints are accepted: the sync engine sends the session
 * token and queued sales to this address, so a `file://` or `javascript:`
 * value must never be stored.
 */
function normalizeApiBase(url) {
  const next = (url || '').trim().replace(/\/+$/, '');
  if (!next) return '';
  let parsed;
  try {
    parsed = new URL(next);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  return next;
}

function getApiBase() {
  const stored = sqliteStore.getSyncMeta(API_BASE_KEY);
  if (stored) {
    const normalized = normalizeApiBase(stored);
    if (normalized) return normalized;
  }
  return normalizeApiBase(process.env.OPENPOS_API_URL) || DEFAULT_API_BASE;
}

function setApiBase(url) {
  const next = normalizeApiBase(url);
  if (!next) return getApiBase();
  sqliteStore.setSyncMeta(API_BASE_KEY, next);
  return next;
}

// ---------------------------------------------------------------------------
// Persistent window bounds
// ---------------------------------------------------------------------------

const boundsFile = () => path.join(app.getPath('userData'), 'window-bounds.json');

function readSavedBounds() {
  try {
    const file = boundsFile();
    if (!fs.existsSync(file)) return null;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!saved || !saved.width || !saved.height) return null;
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    // Ignore bounds that no longer fit on the attached display.
    if (saved.width > width || saved.height > height) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(boundsFile(), JSON.stringify(mainWindow.getBounds()));
  } catch {
    /* ignore write failures (read-only profile) */
  }
}

// ---------------------------------------------------------------------------
// Navigation hardening
//
// The renderer runs the POS UI, but it must never be able to hand the window
// (and with it the preload bridge: offline database, sync token, printer
// access) over to a remote page. New windows are denied outright and
// navigation away from the app origin is blocked; genuine http(s) links are
// opened in the system browser instead.
// ---------------------------------------------------------------------------

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isAppOrigin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') {
      // The packaged UI is loaded from disk — only files inside the bundle
      // are acceptable.
      return parsed.pathname.startsWith(path.join(__dirname, '../web/dist'));
    }
    if (!devServerUrl) return false;
    const dev = new URL(devServerUrl);
    return parsed.origin === dev.origin;
  } catch {
    return false;
  }
}

function hardenWebContents(contents) {
  // No new windows: a remote page opened with window.open() would inherit
  // the preload bridge.
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      /* ignore malformed URLs */
    }
    return { action: 'deny' };
  });

  // The window itself may only ever show the bundled application.
  contents.on('will-navigate', (event, url) => {
    if (!isAppOrigin(url)) {
      event.preventDefault();
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (!isAppOrigin(url)) {
      event.preventDefault();
    }
  });

  // <webview> is never used by OpenPOS.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const saved = readSavedBounds();

  mainWindow = new BrowserWindow({
    width: saved?.width || 1280,
    height: saved?.height || 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f8fafc',
    title: 'OpenPOS',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      webviewTag: false,
    },
  });

  hardenWebContents(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => {
    if (saved?.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  if (devServerUrl && (isDev || process.env.OPENPOS_FORCE_DEV === '1')) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else if (fs.existsSync(productionIndex)) {
    // Packaged app (or a local build) — load the compiled bundle from disk.
    mainWindow.loadFile(productionIndex);
  } else {
    mainWindow.loadURL(devServerUrl || 'http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', saveWindowBounds);
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App menu
// ---------------------------------------------------------------------------

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Developer tools are a development aid only — they are not exposed
        // in a packaged build.
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'OpenPOS Desktop',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('navigate', 'settings');
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  try {
    sqliteStore.initDb(app);
  } catch (e) {
    console.error('Failed to init SQLite:', e.message);
  }

  createWindow();
  buildMenu();

  // Background auto-sync: pushes queued offline sales to the API whenever
  // the backend becomes reachable again.
  try {
    syncEngine.startAutoSync(
      {
        getQueuedSales: () => sqliteStore.getQueuedSales(),
        removeQueuedSale: (id) => sqliteStore.removeQueuedSale(id),
        getApiBase: () => getApiBase(),
      },
      { intervalMs: 30_000 }
    );
  } catch (e) {
    console.error('Failed to start auto-sync engine:', e.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  syncEngine.stopAutoSync();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', saveWindowBounds);

// ---------------------------------------------------------------------------
// IPC — printing
// ---------------------------------------------------------------------------

ipcMain.handle('print-receipt', async (event, options = {}) => {
  if (!mainWindow) return { ok: false, message: 'No window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent === true,
        printBackground: true,
        deviceName: options.deviceName || '',
      },
      (success, errorType) => {
        if (!success) resolve({ ok: false, message: errorType || 'Print failed' });
        else resolve({ ok: true, message: 'Printed' });
      }
    );
  });
});

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return printers.listPrinters(mainWindow.webContents);
});

ipcMain.handle('print-html', async (event, options = {}) => printers.printHtml(options));

ipcMain.handle('print-escpos-network', async (event, options = {}) =>
  printers.printEscPosOverNetwork(options)
);

ipcMain.handle('get-escpos-port', () => printers.DEFAULT_ESC_POS_PORT);

// ---------------------------------------------------------------------------
// IPC — app / desktop settings
// ---------------------------------------------------------------------------

ipcMain.handle('get-app-path', () => app.getPath('userData'));

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  name: app.getName(),
}));

/** Auto-launch the app when the system starts. */
ipcMain.handle('desktop:getAutoLaunch', () => {
  try {
    const settings = app.getLoginItemSettings();
    return { enabled: Boolean(settings.openAtLogin) };
  } catch {
    return { enabled: false };
  }
});

ipcMain.handle('desktop:setAutoLaunch', (event, enabled) => {
  try {
    if (process.platform === 'linux') {
      // `openAtLogin` is not supported on Linux desktops — use the
      // .desktop autostart entry in the XDG config directory instead.
      const dir = path.join(app.getPath('home'), '.config', 'autostart');
      const entry = path.join(dir, 'openpos.desktop');
      if (enabled) {
        fs.mkdirSync(dir, { recursive: true });
        const exec = process.env.APPIMAGE || process.execPath;
        fs.writeFileSync(
          entry,
          [
            '[Desktop Entry]',
            'Type=Application',
            'Name=OpenPOS',
            `Exec=${exec} --hidden`,
            'X-GNOME-Autostart-enabled=true',
            'Terminal=false',
            'Comment=OpenPOS Point of Sale',
            '',
          ].join('\n')
        );
        return { ok: true, enabled: true };
      }
      if (fs.existsSync(entry)) fs.unlinkSync(entry);
      return { ok: true, enabled: false };
    }

    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: Boolean(enabled) && process.platform === 'darwin',
    });
    return { ok: true, enabled: Boolean(enabled) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------------------------------------------------------------------------
// IPC — sync engine
// ---------------------------------------------------------------------------

ipcMain.handle('sync:status', () => syncEngine.getSyncStatus());

ipcMain.handle('sync:setToken', (event, token) => {
  syncEngine.setAuthToken(token);
  return { ok: true };
});

ipcMain.handle('sync:flush', async () => {
  const result = await syncEngine.syncQueuedSales({
    getQueuedSales: () => sqliteStore.getQueuedSales(),
    removeQueuedSale: (id) => sqliteStore.removeQueuedSale(id),
    getApiBase: () => getApiBase(),
  });
  return result;
});

// ---------------------------------------------------------------------------
// IPC — API endpoint (shared by the renderer and the background sync engine)
// ---------------------------------------------------------------------------

ipcMain.handle('settings:getApiBase', () => getApiBase());

ipcMain.handle('settings:setApiBase', (event, url) => {
  const next = setApiBase(url);
  if (!next || next !== normalizeApiBase(url)) {
    return { ok: false, error: 'Enter a valid http:// or https:// API address.', apiBase: getApiBase() };
  }
  return { ok: true, apiBase: next };
});

// ---------------------------------------------------------------------------
// IPC — SQLite offline store
// ---------------------------------------------------------------------------

ipcMain.handle('sqlite:upsertProduct', async (event, product) => {
  try {
    sqliteStore.upsertProduct(product);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getProductBySku', async (event, sku) => {
  try {
    return sqliteStore.getProductBySku(sku);
  } catch {
    return null;
  }
});
ipcMain.handle('sqlite:getAllProducts', async () => {
  try {
    return sqliteStore.getAllProducts();
  } catch {
    return [];
  }
});
ipcMain.handle('sqlite:queueSale', async (event, payload) => {
  try {
    const id = sqliteStore.queueSale(payload);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getQueuedSales', async () => {
  try {
    return sqliteStore.getQueuedSales();
  } catch {
    return [];
  }
});
ipcMain.handle('sqlite:removeQueuedSale', async (event, id) => {
  try {
    sqliteStore.removeQueuedSale(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getQueueCount', async () => {
  try {
    return sqliteStore.getQueueCount();
  } catch {
    return 0;
  }
});
ipcMain.handle('sqlite:cacheSales', async (event, sales) => {
  try {
    sqliteStore.cacheSales(sales);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getCachedSales', async () => {
  try {
    return sqliteStore.getCachedSales();
  } catch {
    return [];
  }
});
ipcMain.handle('sqlite:setSyncMeta', async (event, key, value) => {
  try {
    sqliteStore.setSyncMeta(key, value);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getSyncMeta', async (event, key) => {
  try {
    return sqliteStore.getSyncMeta(key);
  } catch {
    return null;
  }
});
ipcMain.handle('sqlite:saveActiveCart', async (event, id, cart) => {
  try {
    sqliteStore.saveActiveCart(id, cart);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('sqlite:getActiveCart', async (event, id) => {
  try {
    return sqliteStore.getActiveCart(id);
  } catch {
    return null;
  }
});
ipcMain.handle('sqlite:getActiveCarts', async () => {
  try {
    return sqliteStore.getActiveCarts();
  } catch {
    return [];
  }
});
ipcMain.handle('sqlite:removeActiveCart', async (event, id) => {
  try {
    sqliteStore.removeActiveCart(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
