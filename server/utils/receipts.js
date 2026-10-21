// Printable receipts are operational artefacts, not the financial ledger:
// the Sale documents stay forever (analytics/exports depend on them) while
// the receipt snapshot collection is TTL-purged after 7 days.
const RECEIPT_RETENTION_DAYS = 7;
const RECEIPT_RETENTION_SECONDS = RECEIPT_RETENTION_DAYS * 24 * 60 * 60;

/**
 * Pure projection of a Sale document into the printable receipt record.
 * Kept side-effect free so it can be unit tested without a database.
 */
function buildReceiptFromSale(sale) {
  if (!sale) throw new Error('sale is required');
  if (!sale.transactionId) throw new Error('sale.transactionId is required');

  return {
    transactionId: sale.transactionId,
    sale: sale._id,
    cashier: sale.cashier,
    cashierName: sale.cashierName || '',
    branchNumber: sale.branchNumber || '',
    storeAddress: sale.storeAddress || '',
    customerName: sale.customerName || '',
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    currency: sale.currency,
    qrCodeDataUrl: sale.qrCodeDataUrl || '',
    refundStatus: sale.refundStatus || 'None',
    items: (sale.items || []).map((item) => ({
      product: item.product,
      sku: item.sku,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    totalAmount: sale.totalAmount,
    taxRate: sale.taxRate || 0,
    taxAmount: sale.taxAmount || 0,
    totalWithTax: sale.totalWithTax || sale.totalAmount || 0,
  };
}

function isReceiptActive(receipt, now = Date.now()) {
  if (!receipt || !receipt.createdAt) return false;
  const age = now - new Date(receipt.createdAt).getTime();
  return age >= 0 && age <= RECEIPT_RETENTION_SECONDS * 1000;
}

module.exports = {
  RECEIPT_RETENTION_DAYS,
  RECEIPT_RETENTION_SECONDS,
  buildReceiptFromSale,
  isReceiptActive,
};
