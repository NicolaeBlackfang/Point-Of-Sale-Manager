const mongoose = require('mongoose');

// Append-only audit trail for administrative changes (products, prices, settings).
const auditLogSchema = new mongoose.Schema(
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

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
