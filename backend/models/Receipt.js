const mongoose = require('mongoose');
const { RECEIPT_RETENTION_SECONDS } = require('../utils/receipts');

const receiptItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

// Printable receipt snapshot created alongside every sale. This collection is
// the "receipt history": a background TTL index purges records 7 days after
// they were created, while the Sale ledger itself is kept permanently for
// analytics, exports and refunds accounting.
const receiptSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cashierName: { type: String, default: '', index: true },
    branchNumber: { type: String, default: '' },
    storeAddress: { type: String, default: '' },
    customerName: { type: String, default: '' },
    paymentMethod: { type: String, default: 'CASH' },
    paymentStatus: { type: String, default: 'Completed' },
    currency: { type: String, default: 'USD' },
    qrCodeDataUrl: { type: String, default: '' },
    refundStatus: { type: String, enum: ['None', 'Refunded'], default: 'None' },
    items: [receiptItemSchema],
    totalAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalWithTax: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// 7-day auto-purge: MongoDB's TTL monitor deletes matching docs in the
// background (~60s cadence) once `createdAt` is older than the retention window.
receiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: RECEIPT_RETENTION_SECONDS });
receiptSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Receipt', receiptSchema);
