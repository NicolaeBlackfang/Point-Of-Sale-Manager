const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/settings
// @access  Private (All authenticated users)
// @route   PUT /api/settings
// @access  Private (Superadmin)
router
  .route('/')
  .get(protect, getSettings)
  .put(protect, authorize('Superadmin'), updateSettings);

module.exports = router;
