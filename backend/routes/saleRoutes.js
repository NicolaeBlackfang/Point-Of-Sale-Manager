const express = require('express');
const router = express.Router();
const {
  createSale,
  getMySales,
  getAllSales,
  purgeSales,
  resetCashierSales,
  getCashierAuditLogs,
  exportSalesData,
  hardResetSalesData,
  updateSale,
  deleteSale,
} = require('../controllers/salesController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   POST /api/sales
// @access  Private (Cashier, Superadmin)
// @route   GET /api/sales
// @access  Private (Superadmin)
router
  .route('/')
  .post(protect, authorize('Cashier', 'Superadmin'), createSale)
  .get(protect, authorize('Superadmin'), getAllSales)
  // @route   DELETE /api/sales  (bulk purge selected Sales Log entries)
  // @access  Private (Superadmin)
  .delete(protect, authorize('Superadmin'), purgeSales);

// @route   GET /api/sales/my-sales
// @access  Private (Cashier)
router.get('/my-sales', protect, authorize('Cashier', 'Superadmin'), getMySales);

// @route   GET /api/sales/cashier-logs
// @access  Private (Superadmin)
router.get('/cashier-logs', protect, authorize('Superadmin'), getCashierAuditLogs);

// @route   DELETE /api/sales/reset-cashier/:cashierId
// @access  Private (Superadmin)
router.delete(
  '/reset-cashier/:cashierId',
  protect,
  authorize('Superadmin'),
  resetCashierSales
);

// @route   GET /api/sales/export
// @access  Private (Superadmin)
router.get('/export', protect, authorize('Superadmin'), exportSalesData);

// @route   DELETE /api/sales/hard-reset
// @access  Private (Superadmin)
router.delete('/hard-reset', protect, authorize('Superadmin'), hardResetSalesData);

// @route   PUT /api/sales/:id
// @desc    Edit a receipt (master override)
// @access  Private (Superadmin)
// @route   DELETE /api/sales/:id
// @desc    Permanently delete a receipt & restore stock (master override)
// @access  Private (Superadmin)
router
  .route('/:id')
  .put(protect, authorize('Superadmin'), updateSale)
  .delete(protect, authorize('Superadmin'), deleteSale);

module.exports = router;