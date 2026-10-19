const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true },
});

const saleSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      default: () => `TXN-${Date.now()}-${require('crypto').randomUUID()}`,
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Denormalized cashier display name so the Sales Log can filter/sort by
    // name without a populate (kept in sync at sale creation).
    cashierName: {
      type: String,
      trim: true,
      index: true,
    },
    branchNumber: {
      type: String,
      required: true,
    },
    storeAddress: {
      type: String,
      required: true,
    },
    items: [saleItemSchema],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tax & grand total (computed server-side from store settings)
    taxRate: {
      type: Number,
      default: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    totalWithTax: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'MOBILE', 'cash', 'card', 'mobile'],
      required: true,
      uppercase: true, // Automatically converts inputs like 'card' to 'CARD'
    },
    paymentStatus: {
      type: String,
      enum: ['Completed', 'Pending', 'Failed'],
      default: 'Completed',
    },
    // Set only by PER-CASHIER monthly resets: excluded from cashier-level
    // performance reports, but never from store-wide (global) monthly totals.
    isResetForCashierMonth: {
      type: Boolean,
      default: false,
    },
    // Set only by store-wide monthly / annual resets: excluded from both
    // global and cashier-level monthly totals.
    isResetForMonth: {
      type: Boolean,
      default: false,
    },
    isResetForYear: {
      type: Boolean,
      default: false,
    },
    // Tracking Window Keys
    monthYearKey: {
      type: String, // Format: "YYYY-MM"
      default: () => new Date().toISOString().slice(0, 7),
    },
    yearKey: {
      type: String, // Format: "YYYY"
      default: () => new Date().getFullYear().toString(),
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to accelerate monthly cashier sales calculations and wipes
saleSchema.index({ cashier: 1, createdAt: 1 });
// Branch-scoped financial reporting & exports
saleSchema.index({ branchNumber: 1, createdAt: -1 });
// Fast aggregation windows for dashboard charts
saleSchema.index({ createdAt: -1 });
// Monthly/annual reset tracking keys
saleSchema.index({ monthYearKey: 1, yearKey: 1 });

module.exports = mongoose.model('Sale', saleSchema);