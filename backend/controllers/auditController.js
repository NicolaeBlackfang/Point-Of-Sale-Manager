const AuditLog = require('../models/AuditLog');

// @desc    Get audit log entries (product & settings changes)
// @route   GET /api/audit-logs
// @access  Private (Superadmin)
const getAuditLogs = async (req, res) => {
  try {
    const { entityType, action, limit } = req.query;

    const query = {};
    if (entityType) query.entityType = entityType;
    if (action) query.action = action;

    const parsedLimit = parseInt(limit, 10);
    const safeLimit = Math.min(Number.isInteger(parsedLimit) ? parsedLimit : 100, 500);

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'username roleTakerName role')
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getAuditLogs };
