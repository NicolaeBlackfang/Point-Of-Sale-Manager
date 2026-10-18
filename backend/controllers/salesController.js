const Sale = require('../models/Sale');
const Product = require('../models/Product');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { round2 } = require('../utils/validators');
const { checkLowStockBulk } = require('../utils/lowStock');

// @desc    Create a new sale transaction
// @route   POST /api/sales
// @access  Private (Cashier, Superadmin)
const createSale = async (req, res) => {
  try {
    const { items, paymentMethod, storeAddress, branchNumber } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items in sale transaction.' });
    }

    // 1. Normalize/validate client-supplied item identifiers and quantities.
    //    Prices are NEVER trusted from the client.
    const normalizedItems = [];
    for (const item of items) {
      const productId = item.product || item._id;
      const quantity = Number(item.quantity);

      if (
        !productId ||
        productId === 'undefined' ||
        productId === 'null' ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({ message: 'Invalid item in sale transaction.' });
      }

      normalizedItems.push({ productId, quantity });
    }

    // 2. Load store settings (tax rate) and products; compute prices/totals
    //    from trusted DB values. Prices are NEVER trusted from the client.
    const settings = await Setting.getSettings();
    const taxRate = settings.taxRate || 0;

    const processedItems = [];
    let computedTotal = 0;

    for (const { productId, quantity } of normalizedItems) {
      const product = await Product.findById(productId);

      if (!product || product.isDeleted) {
        return res.status(404).json({ message: 'Product not found in sale items.' });
      }

      const unitPrice = product.price;
      const subtotal = unitPrice * quantity;
      computedTotal += subtotal;

      processedItems.push({
        product: product._id,
        sku: product.sku,
        name: product.name,
        price: unitPrice,
        quantity,
        subtotal,
      });
    }

    // 3. Atomically decrement stock (guards against race conditions / negative stock).
    //    Roll back already-applied decrements if any item fails.
    const decremented = [];
    for (const { productId, quantity } of normalizedItems) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, isDeleted: false, stockQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity } },
        { new: true }
      );

      if (!updated) {
        await Promise.all(
          decremented.map(({ productId: id, quantity: qty }) =>
            Product.updateOne({ _id: id }, { $inc: { stockQuantity: qty } })
          )
        );
        return res.status(400).json({ message: 'Insufficient stock for one or more items.' });
      }

      decremented.push({ productId, quantity });
    }

    const requestedPayment = String(paymentMethod || 'cash').toLowerCase();
    const formattedPaymentMethod = ['cash', 'card', 'mobile'].includes(requestedPayment)
      ? requestedPayment
      : 'cash';

    const finalBranchNumber = branchNumber || req.user.branchNumber || '101';
    const finalStoreAddress = storeAddress || req.user.storeAddress || 'Main Store';

    const taxAmount = round2((computedTotal * taxRate) / 100);
    const totalWithTax = round2(computedTotal + taxAmount);

    // 4. Create Sale document with the server-computed total and tax breakdown.
    const sale = await Sale.create({
      cashier: req.user._id,
      cashierName: req.user.roleTakerName || req.user.username,
      branchNumber: finalBranchNumber,
      storeAddress: finalStoreAddress,
      items: processedItems,
      totalAmount: computedTotal,
      taxRate,
      taxAmount,
      totalWithTax,
      currency: settings.currencyCode,
      paymentMethod: formattedPaymentMethod,
    });

    // 5. Low-stock alerts for any product that dropped to/below the threshold.
    const soldProducts = await Product.find({
      _id: { $in: normalizedItems.map((item) => item.productId) },
    }).select('sku name stockQuantity branchNumber');

    const lowStockWarnings = await checkLowStockBulk(soldProducts);

    res.status(201).json({ ...sale.toObject(), lowStockWarnings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
      const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
      const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1));
      query.createdAt = { $gte: startOfMonth, $lt: endOfMonth };
    } else if (timeframe === 'annual') {
      const startOfYear = new Date(Date.UTC(targetYear, 0, 1));
      const endOfYear = new Date(Date.UTC(targetYear + 1, 0, 1));
      query.createdAt = { $gte: startOfYear, $lt: endOfYear };
    }

    const sales = await Sale.find(query)
      .populate('cashier', 'username roleTakerName branchNumber storeAddress')
      .sort({ createdAt: -1 });

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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
