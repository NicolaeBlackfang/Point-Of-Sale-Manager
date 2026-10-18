const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
});

test('health route responds', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Retail POS System API/);
});

test('unknown route returns JSON 404', async () => {
  const res = await fetch(`${baseUrl}/api/definitely-missing`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.message, 'Route not found');
});

test('CORS blocks disallowed origins', async () => {
  const res = await fetch(`${baseUrl}/`, { headers: { Origin: 'http://evil.example' } });
  assert.equal(res.status, 403);
});

test('CORS allows configured dev origin', async () => {
  const res = await fetch(`${baseUrl}/`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(res.status, 200);
});
