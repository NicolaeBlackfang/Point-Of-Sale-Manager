const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  deleteAuditLog,
  purgeAuditLogs,
} = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/audit-logs
// @access  Private (Superadmin)
router.get('/', protect, authorize('Superadmin'), getAuditLogs);

// @route   DELETE /api/audit-logs
// @desc    Purge all audit logs (requires ?confirm=PURGE)
// @access  Private (Superadmin)
router.delete('/', protect, authorize('Superadmin'), purgeAuditLogs);

// @route   DELETE /api/audit-logs/:id
// @desc    Delete a single audit entry
// @access  Private (Superadmin)
router.delete('/:id', protect, authorize('Superadmin'), deleteAuditLog);

module.exports = router;
