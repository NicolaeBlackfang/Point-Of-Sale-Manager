const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escapeRegex, round2, validateSettingsInput } = require('../utils/validators');

test('escapeRegex escapes regex special characters', () => {
  assert.equal(escapeRegex('a.b*c'), 'a\\.b\\*c');
  assert.equal(escapeRegex('SKU-1001'), 'SKU-1001');
  assert.equal(escapeRegex('a+b?'), 'a\\+b\\?');
});

test('round2 rounds to two decimal places', () => {
  assert.equal(round2(10.005), 10.01);
  assert.equal(round2(10.004), 10);
  assert.equal(round2(0), 0);
  assert.equal(round2(19.999999), 20);
});

test('validateSettingsInput accepts valid currency and tax', () => {
  const result = validateSettingsInput({
    currencySymbol: '€',
    currencyCode: 'eur',
    taxRate: 15,
    lowStockThreshold: 3,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    currencySymbol: '€',
    currencyCode: 'EUR',
    taxRate: 15,
    lowStockThreshold: 3,
  });
});

test('validateSettingsInput rejects invalid tax rate', () => {
  const result = validateSettingsInput({ taxRate: 150 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Tax rate/);
});

test('validateSettingsInput rejects invalid currency code', () => {
  const result = validateSettingsInput({ currencyCode: 'US' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Currency code/);
});

test('validateSettingsInput rejects empty body', () => {
  const result = validateSettingsInput({});
  assert.equal(result.ok, false);
});
