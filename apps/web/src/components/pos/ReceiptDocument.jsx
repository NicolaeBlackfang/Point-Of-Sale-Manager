import React, { useRef, useState } from 'react';
import { X, Printer, CheckCircle2, Undo2, Loader2 } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { getPrinterConfig, buildEscPosReceipt, sendToPrinter } from '../../utils/printer';

const formatWhen = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

/**
 * Printable receipt. Works with both a freshly created Sale (checkout response)
 * and a Receipt snapshot from the inspector/refund lookup.
 *
 * The paper block carries `id="receipt-print-area"` so the print stylesheet in
 * index.css can isolate it when printing.
 */
const ReceiptDocument = ({
  sale,
  onClose,
  actionLabel,
  onAction,
  actionIcon,
  closeLabel = 'New sale',
}) => {
  const { formatCurrency, settings } = useSettings();
  const printRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState('');
  const printerConfig = getPrinterConfig();

  if (!sale) return null;

  const items = sale.items || [];
  const subtotal = Number(sale.totalAmount || 0);
  const taxRate = Number(sale.taxRate || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const grandTotal =
    sale.totalWithTax !== undefined && sale.totalWithTax !== null
      ? Number(sale.totalWithTax)
      : subtotal + taxAmount;

  const isRefunded = sale.refundStatus === 'Refunded';

  const handlePrint = async () => {
    setPrintMsg('');
    // System Print just prints what is on screen; hardware transports send a
    // hand-built ESC/POS stream straight to the device.
    if (printerConfig.transport === 'system') {
      window.print();
      return;
    }

    setPrinting(true);
    const bytes = buildEscPosReceipt(sale, {
      paperWidth: printerConfig.paperWidth,
      includeQr: printerConfig.includeQr,
      currencySymbol: settings.currencySymbol,
    });
    const result = await sendToPrinter(bytes, printerConfig);
    setPrinting(false);
    setPrintMsg(result.message);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header (screen only) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60 print:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Receipt</h3>
              <p className="text-xs text-slate-500 font-mono">{sale.transactionId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            aria-label="Close receipt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Paper */}
        <div className="overflow-y-auto p-4 bg-slate-100">
          <div
            id="receipt-print-area"
            ref={printRef}
            className={`mx-auto w-full max-w-[320px] bg-white text-slate-900 font-mono text-[11px] leading-relaxed p-4 shadow-sm${
              printerConfig.paperWidth === 58 ? ' paper-58' : ''
            }`}
          >
            <div className="text-center space-y-0.5">
              <p className="font-bold text-[13px] uppercase tracking-wide">
                {sale.storeAddress || 'OpenPOS Store'}
              </p>
              <p>Branch #{sale.branchNumber || '—'}</p>
              <p>{formatWhen(sale.createdAt)}</p>
              <p>Cashier: {sale.cashierName || '—'}</p>
              {sale.customerName ? <p>Customer: {sale.customerName}</p> : null}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2.5" />

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500">Transaction ID</p>
                <p className="font-bold break-all">{sale.transactionId}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Payment: {String(sale.paymentMethod || 'CASH').toUpperCase()}
                </p>
                <p className="text-[10px] text-slate-500">
                  Status: {sale.paymentStatus || 'Completed'}
                </p>
              </div>
              {sale.qrCodeDataUrl ? (
                <img
                  src={sale.qrCodeDataUrl}
                  alt={`QR code for ${sale.transactionId}`}
                  className="w-20 h-20 shrink-0"
                />
              ) : null}
            </div>

            <div className="border-t border-dashed border-slate-400 my-2.5" />

            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-slate-500">
                  <th className="text-left font-normal">Item</th>
                  <th className="text-center font-normal">Qty</th>
                  <th className="text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.sku || index}-${index}`}>
                    <td className="py-0.5 pr-1 align-top break-words">{item.name}</td>
                    <td className="py-0.5 text-center align-top whitespace-nowrap">
                      {item.quantity} × {Number(item.price).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right align-top whitespace-nowrap">
                      {Number(item.subtotal).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-slate-400 my-2.5" />

            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax ({taxRate}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-[13px] pt-1 border-t border-slate-300">
                <span>TOTAL</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-400 my-2.5" />

            <div className="text-center space-y-1">
              {isRefunded ? (
                <p className="font-bold text-red-700 uppercase">
                  REFUNDED{sale.refundedAt ? ` — ${formatWhen(sale.refundedAt)}` : ''}
                </p>
              ) : (
                <p>Returns &amp; refunds accepted within 7 days with this receipt.</p>
              )}
              <p className="font-semibold">Thank you for shopping with us!</p>
              <p className="text-[9px] text-slate-500">Powered by OpenPOS</p>
            </div>
          </div>
        </div>

        {/* Actions (screen only) */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white print:hidden space-y-2">
          {printMsg ? (
            <p className="text-[11px] text-slate-500 text-right">{printMsg}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {actionLabel && onAction ? (
              <button
                onClick={onAction}
                className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition text-xs"
              >
                {actionIcon || <Undo2 className="h-4 w-4" />}
                <span>{actionLabel}</span>
              </button>
            ) : null}
            <button
              onClick={handlePrint}
              disabled={printing}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold transition text-xs disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              <span>
                {printing
                  ? 'Printing…'
                  : `Print${printerConfig.transport === 'system' ? '' : ` (${printerConfig.transport})`}`}
              </span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition text-xs"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptDocument;
