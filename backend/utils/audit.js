const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit writer. Never blocks or fails the main operation.
async function logAudit({ action, entityType, entityId, entityLabel, user, req, details }) {
  try {
    await AuditLog.create({
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : undefined,
      entityLabel,
      performedBy: user?._id,
      performedByName: user?.roleTakerName || user?.username || 'System',
      role: user?.role,
      branchNumber: user?.branchNumber,
      details: details || {},
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
}

module.exports = { logAudit };
