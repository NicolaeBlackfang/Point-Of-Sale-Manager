const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Webhook URL must start with http:// or https://.' };
    }
    if (url.length > 500) {
      return { ok: false, error: 'Webhook URL is too long (max 500 characters).' };
    }
    value.webhookUrl = url;
  }

  if (body.smtpHost !== undefined) {
    const host = String(body.smtpHost).trim();
    if (host.length > 255) {
      return { ok: false, error: 'SMTP host is too long (max 255 characters).' };
    }
    value.smtpHost = host;
  }

  if (body.smtpPort !== undefined) {
    const port = Number(body.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: 'SMTP port must be a whole number between 1 and 65535.' };
    }
    value.smtpPort = port;
  }

  if (body.smtpUser !== undefined) {
    value.smtpUser = String(body.smtpUser).trim().slice(0, 255);
  }

  if (body.smtpPass !== undefined) {
    // Allow empty string (clearing the password) but never log the value.
    value.smtpPass = String(body.smtpPass).slice(0, 512);
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

module.exports = { escapeRegex, round2, taxAmountFor, validateSettingsInput };
