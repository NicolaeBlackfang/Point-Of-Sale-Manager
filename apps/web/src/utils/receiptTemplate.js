// Receipt template storage (localStorage + Electron IPC fallback)
export const DEFAULT_RECEIPT_TEMPLATE = {
  storeName: 'OpenPOS Store',
  branchAddress: '123 Main Street, City',
  phone: '+00 000 000 000',
  taxId: 'TAX-XXXX-0000',
  headerMessage: 'Thank you for shopping with us!',
  footerMessage: 'Returns accepted within 7 days with this receipt.',
  logoDataUrl: '',
  showLogo: false,
  showQr: true,
  paperWidth: 80,
  customCss: '',
};

const STORAGE_KEY = 'openpos.receiptTemplate';

export function getReceiptTemplate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RECEIPT_TEMPLATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RECEIPT_TEMPLATE, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_RECEIPT_TEMPLATE };
  }
}

export function saveReceiptTemplate(patch) {
  const next = { ...getReceiptTemplate(), ...(patch || {}) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function exportReceiptTemplate(template = getReceiptTemplate()) {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openpos-receipt-template.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importReceiptTemplate(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const merged = { ...DEFAULT_RECEIPT_TEMPLATE, ...(parsed || {}) };
        saveReceiptTemplate(merged);
        resolve(merged);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// The placeholders a store manager can drop into the header/footer messages
// or the print layout.
export const RECEIPT_TEMPLATE_TOKENS = [
  { token: '{{store_name}}', label: 'Store name' },
  { token: '{{branch_address}}', label: 'Branch address' },
  { token: '{{phone}}', label: 'Phone number' },
  { token: '{{tax_id}}', label: 'Tax ID' },
  { token: '{{transaction_id}}', label: 'Transaction ID' },
  { token: '{{customer_name}}', label: 'Customer name' },
  { token: '{{date_time}}', label: 'Date & time' },
  { token: '{{subtotal}}', label: 'Subtotal' },
  { token: '{{tax_amount}}', label: 'Tax amount' },
  { token: '{{total_amount}}', label: 'Total amount' },
  { token: '{{cashier_name}}', label: 'Cashier name' },
  { token: '{{branch_number}}', label: 'Branch number' },
  { token: '{{payment_method}}', label: 'Payment method' },
  { token: '{{item_list}}', label: 'Purchased items' },
];

/**
 * Builds the value map used for placeholder substitution.
 * `data` (the sale) always wins over the saved template defaults.
 */
export function buildReceiptTokens(template = {}, data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    '{{store_name}}': data.storeName || template.storeName || '',
    '{{branch_address}}': data.branchAddress || template.branchAddress || '',
    '{{phone}}': data.phone || template.phone || '',
    '{{tax_id}}': data.taxId || template.taxId || '',
    '{{transaction_id}}': data.transactionId || data.saleId || '',
    '{{customer_name}}': data.customerName || 'Walk-in',
    '{{date_time}}': data.dateTime || formatWhen(data.createdAt),
    '{{subtotal}}': formatAmount(data.totalAmount ?? data.subtotal),
    '{{tax_amount}}': formatAmount(data.taxAmount),
    '{{total_amount}}': formatAmount(data.totalWithTax ?? data.totalAmount),
    '{{cashier_name}}': data.cashierName || '',
    '{{branch_number}}': data.branchNumber != null ? String(data.branchNumber) : '',
    '{{payment_method}}': String(data.paymentMethod || 'CASH').toUpperCase(),
    '{{item_list}}': items.length
      ? items
          .map((item) => `${item.quantity}x ${item.name} - ${formatAmount(item.subtotal)}`)
          .join('\n')
      : '',
  };
}

const formatAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '';
};

const formatWhen = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return new Date().toLocaleString();
  return date.toLocaleString();
};

/**
 * Replaces every supported placeholder in `text`. Unknown placeholders are
 * left untouched so a typo is visible instead of silently blank.
 */
export function renderTokens(text, template = {}, data = {}) {
  if (!text) return '';
  const tokens = buildReceiptTokens(template, data);
  return String(text).replace(/\{\{[a-z_]+\}\}/g, (match) =>
    Object.prototype.hasOwnProperty.call(tokens, match) ? String(tokens[match] ?? '') : match
  );
}

/**
 * Returns a copy of the template with all placeholders resolved.
 */
export function renderReceiptTemplate(template, data = {}) {
  if (!template) return template;
  const resolved = { ...template };
  ['storeName', 'branchAddress', 'phone', 'taxId', 'headerMessage', 'footerMessage'].forEach(
    (key) => {
      if (typeof resolved[key] === 'string') {
        resolved[key] = renderTokens(resolved[key], template, data);
      }
    }
  );
  return resolved;
}
