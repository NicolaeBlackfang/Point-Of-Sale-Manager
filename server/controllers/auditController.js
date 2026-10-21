const SystemLog = require('../models/SystemLog');
const { logAudit } = require('../utils/audit');
const mongoose = require('mongoose');

// @desc    Get audit log entries (product & settings changes)
// @route   GET /api/audit-logs
// @access  Private (Superadmin)
const getAuditLogs = async (req, res) => {
  try {
    const { entityType, action, limit } = req.query;

    const query = {};
    if (typeof entityType === 'string' && entityType.trim()) {
      query.entityType = entityType.trim();
    }
    if (typeof action === 'string' && action.trim()) {
      query.action = action.trim();
    }

    const parsedLimit = parseInt(limit, 10);
    const safeLimit = Math.min(Number.isInteger(parsedLimit) ? parsedLimit : 100, 500);

    const logs = await SystemLog.find(query)
      .populate('performedBy', 'username roleTakerName role')
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Delete a single audit log entry
// @route   DELETE /api/audit-logs/:id
// @access  Private (Superadmin)
const deleteAuditLog = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid audit log id.' });
    }

    const log = await SystemLog.findByIdAndDelete(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'Audit log entry not found.' });
    }

    // Record the deletion itself so the trail stays accountable.
    await logAudit({
      action: 'DELETE_AUDIT_LOG',
      entityType: 'Settings',
      entityId: req.params.id,
      entityLabel: `Deleted audit entry: ${log.action}`,
      user: req.user,
      req,
      details: { deletedAction: log.action, deletedEntity: log.entityLabel || log.entityId },
    });

    res.json({ message: 'Audit log entry deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Purge all audit logs (double-confirmation enforced client-side,
//          plus a server-side 'confirm' guard to avoid accidental wipes)
// @route   DELETE /api/audit-logs
// @access  Private (Superadmin)
const purgeAuditLogs = async (req, res) => {
  try {
    if (req.query.confirm !== 'PURGE') {
      return res
        .status(400)
        .json({ message: "Confirmation required. Pass ?confirm=PURGE to purge all audit logs." });
    }

    const { deletedCount = 0 } = await SystemLog.deleteMany({});

    await logAudit({
      action: 'PURGE_AUDIT_LOGS',
      entityType: 'Settings',
      entityLabel: 'Audit log purge',
      user: req.user,
      req,
      details: { deletedCount },
    });

    res.json({ message: `Purged ${deletedCount} audit log entr(ies).`, deletedCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getAuditLogs, deleteAuditLog, purgeAuditLogs };
