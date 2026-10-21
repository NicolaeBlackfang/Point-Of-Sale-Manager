const Sale = require('../models/Sale');
const User = require('../models/User');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const mongoose = require('mongoose');
const { round2 } = require('../utils/validators');
const { logAudit } = require('../utils/audit');
const { resolveResetScope } = require('../utils/resetScope');
const {
  normalizeTimezone,
  monthRange,
  wallClockToInstant,
  dayKey,
  lastNDayKeys,
} = require('../utils/timezone');
const { validatePasswordStrength, normalizeStaffRole } = require('../utils/security');

// Longest accepted profile values (keeps staff records from bloating).
const MAX_NAME_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 250;
const MAX_BRANCH_LENGTH = 40;
const MAX_OPERATOR_ID_LENGTH = 60;

// Refunded sales stay in the financial ledger forever, but they must never
// inflate revenue: every refunded transaction contributes 0 to money metrics.
// Transaction counts are deliberately left untouched so activity totals stay
// honest (a refund is still a real operation).
function activeRevenue(field = '$totalAmount') {
  return { $sum: { $cond: [{ $eq: ['$refundStatus', 'Refunded'] }, 0, field] } };
}

// Store timezone from settings (defaults to UTC) — every date window below is
// computed against it instead of the server's local clock.
async function storeTimezone() {
  try {
    const settings = await Setting.getSettings();
    return normalizeTimezone(settings.timezone);
  } catch {
    return normalizeTimezone(undefined);
  }
}

// @desc    Get Global Analytics for Superadmin Dashboard
// @route   GET /api/analytics
// @access  Private (Superadmin)
const getGlobalAnalytics = async (req, res) => {
  try {
    // 1. Current Month Date Range (store timezone)
    const tz = await storeTimezone();
    const { start: startOfMonth, end: endOfMonth } = monthRange(new Date(), tz);

    // 2. Annual Sales (Excludes reset annual transactions)
    const annualSalesAgg = await Sale.aggregate([
      { $match: { isResetForYear: {$ne: true } } },
      {
        $group: {
          _id: null,
          totalRevenue: activeRevenue(),
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    // 3. Current Monthly Sales (Excludes reset monthly transactions)
    const monthlySalesAgg = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth,$lte: endOfMonth },
          isResetForMonth: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          totalMonthlyRevenue: activeRevenue(),
          totalMonthlyTransactions: { $sum: 1 },
        },
      },
    ]);

    // 4. Staff & Branch Queries
    const activeBranches = await User.distinct('branchNumber', { isActive: true });
    const totalProducts = await Product.countDocuments({ isDeleted: false });

    const activeOperators = await User.find({ role: 'Operator', isActive: true }).select('-password');
    const activeCashiers = await User.find({ role: 'Cashier', isActive: true }).select('-password');

    const annualSummary = annualSalesAgg[0] || { totalRevenue: 0, totalTransactions: 0 };
    const monthlySummary = monthlySalesAgg[0] || { totalMonthlyRevenue: 0, totalMonthlyTransactions: 0 };

    res.json({
      summary: {
        totalRevenue: annualSummary.totalRevenue || 0,
        totalTransactions: annualSummary.totalTransactions || 0,
        totalMonthlyRevenue: monthlySummary.totalMonthlyRevenue || 0,
        totalMonthlyTransactions: monthlySummary.totalMonthlyTransactions || 0,
        totalProducts,
        totalOperators: activeOperators.length,
        totalCashiers: activeCashiers.length,
      },
      operators: activeOperators,
      cashiers: activeCashiers,
      branchPerformance: activeBranches,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Get Cashiers Performance Report (Includes Cashiers with $0 Sales)
// @route   GET /api/analytics/cashiers-monthly
// @access  Private (Superadmin)
const getCashierMonthlyPerformance = async (req, res) => {
  try {
    const tz = await storeTimezone();
    const { start: startOfMonth, end: endOfMonth } = monthRange(new Date(), tz);

    // 1. Fetch all active cashiers directly from User model
    const cashiers = await User.find({ role: 'Cashier', isActive: true }).select('-password');

    // 2. Aggregate sales for the current month, excluding store-wide resets
    //    AND this-report-only per-cashier resets.
    const monthlySales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth,$lte: endOfMonth },
          isResetForMonth: { $ne: true },
          isResetForCashierMonth: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$cashier',
          monthlyRevenue: activeRevenue(),
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    // Create a quick lookup map for monthly sales aggregated values
    const salesMap = {};
    monthlySales.forEach((item) => {
      salesMap[item._id.toString()] = item;
    });

    // 3. Map all cashiers so even cashiers with 0 transactions appear properly
    const report = cashiers.map((cashier) => {
      const salesData = salesMap[cashier._id.toString()] || {};

      return {
        _id: cashier._id,
        cashierId: cashier._id,
        roleTakerName: cashier.roleTakerName || cashier.username,
        cashierName: cashier.roleTakerName || cashier.username,
        username: cashier.username,
        branchNumber: cashier.branchNumber || 'N/A',
        storeAddress: cashier.storeAddress || 'N/A',
        // Monthly Metrics
        monthlyRevenue: salesData.monthlyRevenue || cashier.monthlySalesRevenue || 0,
        monthlySalesRevenue: salesData.monthlyRevenue || cashier.monthlySalesRevenue || 0,
        totalTransactions: salesData.totalTransactions || cashier.monthlyTransactionsCount || 0,
        monthlyTransactionsCount: salesData.totalTransactions || cashier.monthlyTransactionsCount || 0,
        // Annual Metrics
        annualSalesRevenue: cashier.annualSalesRevenue || 0,
        annualTransactionsCount: cashier.annualTransactionsCount || 0,
      };
    });

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Wipe/Reset Cashier's Sales Data for Current Month
// @route   DELETE /api/analytics/reset-cashier-sales/:cashierId
// @access  Private (Superadmin)
const resetCashierMonthlySales = async (req, res) => {
  const { cashierId } = req.params;

  try {
    if (!cashierId || !mongoose.isValidObjectId(cashierId)) {
      return res.status(400).json({ message: 'A valid cashierId is required.' });
    }

    const cashier = await User.findById(cashierId);
    if (!cashier || cashier.role !== 'Cashier') {
      return res.status(404).json({ message: 'Cashier not found.' });
    }

    const tz = await storeTimezone();
    const { start: startOfMonth, end: endOfMonth } = monthRange(new Date(), tz);

    // Flag ONLY this cashier's monthly sales for the cashier-level report.
    // Store-wide monthly revenue (Overview) must stay untouched, so the
    // global isResetForMonth flag is deliberately NOT used here.
    const result = await Sale.updateMany(
      {
        cashier: cashier._id,
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      },
      {
        $set: { isResetForCashierMonth: true },
      }
    );

    // Reset this cashier's monthly performance counters only.
    await User.findByIdAndUpdate(cashier._id, {
      monthlySalesRevenue: 0,
      monthlyTransactionsCount: 0,
    });

    res.json({
      message: 'Monthly sales data reset successfully for cashier',
      deletedCount: result.modifiedCount || result.deletedCount || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Reset Monthly Sales Data for a Cashier or All Cashiers
// @route   POST /api/analytics/reset-monthly
// @access  Private (Superadmin)
const resetMonthlyData = async (req, res) => {
  try {
    // Guard: a missing/invalid cashierId must NEVER trigger a store-wide wipe.
    const scopeResult = resolveResetScope(req.body || {});
    if (!scopeResult.ok) {
      return res.status(400).json({ message: scopeResult.message });
    }

    const tz = await storeTimezone();
    const { start: startOfMonth, end: endOfMonth } = monthRange(new Date(), tz);

    if (scopeResult.scope === 'cashier') {
      const cashier = await User.findById(scopeResult.cashierId);
      if (!cashier || cashier.role !== 'Cashier') {
        return res.status(404).json({ message: 'Cashier not found.' });
      }

      // 1. Reset this cashier's monthly counters only.
      await User.findByIdAndUpdate(cashier._id, {
        monthlySalesRevenue: 0,
        monthlyTransactionsCount: 0,
      });

      // 2. Flag only this cashier's current-month sales for the cashier-level
      //    report. Store-wide monthly totals must never see this flag.
      await Sale.updateMany(
        { cashier: cashier._id, createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
        { $set: { isResetForCashierMonth: true } }
      );

      await logAudit({
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: cashier._id,
        entityLabel: `${cashier.username} (monthly reset)`,
        user: req.user,
        req,
        details: { scope: 'cashier', month: `${startOfMonth.toISOString().slice(0, 7)}` },
      });

      return res.json({
        message: 'Monthly performance data reset successfully for cashier.',
        cashierId: String(cashier._id),
      });
    }

    // Explicit store-wide reset (scope === 'global', sent by System Configuration).
    await User.updateMany(
      { role: 'Cashier' },
      { monthlySalesRevenue: 0, monthlyTransactionsCount: 0 }
    );

    await Sale.updateMany(
      { createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
      { $set: { isResetForMonth: true } }
    );

    await logAudit({
      action: 'UPDATE_SETTINGS',
      entityType: 'Settings',
      entityId: 'store',
      entityLabel: 'Global monthly reset',
      user: req.user,
      req,
      details: { scope: 'global' },
    });

    res.json({ message: 'Global monthly sales performance data reset successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Reset Annual Metrics Globally (Year-End System Override)
// @route   POST /api/analytics/reset-annual
// @access  Private (Superadmin)
const resetAnnualData = async (req, res) => {
  try {
    // 1. Reset user metrics across all accounts
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

    // 2. Flag all sales records as reset for annual tracking
    await Sale.updateMany(
      {},
      { $set: { isResetForYear: true, isResetForMonth: true } }
    );

    res.json({ message: 'Annual revenue and transaction metrics reset successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Update Staff Details (Operator / Cashier) — master control:
//          edit profile, reset credentials, change role, activate/deactivate
// @route   PUT /api/analytics/staff/:id
// @access  Private (Superadmin)
const updateStaff = async (req, res) => {
  const { roleTakerName, branchNumber, storeAddress, operatorId, isActive, password, role } = req.body;

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid staff id.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot modify your own account here.' });
    }

    const changes = {};

    // Reject over-long values before they are written to the user record.
    const lengthError = (value, max, label) => {
      if (typeof value !== 'string') return `${label} must be text.`;
      if (value.trim().length > max) return `${label} must be at most ${max} characters.`;
      return null;
    };
    const nameError = lengthError(roleTakerName, MAX_NAME_LENGTH, 'Name');
    if (nameError) return res.status(400).json({ message: nameError });
    const branchError = lengthError(branchNumber, MAX_BRANCH_LENGTH, 'Branch number');
    if (branchError) return res.status(400).json({ message: branchError });
    const addressError = lengthError(storeAddress, MAX_ADDRESS_LENGTH, 'Store address');
    if (addressError) return res.status(400).json({ message: addressError });
    const operatorIdError = lengthError(operatorId, MAX_OPERATOR_ID_LENGTH, 'Operator ID');
    if (operatorIdError) return res.status(400).json({ message: operatorIdError });

    if (roleTakerName && roleTakerName.trim() !== user.roleTakerName) {
      changes.roleTakerName = { from: user.roleTakerName, to: roleTakerName.trim() };
      user.roleTakerName = roleTakerName.trim();
    }
    if (branchNumber && branchNumber.trim() !== user.branchNumber) {
      changes.branchNumber = { from: user.branchNumber, to: branchNumber.trim() };
      user.branchNumber = branchNumber.trim();
    }
    // Accept profile fields whenever provided. Role-specific requirements are
    // enforced below when the role actually changes (the target role may differ
    // from the current one, so field validity must be judged after both land).
    if (storeAddress && storeAddress.trim() !== user.storeAddress) {
      changes.storeAddress = { from: user.storeAddress, to: storeAddress.trim() };
      user.storeAddress = storeAddress.trim();
    }
    if (operatorId && operatorId.trim() !== user.operatorId) {
      changes.operatorId = { from: user.operatorId, to: operatorId.trim() };
      user.operatorId = operatorId.trim();
    }

    // Role change (e.g. Cashier <-> Operator). Keep required profile fields valid.
    if (role && role !== user.role) {
      // Only managed staff roles may be assigned — a Superadmin account can
      // never be created or promoted through this endpoint.
      const roleResult = normalizeStaffRole(role);
      if (!roleResult.ok) {
        return res.status(400).json({ message: roleResult.error });
      }
      const nextRole = roleResult.role;
      if (nextRole === 'Operator' && !user.operatorId) {
        return res
          .status(400)
          .json({ message: 'Assign an operatorId before changing this user to Operator.' });
      }
      if (nextRole === 'Cashier' && !user.storeAddress) {
        return res
          .status(400)
          .json({ message: 'Assign a store address before changing this user to Cashier.' });
      }
      changes.role = { from: user.role, to: nextRole };
      user.role = nextRole;
    }

    // Credential reset (password is hashed by the User model pre-save hook).
    if (password) {
      const passwordResult = validatePasswordStrength(password);
      if (!passwordResult.ok) {
        return res.status(400).json({ message: passwordResult.error });
      }
      user.password = password;
      changes.password = { from: '(hidden)', to: 'reset' };
    }

    // Account activation toggle (only accept a real boolean).
    if (typeof isActive === 'boolean' && isActive !== user.isActive) {
      changes.isActive = { from: user.isActive, to: isActive };
      user.isActive = isActive;
    }

    if (Object.keys(changes).length === 0) {
      return res.json({ message: 'No changes provided.', user: undefined });
    }

    await user.save();

    await logAudit({
      action: 'UPDATE_USER',
      entityType: 'User',
      entityId: user._id,
      entityLabel: user.username,
      user: req.user,
      req,
      details: { changes },
    });

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ message: 'Staff member details updated successfully.', user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Unable to update staff member.' });
  }
};

// @desc    Permanently delete Staff Account
// @route   DELETE /api/analytics/staff/:id
// @access  Private (Superadmin)
const deleteStaff = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid staff id.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (user.role === 'Superadmin') {
      return res.status(403).json({ message: 'Superadmin accounts cannot be deleted.' });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const label = `${user.username} (${user.role})`;
    await user.deleteOne();

    await logAudit({
      action: 'DELETE_USER',
      entityType: 'User',
      entityId: user._id,
      entityLabel: label,
      user: req.user,
      req,
      details: { role: user.role, branchNumber: user.branchNumber },
    });

    res.json({ message: `${user.role} account deleted successfully.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Get dashboard chart data (daily revenue, top products, payment mix)
// @route   GET /api/analytics/charts
// @access  Private (Superadmin)
const getChartData = async (req, res) => {
  try {
    const now = new Date();
    const tz = await storeTimezone();

    // Rolling 14-day + 30-day windows, aligned to store-timezone midnights.
    const dayKeys14 = lastNDayKeys(14, tz, now);
    const dayKeys30 = lastNDayKeys(30, tz, now);
    const start14Days = wallClockToInstant(
      { year: Number(dayKeys14[0].slice(0, 4)), month: Number(dayKeys14[0].slice(5, 7)), day: Number(dayKeys14[0].slice(8, 10)) },
      tz
    );
    const start30Days = wallClockToInstant(
      { year: Number(dayKeys30[0].slice(0, 4)), month: Number(dayKeys30[0].slice(5, 7)), day: Number(dayKeys30[0].slice(8, 10)) },
      tz
    );

    const dailyRows = await Sale.aggregate([
      { $match: { createdAt: { $gte: start14Days }, isResetForYear: { $ne: true } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: tz } },
          revenue: activeRevenue(),
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Zero-fill every day of the window so the graph renders continuously.
    const dailyByDay = new Map();
    for (const row of dailyRows) {
      dailyByDay.set(dayKey(row._id, tz), row);
    }
    const daily = dayKeys14.map((key) => {
      const row = dailyByDay.get(key);
      return {
        date: key,
        revenue: row ? round2(row.revenue) : 0,
        transactions: row ? row.transactions : 0,
      };
    });

    const topProducts = await Sale.aggregate([
      { $match: { createdAt: { $gte: start30Days } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { sku: '$items.sku', name: '$items.name' },
          quantitySold: activeRevenue('$items.quantity'),
          revenue: activeRevenue('$items.subtotal'),
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    const paymentBreakdown = await Sale.aggregate([
      { $match: { createdAt: { $gte: start30Days } } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          revenue: activeRevenue(),
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({
      daily,
      timezone: tz,
      topProducts: topProducts.map((entry) => ({
        sku: entry._id.sku,
        name: entry._id.name,
        quantitySold: entry.quantitySold,
        revenue: round2(entry.revenue),
      })),
      paymentBreakdown: paymentBreakdown.map((entry) => ({
        method: entry._id,
        count: entry.count,
        revenue: round2(entry.revenue),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Get products at or below the low-stock threshold
// @route   GET /api/analytics/low-stock
// @access  Private (Superadmin)
const getLowStockProducts = async (req, res) => {
  try {
    const settings = await Setting.getSettings();

    const products = await Product.find({
      isDeleted: false,
      stockQuantity: { $lte: settings.lowStockThreshold },
    })
      .select('sku name stockQuantity branchNumber category')
      .sort({ stockQuantity: 1 })
      .limit(100);

    res.json({ threshold: settings.lowStockThreshold, products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getGlobalAnalytics,
  getCashierMonthlyPerformance,
  resetCashierMonthlySales,
  resetMonthlyData,
  resetAnnualData,
  updateStaff,
  deleteStaff,
  getChartData,
  getLowStockProducts,
};