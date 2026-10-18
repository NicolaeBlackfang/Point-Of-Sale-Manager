const mongoose = require('mongoose');

// Singleton store-wide settings document (currency, tax, inventory thresholds).
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'store' },
    currencySymbol: { type: String, default: '$', trim: true, maxlength: 8 },
    currencyCode: { type: String, default: 'USD', trim: true, uppercase: true, maxlength: 8 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true }
);

settingSchema.statics.getSettings = async function () {
  const existing = await this.findById('store');
  if (existing) return existing;
  return this.create({});
};

module.exports = mongoose.model('Setting', settingSchema);
