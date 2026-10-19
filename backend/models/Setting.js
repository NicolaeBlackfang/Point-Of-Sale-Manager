const mongoose = require('mongoose');
const cache = require('../utils/cache');
const { DEFAULT_TIMEZONE, isValidTimezone } = require('../utils/timezone');

const SETTINGS_CACHE_KEY = 'settings:store';
const SETTINGS_CACHE_TTL_MS = 60000;

// Singleton store-wide settings document (currency, tax, inventory thresholds,
// timezone and optional notification channels).
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'store' },
    currencySymbol: { type: String, default: '$', trim: true, maxlength: 8 },
    currencyCode: { type: String, default: 'USD', trim: true, uppercase: true, maxlength: 8 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    // Store timezone used for every date bucket / analytics window.
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      trim: true,
      validate: {
        validator: (value) => isValidTimezone(value),
        message: 'Timezone must be a valid IANA timezone (e.g. UTC, Europe/Berlin).',
      },
    },
    // Optional alert channels (webhook + SMTP e-mail).
    webhookUrl: { type: String, default: '', trim: true, maxlength: 500 },
    smtpHost: { type: String, default: '', trim: true, maxlength: 255 },
    smtpPort: { type: Number, default: 587, min: 1, max: 65535 },
    smtpUser: { type: String, default: '', trim: true, maxlength: 255 },
    smtpPass: { type: String, default: '', maxlength: 512 },
    emailRecipient: { type: String, default: '', trim: true, maxlength: 255 },
    lowStockEmailEnabled: { type: Boolean, default: false },
    dailyReportEnabled: { type: Boolean, default: false },
    dailyReportHour: { type: Number, default: 8, min: 0, max: 23 },
  },
  { timestamps: true }
);

settingSchema.statics.getSettings = async function getSettings() {
  const cached = cache.get(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  let doc = await this.findById('store');
  if (!doc) doc = await this.create({});
  const plain = doc.toObject();
  cache.set(SETTINGS_CACHE_KEY, plain, SETTINGS_CACHE_TTL_MS);
  return plain;
};

// Fresh document for mutations (bypasses the read cache, then invalidates it).
settingSchema.statics.getSettingsDoc = async function getSettingsDoc() {
  let doc = await this.findById('store');
  if (!doc) doc = await this.create({});
  return doc;
};

settingSchema.statics.invalidateCache = function invalidateCache() {
  cache.invalidate('settings:');
};

module.exports = mongoose.model('Setting', settingSchema);
