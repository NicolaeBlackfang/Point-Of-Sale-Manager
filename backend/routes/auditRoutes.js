const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/audit-logs
// @access  Private (Superadmin)
router.get('/', protect, authorize('Superadmin'), getAuditLogs);

module.exports = router;
