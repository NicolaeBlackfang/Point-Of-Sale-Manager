const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Server-side hardening
// ---------------------------------------------------------------------------
const {
  validatePasswordStrength,
  normalizeStaffRole,
  isValidObjectIdString,
  normalizeSaleItems,
  isSafeOutboundUrl,
  assertPublicHost,
  isPrivateAddress,
  MAX_SALE_ITEMS,
  MAX_ITEM_QUANTITY,
} = require('../utils/security');

const { validateSettingsInput, validateProductInput } = require('../utils/validators');

// ---------------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------------

test('password policy rejects short, empty and non-string passwords', () => {
  assert.equal(validatePasswordStrength('').ok, false);
  assert.equal(validatePasswordStrength('a1').ok, false);
  assert.equal(validatePasswordStrength('short1').ok, false);
  assert.equal(validatePasswordStrength(undefined).ok, false);
  assert.equal(validatePasswordStrength(12345678).ok, false);
  assert.equal(validatePasswordStrength('x'.repeat(129)).ok, false);
});

test('password policy requires a letter and a number', () => {
  assert.equal(validatePasswordStrength('abcdefgh').ok, false);
  assert.equal(validatePasswordStrength('12345678').ok, false);
  assert.equal(validatePasswordStrength('Abcdefgh1').ok, true);
});

test('password policy accepts a reasonable password', () => {
  const result = validatePasswordStrength('Sup3rSecret!');
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// Staff roles
// ---------------------------------------------------------------------------

test('staff role normalisation only allows Operator and Cashier', () => {
  assert.equal(normalizeStaffRole('operator').ok, true);
  assert.equal(normalizeStaffRole('operator').role, 'Operator');
  assert.equal(normalizeStaffRole('CASHIER').role, 'Cashier');

  // A Superadmin must never be mintable through the staff endpoints.
  assert.equal(normalizeStaffRole('Superadmin').ok, false);
  assert.equal(normalizeStaffRole('superadmin').ok, false);
  assert.equal(normalizeStaffRole('Admin').ok, false);
  assert.equal(normalizeStaffRole('').ok, false);
  assert.equal(normalizeStaffRole(undefined).ok, false);
  assert.equal(normalizeStaffRole({ $ne: null }).ok, false);
});

// ---------------------------------------------------------------------------
// Sale payload limits (request flooding / DoS)
// ---------------------------------------------------------------------------

test('sale items must be an array with at least one line', () => {
  assert.equal(normalizeSaleItems([]).ok, false);
  assert.equal(normalizeSaleItems('nope').ok, false);
  assert.equal(normalizeSaleItems(undefined).ok, false);
  assert.equal(normalizeSaleItems(null).ok, false);
});

test('sale items are capped so one request cannot flood the database', () => {
  const productId = 'a'.repeat(24);
  const many = Array.from({ length: MAX_SALE_ITEMS + 1 }, () => ({ product: productId, quantity: 1 }));
  const result = normalizeSaleItems(many);
  assert.equal(result.ok, false);
  assert.match(result.error, /at most/i);
});

test('sale line quantity is bounded', () => {
  const productId = 'a'.repeat(24);
  assert.equal(normalizeSaleItems([{ product: productId, quantity: MAX_ITEM_QUANTITY }]).ok, true);

  const tooMany = normalizeSaleItems([
    { product: productId, quantity: MAX_ITEM_QUANTITY + 1 },
  ]);
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.error, /limited to/i);

  assert.equal(normalizeSaleItems([{ product: productId, quantity: 0 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: productId, quantity: -3 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: productId, quantity: 1.5 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: productId, quantity: '2' }]).ok, true);
});

test('sale items reject malformed product identifiers', () => {
  assert.equal(normalizeSaleItems([{ product: 'not-an-id', quantity: 1 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: 'undefined', quantity: 1 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: { $ne: null }, quantity: 1 }]).ok, false);
  assert.equal(normalizeSaleItems([{ product: '', quantity: 1 }]).ok, false);
  assert.equal(normalizeSaleItems([null]).ok, false);
});

test('isValidObjectIdString only accepts 24 hex characters', () => {
  assert.equal(isValidObjectIdString('a'.repeat(24)), true);
  assert.equal(isValidObjectIdString('A1B2C3D4E5F60718293A4B5C'), true);
  assert.equal(isValidObjectIdString('abc'), false);
  assert.equal(isValidObjectIdString('z'.repeat(24)), false);
  assert.equal(isValidObjectIdString(null), false);
  assert.equal(isValidObjectIdString({ $ne: null }), false);
});

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

test('private and metadata addresses are recognised as unsafe', () => {
  const unsafe = [
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '192.168.1.10',
    '172.16.5.4',
    '172.31.255.254',
    '0.0.0.0',
    '169.254.169.254', // AWS/GCP/Azure metadata
    '100.100.100.200', // Alibaba metadata
    '100.64.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
  ];
  for (const address of unsafe) {
    assert.equal(isPrivateAddress(address), true, `${address} must be treated as private`);
  }

  const safe = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111'];
  for (const address of safe) {
    assert.equal(isPrivateAddress(address), false, `${address} must be treated as public`);
  }
});

test('outbound URL validation blocks SSRF targets', () => {
  const blocked = [
    'http://127.0.0.1:5000/api/products',
    'http://localhost:5000/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.0.1/admin',
    'http://[::1]:8080/',
    'file:///etc/passwd',
    'gopher://127.0.0.1:6379/_INFO',
    'ftp://example.com',
    'http://user:pass@example.com/',
    'not-a-url',
  ];
  for (const url of blocked) {
    assert.equal(isSafeOutboundUrl(url).ok, false, `${url} must be rejected`);
  }
});

test('outbound URL validation allows public webhooks', () => {
  const allowed = [
    'https://hooks.example.com/services/abc',
    'http://example.com/hook',
  ];
  for (const url of allowed) {
    assert.equal(isSafeOutboundUrl(url).ok, true, `${url} must be accepted`);
  }
});

test('a hostname that resolves to a private address is rejected', async () => {
  const result = await assertPublicHost('http://localhost/');
  assert.equal(result.ok, false);
});

test('settings validation refuses an internal webhook URL', () => {
  const internal = validateSettingsInput({ webhookUrl: 'http://169.254.169.254/latest/meta-data/' });
  assert.equal(internal.ok, false);
  assert.match(internal.error, /webhook/i);

  const loopback = validateSettingsInput({ webhookUrl: 'http://127.0.0.1:5000/' });
  assert.equal(loopback.ok, false);

  const publicHook = validateSettingsInput({ webhookUrl: 'https://hooks.example.com/abc' });
  assert.equal(publicHook.ok, true);
});

test('settings validation still allows clearing the webhook', () => {
  const cleared = validateSettingsInput({ webhookUrl: '' });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.value.webhookUrl, '');
});

// ---------------------------------------------------------------------------
// Product input hardening
// ---------------------------------------------------------------------------

test('product input rejects negative or absurd prices', () => {
  assert.equal(validateProductInput({ name: 'A', category: 'B', price: -1, stockQuantity: 1 }).ok, false);
  assert.equal(
    validateProductInput({ name: 'A', category: 'B', price: 1e12, stockQuantity: 1 }).ok,
    false
  );
  assert.equal(validateProductInput({ name: 'A', category: 'B', price: 'abc', stockQuantity: 1 }).ok, false);
  assert.equal(validateProductInput({ name: 'A', category: 'B', price: 9.99, stockQuantity: 3 }).ok, true);
});

test('product input rejects negative stock and over-long names', () => {
  assert.equal(validateProductInput({ name: 'A', category: 'B', price: 1, stockQuantity: -5 }).ok, false);
  const long = validateProductInput({
    name: 'x'.repeat(500),
    category: 'B',
    price: 1,
    stockQuantity: 1,
  });
  assert.equal(long.ok, false);
});

test('partial product validation only checks the provided fields', () => {
  const result = validateProductInput({ price: 12.5 }, { partial: true });
  assert.equal(result.ok, true);
  assert.equal(result.value.price, 12.5);
  assert.equal(result.value.name, undefined);
});

// ---------------------------------------------------------------------------
// SMTP settings hardening
// ---------------------------------------------------------------------------

test('smtp settings reject command/header injection attempts', () => {
  // A CRLF in the user name would split the SMTP conversation into extra
  // commands (MAIL FROM / RCPT TO smuggling).
  const injectedUser = validateSettingsInput({
    smtpUser: 'store@example.com\r\nRCPT TO:<victim@example.com>',
  });
  assert.equal(injectedUser.ok, false);
  assert.match(injectedUser.error, /control character/i);

  // A scheme/path in the host would turn the relay target into something else.
  assert.equal(validateSettingsInput({ smtpHost: 'http://127.0.0.1/' }).ok, false);
  assert.equal(validateSettingsInput({ smtpHost: 'smtp.example.com:25' }).ok, false);
  assert.equal(validateSettingsInput({ smtpHost: 'mail.example.com' }).ok, true);
  assert.equal(validateSettingsInput({ smtpHost: '127.0.0.1' }).ok, true);
});

test('smtp password may not contain line breaks', () => {
  assert.equal(validateSettingsInput({ smtpPass: 'secret\r\nquit' }).ok, false);
  assert.equal(validateSettingsInput({ smtpPass: 'secret' }).ok, true);
  assert.equal(validateSettingsInput({ smtpPass: '' }).ok, true);
});

test('the mailer strips control characters from envelope values', () => {
  const { buildMessage, encodeHeader } = require('../utils/mailer');
  const message = buildMessage({
    from: 'store@example.com\r\nRCPT TO:<victim@example.com>',
    to: 'owner@example.com',
    subject: 'Daily report',
    text: 'hello',
  });
  // An injected CRLF would turn the From value into an extra header line.
  const headerLines = message.split('\r\n\r\n')[0].split('\r\n');
  assert.equal(headerLines.length, 7, 'the header block must not grow');
  assert.ok(headerLines[0].startsWith('From: store@example.com '));
  assert.ok(!headerLines.some((line) => line.startsWith('RCPT TO:')));
  // A subject with line breaks is base64 encoded, so it cannot inject headers.
  const subject = encodeHeader('Daily\r\nreport');
  assert.ok(subject.startsWith('=?UTF-8?B?'));
  assert.equal(subject.includes('\r'), false);
});

test('smtp host validation rejects control characters and empty values', () => {
  const { isValidSmtpHost, sanitizeSmtpValue, validateSmtpIdentity } = require('../utils/security');
  assert.equal(isValidSmtpHost('mail.example.com'), true);
  assert.equal(isValidSmtpHost('mail.example.com\r\nX'), false);
  assert.equal(isValidSmtpHost('mail.example.com:25'), false);
  assert.equal(isValidSmtpHost('user@example.com'), false);
  assert.equal(isValidSmtpHost(''), false);
  assert.equal(sanitizeSmtpValue('a\r\nb'), 'a b');
  assert.equal(validateSmtpIdentity('store@example.com').ok, true);
  assert.equal(validateSmtpIdentity('a<b@example.com').ok, false);
});
