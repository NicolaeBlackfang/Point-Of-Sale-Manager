const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSettingsInput, taxAmountFor, round2 } = require('../utils/validators');
const { buildMessage, isConfigured, encodeHeader } = require('../utils/mailer');
const { planDailyReport, formatDailyReport } = require('../utils/dailyReport');

// --- tax math (mirrors SettingsContext.taxAmountFor + server createSale) ---

test('taxAmountFor computes percentage, not raw subtotal multiplication', () => {
  assert.equal(taxAmountFor(299, 10), 29.9);
  assert.equal(taxAmountFor(299, '10'), 29.9);
  assert.equal(taxAmountFor(100, 19), 19);
  assert.equal(taxAmountFor(0, 10), 0);
  assert.equal(taxAmountFor(123.45, 0), 0);
});

test('taxAmountFor rounds half up to 2 decimals like the server', () => {
  // 10.10 * 5.5% = 0.5555 -> 0.56
  assert.equal(taxAmountFor(10.1, 5.5), round2(10.1 * 5.5 / 100));
  assert.equal(taxAmountFor(10.1, 5.5), 0.56);
});

// --- settings validation ---

test('validateSettingsInput accepts a full notification/timezone payload', () => {
  const { ok, value } = validateSettingsInput({
    timezone: 'Europe/Berlin',
    webhookUrl: 'https://hooks.example.com/services/abc',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'alerts@example.com',
    smtpPass: 'hunter2',
    emailRecipient: 'owner@example.com',
    lowStockEmailEnabled: true,
    dailyReportEnabled: false,
    dailyReportHour: 7,
  });
  assert.equal(ok, true);
  assert.equal(value.timezone, 'Europe/Berlin');
  assert.equal(value.smtpPort, 587);
  assert.equal(value.dailyReportHour, 7);
  assert.equal(value.lowStockEmailEnabled, true);
});

test('validateSettingsInput rejects invalid timezone', () => {
  assert.equal(validateSettingsInput({ timezone: 'Not/AZone' }).ok, false);
  assert.equal(validateSettingsInput({ timezone: 'UTC' }).ok, true);
});

test('validateSettingsInput requires http(s) webhook URLs', () => {
  assert.equal(validateSettingsInput({ webhookUrl: 'ftp://example.com' }).ok, false);
  assert.equal(validateSettingsInput({ webhookUrl: 'example.com' }).ok, false);
  assert.equal(validateSettingsInput({ webhookUrl: '' }).ok, true);
  assert.equal(validateSettingsInput({ webhookUrl: 'https://example.com/hook' }).ok, true);
});

test('validateSettingsInput validates SMTP port bounds', () => {
  assert.equal(validateSettingsInput({ smtpPort: '25' }).ok, true);
  assert.equal(validateSettingsInput({ smtpPort: 0 }).ok, false);
  assert.equal(validateSettingsInput({ smtpPort: 70000 }).ok, false);
  assert.equal(validateSettingsInput({ smtpPort: 12.5 }).ok, false);
});

test('validateSettingsInput validates recipient e-mail shape', () => {
  assert.equal(validateSettingsInput({ emailRecipient: 'a@b.co' }).ok, true);
  assert.equal(validateSettingsInput({ emailRecipient: '' }).ok, true);
  assert.equal(validateSettingsInput({ emailRecipient: 'not-an-email' }).ok, false);
});

test('validateSettingsInput requires booleans for toggles and 0-23 for report hour', () => {
  assert.equal(validateSettingsInput({ lowStockEmailEnabled: 'yes' }).ok, false);
  assert.equal(validateSettingsInput({ dailyReportEnabled: 1 }).ok, false);
  assert.equal(validateSettingsInput({ dailyReportHour: 24 }).ok, false);
  assert.equal(validateSettingsInput({ dailyReportHour: -1 }).ok, false);
  assert.equal(validateSettingsInput({ dailyReportHour: '9' }).ok, true);
});

// --- mailer message construction ---

test('isConfigured requires both host and recipient', () => {
  assert.equal(isConfigured({ smtpHost: 'smtp.x.com', emailRecipient: 'a@b.co' }), true);
  assert.equal(isConfigured({ smtpHost: 'smtp.x.com' }), false);
  assert.equal(isConfigured({ emailRecipient: 'a@b.co' }), false);
  assert.equal(isConfigured({}), false);
});

test('buildMessage produces a well-formed base64 plain-text e-mail', () => {
  const raw = buildMessage({
    from: 'alerts@example.com',
    to: 'owner@example.com',
    subject: 'Low stock: 2 product(s)',
    text: 'Line one\nLine two',
    date: new Date('2026-10-19T10:00:00.000Z'),
  });

  assert.ok(raw.startsWith('From: alerts@example.com\r\n'));
  assert.ok(raw.includes('To: owner@example.com\r\n'));
  assert.ok(raw.includes('Subject: Low stock: 2 product(s)\r\n'));
  assert.ok(raw.includes('Date: Mon, 19 Oct 2026 10:00:00 GMT\r\n'));
  assert.ok(raw.includes('Content-Transfer-Encoding: base64\r\n'));
  assert.ok(raw.endsWith('.\r\n')); // SMTP data terminator

  const body = raw.split('\r\n\r\n')[1].split('\r\n.\r\n')[0].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Line one\nLine two');
});

test('encodeHeader base64-encodes non-ASCII subjects', () => {
  assert.equal(encodeHeader('Plain ASCII subject'), 'Plain ASCII subject');
  const encoded = encodeHeader('Umsatz € Meldung');
  assert.match(encoded, /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(
    Buffer.from(encoded.replace('=?UTF-8?B?', '').replace('?=', ''), 'base64').toString('utf8'),
    'Umsatz € Meldung'
  );
});

// --- daily report planning (pure decision logic) ---

const baseSettings = {
  dailyReportEnabled: true,
  smtpHost: 'smtp.example.com',
  emailRecipient: 'owner@example.com',
  timezone: 'UTC',
  dailyReportHour: 8,
};

test('planDailyReport stays off before the configured store hour', () => {
  const early = planDailyReport(baseSettings, new Date('2026-10-19T07:59:00.000Z'));
  assert.equal(early.send, false);
});

test('planDailyReport fires at/after the store-local hour for yesterday', () => {
  const onTime = planDailyReport(baseSettings, new Date('2026-10-19T08:00:00.000Z'));
  assert.equal(onTime.send, true);
  assert.equal(onTime.dayKey, '2026-10-18');
  assert.equal(onTime.timezone, 'UTC');
});

test('planDailyReport respects the store timezone for "yesterday" and hour', () => {
  const settings = { ...baseSettings, timezone: 'Asia/Kolkata', dailyReportHour: 9 };
  // 04:00Z = 09:30 IST on Oct 19 -> yesterday in IST is Oct 18.
  const result = planDailyReport(settings, new Date('2026-10-19T04:00:00.000Z'));
  assert.equal(result.send, true);
  assert.equal(result.dayKey, '2026-10-18');

  // Same instant is 23:30 Oct 18 in New York: report hour not reached there.
  const ny = planDailyReport({ ...baseSettings, timezone: 'America/New_York' }, new Date('2026-10-19T04:00:00.000Z'));
  assert.equal(ny.send, false);
});

test('planDailyReport requires enable flag and complete SMTP settings', () => {
  assert.equal(planDailyReport({ ...baseSettings, dailyReportEnabled: false }, new Date('2026-10-19T12:00:00.000Z')).send, false);
  assert.equal(planDailyReport({ ...baseSettings, smtpHost: '' }, new Date('2026-10-19T12:00:00.000Z')).send, false);
  assert.equal(planDailyReport({ ...baseSettings, emailRecipient: '' }, new Date('2026-10-19T12:00:00.000Z')).send, false);
});

test('formatDailyReport renders numbers and placeholders', () => {
  const text = formatDailyReport({
    dayKey: '2026-10-18',
    revenue: 1523.45,
    transactions: 42,
    cash: 900,
    card: 600.45,
    mobile: 23,
    lowStockCount: 3,
    topProducts: [{ sku: 'SKU1', name: 'Widget', units: 10, revenue: 500 }],
    currency: 'USD',
    symbol: '$',
  });

  assert.match(text, /Daily report for 2026-10-18/);
  assert.match(text, /Revenue \(incl\. tax\): \$1523\.45 USD/);
  assert.match(text, /Transactions: 42/);
  assert.match(text, /Products at\/below low-stock threshold: 3/);
  assert.match(text, /1\. SKU1 Widget — 10 unit\(s\), \$500\.00 USD/);

  const empty = formatDailyReport({
    dayKey: '2026-10-18',
    revenue: 0,
    transactions: 0,
    cash: 0,
    card: 0,
    mobile: 0,
    lowStockCount: 0,
    topProducts: [],
    currency: 'EUR',
    symbol: '€',
  });
  assert.match(empty, /no sales recorded/);
});
