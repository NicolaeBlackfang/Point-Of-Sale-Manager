const express = require('express');
const router = express.Router();
const { loginUser, registerStaff, getMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.post('/register-staff', protect, authorize('Superadmin'), registerStaff);
router.get('/me', protect, getMe);

module.exports = router;
