// Store-timezone date helpers built on Intl (no third-party dependencies).
// All analytics windows (day buckets, month ranges, rolling windows) are
// computed against the store's configured timezone instead of server-local time.

const DEFAULT_TIMEZONE = 'UTC';

const formatterCache = new Map();

function getFormatter(timeZone) {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(timeZone) {
  return isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

// Calendar/wall-clock parts of an instant in the given timezone.
function zonedParts(instant, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const parts = getFormatter(tz).formatToParts(instant);
  const lookup = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = Number(part.value);
  }
  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour % 24,
    minute: lookup.minute,
    second: lookup.second,
  };
}

// Offset (ms east of UTC) that `timeZone` has at the given instant.
function tzOffsetMs(instant, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Converts a wall-clock time in `timeZone` into the exact UTC instant.
function wallClockToInstant({ year, month, day, hour = 0, minute = 0, second = 0, ms = 0 }, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let offset = tzOffsetMs(new Date(guess), tz);
  let timestamp = guess - offset;
  // Second pass handles DST transitions where the offset changed.
  offset = tzOffsetMs(new Date(timestamp), tz);
  return new Date(guess - offset);
}

// 'YYYY-MM-DD' key for an instant in the given timezone.
function dayKey(instant, timeZone) {
  const p = zonedParts(instant, timeZone);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

// 'YYYY-MM' key for an instant in the given timezone.
function monthKey(instant, timeZone) {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

// First instant of a 'YYYY-MM-DD' day in the store timezone.
function dayKeyToInstant(key, timeZone) {
  const [year, month, day] = String(key).split('-').map(Number);
  return wallClockToInstant({ year, month, day }, timeZone);
}

// Inclusive day range [start, end) covering the calendar month of `instant`
// in the store timezone.
function monthRange(instant, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const p = zonedParts(instant, tz);
  const start = wallClockToInstant({ year: p.year, month: p.month, day: 1 }, tz);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const endExclusive = wallClockToInstant({ year: nextYear, month: nextMonth, day: 1 }, tz);
  return { start, end: new Date(endExclusive.getTime() - 1) };
}

// Inclusive day range [start, end] covering the calendar day of `instant`.
// DST-safe: `end` is the instant before the next store-local midnight, so
// 23h/25h transition days are handled correctly.
function dayRange(instant, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const p = zonedParts(instant, tz);
  const start = wallClockToInstant({ year: p.year, month: p.month, day: p.day }, tz);
  const nextDate = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const endExclusive = wallClockToInstant(
    { year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() + 1, day: nextDate.getUTCDate() },
    tz
  );
  return { start, end: new Date(endExclusive.getTime() - 1) };
}

// The last `count` calendar day keys ending with "today" in the store
// timezone, oldest first (e.g. ['2026-10-06', ..., '2026-10-19']).
function lastNDayKeys(count, timeZone, reference = new Date()) {
  const tz = normalizeTimezone(timeZone);
  const p = zonedParts(reference, tz);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const cursor = new Date(Date.UTC(p.year, p.month - 1, p.day - i));
    keys.push(cursor.toISOString().slice(0, 10));
  }
  return keys;
}

module.exports = {
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
};
