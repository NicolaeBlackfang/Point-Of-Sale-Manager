const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductByQrData,
  createProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  getAuditLogs,
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/products
// @access  Private (All authenticated users: Cashier, Operator, Superadmin)
// @route   POST /api/products
// @access  Private (Operator, Superadmin)
router
  .route('/')
  .get(protect, getProducts)
  .post(protect, authorize('Operator', 'Superadmin'), createProduct);


// @route   PUT /api/products/:id/stock
// @access  Private (Operator, Superadmin)
router.put('/:id/stock', protect, authorize('Operator', 'Superadmin'), updateStock);

// @route   GET /api/products/scan/:qrData
// @access  Private (Cashier, Superadmin, Operator)
router.get('/scan/:qrData', protect, getProductByQrData);

// @route   GET /api/products/audit/logs
// @access  Private (Superadmin)
router.get('/audit/logs', protect, authorize('Superadmin'), getAuditLogs);

// @route   PUT /api/products/:id
// @access  Private (Operator, Superadmin)
// @route   DELETE /api/products/:id
// @access  Private (Superadmin, Operator)
router
  .route('/:id')
  .put(protect, authorize('Operator', 'Superadmin'), updateProduct)
  .delete(protect, authorize('Superadmin', 'Operator'), deleteProduct);

module.exports = router;