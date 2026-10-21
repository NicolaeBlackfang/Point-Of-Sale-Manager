// Output-escaping helpers for the browser app.
//
// Anything that ends up inside an HTML string (the print/report windows) or
// inside a CSV file must be escaped here first. Sale data is user supplied
// (cashier names, product names, branch labels) and is rendered verbatim in
// the printable reports, so unescaped interpolation is a stored-XSS sink.

/** Escapes a value for safe interpolation into HTML text or attributes. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a value for an HTML attribute that is used as a URL (img src).
 * Only http(s), data: and blob: sources survive — a `javascript:` payload
 * never reaches the DOM. SVG data URLs are rejected on purpose: they are
 * scriptable whenever they are not loaded through an <img> tag.
 */
export function escapeUrlAttribute(value) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) return escapeHtml(raw);
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return escapeHtml(raw);
  if (/^blob:/i.test(raw)) return escapeHtml(raw);
  return '';
}

/**
 * Escapes a value for a CSV cell.
 *
 * Quoting alone is not enough: spreadsheet applications still evaluate cells
 * that start with `=`, `+`, `-` or `@` as formulas (CSV injection). Such
 * values are prefixed with a single quote so they stay inert text.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Neutralise formula injection (leading =, +, -, @, tab or carriage return).
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  // Escape the quote character by doubling it, then wrap the cell in quotes.
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Strips anything that could break out of a <style> block in a printed
 * document (a receipt template may carry custom CSS).
 */
export function sanitizeCustomCss(css) {
  if (!css) return '';
  return String(css)
    .replace(/<\/?style/gi, '')
    .replace(/<\/?script/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, 20000);
}

/** A restrictive CSP for generated print documents (blocks inline scripts). */
export const PRINT_DOCUMENT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: http: https:; font-src data:; form-action 'none'; base-uri 'none'";
