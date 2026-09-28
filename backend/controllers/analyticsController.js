const Sale = require('../models/Sale');
const User = require('../models/User');
const Product = require('../models/Product');

// @desc    Get Global Analytics for Superadmin Dashboard
// @route   GET /api/analytics
// @access  Private (Superadmin)
const getGlobalAnalytics = async (req, res) => {
  try {
    // 1. Current Month Date Range
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // 2. Annual Sales (Excludes reset annual transactions)
    const annualSalesAgg = await Sale.aggregate([
      { $match: { isResetForYear: {$ne: true } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
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
          totalMonthlyRevenue: { $sum: '$totalAmount' },
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
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Cashiers Performance Report (Includes Cashiers with $0 Sales)
// @route   GET /api/analytics/cashiers-monthly
// @access  Private (Superadmin)
const getCashierMonthlyPerformance = async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // 1. Fetch all active cashiers directly from User model
    const cashiers = await User.find({ role: 'Cashier', isActive: true }).select('-password');

    // 2. Aggregate sales for the current month excluding reset transactions
    const monthlySales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth,$lte: endOfMonth },
          isResetForMonth: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$cashier',
          monthlyRevenue: { $sum: '$totalAmount' },
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
    res.status(500).json({ message: error.message });
  }
};

// @desc    Wipe/Reset Cashier's Sales Data for Current Month
// @route   DELETE /api/analytics/reset-cashier-sales/:cashierId
// @access  Private (Superadmin)
const resetCashierMonthlySales = async (req, res) => {
  const { cashierId } = req.params;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Flag monthly sales as reset while keeping sales records intact for annual calculations
    const result = await Sale.updateMany(
      {
        cashier: cashierId,
        createdAt: { $gte: startOfMonth,$lte: endOfMonth },
      },
      {
        $set: { isResetForMonth: true },
      }
    );

    // Reset cashier's monthly performance fields on the User document
    await User.findByIdAndUpdate(cashierId, {
      monthlySalesRevenue: 0,
      monthlyTransactionsCount: 0,
    });

    res.json({
      message: 'Monthly sales data reset successfully for cashier',
      deletedCount: result.modifiedCount || result.deletedCount || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset Monthly Sales Data for a Cashier or All Cashiers
// @route   POST /api/analytics/reset-monthly
// @access  Private (Superadmin)
const resetMonthlyData = async (req, res) => {
  const { cashierId } = req.body;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    if (cashierId) {
      // 1. Reset monthly stats on User document
      await User.findByIdAndUpdate(cashierId, {
        monthlySalesRevenue: 0,
        monthlyTransactionsCount: 0,
      });

      // 2. Mark current month's sales as reset
      await Sale.updateMany(
        { cashier: cashierId, createdAt: { $gte: startOfMonth,$lte: endOfMonth } },
        { $set: { isResetForMonth: true } }
      );

      return res.json({ message: 'Monthly performance data reset successfully for cashier.' });
    }

    // Global reset across all cashiers
    await User.updateMany(
      { role: 'Cashier' },
      { monthlySalesRevenue: 0, monthlyTransactionsCount: 0 }
    );

    await Sale.updateMany(
      { createdAt: { $gte: startOfMonth,$lte: endOfMonth } },
      { $set: { isResetForMonth: true } }
    );

    res.json({ message: 'Global monthly sales performance data reset successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update Staff Details (Operator / Cashier)
// @route   PUT /api/auth/staff/:id
// @access  Private (Superadmin)
const updateStaff = async (req, res) => {
  const { roleTakerName, branchNumber, storeAddress, operatorId } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (roleTakerName) user.roleTakerName = roleTakerName.trim();
    if (branchNumber) user.branchNumber = branchNumber.trim();
    if (user.role === 'Cashier' && storeAddress) user.storeAddress = storeAddress.trim();
    if (user.role === 'Operator' && operatorId) user.operatorId = operatorId.trim();

    await user.save();
    res.json({ message: 'Staff member details updated successfully.', user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete Staff Account
// @route   DELETE /api/auth/staff/:id
// @access  Private (Superadmin)
const deleteStaff = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (user.role === 'Superadmin') {
      return res.status(403).json({ message: 'Superadmin accounts cannot be deleted.' });
    }

    await user.deleteOne();
    res.json({ message: `${user.role} account deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
};