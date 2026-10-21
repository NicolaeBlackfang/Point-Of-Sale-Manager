const Setting = require('../models/Setting');
const { sendSettingsEmail } = require('./mailer');
const { isSafeOutboundUrl, assertPublicHost } = require('./security');

// Hard cap on how long the server waits for a webhook to answer. A slow
// endpoint must never hold a worker (or the checkout response) hostage.
const WEBHOOK_TIMEOUT_MS = 5000;

// POSTs a low-stock alert to the configured webhook (settings first, then the
// legacy LOW_STOCK_WEBHOOK_URL environment variable as a fallback).
//
// The URL is validated before the request is made: only public http(s)
// endpoints are allowed, redirects are refused (a redirect could otherwise
// bounce the request into the private network) and the call is time-boxed.
async function postWebhook(webhookUrl, payload) {
  const safe = isSafeOutboundUrl(webhookUrl);
  if (!safe.ok) {
    console.error('Low-stock webhook blocked: %s', safe.error);
    return false;
  }

  const publicHost = await assertPublicHost(safe.url);
  if (!publicHost.ok) {
    console.error('Low-stock webhook blocked: %s', publicHost.error);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(safe.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error('Low-stock webhook responded with status', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Low-stock webhook failed:', error.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Checks a product against the store low-stock threshold. Logs an alert and
// POSTs it to the configured webhook (Slack/Discord/generic JSON).
async function checkLowStock(product) {
  try {
    if (!product) return null;

    const settings = await Setting.getSettings();
    const threshold = settings.lowStockThreshold ?? 5;

    if (product.stockQuantity > threshold) return null;

    const alert = {
      type: 'low_stock',
      sku: product.sku,
      name: product.name,
      stockQuantity: product.stockQuantity,
      threshold,
      branchNumber: product.branchNumber,
      currency: settings.currencyCode,
      at: new Date().toISOString(),
    };

    console.warn(
      `[LOW-STOCK] ${product.sku} (${product.name}) has ${product.stockQuantity} unit(s) left (threshold ${threshold})`
    );

    const webhookUrl = settings.webhookUrl || process.env.LOW_STOCK_WEBHOOK_URL;
    if (webhookUrl) {
      // Fire and forget — never block the caller on the webhook.
      postWebhook(webhookUrl, alert).catch((error) =>
        console.error('Low-stock webhook failed:', error.message)
      );
    }

    return alert;
  } catch (error) {
    console.error('Low-stock check failed:', error.message);
    return null;
  }
}

// Same per-product checks, plus ONE digest e-mail for the whole batch so a
// checkout never triggers an e-mail storm. Never throws.
async function checkLowStockBulk(products = []) {
  const alerts = [];
  for (const product of products) {
    const alert = await checkLowStock(product);
    if (alert) alerts.push(alert);
  }

  if (alerts.length > 0) {
    // Fire-and-forget: SMTP latency must never delay the checkout response.
    sendLowStockDigest(alerts).catch((error) =>
      console.error('Low-stock digest failed:', error.message)
    );
  }

  return alerts;
}

async function sendLowStockDigest(alerts) {
  const settings = await Setting.getSettings();
  if (!settings.lowStockEmailEnabled || alerts.length === 0) return;

  const lines = alerts.map(
    (a) =>
      `- ${a.sku} ${a.name}: ${a.stockQuantity} left (threshold ${a.threshold})${
        a.branchNumber ? ` [branch ${a.branchNumber}]` : ''
      }`
  );
  const text = [
    `Low stock alert: ${alerts.length} product(s) at or below threshold.`,
    '',
    ...lines,
    '',
    `Store: ${settings.currencyCode} settings, ${new Date().toISOString()}`,
  ].join('\n');

  await sendSettingsEmail(settings, {
    subject: `Low stock: ${alerts.length} product(s) need restocking`,
    text,
    enabled: true,
  });
}

module.exports = { checkLowStock, checkLowStockBulk, sendLowStockDigest, postWebhook };
