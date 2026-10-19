const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_TIMEZONE,
  isValidTimezone,
  normalizeTimezone,
  zonedParts,
  tzOffsetMs,
  wallClockToInstant,
  dayKey,
  monthKey,
  dayKeyToInstant,
  monthRange,
  dayRange,
  lastNDayKeys,
} = require('../utils/timezone');

test('isValidTimezone accepts IANA zones and rejects junk', () => {
  assert.equal(isValidTimezone('UTC'), true);
  assert.equal(isValidTimezone('Europe/Berlin'), true);
  assert.equal(isValidTimezone('Asia/Kolkata'), true);
  assert.equal(isValidTimezone('Not/AZone'), false);
  assert.equal(isValidTimezone(''), false);
  assert.equal(isValidTimezone(null), false);
  assert.equal(isValidTimezone(123), false);
});

test('normalizeTimezone falls back to UTC for invalid input', () => {
  assert.equal(normalizeTimezone('America/New_York'), 'America/New_York');
  assert.equal(normalizeTimezone('garbage'), DEFAULT_TIMEZONE);
  assert.equal(normalizeTimezone(undefined), 'UTC');
});

test('zonedParts resolves wall-clock parts across the date line', () => {
  // 2026-03-15T01:00Z: still 2026-03-14 evening in New York (EDT, UTC-4 —
  // US DST started Mar 8), while Berlin is still on CET (UTC+1 — EU DST
  // starts Mar 29), i.e. already 2026-03-15 02:00 local.
  const instant = new Date('2026-03-15T01:00:00.000Z');
  assert.deepEqual(zonedParts(instant, 'UTC'), {
    year: 2026, month: 3, day: 15, hour: 1, minute: 0, second: 0,
  });
  const ny = zonedParts(instant, 'America/New_York');
  assert.equal(ny.day, 14);
  assert.equal(ny.hour, 21);
  const berlin = zonedParts(instant, 'Europe/Berlin');
  assert.equal(berlin.day, 15);
  assert.equal(berlin.hour, 2);
});

test('tzOffsetMs measures offsets east of UTC including half-hour zones', () => {
  const winter = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(tzOffsetMs(winter, 'UTC'), 0);
  assert.equal(tzOffsetMs(winter, 'Asia/Kolkata'), 5.5 * 3600 * 1000);
  assert.equal(tzOffsetMs(winter, 'Europe/Berlin'), 1 * 3600 * 1000);
  assert.equal(tzOffsetMs(new Date('2026-07-15T12:00:00.000Z'), 'Europe/Berlin'), 2 * 3600 * 1000);
});

test('wallClockToInstant converts store-local midnight to the right instant', () => {
  assert.deepEqual(
    wallClockToInstant({ year: 2026, month: 10, day: 19 }, 'UTC'),
    new Date('2026-10-19T00:00:00.000Z')
  );
  // Berlin winter (UTC+1): local midnight = 23:00Z previous day.
  assert.deepEqual(
    wallClockToInstant({ year: 2026, month: 1, day: 15 }, 'Europe/Berlin'),
    new Date('2026-01-14T23:00:00.000Z')
  );
  // Berlin summer (UTC+2): local midnight = 22:00Z previous day.
  assert.deepEqual(
    wallClockToInstant({ year: 2026, month: 7, day: 15 }, 'Europe/Berlin'),
    new Date('2026-07-14T22:00:00.000Z')
  );
  // Kolkata (UTC+5:30): local midnight = 18:30Z previous day.
  assert.deepEqual(
    wallClockToInstant({ year: 2026, month: 10, day: 19 }, 'Asia/Kolkata'),
    new Date('2026-10-18T18:30:00.000Z')
  );
});

test('wallClockToInstant normalizes out-of-range days (month rollover)', () => {
  // day 0 = last day of previous month via Date.UTC normalization.
  assert.deepEqual(
    wallClockToInstant({ year: 2026, month: 3, day: 0 }, 'UTC'),
    new Date('2026-02-28T00:00:00.000Z')
  );
});

test('dayKey buckets instants by store-local calendar day', () => {
  const instant = new Date('2026-03-15T03:00:00.000Z');
  assert.equal(dayKey(instant, 'UTC'), '2026-03-15');
  assert.equal(dayKey(instant, 'America/New_York'), '2026-03-14');
  assert.equal(dayKey(instant, 'Asia/Tokyo'), '2026-03-15');
});

test('monthKey buckets instants by store-local month', () => {
  const instant = new Date('2026-03-01T00:30:00.000Z');
  assert.equal(monthKey(instant, 'UTC'), '2026-03');
  // 00:30Z is still February in New York.
  assert.equal(monthKey(instant, 'America/New_York'), '2026-02');
});

test('dayKeyToInstant round-trips with dayKey', () => {
  const instant = dayKeyToInstant('2026-10-19', 'Europe/Berlin');
  assert.equal(dayKey(instant, 'Europe/Berlin'), '2026-10-19');
  assert.equal(instant.toISOString(), '2026-10-18T22:00:00.000Z');
});

test('monthRange spans the store-local month including leap February', () => {
  const { start, end } = monthRange(new Date('2026-02-10T12:00:00.000Z'), 'UTC');
  assert.equal(start.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-02-28T23:59:59.999Z');

  const leap = monthRange(new Date('2028-02-10T12:00:00.000Z'), 'UTC');
  assert.equal(leap.end.toISOString(), '2028-02-29T23:59:59.999Z');
});

test('monthRange uses store timezone boundaries (half-hour offsets)', () => {
  // 2026-10-01T01:00Z is already 06:30 on Oct 1 in Kolkata.
  const { start } = monthRange(new Date('2026-10-01T01:00:00.000Z'), 'Asia/Kolkata');
  assert.equal(start.toISOString(), '2026-09-30T18:30:00.000Z');
});

test('dayRange covers exactly one store-local day (DST-safe)', () => {
  const normal = dayRange(new Date('2026-10-19T12:00:00.000Z'), 'UTC');
  assert.equal(normal.start.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(normal.end.toISOString(), '2026-10-19T23:59:59.999Z');

  // Spring-forward day in Berlin is 23 local hours: the end must still be
  // the instant before the next local midnight (22:00Z), not start + 24h - 1.
  const dstDay = dayRange(new Date('2026-03-29T12:00:00.000Z'), 'Europe/Berlin');
  assert.equal(dstDay.start.toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(dstDay.end.toISOString(), '2026-03-29T21:59:59.999Z');
  assert.equal(zonedParts(dstDay.end, 'Europe/Berlin').day, 29);
  assert.equal(zonedParts(dstDay.end, 'Europe/Berlin').hour, 23);
});

test('lastNDayKeys returns contiguous store-local days ending today', () => {
  const keys = lastNDayKeys(3, 'UTC', new Date('2026-01-01T05:00:00.000Z'));
  assert.deepEqual(keys, ['2025-12-30', '2025-12-31', '2026-01-01']);

  const single = lastNDayKeys(1, 'UTC', new Date('2026-10-19T08:00:00.000Z'));
  assert.deepEqual(single, ['2026-10-19']);

  // 05:00Z on Jan 1 is exactly midnight New Year in New York (EST, UTC-5).
  const nyKeys = lastNDayKeys(2, 'America/New_York', new Date('2026-01-01T05:00:00.000Z'));
  assert.deepEqual(nyKeys, ['2025-12-31', '2026-01-01']);
});

test('lastNDayKeys(14) produces a 14-entry zero-fillable series', () => {
  const keys = lastNDayKeys(14, 'UTC', new Date('2026-10-19T10:00:00.000Z'));
  assert.equal(keys.length, 14);
  assert.equal(keys[0], '2026-10-06');
  assert.equal(keys[13], '2026-10-19');
  assert.equal(new Set(keys).size, 14);
});
