const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
  adjustmentType: {
    type: String,
    enum: ['ADDITION', 'DEDUCTION', 'CORRECTION'],
    required: true,
  },
  quantityChanged: {
    type: Number,
    required: true,
  },
  previousQuantity: {
    type: Number,
    required: true,
  },
  newQuantity: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    default: 'Manual Inventory Adjustment',
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'Product SKU is required'],
      unique: true, // Database-level uniqueness enforcement
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
      max: [1000000000, 'Price is unrealistically high'],
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      max: [10000000, 'Stock quantity is unrealistically high'],
      default: 0,
    },
    branchNumber: {
      type: String,
      required: [true, 'Branch number allocation is required'],
      trim: true,
    },
    // Product photo uploaded by the Operator (public URL under /uploads/...).
    // View-only for Superadmins and Cashiers.
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    qrCodeDataUrl: {
      type: String,
      required: [true, 'QR Code Data URL is required'],
    },
    qrPayload: {
      type: String,
      required: [true, 'QR code payload string is required'],
      unique: true,
    },
    createdByOperatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    stockHistory: [stockAdjustmentSchema],
  },
  {
    timestamps: true,
  }
);

// --- Performance indexes for large-scale catalogs (100k+ items) ---
// Barcode + SKU compound lookup (scanner input).
productSchema.index({ barcode: 1, sku: 1 });
// Full-text search across product copy for instant autocomplete.
productSchema.index({ name: 'text', description: 'text' });
// Branch-scoped catalog browsing / category filtering.
productSchema.index({ branchNumber: 1, category: 1, name: 1 });

module.exports = mongoose.model('Product', productSchema);