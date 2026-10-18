const Setting = require('../models/Setting');

// Checks a product against the store low-stock threshold. Logs an alert and
// optionally POSTs it to LOW_STOCK_WEBHOOK_URL (Slack/Discord/generic JSON).
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

    const webhookUrl = process.env.LOW_STOCK_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      }).catch((error) => console.error('Low-stock webhook failed:', error.message));
    }

    return alert;
  } catch (error) {
    console.error('Low-stock check failed:', error.message);
    return null;
  }
}

async function checkLowStockBulk(products = []) {
  const alerts = [];
  for (const product of products) {
    const alert = await checkLowStock(product);
    if (alert) alerts.push(alert);
  }
  return alerts;
}

module.exports = { checkLowStock, checkLowStockBulk };
