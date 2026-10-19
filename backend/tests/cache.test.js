const { test } = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../utils/cache');

test('set/get returns stored values and misses return undefined', () => {
  cache.set('t:alpha', { a: 1 }, 60000);
  assert.deepEqual(cache.get('t:alpha'), { a: 1 });
  assert.equal(cache.get('t:missing'), undefined);
});

test('entries expire after their TTL', async () => {
  cache.set('t:short', 'value', 30);
  assert.equal(cache.get('t:short'), 'value');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(cache.get('t:short'), undefined);
});

test('invalidate removes only matching prefixes', () => {
  cache.set('t:products:list:1', [1]);
  cache.set('t:products:list:2', [2]);
  cache.set('t:settings:store', { x: 1 });

  cache.invalidate('t:products:');
  assert.equal(cache.get('t:products:list:1'), undefined);
  assert.equal(cache.get('t:products:list:2'), undefined);
  assert.deepEqual(cache.get('t:settings:store'), { x: 1 });

  cache.invalidate('t:');
  assert.equal(cache.get('t:settings:store'), undefined);
});

test('wrap computes once and serves cached results afterwards', async () => {
  let calls = 0;
  const factory = () => {
    calls += 1;
    return { calls };
  };

  const first = await cache.wrap('t:wrap', 60000, factory);
  const second = await cache.wrap('t:wrap', 60000, factory);
  assert.deepEqual(first, { calls: 1 });
  assert.deepEqual(second, { calls: 1 });
  assert.equal(calls, 1);
});

test('size reports live entries', () => {
  cache.set('t:size:1', 1, 60000);
  cache.set('t:size:2', 2, 60000);
  assert.ok(cache.size() >= 2);
  cache.invalidate('t:size:');
  assert.ok(cache.size() < 2);
});
