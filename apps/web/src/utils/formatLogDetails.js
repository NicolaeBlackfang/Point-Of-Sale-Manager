const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONEY_FIELDS = new Set(['price', 'totalAmount']);
const PERCENT_FIELDS = new Set(['taxRate']);
const HIDDEN_FIELDS = new Set(['smtpPass', 'password']);

// Boolean meta markers are promoted to a human suffix instead of printed raw.
const META_FLAGS = {
  softDeleted: 'soft-deleted',
  hardDeleted: 'permanently deleted',
  stockRestored: 'stock restored',
};

// "taxRate" -> "Tax Rate", "smtpHost" -> "Smtp Host", "ADDITION" -> "Addition".
export const humanizeKey = (key) =>
  String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w+/g, (word) =>
      word.length > 1 && word === word.toUpperCase()
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    );

// "2026-10" -> "October 2026".
export const formatLogMonth = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!match) return String(value);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return String(value);
  return `${MONTHS[monthIndex]} ${match[1]}`;
};

const formatValue = (key, value, currency = '$') => {
  if (value === null || value === undefined || value === '') return '—';
  if (HIDDEN_FIELDS.has(key)) return '(hidden)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (PERCENT_FIELDS.has(key)) return `${value}%`;
  if (MONEY_FIELDS.has(key)) return `${currency}${Number(value).toFixed(2)}`;
  if (key === 'month') return formatLogMonth(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return formatLogDetails(value, currency);
  return String(value);
};

const pluralize = (count, singular) => `${count} ${singular}${Number(count) === 1 ? '' : 's'}`;

/**
 * Turns a raw system-log `details` object into a short, human-readable string.
 * Falls back to compact `Label: value` pairs — never raw JSON.
 */
export function formatLogDetails(details, currency = '$') {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;

  // Sales reset: { scope: 'cashier' | 'global', month?: 'YYYY-MM' }
  if (details.scope !== undefined) {
    const scopeLabel =
      details.scope === 'cashier'
        ? 'Cashier Scope'
        : details.scope === 'global'
          ? 'Global Scope'
          : humanizeKey(details.scope);
    const monthPart = details.month ? ` - ${formatLogMonth(details.month)}` : '';
    return `Reset Monthly Sales (${scopeLabel})${monthPart}`;
  }

  // Stock-history purge: { entriesRemoved, productsUpdated, purgeScope, before? }
  if (details.entriesRemoved !== undefined) {
    const count = details.entriesRemoved;
    const scope =
      details.purgeScope === 'before' && details.before
        ? ` before ${String(details.before).slice(0, 10)}`
        : ' (all)';
    return `Purged ${count} stock log entr${count === 1 ? 'y' : 'ies'}${scope} across ${
      details.productsUpdated ?? 0
    } product(s)`;
  }

  // Field-level diffs: { changes: { field: { from, to } } }
  if (details.changes && typeof details.changes === 'object' && !Array.isArray(details.changes)) {
    const parts = Object.entries(details.changes).map(
      ([field, change]) =>
        `${humanizeKey(field)} updated: ${formatValue(field, change?.from, currency)} → ${formatValue(
          field,
          change?.to,
          currency
        )}`
    );
    if (parts.length) return parts.join(' · ');
  }

  // Stock adjustment: { adjustmentType, quantityChanged, previousQuantity, newQuantity, reason }
  if (details.adjustmentType) {
    const reason = details.reason ? ` - ${details.reason}` : '';
    return `${humanizeKey(details.adjustmentType)} ${details.quantityChanged} (was ${
      details.previousQuantity
    }, now ${details.newQuantity})${reason}`;
  }

  // Bulk counts: { deletedCount } / { deleted, requested, stockRestored }
  if (details.deletedCount !== undefined) {
    return `Deleted ${pluralize(details.deletedCount, 'record')}`;
  }
  if (details.deleted !== undefined && details.requested !== undefined) {
    const base = `Purged ${details.deleted} of ${details.requested} requested receipt(s)`;
    return details.stockRestored ? `${base} - stock restored` : base;
  }

  // Deleted audit entry: { deletedAction, deletedEntity }
  if (details.deletedAction || details.deletedEntity) {
    const action = details.deletedAction ? humanizeKey(details.deletedAction) : '';
    const entity = details.deletedEntity ? String(details.deletedEntity) : '';
    if (action && entity) return `Deleted ${action} entry (${entity})`;
    return `Deleted ${action || entity || 'log'} entry`;
  }

  // Receipt deletion: { totalAmount, paymentMethod, itemSkus, stockRestored }
  if (details.paymentMethod || details.itemSkus) {
    const parts = [];
    if (details.totalAmount !== undefined) parts.push(`${currency}${Number(details.totalAmount).toFixed(2)}`);
    if (details.paymentMethod) parts.push(String(details.paymentMethod).toUpperCase());
    if (Array.isArray(details.itemSkus) && details.itemSkus.length) {
      parts.push(`items: ${details.itemSkus.join(', ')}`);
    }
    const base = parts.length ? `Deleted receipt: ${parts.join(' · ')}` : 'Deleted receipt';
    return details.stockRestored ? `${base} - stock restored` : base;
  }

  // Generic fallback: label every field, promote boolean meta flags to a suffix.
  const entries = Object.entries(details).filter(
    ([key, value]) => value !== null && value !== undefined && !(key in META_FLAGS)
  );
  const text = entries
    .map(([key, value]) => `${humanizeKey(key)}: ${formatValue(key, value, currency)}`)
    .join(' · ');
  const flags = Object.keys(META_FLAGS)
    .filter((key) => details[key])
    .map((key) => META_FLAGS[key]);
  const suffix = flags.join(', ');

  if (text && suffix) return `${text} — ${suffix}`;
  if (text) return text;
  if (suffix) return suffix.charAt(0).toUpperCase() + suffix.slice(1);
  return null;
}

export default formatLogDetails;
