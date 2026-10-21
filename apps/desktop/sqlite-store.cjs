// SQLite offline storage for the Electron desktop app.
//
// Uses node-sqlite3-wasm (a WebAssembly build of SQLite) so the exact same
// module works unchanged in plain Node.js (unit tests, CLI tooling) and inside
// Electron — no native rebuild / ABI juggling required.
const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

let db = null;

function getDbPath(app) {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'openpos-offline.db');
}

function initDb(app) {
  if (db) return db;
  const dbPath = getDbPath(app);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      price REAL,
      stockQuantity INTEGER,
      branchNumber INTEGER,
      imageUrl TEXT,
      data TEXT,
      cachedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS sales_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT,
      queuedAt INTEGER,
      synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sales_cache (
      id TEXT PRIMARY KEY,
      data TEXT,
      cachedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS active_carts (
      id TEXT PRIMARY KEY,
      data TEXT,
      updatedAt INTEGER
    );
  `);
  return db;
}

function upsertProduct(product) {
  if (!db || !product) return;
  db.run(
    `INSERT OR REPLACE INTO products (id, sku, name, price, stockQuantity, branchNumber, imageUrl, data, cachedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      product._id || product.id || product.sku,
      String(product.sku || '').toUpperCase(),
      product.name || '',
      Number(product.price || 0),
      Number(product.stockQuantity || 0),
      Number(product.branchNumber || 0),
      product.imageUrl || '',
      JSON.stringify(product),
      Date.now(),
    ]
  );
}

function getProductBySku(sku) {
  if (!db || !sku) return null;
  const row = db.get('SELECT data FROM products WHERE sku = ?', [String(sku).toUpperCase()]);
  return row ? JSON.parse(row.data) : null;
}

function getAllProducts() {
  if (!db) return [];
  const rows = db.all('SELECT data FROM products ORDER BY name ASC');
  return rows.map((r) => JSON.parse(r.data));
}

function queueSale(payload) {
  if (!db || !payload) return null;
  const info = db.run('INSERT INTO sales_queue (payload, queuedAt, synced) VALUES (?, ?, 0)', [
    JSON.stringify(payload),
    Date.now(),
  ]);
  return info.lastInsertRowid;
}

function getQueuedSales() {
  if (!db) return [];
  const rows = db.all(
    'SELECT id, payload, queuedAt FROM sales_queue WHERE synced = 0 ORDER BY id ASC'
  );
  return rows.map((r) => ({ key: r.id, payload: JSON.parse(r.payload), queuedAt: r.queuedAt }));
}

function removeQueuedSale(id) {
  if (!db) return;
  db.run('DELETE FROM sales_queue WHERE id = ?', [id]);
}

function getQueueCount() {
  if (!db) return 0;
  const row = db.get('SELECT COUNT(*) as c FROM sales_queue WHERE synced = 0');
  return row ? Number(row.c) : 0;
}

function cacheSales(sales) {
  if (!db || !Array.isArray(sales)) return;
  db.exec('BEGIN');
  try {
    db.run('DELETE FROM sales_cache');
    sales.slice(0, 50).forEach((s) => {
      if (s && s._id) {
        db.run('INSERT OR REPLACE INTO sales_cache (id, data, cachedAt) VALUES (?, ?, ?)', [
          s._id,
          JSON.stringify(s),
          Date.now(),
        ]);
      }
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getCachedSales() {
  if (!db) return [];
  const rows = db.all('SELECT data FROM sales_cache ORDER BY cachedAt DESC');
  const sales = rows.map((r) => JSON.parse(r.data));
  return sales.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function setSyncMeta(key, value) {
  if (!db) return;
  db.run('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]);
}

function getSyncMeta(key) {
  if (!db) return null;
  const row = db.get('SELECT value FROM sync_meta WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

// An in-progress cart is persisted so a cashier can close the app mid-sale
// (or lose power) without losing the basket.
function saveActiveCart(id, cart) {
  if (!db || !id) return;
  db.run('INSERT OR REPLACE INTO active_carts (id, data, updatedAt) VALUES (?, ?, ?)', [
    String(id),
    JSON.stringify(cart || {}),
    Date.now(),
  ]);
}

function getActiveCart(id) {
  if (!db || !id) return null;
  const row = db.get('SELECT data FROM active_carts WHERE id = ?', [String(id)]);
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function getActiveCarts() {
  if (!db) return [];
  return db
    .all('SELECT id, data, updatedAt FROM active_carts ORDER BY updatedAt DESC')
    .map((r) => ({
      id: r.id,
      cart: JSON.parse(r.data),
      updatedAt: r.updatedAt,
    }));
}

function removeActiveCart(id) {
  if (!db || !id) return;
  db.run('DELETE FROM active_carts WHERE id = ?', [String(id)]);
}

module.exports = {
  initDb,
  upsertProduct,
  getProductBySku,
  getAllProducts,
  queueSale,
  getQueuedSales,
  removeQueuedSale,
  getQueueCount,
  cacheSales,
  getCachedSales,
  setSyncMeta,
  getSyncMeta,
  saveActiveCart,
  getActiveCart,
  getActiveCarts,
  removeActiveCart,

  // Test-only helpers so the unit tests can point the module at a temporary
  // database instead of the real user profile.
  __setDbForTests: (handle) => {
    db = handle;
  },
  __resetDbForTests: () => {
    db = null;
  },
};
