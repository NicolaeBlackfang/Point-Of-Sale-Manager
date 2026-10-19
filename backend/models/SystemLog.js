const mongoose = require('mongoose');

// Append-only system log (formerly "Audit Log") for administrative changes
// (products, prices, settings, staff, receipts). The Mongo collection name is
// pinned to 'auditlogs' so existing deployments keep their history.
const systemLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'CREATE_PRODUCT',
        'UPDATE_PRODUCT',
        'DELETE_PRODUCT',
        'UPDATE_STOCK',
        'UPDATE_SETTINGS',
        'UPDATE_USER',
        'DELETE_USER',
        'UPDATE_SALE',
        'DELETE_SALE',
        'PURGE_AUDIT_LOGS',
        'DELETE_AUDIT_LOG',
        'PURGE_STOCK_LOGS',
        'PURGE_SALES',
      ],
    },
    entityType: {
      type: String,
      required: true,
      enum: ['Product', 'Settings', 'User', 'Sale'],
    },
    entityId: { type: String },
    entityLabel: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    role: { type: String },
    branchNumber: { type: String },
    details: { type: Object, default: {} },
    ip: { type: String },
  },
  { timestamps: true }
);

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ entityType: 1, createdAt: -1 });

module.exports = mongoose.model('SystemLog', systemLogSchema, 'auditlogs');
