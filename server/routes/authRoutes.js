const express = require('express');
const router = express.Router();
const { loginUser, registerStaff } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.post('/register-staff', protect, authorize('Superadmin'), registerStaff);

module.exports = router;