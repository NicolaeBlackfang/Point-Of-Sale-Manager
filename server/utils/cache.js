// Lightweight in-memory TTL cache for hot master data (store settings,
// category lists, catalog search results). No external dependencies.

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires && entry.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = 0) {
  store.set(key, { value, expires: ttlMs > 0 ? Date.now() + ttlMs : 0 });
  return value;
}

// Returns the cached value, otherwise loads it once and caches the result.
async function wrap(key, ttlMs, loader) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  if (value !== undefined) set(key, value, ttlMs);
  return value;
}

// Drops every entry whose key starts with the given prefix ('' clears all).
function invalidate(prefix = '') {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function size() {
  return store.size;
}

module.exports = { get, set, wrap, invalidate, size };
