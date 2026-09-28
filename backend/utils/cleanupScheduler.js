const cron = require('node-cron');
const Sale = require('../models/Sale');
const Product = require('../models/Product');

const initCleanupScheduler = () => {
  // 1. Run every night at midnight (00:00) to clear sales/transactions from the database
  cron.schedule('0 0 * * *', async () => {
    try {
      const result = await Sale.deleteMany({});
      console.log(`[CRON] Daily sales cleanup complete. Deleted ${result.deletedCount} transaction records.`);
    } catch (error) {
      console.error('[CRON] Error during daily sales cleanup:', error);
    }
  });

  // 2. Run every night at midnight to permanently delete soft-deleted products older than 7 days
  cron.schedule('0 0 * * *', async () => {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await Product.deleteMany({
        isDeleted: true,
        updatedAt: { $lte: oneWeekAgo },
      });
      console.log(`[CRON] Weekly audit log cleanup complete. Permanently removed ${result.deletedCount} products older than 1 week.`);
    } catch (error) {
      console.error('[CRON] Error during permanent product cleanup:', error);
    }
  });
};

module.exports = initCleanupScheduler;