// Background auto-sync engine for the desktop app.
//
// Watches for network availability and pushes queued offline sales to the
// MongoDB-backed API as soon as the connection is restored. Runs inside the
// Electron main process so syncing continues even while the window is closed
// or the UI is busy.

const net = require('net');

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_API = 'http://localhost:5000/api';

let timer = null;
let running = false;
let lastError = null;
let lastSyncAt = null;
let authToken = '';

/** Stores the JWT used to authenticate background sync requests. */
function setAuthToken(token) {
  authToken = token || '';
}

function getAuthToken() {
  return authToken;
}

function getApiBase() {
  return process.env.OPENPOS_API_URL || DEFAULT_API;
}

/** Cheap reachability probe against the API host. */
function isBackendReachable(timeoutMs = 3000, apiBaseOverride) {
  const apiBase = apiBaseOverride || getApiBase();
  let url;
  try {
    url = new URL(apiBase);
  } catch {
    return Promise.resolve(false);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.resolve(false);
  }
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  const host = url.hostname;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Pushes every queued sale to the API.
 * @param {object} deps { getQueuedSales, removeQueuedSale, getApiBase }
 */
async function syncQueuedSales(deps) {
  const { getQueuedSales, removeQueuedSale } = deps;
  const apiBase = deps.getApiBase ? deps.getApiBase() : getApiBase();

  // Never ship the auth token or queued sales to a non-HTTP(S) target.
  let target;
  try {
    target = new URL(apiBase);
  } catch {
    return { sent: 0, dropped: 0, remaining: 0, error: 'Invalid API base URL.' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { sent: 0, dropped: 0, remaining: 0, error: 'Unsupported API base URL.' };
  }

  const queued = await getQueuedSales();
  if (!queued.length) return { sent: 0, dropped: 0, remaining: 0 };

  const headers = { 'Content-Type': 'application/json' };
  const token = deps.getAuthToken ? deps.getAuthToken() : getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let sent = 0;
  let dropped = 0;

  for (const entry of queued) {
    try {
      const response = await fetch(`${apiBase}/sales`, {
        method: 'POST',
        headers,
        body: JSON.stringify(entry.payload),
      });
      if (!response.ok) {
        // 401/403 — the token is missing or expired. Keep the queue intact so
        // the sale is retried once the cashier signs in again.
        if (response.status === 401 || response.status === 403) break;
        // Other 4xx means the payload is rejected — drop it so the queue cannot
        // wedge; 5xx / network errors keep the sale queued for the next pass.
        if (response.status >= 400 && response.status < 500) {
          await removeQueuedSale(entry.key);
          dropped += 1;
          continue;
        }
        break;
      }
      await removeQueuedSale(entry.key);
      sent += 1;
    } catch {
      break; // still offline — keep the queue intact
    }
  }

  return { sent, dropped, remaining: queued.length - sent - dropped };
}

function startAutoSync(deps, options = {}) {
  stopAutoSync();
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Probe the SAME endpoint the sync will use — the configured API base
      // (not the environment default) — otherwise a custom server would never
      // be reached.
      const apiBase = deps.getApiBase ? deps.getApiBase() : getApiBase();
      const reachable = await isBackendReachable(3000, apiBase);
      if (!reachable) return;
      const result = await syncQueuedSales(deps);
      lastSyncAt = Date.now();
      if (result.sent > 0) {
        console.log(`[autosync] pushed ${result.sent} queued sale(s) to the server.`);
      }
      lastError = null;
    } catch (error) {
      lastError = error?.message || String(error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick();
}

function stopAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getSyncStatus() {
  return { running, lastError, lastSyncAt };
}

module.exports = {
  startAutoSync,
  stopAutoSync,
  syncQueuedSales,
  isBackendReachable,
  getSyncStatus,
  setAuthToken,
  getAuthToken,
};
