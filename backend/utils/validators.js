const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Validates and normalizes store settings updates (currency, tax, low-stock).
function validateSettingsInput(body = {}) {
  const value = {};

  if (body.currencySymbol !== undefined) {
    const symbol = String(body.currencySymbol).trim();
    if (!symbol || symbol.length > 8) {
      return { ok: false, error: 'Currency symbol must be 1-8 characters.' };
    }
    value.currencySymbol = symbol;
  }

  if (body.currencyCode !== undefined) {
    const code = String(body.currencyCode).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      return { ok: false, error: 'Currency code must be a 3-letter ISO code (e.g. USD).' };
    }
    value.currencyCode = code;
  }

  if (body.taxRate !== undefined) {
    const tax = Number(body.taxRate);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      return { ok: false, error: 'Tax rate must be a number between 0 and 100.' };
    }
    value.taxRate = round2(tax);
  }

  if (body.lowStockThreshold !== undefined) {
    const threshold = Number(body.lowStockThreshold);
    if (!Number.isInteger(threshold) || threshold < 0) {
      return { ok: false, error: 'Low stock threshold must be a whole number of 0 or more.' };
    }
    value.lowStockThreshold = threshold;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'No valid settings provided.' };
  }

  return { ok: true, value };
}

module.exports = { escapeRegex, round2, validateSettingsInput };
