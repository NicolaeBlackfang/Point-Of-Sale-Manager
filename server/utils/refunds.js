const REFUND_WINDOW_DAYS = 7;
const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Validates a sale for a receipt-based refund and computes the restock plan.
 * Pure function (no database access) so it can be unit tested directly.
 *
 * Returns:
 *   { ok: false, error } when the refund cannot be executed, or
 *   { ok: true, refundAmount, taxAmount, lines: [{ productId, sku, quantity }] }
 */
function buildRefundPlan(sale, now = Date.now()) {
  if (!sale) return { ok: false, error: 'Receipt not found.' };
  if (sale.refundStatus === 'Refunded') {
    return { ok: false, error: 'This receipt has already been refunded.' };
  }

  const createdMs = sale.createdAt ? new Date(sale.createdAt).getTime() : NaN;
  if (Number.isNaN(createdMs)) {
    return { ok: false, error: 'Receipt has no valid timestamp.' };
  }
  if (now - createdMs > REFUND_WINDOW_MS) {
    return { ok: false, error: `Receipt is older than ${REFUND_WINDOW_DAYS} days and can no longer be refunded.` };
  }
  if (now < createdMs) {
    return { ok: false, error: 'Receipt timestamp is in the future.' };
  }

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (!items.length) return { ok: false, error: 'Receipt has no line items.' };

  const lines = [];
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'Receipt contains an invalid line quantity.' };
    }
    if (!item.product) {
      return { ok: false, error: 'Receipt line is missing its product reference.' };
    }
    lines.push({ productId: item.product, sku: item.sku, quantity });
  }

  const refundAmount = round2(
    sale.totalWithTax !== undefined && sale.totalWithTax !== null
      ? sale.totalWithTax
      : (Number(sale.totalAmount) || 0) + (Number(sale.taxAmount) || 0)
  );

  return { ok: true, refundAmount, taxAmount: Number(sale.taxAmount) || 0, lines };
}

module.exports = { REFUND_WINDOW_DAYS, REFUND_WINDOW_MS, buildRefundPlan, round2 };
