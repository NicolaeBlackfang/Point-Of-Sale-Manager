const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  parseImagePayload,
  saveProductImage,
  removeProductImage,
  MAX_IMAGE_BYTES,
} = require('../utils/productImage');
const { buildReceiptFromSale, isReceiptActive, RECEIPT_RETENTION_SECONDS } = require('../utils/receipts');
const { buildRefundPlan, REFUND_WINDOW_DAYS } = require('../utils/refunds');
const app = require('../app');

// ---------------------------------------------------------------------------
// Product image validation
// ---------------------------------------------------------------------------

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(16),
]);

const dataUrl = (mime, buffer) => `data:${mime};base64,${buffer.toString('base64')}`;

test('image payload is required', () => {
  for (const input of [undefined, null, '', '   ']) {
    const result = parseImagePayload(input);
    assert.equal(result.ok, false);
    assert.match(result.error, /required/i);
  }
});

test('non-data-URL payloads are rejected', () => {
  const result = parseImagePayload('https://example.com/cat.png');
  assert.equal(result.ok, false);
  assert.match(result.error, /base64/i);
});

test('disallowed MIME types are rejected', () => {
  const result = parseImagePayload(dataUrl('image/gif', PNG_BYTES));
  assert.equal(result.ok, false);
  assert.match(result.error, /JPEG, PNG or WebP/i);
});

test('magic-byte mismatch is rejected (renamed files cannot slip through)', () => {
  const result = parseImagePayload(dataUrl('image/png', JPEG_BYTES));
  assert.equal(result.ok, false);
  assert.match(result.error, /does not match/i);
});

test('garbage bytes are rejected', () => {
  const result = parseImagePayload(dataUrl('image/png', Buffer.from('<html><body>hi</body></html>')));
  assert.equal(result.ok, false);
  assert.match(result.error, /not a valid image/i);
});

test('oversized payloads are rejected', () => {
  const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1);
  const result = parseImagePayload(dataUrl('image/png', huge));
  assert.equal(result.ok, false);
  assert.match(result.error, /2MB/i);
});

test('valid PNG, JPEG and WebP payloads are accepted', () => {
  for (const [mime, bytes] of [
    ['image/png', PNG_BYTES],
    ['image/jpeg', JPEG_BYTES],
    ['image/webp', WEBP_BYTES],
  ]) {
    const result = parseImagePayload(dataUrl(mime, bytes));
    assert.equal(result.ok, true, `${mime} should parse`);
    assert.equal(result.mime, mime);
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.ok(result.buffer.length >= 12);
  }
});

test('images save under /uploads/products and can be removed', async () => {
  const saved = await saveProductImage(PNG_BYTES, 'image/png');
  assert.match(saved, /^\/uploads\/products\/[0-9a-f-]+\.png$/);

  const onDisk = path.join(__dirname, '..', saved);
  const stat = await fs.stat(onDisk);
  assert.ok(stat.isFile());

  await removeProductImage(saved);
  await assert.rejects(fs.stat(onDisk));

  // Removing a path outside the upload dir is a no-op.
  await removeProductImage('/uploads/products/../../etc/hosts');
  await removeProductImage('https://example.com/not-ours.png');
});

// ---------------------------------------------------------------------------
// Receipt projection (7-day TTL collection)
// ---------------------------------------------------------------------------

const baseSale = {
  _id: '654321000000000000000abc',
  transactionId: 'TXN-1-abc',
  cashier: '654321000000000000000def',
  cashierName: 'Cassie',
  branchNumber: '101',
  storeAddress: 'Main Store',
  customerName: 'Jane',
  paymentMethod: 'cash',
  paymentStatus: 'Completed',
  currency: 'EUR',
  qrCodeDataUrl: 'data:image/png;base64,AAA',
  items: [
    { product: 'p1', sku: 'SKU-1', name: 'Widget', price: 10, quantity: 2, subtotal: 20 },
  ],
  totalAmount: 20,
  taxRate: 10,
  taxAmount: 2,
  totalWithTax: 22,
  createdAt: new Date(),
};

test('buildReceiptFromSale mirrors the printable fields', () => {
  const receipt = buildReceiptFromSale(baseSale);
  assert.equal(receipt.transactionId, 'TXN-1-abc');
  assert.equal(receipt.sale, baseSale._id);
  assert.equal(receipt.customerName, 'Jane');
  assert.equal(receipt.totalWithTax, 22);
  assert.equal(receipt.refundStatus, 'None');
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].sku, 'SKU-1');
});

test('buildReceiptFromSale requires a transaction id', () => {
  assert.throws(() => buildReceiptFromSale(null));
  assert.throws(() => buildReceiptFromSale({ _id: 'x' }));
});

test('receipt retention window is 7 days', () => {
  assert.equal(RECEIPT_RETENTION_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(REFUND_WINDOW_DAYS, 7);

  const now = Date.now();
  assert.equal(isReceiptActive({ createdAt: new Date(now - 1000) }, now), true);
  assert.equal(
    isReceiptActive({ createdAt: new Date(now - RECEIPT_RETENTION_SECONDS * 1000 - 1000) }, now),
    false
  );
  assert.equal(isReceiptActive(null, now), false);
});

// ---------------------------------------------------------------------------
// Refund planning (pure)
// ---------------------------------------------------------------------------

test('refund plan restocks every line and reports the tax-inclusive amount', () => {
  const sale = { ...baseSale, createdAt: new Date('2026-10-19T10:00:00.000Z') };
  const plan = buildRefundPlan(sale, Date.parse('2026-10-20T12:00:00Z'));
  assert.equal(plan.ok, true);
  assert.equal(plan.refundAmount, 22);
  assert.deepEqual(plan.lines, [{ productId: 'p1', sku: 'SKU-1', quantity: 2 }]);
});

test('refund is refused for unknown, refunded, stale or future receipts', () => {
  const now = Date.now();
  assert.equal(buildRefundPlan(null, now).ok, false);

  const refunded = { ...baseSale, refundStatus: 'Refunded' };
  const refundedPlan = buildRefundPlan(refunded, now);
  assert.equal(refundedPlan.ok, false);
  assert.match(refundedPlan.error, /already been refunded/i);

  const oldSale = { ...baseSale, createdAt: new Date(now - (REFUND_WINDOW_DAYS + 1) * 86400000) };
  const oldPlan = buildRefundPlan(oldSale, now);
  assert.equal(oldPlan.ok, false);
  assert.match(oldPlan.error, new RegExp(`${REFUND_WINDOW_DAYS} days`));

  const futureSale = { ...baseSale, createdAt: new Date(now + 60000) };
  assert.equal(buildRefundPlan(futureSale, now).ok, false);

  const emptySale = { ...baseSale, items: [] };
  assert.equal(buildRefundPlan(emptySale, now).ok, false);

  const badQty = { ...baseSale, items: [{ ...baseSale.items[0], quantity: 0 }] };
  assert.equal(buildRefundPlan(badQty, now).ok, false);
});

// ---------------------------------------------------------------------------
// HTTP surface (no database required)
// ---------------------------------------------------------------------------

test('receipt endpoints require authentication', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const list = await fetch(`${baseUrl}/api/sales/receipts`);
    assert.equal(list.status, 401);

    const single = await fetch(`${baseUrl}/api/sales/receipts/TXN-1-abc`);
    assert.equal(single.status, 401);

    const refund = await fetch(`${baseUrl}/api/sales/receipts/TXN-1-abc/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    });
    assert.equal(refund.status, 401);
  } finally {
    server.close();
  }
});

test('product image uploads get the raised JSON limit, other routes keep 10kb', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ~20kb body: rejected on ordinary routes, parsed (then 401) on product writes.
  const payload = JSON.stringify({ blob: 'x'.repeat(20 * 1024) });
  const headers = { 'Content-Type': 'application/json' };

  try {
    const ordinary = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers,
      body: payload,
    });
    assert.equal(ordinary.status, 413);

    const productWrite = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers,
      body: payload,
    });
    assert.equal(productWrite.status, 401);

    // Uploaded images are served straight off the static mount.
    const missing = await fetch(`${baseUrl}/uploads/products/does-not-exist.png`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
});
