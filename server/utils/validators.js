const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const { isSafeOutboundUrl, isValidSmtpHost } = require('./security');

// Control characters (CR/LF) are never valid inside SMTP settings.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Frontend mirror: tax = subtotal * rate / 100, rounded to 2 decimals.
const taxAmountFor = (subtotal, rate) =>
  round2((Number(subtotal || 0) * Number(rate || 0)) / 100);

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

  if (body.timezone !== undefined) {
    const tz = String(body.timezone).trim();
    const { isValidTimezone } = require('./timezone');
    if (!isValidTimezone(tz)) {
      return { ok: false, error: 'Timezone must be a valid IANA timezone (e.g. UTC, Europe/Berlin).' };
    }
    value.timezone = tz;
  }

  if (body.webhookUrl !== undefined) {
    const url = String(body.webhookUrl).trim();
    if (!url) {
      value.webhookUrl = '';
    } else {
      // The server POSTs to this URL on its own behalf, so only public
      // http(s) endpoints are accepted (blocks SSRF into the private network
      // or a cloud metadata service).
      const safe = isSafeOutboundUrl(url);
      if (!safe.ok) {
        return { ok: false, error: `Webhook URL is not allowed: ${safe.error}` };
      }
      if (url.length > 500) {
        return { ok: false, error: 'Webhook URL is too long (max 500 characters).' };
      }
      value.webhookUrl = url;
    }
  }

  if (body.smtpHost !== undefined) {
    const host = String(body.smtpHost).trim();
    if (!host) {
      value.smtpHost = '';
    } else if (!isValidSmtpHost(host)) {
      return {
        ok: false,
        error: 'SMTP host must be a valid host name or IP address (no scheme, port or path).',
      };
    } else {
      value.smtpHost = host;
    }
  }

  if (body.smtpPort !== undefined) {
    const port = Number(body.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: 'SMTP port must be a whole number between 1 and 65535.' };
    }
    value.smtpPort = port;
  }

  if (body.smtpUser !== undefined) {
    // The user name ends up in the SMTP envelope/commands, so control
    // characters (CR/LF) must never survive validation.
    const user = String(body.smtpUser).trim();
    if (user.length > 255) {
      return { ok: false, error: 'SMTP user is too long (max 255 characters).' };
    }
    if (CONTROL_CHARS.test(user)) {
      return { ok: false, error: 'SMTP user must not contain control characters.' };
    }
    value.smtpUser = user;
  }

  if (body.smtpPass !== undefined) {
    // Allow empty string (clearing the password) but never log the value.
    // The password is base64 encoded for AUTH LOGIN, so it may not contain
    // CR/LF (which would break the base64 payload) but no other characters
    // are rejected.
    const pass = String(body.smtpPass);
    if (pass.length > 512) {
      return { ok: false, error: 'SMTP password is too long (max 512 characters).' };
    }
    if (/[\r\n]/.test(pass)) {
      return { ok: false, error: 'SMTP password must not contain line breaks.' };
    }
    value.smtpPass = pass;
  }

  if (body.emailRecipient !== undefined) {
    const email = String(body.emailRecipient).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Notification recipient must be a valid e-mail address.' };
    }
    value.emailRecipient = email.slice(0, 255);
  }

  if (body.lowStockEmailEnabled !== undefined) {
    if (typeof body.lowStockEmailEnabled !== 'boolean') {
      return { ok: false, error: 'lowStockEmailEnabled must be true or false.' };
    }
    value.lowStockEmailEnabled = body.lowStockEmailEnabled;
  }

  if (body.dailyReportEnabled !== undefined) {
    if (typeof body.dailyReportEnabled !== 'boolean') {
      return { ok: false, error: 'dailyReportEnabled must be true or false.' };
    }
    value.dailyReportEnabled = body.dailyReportEnabled;
  }

  if (body.dailyReportHour !== undefined) {
    const hour = Number(body.dailyReportHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return { ok: false, error: 'Daily report hour must be a whole number between 0 and 23.' };
    }
    value.dailyReportHour = hour;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'No valid settings provided.' };
  }

  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Product input
// ---------------------------------------------------------------------------

const MAX_PRODUCT_NAME = 200;
const MAX_CATEGORY = 100;
const MAX_DESCRIPTION = 2000;
const MAX_BARCODE = 100;
const MAX_BRANCH_LENGTH = 40;
// Prices and stock are bounded so a single record can never poison the
// arithmetic of a whole sales ledger (overflow / absurd totals).
const MAX_PRODUCT_PRICE = 1_000_000_000;
const MAX_PRODUCT_STOCK = 10_000_000;

/**
 * Validates and normalises the writable fields of a product.
 * @param {object} input  raw request body
 * @param {object} [opts] { partial: true } to validate only the provided keys
 */
function validateProductInput(input = {}, opts = {}) {
  const partial = opts.partial === true;
  const value = {};
  const provided = (key) => input[key] !== undefined && input[key] !== null;

  if (!partial || provided('name')) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      return { ok: false, error: 'Product name is required.' };
    }
    if (input.name.trim().length > MAX_PRODUCT_NAME) {
      return {
        ok: false,
        error: `Product name must be at most ${MAX_PRODUCT_NAME} characters.`,
      };
    }
    value.name = input.name.trim();
  }

  if (!partial || provided('category')) {
    if (typeof input.category !== 'string' || !input.category.trim()) {
      return { ok: false, error: 'Category is required.' };
    }
    if (input.category.trim().length > MAX_CATEGORY) {
      return { ok: false, error: `Category must be at most ${MAX_CATEGORY} characters.` };
    }
    value.category = input.category.trim();
  }

  if (!partial || provided('price')) {
    // `Number(null)` and `Number('')` are 0 — an omitted price must never
    // silently become a free product.
    if (input.price === null || input.price === undefined || input.price === '') {
      return { ok: false, error: 'Price is required.' };
    }
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRODUCT_PRICE) {
      return {
        ok: false,
        error: `Price must be a number between 0 and ${MAX_PRODUCT_PRICE}.`,
      };
    }
    value.price = round2(price);
  }

  if (!partial || provided('stockQuantity')) {
    if (input.stockQuantity === null || input.stockQuantity === undefined || input.stockQuantity === '') {
      return { ok: false, error: 'Stock quantity is required.' };
    }
    const stock = Number(input.stockQuantity);
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_PRODUCT_STOCK) {
      return {
        ok: false,
        error: `Stock quantity must be a whole number between 0 and ${MAX_PRODUCT_STOCK}.`,
      };
    }
    value.stockQuantity = stock;
  }

  if (!partial || provided('branchNumber')) {
    const branch = String(input.branchNumber ?? '').trim();
    if (branch.length > MAX_BRANCH_LENGTH) {
      return {
        ok: false,
        error: `Branch number must be at most ${MAX_BRANCH_LENGTH} characters.`,
      };
    }
    value.branchNumber = branch;
  }

  if (provided('barcode')) {
    if (typeof input.barcode !== 'string') {
      return { ok: false, error: 'Barcode must be text.' };
    }
    if (input.barcode.trim().length > MAX_BARCODE) {
      return { ok: false, error: `Barcode must be at most ${MAX_BARCODE} characters.` };
    }
    value.barcode = input.barcode.trim();
  }

  if (provided('description')) {
    if (typeof input.description !== 'string') {
      return { ok: false, error: 'Description must be text.' };
    }
    if (input.description.length > MAX_DESCRIPTION) {
      return { ok: false, error: `Description must be at most ${MAX_DESCRIPTION} characters.` };
    }
    value.description = input.description.trim();
  }

  return { ok: true, value };
}

module.exports = {
  escapeRegex,
  round2,
  taxAmountFor,
  validateSettingsInput,
  validateProductInput,
  MAX_PRODUCT_PRICE,
  MAX_PRODUCT_STOCK,
};
