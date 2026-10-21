// Printable report builders for the financial export module.
//
// These are pure functions on purpose: every value they interpolate comes
// from the sales ledger (cashier names, branch labels, transaction ids) and
// therefore from user input. All of it is escaped here so the generated
// document can never execute script.

import { escapeHtml, escapeCsvCell, PRINT_DOCUMENT_CSP } from './sanitize.js';

const CSV_HEADERS = [
  'Transaction ID',
  'Date/Time',
  'Cashier Name',
  'Branch',
  'Store Address',
  'Payment Method',
  'Payment Status',
  'Items Count',
  'Total Amount',
];

/** Builds the CSV export. Every cell is escaped and formula-prefixes are neutralised. */
export function buildSalesCsv(sales, periodLabel = '') {
  if (!Array.isArray(sales) || sales.length === 0) {
    return `STATUS,MESSAGE\nNO_DATA,${escapeCsvCell(`No sales done in ${periodLabel}`)}`;
  }

  const rows = sales.map((sale) => [
    escapeCsvCell(sale.transactionId || sale._id),
    escapeCsvCell(new Date(sale.createdAt).toLocaleString()),
    escapeCsvCell(sale.cashier?.roleTakerName || sale.cashier?.username || 'N/A'),
    escapeCsvCell(sale.branchNumber || 'N/A'),
    escapeCsvCell(sale.storeAddress || 'N/A'),
    escapeCsvCell(sale.paymentMethod || 'CASH'),
    escapeCsvCell(sale.paymentStatus || 'Completed'),
    sale.items?.length || 0,
    (sale.totalWithTax ?? sale.totalAmount ?? 0).toFixed(2),
  ]);

  return [CSV_HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/** Builds the table rows of the printable report. */
export function buildReportTableRows(sales, formatCurrency = (value) => String(value), periodLabel = '') {
  const list = Array.isArray(sales) ? sales : [];
  const grandTotal = list.reduce((sum, s) => sum + (s.totalWithTax ?? s.totalAmount ?? 0), 0);
  const isZeroSales = list.length === 0 || grandTotal === 0;

  if (isZeroSales) {
    return `<tr><td colspan="7" style="text-align:center; padding: 30px; font-weight: bold; color: #64748b; font-size: 14px;">
           ⚠️ No sales done in ${escapeHtml(periodLabel)}
         </td></tr>`;
  }

  return list
    .map(
      (s, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
              <td style="padding: 8px;">${idx + 1}</td>
              <td style="padding: 8px; font-family: monospace;">${escapeHtml(s.transactionId || s._id)}</td>
              <td style="padding: 8px;">${escapeHtml(new Date(s.createdAt).toLocaleString())}</td>
              <td style="padding: 8px;">${escapeHtml(s.cashier?.roleTakerName || s.cashier?.username || 'N/A')}</td>
              <td style="padding: 8px;">${escapeHtml(s.branchNumber || 'N/A')}</td>
              <td style="padding: 8px;">${escapeHtml(s.paymentMethod || 'CASH')}</td>
              <td style="padding: 8px; text-align: right; font-weight: bold;">${escapeHtml(formatCurrency(s.totalWithTax ?? s.totalAmount ?? 0))}</td>
            </tr>
          `
    )
    .join('');
}

/** Builds the complete printable report document. */
export function buildReportHtml({
  sales = [],
  scope = 'global',
  periodLabel = '',
  formatCurrency = (value) => String(value),
} = {}) {
  const list = Array.isArray(sales) ? sales : [];
  const grandTotal = list.reduce((sum, s) => sum + (s.totalWithTax ?? s.totalAmount ?? 0), 0);
  const isZeroSales = list.length === 0 || grandTotal === 0;
  const tableRows = isZeroSales
    ? `<tr><td colspan="7" style="text-align:center; padding: 30px; font-weight: bold; color: #64748b; font-size: 14px;">
           ⚠️ No sales done in ${escapeHtml(periodLabel)}
         </td></tr>`
    : buildReportTableRows(list, formatCurrency);

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="Content-Security-Policy" content="${escapeHtml(PRINT_DOCUMENT_CSP)}" />
          <title>Financial Sales Report - ${escapeHtml(periodLabel)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
            .title { font-size: 20px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 30px; }
            .no-sales-banner { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
            .stat { font-size: 12px; }
            .stat-val { font-size: 16px; font-weight: bold; color: ${isZeroSales ? '#94a3b8' : '#10b981'}; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f1f5f9; text-align: left; padding: 8px; font-size: 11px; font-weight: 700; color: #475569; border-bottom: 2px solid #cbd5e1; }
            .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 15px;">
            <button id="openpos-print-report" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">
              Print / Save as PDF
            </button>
          </div>
          <div class="header">
            <div>
              <div class="title">Financial Sales Report</div>
              <div class="subtitle">Scope: ${escapeHtml(String(scope).toUpperCase())} | Period: ${escapeHtml(periodLabel)}</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #64748b;">
              <div>Generated: ${escapeHtml(new Date().toLocaleString())}</div>
              <div>System: POS Control Panel</div>
            </div>
          </div>

          ${
            isZeroSales
              ? `<div class="no-sales-banner">ℹ️ No sales done in ${escapeHtml(periodLabel)} ($0.00 revenue recorded).</div>`
              : ''
          }

          <div class="summary-box">
            <div class="stat">
              <div>Total Transactions:</div>
              <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${list.length}</div>
            </div>
            <div class="stat">
              <div>Grand Total Revenue:</div>
              <div class="stat-val">${escapeHtml(formatCurrency(grandTotal))}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transaction ID</th>
                <th>Date / Time</th>
                <th>Cashier</th>
                <th>Branch</th>
                <th>Payment</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            Confidential Document &bull; Generated by POS Control Panel
          </div>
        </body>
      </html>
    `;
}
