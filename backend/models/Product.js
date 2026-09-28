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
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    stockQuantity: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    branchNumber: {
      type: String,
      required: [true, 'Branch number allocation is required'],
      trim: true,
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

module.exports = mongoose.model('Product', productSchema);