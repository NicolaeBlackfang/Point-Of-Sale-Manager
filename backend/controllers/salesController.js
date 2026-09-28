const Sale = require('../models/Sale');
const Product = require('../models/Product');
const User = require('../models/User'); // Adjust path based on where your User model file is located

// @desc    Create a new sale transaction
// @route   POST /api/sales
// @access  Private (Cashier, Superadmin)
const createSale = async (req, res) => {
  try {
    const { items, totalAmount, paymentMethod, storeAddress, branchNumber } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in sale transaction.' });
    }

    const processedItems = [];

    // 1. Process items, verify stock, and format sub-documents
    for (const item of items) {
      const productId = item.product || item._id;

      if (!productId || productId === 'undefined' || productId === 'null') {
        return res.status(400).json({ message: 'Invalid product ID passed in sale items.' });
      }

      const product = await Product.findById(productId);

      if (!product || product.isDeleted) {
        return res.status(404).json({ message: `Product not found for ID: "${productId}"` });
      }

      if (product.stockQuantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product "${product.name}". Available: ${product.stockQuantity}`,
        });
      }

      // Deduct stock quantity
      product.stockQuantity -= item.quantity;
      await product.save();

      const unitPrice = item.unitPrice || item.price || product.price;
      const subtotal = unitPrice * item.quantity;

      processedItems.push({
        product: product._id,
        sku: product.sku,
        name: product.name,
        price: unitPrice,
        quantity: item.quantity,
        subtotal: subtotal,
      });
    }

    // 2. Convert payment method to lowercase (e.g. 'card', 'cash', 'mobile')
    const formattedPaymentMethod = String(paymentMethod || 'cash').toLowerCase();

    // 3. Ensure branch number and store address are populated
    const finalBranchNumber =
      branchNumber || req.user.branchNumber || req.user.branch || '101';
    const finalStoreAddress =
      storeAddress || req.user.storeAddress || req.user.branchAddress || 'Main Store';

    // 4. Create Sale document
    const sale = await Sale.create({
      cashier: req.user._id,
      cashierName: req.user.roleTakerName || req.user.username,
      branchNumber: finalBranchNumber,
      storeAddress: finalStoreAddress,
      items: processedItems,
      totalAmount,
      paymentMethod: formattedPaymentMethod,
    });

    res.status(201).json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get sales history for the logged-in cashier
// @route   GET /api/sales/my-sales
// @access  Private (Cashier)
const getMySales = async (req, res) => {
  try {
    const sales = await Sale.find({ cashier: req.user._id })
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all sales transactions across branches
// @route   GET /api/sales
// @access  Private (Superadmin)
const getAllSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate('cashier', 'username roleTakerName branchNumber')
      .populate('items.product', 'name sku')
      .sort({ createdAt: -1 });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset a specific cashier's monthly sales history
// @route   DELETE /api/sales/reset-cashier/:cashierId
// @access  Private (Superadmin)
const resetCashierSales = async (req, res) => {
  try {
    const { cashierId } = req.params;

    const result = await Sale.deleteMany({ cashier: cashierId });

    res.json({
      message: 'Cashier sales history reset successfully.',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Cashier Audit Logs (Sales history grouped by Cashier)
// @route   GET /api/sales/cashier-logs
// @access  Private (Superadmin)
const getCashierAuditLogs = async (req, res) => {
  try {
    const logs = await Sale.find()
      .populate('cashier', 'username roleTakerName branchNumber email')
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get Sales & Receipt Data Export (Filtered by Cashier/Global & Month/Year)
// @route   GET /api/sales/export
// @access  Private (Superadmin)
const exportSalesData = async (req, res) => {
  try {
    const { scope, cashierId, timeframe, year, month } = req.query;

    const query = {};

    // 1. Filter by Scope (Cashier or Global)
    if (scope === 'cashier') {
      if (!cashierId) {
        return res.status(400).json({ message: 'Cashier ID is required for cashier scope export.' });
      }
      query.cashier = cashierId;
    }

    // 2. Filter by Timeframe (Monthly vs Annual)
    const targetYear = parseInt(year, 10) || new Date().getFullYear();

    if (timeframe === 'monthly') {
      const targetMonth = parseInt(month, 10) || new Date().getMonth() + 1; // 1-12
      const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

      query.createdAt = { $gte: startDate, $lte: endDate };
    } else if (timeframe === 'annual') {
      const startDate = new Date(targetYear, 0, 1, 0, 0, 0, 0);
      const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // 3. Fetch sales matching filter criteria with populated references
    const sales = await Sale.find(query)
      .populate('cashier', 'username roleTakerName branchNumber storeAddress')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      exportMetadata: {
        totalRecords: sales.length,
        scope,
        timeframe,
        year: targetYear,
        month: timeframe === 'monthly' ? month : 'N/A',
        exportedAt: new Date().toISOString(),
      },
      sales,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    PERMANENT HARD RESET: Delete ALL transaction records from MongoDB
// @route   DELETE /api/sales/hard-reset
// @access  Private (Superadmin)
const hardResetSalesData = async (req, res) => {
  try {
    const { confirmationPhrase } = req.body;

    // Enforce backend verification guardrail
    if (confirmationPhrase !== 'PERMANENTLY DELETE ALL SALES') {
      return res.status(400).json({
        message: 'Invalid confirmation phrase. Hard reset request rejected.',
      });
    }

    // 1. Permanently delete all records in the Sales collection
    const deleteResult = await Sale.deleteMany({});

    // 2. Reset accumulators across all user accounts
    await User.updateMany(
      {},
      {
        $set: {
          monthlySalesRevenue: 0,
          monthlyTransactionsCount: 0,
          annualSalesRevenue: 0,
          annualTransactionsCount: 0,
        },
      }
    );

    res.json({
      message: 'CRITICAL WARNING: All sales records permanently wiped from MongoDB.',
      deletedCount: deleteResult.deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSale,
  getMySales,
  getAllSales,
  resetCashierSales,
  getCashierAuditLogs,
  exportSalesData,
  hardResetSalesData,
};