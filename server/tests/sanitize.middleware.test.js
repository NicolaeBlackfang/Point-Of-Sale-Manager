const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripOperators, sanitizeRequest } = require('../middleware/sanitizeMiddleware');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('stripOperators removes top-level $ operators', () => {
  const clean = stripOperators({ username: 'admin', $where: 'this' });
  assert.deepEqual(clean, { username: 'admin' });
});

test('stripOperators removes nested operators and dotted keys', () => {
  const clean = stripOperators({
    username: { $gt: '', keep: 1 },
    'a.b': 1,
    items: [{ sku: 'X', $ne: null }],
  });
  assert.deepEqual(clean, { username: { keep: 1 }, items: [{ sku: 'X' }] });
});

test('sanitizeRequest cleans the body and calls next', () => {
  const req = { body: { username: 'admin', $ne: 1, nested: { $gt: 2, ok: true } }, query: {}, params: {} };
  const res = mockRes();
  let called = false;
  sanitizeRequest(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.deepEqual(req.body, { username: 'admin', nested: { ok: true } });
});

test('sanitizeRequest rejects object-valued query params (NoSQL injection)', () => {
  const req = { body: {}, query: { branch: { $ne: null } }, params: {} };
  const res = mockRes();
  let called = false;
  sanitizeRequest(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
});

test('sanitizeRequest rejects operator-shaped query keys', () => {
  const req = { body: {}, query: { $where: 'x' }, params: {} };
  const res = mockRes();
  let called = false;
  sanitizeRequest(req, res, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
});

test('sanitizeRequest passes clean scalar requests through', () => {
  const req = { body: { username: 'admin' }, query: { branch: '101' }, params: { id: 'abc' } };
  const res = mockRes();
  let called = false;
  sanitizeRequest(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
});
