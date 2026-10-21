const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// The Electron main-process modules are plain CommonJS so they can be unit
// tested without booting Electron.
const sqliteStore = require('../../apps/desktop/sqlite-store.cjs');
const syncEngine = require('../../apps/desktop/sync-engine.cjs');

// ---------------------------------------------------------------------------
// SQLite offline store
// ---------------------------------------------------------------------------

// sqliteStore keeps a module-level handle; swap it for a temp database.
function withTempDb(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpos-sqlite-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const { Database } = require('node-sqlite3-wasm');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT, price REAL,
      stockQuantity INTEGER, branchNumber INTEGER, imageUrl TEXT, data TEXT, cachedAt INTEGER
    );
    CREATE TABLE sales_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, queuedAt INTEGER, synced INTEGER DEFAULT 0
    );
    CREATE TABLE sales_cache (id TEXT PRIMARY KEY, data TEXT, cachedAt INTEGER);
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE active_carts (id TEXT PRIMARY KEY, data TEXT, updatedAt INTEGER);
  `);
  // Point the module at the temp database.
  sqliteStore.__setDbForTests(db);
  try {
    return fn();
  } finally {
    sqliteStore.__resetDbForTests();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('sqlite store: products can be upserted and read back by SKU', () => {
  withTempDb(() => {
    sqliteStore.upsertProduct({
      _id: 'p1',
      sku: 'sku-001',
      name: 'Test Product',
      price: 9.99,
      stockQuantity: 12,
      branchNumber: 1,
    });

    const found = sqliteStore.getProductBySku('sku-001');
    assert.ok(found, 'product should be found (SKU is normalised to upper case)');
    assert.equal(found.name, 'Test Product');
    assert.equal(found.price, 9.99);
    assert.equal(found.stockQuantity, 12);
  });
});

test('sqlite store: unknown SKU returns null', () => {
  withTempDb(() => {
    assert.equal(sqliteStore.getProductBySku('nope'), null);
  });
});

test('sqlite store: queued sales are returned in FIFO order and counted', () => {
  withTempDb(() => {
    sqliteStore.queueSale({ totalAmount: 10, items: [] });
    sqliteStore.queueSale({ totalAmount: 20, items: [] });

    const queued = sqliteStore.getQueuedSales();
    assert.equal(queued.length, 2);
    assert.equal(queued[0].payload.totalAmount, 10);
    assert.equal(queued[1].payload.totalAmount, 20);
    assert.equal(sqliteStore.getQueueCount(), 2);

    sqliteStore.removeQueuedSale(queued[0].key);
    assert.equal(sqliteStore.getQueueCount(), 1);
    assert.equal(sqliteStore.getQueuedSales()[0].payload.totalAmount, 20);
  });
});

test('sqlite store: recent sales cache keeps the newest entries', () => {
  withTempDb(() => {
    sqliteStore.cacheSales([
      { _id: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
      { _id: 's2', createdAt: '2026-02-01T00:00:00.000Z' },
    ]);
    const cached = sqliteStore.getCachedSales();
    assert.equal(cached.length, 2);
    assert.equal(cached[0]._id, 's2', 'newest sale first');
  });
});

test('sqlite store: sync metadata round-trips', () => {
  withTempDb(() => {
    sqliteStore.setSyncMeta('apiBase', 'https://pos.example.com/api');
    assert.equal(sqliteStore.getSyncMeta('apiBase'), 'https://pos.example.com/api');
    assert.equal(sqliteStore.getSyncMeta('missing'), null);
  });
});

test('sqlite store: an active cart is saved, restored and removed', () => {
  withTempDb(() => {
    const cart = {
      items: [{ _id: 'p1', name: 'Test Product', price: 5, quantity: 2 }],
      customerName: 'Jane',
      paymentMethod: 'card',
    };
    sqliteStore.saveActiveCart('cart-1', cart);

    const restored = sqliteStore.getActiveCart('cart-1');
    assert.ok(restored, 'the cart should be restored');
    assert.equal(restored.items.length, 1);
    assert.equal(restored.items[0].name, 'Test Product');
    assert.equal(restored.customerName, 'Jane');
    assert.equal(restored.paymentMethod, 'card');

    const all = sqliteStore.getActiveCarts();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'cart-1');

    sqliteStore.removeActiveCart('cart-1');
    assert.equal(sqliteStore.getActiveCart('cart-1'), null);
    assert.equal(sqliteStore.getActiveCarts().length, 0);
  });
});

test('sqlite store: saving the same cart id overwrites the previous basket', () => {
  withTempDb(() => {
    sqliteStore.saveActiveCart('cart-1', { items: [{ name: 'A' }] });
    sqliteStore.saveActiveCart('cart-1', { items: [{ name: 'A' }, { name: 'B' }] });

    const restored = sqliteStore.getActiveCart('cart-1');
    assert.equal(restored.items.length, 2);
    assert.equal(sqliteStore.getActiveCarts().length, 1);
  });
});

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

test('sync engine: pushes queued sales and removes them on success', async () => {
  const posted = [];
  const removed = [];
  const queued = [
    { key: 1, payload: { totalAmount: 10 } },
    { key: 2, payload: { totalAmount: 20 } },
  ];

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    posted.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => queued,
      removeQueuedSale: async (id) => removed.push(id),
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 2);
    assert.equal(result.remaining, 0);
    assert.deepEqual(removed, [1, 2]);
    assert.equal(posted.length, 2);
    assert.equal(posted[0].url, 'http://localhost:5000/api/sales');
    assert.equal(posted[0].body.totalAmount, 10);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync engine: stops on network failure and keeps the queue intact', async () => {
  const removed = [];

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Network Error');
  };

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [
        { key: 1, payload: { totalAmount: 10 } },
        { key: 2, payload: { totalAmount: 20 } },
      ],
      removeQueuedSale: async (id) => removed.push(id),
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 0);
    assert.equal(result.remaining, 2);
    assert.deepEqual(removed, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync engine: 4xx responses drop the rejected sale and continue', async () => {
  const removed = [];

  const originalFetch = global.fetch;
  let call = 0;
  global.fetch = async () => {
    call += 1;
    return call === 1
      ? { ok: false, status: 400 }
      : { ok: true, status: 201 };
  };

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [
        { key: 1, payload: { totalAmount: 10 } },
        { key: 2, payload: { totalAmount: 20 } },
      ],
      removeQueuedSale: async (id) => removed.push(id),
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 1);
    assert.equal(result.dropped, 1);
    assert.deepEqual(removed, [1, 2]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync engine: 401 keeps the sale queued so it retries after sign-in', async () => {
  const removed = [];

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401 });

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [{ key: 1, payload: { totalAmount: 10 } }],
      removeQueuedSale: async (id) => removed.push(id),
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 0);
    assert.equal(result.dropped, 0);
    assert.equal(result.remaining, 1);
    assert.deepEqual(removed, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync engine: the auth token is sent as a Bearer header', async () => {
  const seen = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    seen.push(options.headers);
    return { ok: true, status: 201 };
  };

  try {
    syncEngine.setAuthToken('test-token-123');
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [{ key: 1, payload: { totalAmount: 10 } }],
      removeQueuedSale: async () => {},
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 1);
    assert.equal(seen[0].Authorization, 'Bearer test-token-123');
  } finally {
    syncEngine.setAuthToken('');
    global.fetch = originalFetch;
  }
});

test('sync engine: 5xx responses keep the sale queued for the next pass', async () => {
  const removed = [];

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [{ key: 1, payload: { totalAmount: 10 } }],
      removeQueuedSale: async (id) => removed.push(id),
      getApiBase: () => 'http://localhost:5000/api',
    });

    assert.equal(result.sent, 0);
    assert.equal(result.remaining, 1);
    assert.deepEqual(removed, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync engine: an empty queue is a no-op', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('should not be called');
  };

  try {
    const result = await syncEngine.syncQueuedSales({
      getQueuedSales: async () => [],
      removeQueuedSale: async () => {},
      getApiBase: () => 'http://localhost:5000/api',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.remaining, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
