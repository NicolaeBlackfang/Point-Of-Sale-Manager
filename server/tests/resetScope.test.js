const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveResetScope } = require('../utils/resetScope');

const VALID_ID = '65f1c0ffee00000000000123';

test('cashier scope requires a valid ObjectId', () => {
  const result = resolveResetScope({ cashierId: VALID_ID });
  assert.deepEqual(result, { ok: true, scope: 'cashier', cashierId: VALID_ID });
});

test('cashierId with surrounding whitespace is trimmed', () => {
  const result = resolveResetScope({ cashierId: `  ${VALID_ID}  ` });
  assert.equal(result.ok, true);
  assert.equal(result.cashierId, VALID_ID);
});

test('malformed cashierId is rejected, never treated as global', () => {
  const result = resolveResetScope({ cashierId: 'not-an-object-id' });
  assert.equal(result.ok, false);
  assert.match(result.message, /Invalid cashier id/);
});

test('missing cashierId without explicit scope is rejected (no accidental wipe)', () => {
  for (const body of [{}, { cashierId: '' }, { cashierId: '   ' }, null, undefined]) {
    const result = resolveResetScope(body || {});
    assert.equal(result.ok, false, `body ${JSON.stringify(body)} must not pass`);
    assert.match(result.message, /cashierId is required/);
  }
});

test('explicit scope:global is accepted', () => {
  assert.deepEqual(resolveResetScope({ scope: 'global' }), { ok: true, scope: 'global' });
});

test('explicit global:true flag is accepted', () => {
  assert.deepEqual(resolveResetScope({ global: true }), { ok: true, scope: 'global' });
});

test('cashierId wins over a bogus scope field', () => {
  const result = resolveResetScope({ cashierId: VALID_ID, scope: 'global' });
  assert.equal(result.ok, true);
  assert.equal(result.scope, 'cashier');
});

test('near-miss scope values are not treated as global', () => {
  for (const body of [
    { scope: 'Global' },
    { scope: 'store' },
    { scope: 'all' },
    { global: 'true' },
    { global: 1 },
  ]) {
    const result = resolveResetScope(body);
    assert.equal(result.ok, false, `${JSON.stringify(body)} must not pass`);
  }
});
