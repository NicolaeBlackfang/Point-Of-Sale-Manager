const express = require('express');
const router = express.Router();
const {
  getGlobalAnalytics,
  getCashierMonthlyPerformance,
  resetCashierMonthlySales,
  resetMonthlyData,
  resetAnnualData,
  updateStaff,
  deleteStaff,
} = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Protect all routes below so only Superadmins can access them
router.use(protect, authorize('Superadmin'));

// Analytics Endpoints
router.get('/', getGlobalAnalytics);
router.get('/cashiers-monthly', getCashierMonthlyPerformance);
router.delete('/reset-cashier-sales/:cashierId', resetCashierMonthlySales);
router.post('/reset-monthly', resetMonthlyData);
router.post('/reset-annual', resetAnnualData);

// Staff CRUD Management Endpoints
router.put('/staff/:id', updateStaff);
router.delete('/staff/:id', deleteStaff);

module.exports = router;