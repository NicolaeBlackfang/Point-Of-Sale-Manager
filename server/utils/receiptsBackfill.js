const Sale = require('../models/Sale');
const Receipt = require('../models/Receipt');
const { buildReceiptFromSale, RECEIPT_RETENTION_SECONDS } = require('./receipts');

// One-time, idempotent start-up migration. Sales recorded before receipt
// snapshots existed (or whose snapshot write failed) are given a receipt so the
// 7-day receipt inspector / reprint tool works immediately after a deploy.
// Sales older than the TTL window are skipped: they are outside the receipt
// history anyway, and the Sale ledger itself is never touched.
async function backfillRecentReceipts(logger = console) {
  try {
    const since = new Date(Date.now() - RECEIPT_RETENTION_SECONDS * 1000);

    const sales = await Sale.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    if (!sales.length) return 0;

    const existing = await Receipt.find({
      transactionId: { $in: sales.map((sale) => sale.transactionId) },
    })
      .select('transactionId')
      .lean();

    const alreadyHave = new Set(existing.map((receipt) => receipt.transactionId));
    const docs = sales.filter((sale) => !alreadyHave.has(sale.transactionId)).map(buildReceiptFromSale);

    if (!docs.length) return 0;

    await Receipt.insertMany(docs, { ordered: false });
    if (typeof logger.log === 'function') {
      logger.log(`Receipt history backfilled with ${docs.length} record(s).`);
    }
    return docs.length;
  } catch (error) {
    // Never block server start-up over a cosmetic snapshot.
    if (typeof logger.error === 'function') {
      logger.error('Receipt backfill skipped:', error.message);
    }
    return 0;
  }
}

module.exports = { backfillRecentReceipts };
