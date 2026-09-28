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
      default: () => `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

module.exports = mongoose.model('Sale', saleSchema);