const Sale = require('../models/Sale');
const Product = require('../models/Product');
const User = require('../models/User');
const Setting = require('../models/Setting');
const Receipt = require('../models/Receipt');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const { round2, escapeRegex } = require('../utils/validators');
const { normalizeSaleItems, isValidObjectIdString, MAX_ITEM_QUANTITY } = require('../utils/security');
const { checkLowStockBulk } = require('../utils/lowStock');
const { logAudit } = require('../utils/audit');
const { normalizeTimezone, dayRange, zonedParts, wallClockToInstant } = require('../utils/timezone');
const { buildReceiptFromSale, RECEIPT_RETENTION_SECONDS } = require('../utils/receipts');
const { buildRefundPlan } = require('../utils/refunds');
const cache = require('../utils/cache');

// The active cashier terminal only keeps receipts for this long; older
// records live on in the Superadmin "Sales Log".
const CASHIER_HISTORY_RETENTION_DAYS = 2;

// Only receipts younger than the 7-day TTL window are reachable through the
// API (MongoDB purges them in the background at exactly this age).
function receiptCutoff() {
  return new Date(Date.now() - RECEIPT_RETENTION_SECONDS * 1000);
}

// Cashiers only operate on their own branch's receipts; Superadmins see all.
function receiptScope(user) {
  if (!user || user.role !== 'Cashier') return {};
  return user.branchNumber ? { branchNumber: user.branchNumber } : { cashier: user._id };
}

function newTransactionId() {
  return `TXN-${Date.now()}-${require('crypto').randomUUID()}`;
}

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
    const { items, paymentMethod, storeAddress, branchNumber, customerName } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items in sale transaction.' });
    }

    // Optional buyer name printed on the receipt only.
    const normalizedCustomerName =
      typeof customerName === 'string' ? customerName.trim().slice(0, 80) : '';
    if (customerName !== undefined && typeof customerName !== 'string') {
      return res.status(400).json({ message: 'Customer name must be text.' });
    }

    // 1. Normalize/validate client-supplied item identifiers and quantities.
    //    Prices are NEVER trusted from the client. The line count and the
    //    per-line quantity are capped so a single request cannot turn into a
    //    database-stalling loop (request-flood / DoS).
    const itemsResult = normalizeSaleItems(items);
    if (!itemsResult.ok) {
      return res.status(400).json({ message: itemsResult.error });
    }
    const normalizedItems = itemsResult.items;

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
    // The server is the source of truth. A Cashier/Operator can never
    // override their own branch: only a Superadmin (who has no branch
    // assignment of their own) may record a sale for another branch, and even
    // then the values are length-capped.
    const isSuperadmin = req.user.role === 'Superadmin';
    const requestedBranch = typeof branchNumber === 'string' ? branchNumber.trim().slice(0, 40) : '';
    const requestedAddress = typeof storeAddress === 'string' ? storeAddress.trim().slice(0, 250) : '';
    const finalBranchNumber =
      req.user.branchNumber || (isSuperadmin ? requestedBranch : '') || '101';
    const finalStoreAddress =
      req.user.storeAddress || (isSuperadmin ? requestedAddress : '') || 'Main Store';

    const taxAmount = round2((computedTotal * taxRate) / 100);
    const totalWithTax = round2(computedTotal + taxAmount);

    // 4. Create Sale document with the server-computed total and tax breakdown.
    //    The transaction id is minted up-front so its QR can be rendered on the
    //    receipt and scanned back into the Refund tool.
    const transactionId = newTransactionId();
    const qrCodeDataUrl = await QRCode.toDataURL(transactionId, { margin: 1, width: 160 });

    const sale = await Sale.create({
      transactionId,
      qrCodeDataUrl,
      cashier: req.user._id,
      cashierName: req.user.roleTakerName || req.user.username,
      branchNumber: finalBranchNumber,
      storeAddress: finalStoreAddress,
      customerName: normalizedCustomerName,
      items: processedItems,
      totalAmount: computedTotal,
      taxRate,
      taxAmount,
      totalWithTax,
      currency: settings.currencyCode,
      paymentMethod: formattedPaymentMethod,
    });

    // 4b. Receipt snapshot (TTL-purged after 7 days). Best-effort: a failed
    //     receipt must never void an already-completed sale, and the refund
    //     endpoint falls back to the Sale ledger anyway.
    try {
      await Receipt.create(buildReceiptFromSale(sale));
    } catch (receiptError) {
      console.error('Receipt snapshot failed:', receiptError.message);
    }

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

// @desc    List printable receipts inside the active 7-day window
// @route   GET /api/sales/receipts
// @access  Private (Cashier own branch, Superadmin all)
const getReceipts = async (req, res) => {
  try {
    const { q, from, to, limit } = req.query;

    const query = { ...receiptScope(req.user) };

    let since = receiptCutoff();
    if (typeof from === 'string' && from.trim()) {
      const parsedFrom = new Date(`${from.trim()}T00:00:00`);
      if (Number.isNaN(parsedFrom.getTime())) {
        return res.status(400).json({ message: 'Invalid "from" date.' });
      }
      if (parsedFrom > since) since = parsedFrom;
    }
    query.createdAt = { $gte: since };

    if (typeof to === 'string' && to.trim()) {
      const parsedTo = new Date(`${to.trim()}T23:59:59.999`);
      if (Number.isNaN(parsedTo.getTime())) {
        return res.status(400).json({ message: 'Invalid "to" date.' });
      }
      query.createdAt.$lte = parsedTo;
    }

    if (typeof q === 'string' && q.trim()) {
      const term = escapeRegex(q.trim());
      const matcher = { $regex: term, $options: 'i' };
      query.$or = [{ transactionId: matcher }, { customerName: matcher }, { cashierName: matcher }];
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const cappedLimit =
      Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

    const receipts = await Receipt.find(query).sort({ createdAt: -1 }).limit(cappedLimit).lean();
    res.json(receipts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Fetch one printable receipt by its transaction id (refund lookup/reprint)
// @route   GET /api/sales/receipts/:transactionId
// @access  Private (Cashier own branch, Superadmin all)
const getReceipt = async (req, res) => {
  try {
    const transactionId = String(req.params.transactionId || '').trim();
    if (!transactionId || transactionId.length > 80) {
      return res.status(400).json({ message: 'Invalid transaction id.' });
    }

    const scope = receiptScope(req.user);
    const receipt = await Receipt.findOne({ transactionId, ...scope }).lean();
    if (receipt) {
      return res.json(receipt);
    }

    // Sales recorded before receipt snapshots existed (or if the snapshot write
    // failed) are still printable straight from the ledger while they are young.
    const sale = await Sale.findOne({
      transactionId,
      ...scope,
      createdAt: { $gte: receiptCutoff() },
    }).lean();

    if (!sale) {
      return res
        .status(404)
        .json({ message: 'Receipt not found or older than 7 days.' });
    }

    res.json(buildReceiptFromSale(sale));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Refund a receipt: restock items, mark the sale refunded
// @route   POST /api/sales/receipts/:transactionId/refund
// @access  Private (Cashier own branch, Superadmin all)
const refundSale = async (req, res) => {
  try {
    const transactionId = String(req.params.transactionId || '').trim();
    if (!transactionId || transactionId.length > 80) {
      return res.status(400).json({ message: 'Invalid transaction id.' });
    }

    const scope = receiptScope(req.user);
    const sale = await Sale.findOne({ transactionId, ...scope });
    if (!sale) {
      return res.status(404).json({ message: 'Receipt not found.' });
    }

    const plan = buildRefundPlan(sale, Date.now());
    if (!plan.ok) {
      return res.status(400).json({ message: plan.error });
    }

    const reason =
      typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';

    // Compare-and-set first so a concurrent request can never refund twice
    // (and therefore never restock twice).
    const refundedSale = await Sale.findOneAndUpdate(
      { _id: sale._id, refundStatus: { $ne: 'Refunded' } },
      {
        $set: {
          refundStatus: 'Refunded',
          refundedAt: new Date(),
          refundedBy: req.user._id,
          refundReason: reason,
        },
      },
      { new: true }
    );

    if (!refundedSale) {
      return res.status(409).json({ message: 'This receipt has already been refunded.' });
    }

    // Restock each refunded line. Soft-deleted products are skipped (their
    // stock is intentionally frozen) — everything else goes back on the shelf.
    const restocked = [];
    for (const line of plan.lines) {
      const updated = await Product.findOneAndUpdate(
        { _id: line.productId, isDeleted: false },
        { $inc: { stockQuantity: line.quantity } },
        { returnDocument: 'after' }
      );
      restocked.push({
        productId: line.productId,
        sku: line.sku,
        quantity: line.quantity,
        stockQuantity: updated ? updated.stockQuantity : null,
      });
    }
    cache.invalidate('products:');

    // Keep the printable snapshot in sync while it is still inside its TTL window.
    try {
      await Receipt.updateOne({ transactionId }, { $set: { refundStatus: 'Refunded' } });
    } catch (receiptError) {
      console.error('Receipt refund sync failed:', receiptError.message);
    }

    // Purge the sale record from the Sales Log after refund (as requested) while
    // keeping an immutable audit trail in System Logs.
    try {
      await Sale.deleteOne({ _id: sale._id });
    } catch (deleteErr) {
      console.error('Failed to purge refunded sale from sales log:', deleteErr.message);
    }

    await logAudit({
      action: 'REFUND_EXECUTED',
      entityType: 'Sale',
      entityId: sale._id,
      entityLabel: sale.transactionId,
      user: req.user,
      req,
      details: {
        transactionId: sale.transactionId,
        refundAmount: plan.refundAmount,
        currency: sale.currency,
        branchNumber: sale.branchNumber,
        customerName: sale.customerName || '',
        reason,
        items: plan.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        refundedBy: req.user.username || req.user.roleTakerName || '',
        refundedAt: new Date().toISOString(),
      },
    });

    res.json({
      message: `Refund of ${plan.refundAmount} ${sale.currency} completed.`,
      refundAmount: plan.refundAmount,
      sale: refundedSale,
      restocked,
    });
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
    // Paged and hard-capped: the audit view must never materialise the whole
    // sales collection in one response.
    const parsedLimit = parseInt(req.query.limit, 10);
    const safeLimit = Math.min(
      Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200,
      500
    );

    const logs = await Sale.find()
      .populate('cashier', 'username roleTakerName branchNumber email')
      .populate('items.product', 'name sku price')
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

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
      if (!isValidObjectIdString(String(cashierId))) {
        return res.status(400).json({ message: 'Invalid cashier ID.' });
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

    // Hard cap: an export must never pull the entire sales ledger into
    // memory (the caller can page through the Sales Log instead).
    const MAX_EXPORT_RECORDS = 5000;
    const sales = await Sale.find(query)
      .populate('cashier', 'username roleTakerName branchNumber storeAddress')
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_RECORDS)
      .lean();

    res.json({
      exportMetadata: {
        totalRecords: sales.length,
        truncated: sales.length === MAX_EXPORT_RECORDS,
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

    // Both fields are constrained by enums in the Sale model — validate them
    // here so a bad request is a clean 400 instead of a 500.
    const ALLOWED_PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE'];
    const ALLOWED_PAYMENT_STATUSES = ['Completed', 'Pending', 'Failed'];

    let nextPaymentMethod;
    if (paymentMethod !== undefined) {
      if (typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
        return res.status(400).json({ message: 'Invalid payment method.' });
      }
      nextPaymentMethod = paymentMethod.trim().toUpperCase();
      if (!ALLOWED_PAYMENT_METHODS.includes(nextPaymentMethod)) {
        return res.status(400).json({ message: 'Invalid payment method.' });
      }
    }

    let nextPaymentStatus;
    if (paymentStatus !== undefined) {
      if (typeof paymentStatus !== 'string' || !paymentStatus.trim()) {
        return res.status(400).json({ message: 'Invalid payment status.' });
      }
      nextPaymentStatus = paymentStatus.trim();
      if (!ALLOWED_PAYMENT_STATUSES.includes(nextPaymentStatus)) {
        return res.status(400).json({ message: 'Invalid payment status.' });
      }
    }

    const changes = {};
    if (nextPaymentMethod && nextPaymentMethod !== sale.paymentMethod) {
      changes.paymentMethod = { from: sale.paymentMethod, to: nextPaymentMethod };
      sale.paymentMethod = nextPaymentMethod;
    }
    if (nextPaymentStatus && nextPaymentStatus !== sale.paymentStatus) {
      changes.paymentStatus = { from: sale.paymentStatus, to: nextPaymentStatus };
      sale.paymentStatus = nextPaymentStatus;
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
  getReceipts,
  getReceipt,
  refundSale,
  purgeSales,
  resetCashierSales,
  getCashierAuditLogs,
  exportSalesData,
  hardResetSalesData,
  updateSale,
  deleteSale,
};
