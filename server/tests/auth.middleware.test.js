const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protect, authorize } = require('../middleware/authMiddleware');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
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

test('authorize allows listed roles', () => {
  const middleware = authorize('Cashier', 'Superadmin');
  let nextCalled = false;
  middleware({ user: { role: 'Cashier' } }, mockRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('authorize rejects unlisted roles with 403', () => {
  const middleware = authorize('Superadmin');
  const res = mockRes();
  let nextCalled = false;
  middleware({ user: { role: 'Cashier' } }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Forbidden' });
});

test('authorize rejects requests with no user', () => {
  const middleware = authorize('Superadmin');
  const res = mockRes();
  let nextCalled = false;
  middleware({}, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('protect rejects missing authorization header with 401', async () => {
  const res = mockRes();
  let nextCalled = false;
  await protect({ headers: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Not authorized' });
});

test('protect rejects malformed token with 401', async () => {
  const res = mockRes();
  let nextCalled = false;
  await protect(
    { headers: { authorization: 'Bearer not-a-real-token' } },
    res,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
