const express = require('express');
const router = express.Router();
const {
  getProducts,
  getCategories,
  getProductByQrData,
  createProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  hardDeleteProduct,
  purgeStockHistory,
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


// @route   GET /api/products/categories
// @access  Private (All authenticated users)
router.get('/categories', protect, getCategories);

// @route   PUT /api/products/:id/stock
// @access  Private (Operator, Superadmin)
router.put('/:id/stock', protect, authorize('Operator', 'Superadmin'), updateStock);

// @route   GET /api/products/scan/:qrData
// @access  Private (Cashier, Superadmin, Operator)
router.get('/scan/:qrData', protect, getProductByQrData);

// @route   GET /api/products/audit/logs
// @access  Private (Superadmin)
router.get('/audit/logs', protect, authorize('Superadmin'), getAuditLogs);

// @route   DELETE /api/products/stock-history
// @desc    Purge embedded stock-adjustment history (requires ?confirm=PURGE)
// @access  Private (Superadmin)
// NOTE: must be declared before the '/:id' routes so it is not read as an id.
router.delete('/stock-history', protect, authorize('Superadmin'), purgeStockHistory);

// @route   PUT /api/products/:id
// @access  Private (Operator, Superadmin)
// @route   DELETE /api/products/:id
// @access  Private (Superadmin, Operator)
router
  .route('/:id')
  .put(protect, authorize('Operator', 'Superadmin'), updateProduct)
  .delete(protect, authorize('Superadmin', 'Operator'), deleteProduct);

// @route   DELETE /api/products/:id/hard
// @desc    Permanently remove a product (Superadmin master override)
// @access  Private (Superadmin)
router.delete('/:id/hard', protect, authorize('Superadmin'), hardDeleteProduct);

module.exports = router;