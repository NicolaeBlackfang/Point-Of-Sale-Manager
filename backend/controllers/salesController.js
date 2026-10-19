const Sale = require('../models/Sale');
const Product = require('../models/Product');
const User = require('../models/User');
const Setting = require('../models/Setting');
const mongoose = require('mongoose');
const { round2, escapeRegex } = require('../utils/validators');
const { checkLowStockBulk } = require('../utils/lowStock');
const { logAudit } = require('../utils/audit');
const { normalizeTimezone, dayRange, zonedParts, wallClockToInstant } = require('../utils/timezone');
const cache = require('../utils/cache');

// The active cashier terminal only keeps receipts for this long; older
// records live on in the Superadmin "Sales Log".
const CASHIER_HISTORY_RETENTION_DAYS = 2;

async function storeTimezone() {
  try {
    const settings = await Setting.getSettings();
    return normalizeTimezone(settings.timezone);
  } catch {
    return normalizeTimezone(undefined);
  }
}

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
        { returnDocument: 'after' }
      );

      if (!updated) {
        await Promise.all(
          decremented.map(({ productId: id, quantity: qty }) =>
            Product.updateOne({ _id: id }, { $inc: { stockQuantity: qty } })
          )
        );
        cache.invalidate('products:');
        return res.status(400).json({ message: 'Insufficient stock for one or more items.' });
      }

      decremented.push({ productId, quantity });
    }
    cache.invalidate('products:');

    const requestedPayment = String(paymentMethod || 'cash').toLowerCase();
    const formattedPaymentMethod = ['cash', 'card', 'mobile'].includes(requestedPayment)
      ? requestedPayment
      : 'cash';

    // Branch/store are the authenticated cashier's assignment (the salesperson
    // who processed the sale) — never the operator/inventory source branch.
    // The server is the source of truth; client-supplied values are only a fallback.
    const finalBranchNumber = req.user.branchNumber || branchNumber || '101';
    const finalStoreAddress = req.user.storeAddress || storeAddress || 'Main Store';

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
    const query = { cashier: req.user._id };

    // Temporary view: cashiers only see the last couple of days on the
    // terminal. Older receipts stay untouched for the Superadmin Sales Log.
    if (req.user.role === 'Cashier') {
      const tz = await storeTimezone();
      const today = zonedParts(new Date(), tz);
      const windowStart = wallClockToInstant(
        { year: today.year, month: today.month, day: today.day - (CASHIER_HISTORY_RETENTION_DAYS - 1) },
        tz
      );
      query.createdAt = { $gte: windowStart };
    }

    const sales = await Sale.find(query)
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

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
    const { branch, branchId, cashierName, from, to, limit } = req.query;
    const query = {};

    // Branch filter matches the recorded cashier branch. Accept `branchId` as an
    // alias of `branch` so callers can query by the cashier's active branch.
    const branchFilter = branch || branchId;
    if (typeof branchFilter === 'string' && branchFilter.trim()) {
      query.branchNumber = branchFilter.trim();
    } else if (branchFilter) {
      return res.status(400).json({ message: 'Invalid branch filter.' });
    }
    if (typeof cashierName === 'string' && cashierName.trim()) {
      // Case-insensitive exact/partial match on the recorded cashier name.
      query.cashierName = { $regex: new RegExp(`^${escapeRegex(cashierName.trim())}$`, 'i') };
    }

    const tz = await storeTimezone();
    if (from) {
      const [year, month, day] = String(from).split('-').map(Number);
      if (year && month && day) {
        query.createdAt = { ...(query.createdAt || {}), $gte: wallClockToInstant({ year, month, day }, tz) };
      }
    }
    if (to) {
      const [year, month, day] = String(to).split('-').map(Number);
      if (year && month && day) {
        const endOfDay = dayRange(wallClockToInstant({ year, month, day }, tz), tz).end;
        query.createdAt = { ...(query.createdAt || {}), $lte: endOfDay };
      }
    }

    const parsedLimit = parseInt(limit, 10);
    const safeLimit = Math.min(Number.isInteger(parsedLimit) ? parsedLimit : 500, 1000);

    const sales = await Sale.find(query)
      .populate('cashier', 'username roleTakerName branchNumber')
      .populate('items.product', 'name sku')
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    res.json(sales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Bulk-purge specific sales receipts from the Sales Log (stock restored)
// @route   DELETE /api/sales
// @access  Private (Superadmin)
const purgeSales = async (req, res) => {
  try {
    const { saleIds } = req.body || {};
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({ message: 'Provide a non-empty saleIds array to purge.' });
    }
    if (saleIds.length > 200) {
      return res.status(400).json({ message: 'You can purge at most 200 receipts per request.' });
    }

    const validIds = saleIds.filter((id) => mongoose.isValidObjectId(String(id)));
    if (validIds.length !== saleIds.length) {
      return res.status(400).json({ message: 'One or more sale ids are invalid.' });
    }

    const sales = await Sale.find({ _id: { $in: validIds } });
    if (sales.length === 0) {
      return res.status(404).json({ message: 'No matching receipts found to purge.' });
    }

    // Restore stock for every purged receipt so inventory stays consistent.
    const bulkOps = [];
    for (const sale of sales) {
      for (const item of sale.items || []) {
        if (item.product) {
          bulkOps.push({
            updateOne: {
              filter: { _id: item.product },
              update: { $inc: { stockQuantity: item.quantity } },
            },
          });
        }
      }
    }
    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }
    cache.invalidate('products:');

    const { deletedCount } = await Sale.deleteMany({ _id: { $in: sales.map((s) => s._id) } });

    await logAudit({
      action: 'PURGE_SALES',
      entityType: 'Sale',
      entityId: validIds.join(',').slice(0, 200),
      entityLabel: `Purged ${deletedCount} receipt(s) from Sales Log`,
      user: req.user,
      req,
      details: {
        requested: saleIds.length,
        deleted: deletedCount,
        stockRestored: bulkOps.length > 0,
        totalAmount: round2(sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)),
      },
    });

    res.json({ message: `${deletedCount} receipt(s) purged; stock restored.`, deletedCount });
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

    if (!cashierId || !mongoose.isValidObjectId(cashierId)) {
      return res.status(400).json({ message: 'A valid cashierId is required.' });
    }
    const cashier = await User.findById(cashierId);
    if (!cashier || cashier.role !== 'Cashier') {
      return res.status(404).json({ message: 'Cashier not found.' });
    }

    const result = await Sale.deleteMany({ cashier: cashier._id });

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

    // 2. Filter by Timeframe (Monthly vs Annual) using store-local boundaries
    const tz = await storeTimezone();
    const targetYear = parseInt(year, 10) || new Date().getFullYear();

    if (timeframe === 'monthly') {
      const targetMonth = parseInt(month, 10) || zonedParts(new Date(), tz).month; // 1-12
      const startOfMonth = wallClockToInstant({ year: targetYear, month: targetMonth, day: 1 }, tz);
      const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
      const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
      const startOfNextMonth = wallClockToInstant({ year: nextYear, month: nextMonth, day: 1 }, tz);
      query.createdAt = { $gte: startOfMonth, $lt: startOfNextMonth };
    } else if (timeframe === 'annual') {
      const startOfYear = wallClockToInstant({ year: targetYear, month: 1, day: 1 }, tz);
      const startOfNextYear = wallClockToInstant({ year: targetYear + 1, month: 1, day: 1 }, tz);
      query.createdAt = { $gte: startOfYear, $lt: startOfNextYear };
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
        timezone: tz,
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

// @desc    Edit a sale receipt (master override): payment method/status only
// @route   PUT /api/sales/:id
// @access  Private (Superadmin)
const updateSale = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid sale id.' });
    }
    const { paymentMethod, paymentStatus } = req.body;
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ message: 'Sale receipt not found.' });
    }

    const changes = {};
    if (paymentMethod && paymentMethod.toUpperCase() !== sale.paymentMethod) {
      changes.paymentMethod = { from: sale.paymentMethod, to: paymentMethod.toUpperCase() };
      sale.paymentMethod = paymentMethod.toUpperCase();
    }
    if (paymentStatus && paymentStatus !== sale.paymentStatus) {
      changes.paymentStatus = { from: sale.paymentStatus, to: paymentStatus };
      sale.paymentStatus = paymentStatus;
    }

    if (Object.keys(changes).length === 0) {
      return res.json({ message: 'No changes provided.', sale });
    }

    await sale.save();

    res.json({ message: 'Receipt updated.', sale });

    await logAudit({
      action: 'UPDATE_SALE',
      entityType: 'Sale',
      entityId: sale._id,
      entityLabel: sale.transactionId || String(sale._id),
      user: req.user,
      req,
      details: { changes },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Permanently hard-delete a sale receipt (master override).
//          Stock sold in the receipt is restored to inventory.
// @route   DELETE /api/sales/:id
// @access  Private (Superadmin)
const deleteSale = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid sale id.' });
    }
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ message: 'Sale receipt not found.' });
    }

    const label = sale.transactionId || String(sale._id);
    const snapshot = {
      totalAmount: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      itemSkus: (sale.items || []).map((i) => i.sku),
    };

    // Restore stock for each item so inventory stays consistent.
    const bulkOps = (sale.items || [])
      .filter((item) => item.product)
      .map((item) => ({
        updateOne: {
          filter: { _id: item.product },
          update: { $inc: { stockQuantity: item.quantity } },
        },
      }));
    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
      cache.invalidate('products:');
    }

    await sale.deleteOne();

    res.json({ message: `Receipt ${label} permanently deleted; stock restored.` });

    await logAudit({
      action: 'DELETE_SALE',
      entityType: 'Sale',
      entityId: req.params.id,
      entityLabel: label,
      user: req.user,
      req,
      details: { ...snapshot, stockRestored: true },
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
  purgeSales,
  resetCashierSales,
  getCashierAuditLogs,
  exportSalesData,
  hardResetSalesData,
  updateSale,
  deleteSale,
};
