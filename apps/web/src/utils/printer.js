// Thermal printer support for receipt output — hand-rolled ESC/POS byte
// building plus browser transport adapters (System Print / Native Print /
// WebUSB / WebBluetooth / Web Serial). No third-party printer library is used.

import { isDesktop, listSystemPrinters, printHtmlReceipt, printEscPosOverNetwork } from '../services/electron';
import { getReceiptTemplate, renderTokens } from './receiptTemplate';
import { escapeUrlAttribute, sanitizeCustomCss, PRINT_DOCUMENT_CSP } from './sanitize.js';

export const DEFAULT_PRINTER_CONFIG = {
  // Roll width in millimetres: 80mm → 48 columns, 58mm → 32 columns.
  paperWidth: 80,
  // 'system' uses the browser print dialog (works everywhere).
  // 'native' uses Electron's silent webContents.print() (desktop app only).
  // 'escpos-network' sends a raw ESC/POS stream to a networked POS printer.
  transport: 'system',
  baudRate: 9600,
  // Print automatically after a successful payment (System Print only when the
  // receipt is on screen; hardware transports print the ESC/POS byte stream).
  autoPrint: false,
  includeQr: true,
  // Name of the OS printer selected in the desktop app.
  deviceName: '',
  silent: true,
  // Networked ESC/POS printer (used by the 'escpos-network' transport).
  printerHost: '',
  printerPort: 9100,
};

const STORAGE_KEY = 'openpos.printer';

export function getPrinterConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINTER_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      paperWidth: Number(parsed?.paperWidth) === 58 ? 58 : 80,
    };
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
}

export function savePrinterConfig(patch) {
  const next = { ...getPrinterConfig(), ...(patch || {}) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full/blocked — config still applies for this session */
  }
  return next;
}

export const columnsFor = (paperWidth) => (Number(paperWidth) === 58 ? 32 : 48);

// ---------------------------------------------------------------------------
// ESC/POS byte builder (pure — returns a Uint8Array for a plain sale object)
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

const ESC = 0x1b;
const GS = 0x1d;

function padEnd(str, width) {
  const s = String(str);
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function qrCodeBytes(text) {
  const data = textEncoder.encode(text);
  const payloadLength = data.length + 3;
  const low = payloadLength & 0xff;
  const high = (payloadLength >> 8) & 0xff;
  return [
    // Model 2
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x4e, 0x32,
    // Error correction level M
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // Module size 6
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x53, 0x36,
    // Store the data
    GS, 0x28, 0x6b, low, high, 0x31, 0x50, 0x30, ...data,
    // Print the symbol
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/**
 * Builds the ESC/POS byte stream for a sale/receipt object.
 *
 * @param {object} sale      Sale or Receipt document (transactionId, items, totals…)
 * @param {object} options   { paperWidth, includeQr, currencySymbol }
 * @returns {Uint8Array}
 */
export function buildEscPosReceipt(sale, options = {}) {
  const paperWidth = Number(options.paperWidth) === 58 ? 58 : 80;
  const cols = columnsFor(paperWidth);
  const includeQr = options.includeQr !== false;
  const symbol = options.currencySymbol || '$';

  const out = [];
  const put = (...values) => out.push(...values);
  const putText = (text) => out.push(...textEncoder.encode(String(text)));
  const putLine = (text = '') => {
    putText(text);
    put(0x0a);
  };
  const rule = () => putLine('-'.repeat(cols));

  const items = Array.isArray(sale.items) ? sale.items : [];
  const subtotal = Number(sale.totalAmount || 0);
  const taxRate = Number(sale.taxRate || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const grandTotal =
    sale.totalWithTax !== undefined && sale.totalWithTax !== null
      ? Number(sale.totalWithTax)
      : subtotal + taxAmount;
  const money = (value) => `${symbol}${Number(value || 0).toFixed(2)}`;

  // Reset + line spacing
  put(ESC, 0x40);

  // Header (centre, bold, double size)
  put(ESC, 0x61, 0x01);
  put(ESC, 0x45, 0x01);
  put(GS, 0x21, 0x11);
  putLine(String(sale.storeAddress || 'OpenPOS Store').toUpperCase().slice(0, cols));
  put(GS, 0x21, 0x00);
  put(ESC, 0x45, 0x00);
  putLine(`Branch #${sale.branchNumber || '-'}`);
  const stamp = sale.createdAt ? new Date(sale.createdAt) : new Date();
  putLine(stamp.toLocaleString());
  putLine(`Cashier: ${sale.cashierName || '-'}`);
  if (sale.customerName) putLine(`Customer: ${sale.customerName}`);
  put(ESC, 0x61, 0x00);

  rule();
  // Transaction id, wrapped to the paper width
  const txn = String(sale.transactionId || '');
  for (let i = 0; i < txn.length; i += cols) {
    putLine(txn.slice(i, i + cols));
  }
  putLine(`Paid via ${String(sale.paymentMethod || 'CASH').toUpperCase()}`);
  rule();

  for (const item of items) {
    const amount = money(item.subtotal);
    const nameWidth = Math.max(cols - amount.length - 1, 6);
    putLine(`${padEnd(item.name, nameWidth)} ${amount}`);
    putLine(`  ${item.quantity} x ${money(item.price)}`);
  }

  rule();
  const totalRow = (label, value) => {
    const amount = money(value);
    putLine(`${padEnd(label, Math.max(cols - amount.length - 1, 6))} ${amount}`);
  };
  totalRow('Subtotal', subtotal);
  totalRow(`Tax (${taxRate}%)`, taxAmount);
  put(GS, 0x45, 0x01); // bold on
  totalRow('TOTAL', grandTotal);
  put(GS, 0x45, 0x00); // bold off
  rule();

  put(ESC, 0x61, 0x01);
  if (sale.refundStatus === 'Refunded') {
    putLine('*** REFUNDED ***');
  } else {
    putLine('Returns accepted within 7 days');
    putLine('with this receipt. Thank you!');
  }

  if (includeQr && txn) {
    put(0x1b, 0x64, 0x02); // feed two lines
    for (const byte of qrCodeBytes(txn)) put(byte);
  }

  putLine('');
  put(ESC, 0x61, 0x00);
  putLine(`Powered by OpenPOS — ${paperWidth}mm`);
  put(0x1b, 0x64, 0x04); // feed before cutting
  put(GS, 0x56, 0x42, 0x00); // partial cut (ignored if unsupported)

  return Uint8Array.from(out);
}

/** Short self-test page for the printer settings panel. */
export function buildTestPage(config = {}) {
  const paperWidth = Number(config.paperWidth) === 58 ? 58 : 80;
  const cols = columnsFor(paperWidth);
  const out = [];
  const put = (...values) => out.push(...values);
  const putLine = (text = '') => {
    out.push(...textEncoder.encode(String(text)));
    out.push(0x0a);
  };

  put(ESC, 0x40);
  put(ESC, 0x61, 0x01);
  put(GS, 0x21, 0x11);
  putLine('OPENPOS');
  put(GS, 0x21, 0x00);
  putLine(`Printer test — ${paperWidth}mm`);
  putLine('-'.repeat(cols));
  putLine('0123456789 ABCDEFGHIJKLM');
  putLine('nopqrstuvwxyz <>#@&*');
  put(GS, 0x45, 0x01);
  putLine('BOLD TEXT');
  put(GS, 0x45, 0x00);
  putLine('-'.repeat(cols));
  for (const byte of qrCodeBytes('OPENPOS-TEST')) out.push(byte);
  putLine('');
  put(ESC, 0x61, 0x00);
  put(0x1b, 0x64, 0x04);
  put(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const chunk = (buffer, size) => {
  const parts = [];
  for (let i = 0; i < buffer.length; i += size) parts.push(buffer.subarray(i, i + size));
  return parts;
};

async function printViaUsb(bytes) {
  if (!navigator.usb) {
    throw new Error('WebUSB is unavailable. Use Chrome/Edge over http://localhost or HTTPS.');
  }
  const device = await navigator.usb.requestDevice({ filters: [] });
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  await device.claimInterface(0);

  const iface = device.configuration?.interfaces?.[0]?.alternate;
  const endpoint = iface?.endpoints?.find((ep) => ep.direction === 'out');
  if (!endpoint) throw new Error('No bulk-out endpoint found on the selected printer.');

  for (const part of chunk(bytes, 1024)) {
    const result = await device.transferOut(endpoint.endpointNumber, part);
    if (result.status !== 'ok') throw new Error(`USB write failed (${result.status}).`);
  }

  await device.close();
  return { ok: true, message: `Printed to ${device.productName || 'USB printer'}.` };
}

async function printViaBluetooth(bytes, config) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is unavailable. Use Chrome/Edge on HTTPS or localhost.');
  }
  const serviceId = config.bleService || '0000ff00-0000-1000-8000-00805f9b34fb';
  const characteristicId = config.bleCharacteristic || '0000ff02-0000-1000-8000-00805f9b34fb';

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [serviceId],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceId);
  const characteristic = await service.getCharacteristic(characteristicId);

  // BLE writes are MTU-limited; 180-byte frames are safe on almost every stack.
  for (const part of chunk(bytes, 180)) {
    if (typeof characteristic.writeValueWithoutResponse === 'function') {
      await characteristic.writeValueWithoutResponse(part);
    } else {
      await characteristic.writeValue(part);
    }
  }

  if (server.connected) server.disconnect();
  return { ok: true, message: `Printed to ${device.name || 'Bluetooth printer'}.` };
}

async function printViaSerial(bytes, config) {
  if (!navigator.serial) {
    throw new Error('Web Serial is unavailable. Use Chrome/Edge on HTTPS or localhost.');
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: Number(config.baudRate) || 9600 });

  const writer = port.writable.getWriter();
  try {
    for (const part of chunk(bytes, 4096)) {
      await writer.write(part);
    }
  } finally {
    writer.releaseLock();
  }
  await port.close();
  return { ok: true, message: 'Printed over the serial port.' };
}

/**
 * Native (desktop) silent print: renders the receipt as HTML and hands it to
 * Electron's webContents.print() — no browser print dialog.
 */
async function printNative(bytes, config, sale) {
  if (!isDesktop()) {
    throw new Error('Native printing is only available in the OpenPOS desktop app.');
  }
  const html = buildReceiptHtml(sale || {}, {
    paperWidth: config.paperWidth,
    includeQr: config.includeQr,
    currencySymbol: config.currencySymbol,
    template: getReceiptTemplate(),
  });
  return printHtmlReceipt({
    html,
    deviceName: config.deviceName || '',
    silent: config.silent !== false,
    paperWidth: config.paperWidth,
  });
}

/** Raw ESC/POS over TCP to a networked POS printer (host:9100). */
async function printViaNetwork(bytes, config) {
  if (!isDesktop()) {
    throw new Error('Network printing is only available in the OpenPOS desktop app.');
  }
  return printEscPosOverNetwork({
    host: config.printerHost,
    port: config.printerPort || 9100,
    bytes,
  });
}

/**
 * Builds a minimal print-ready HTML document from the receipt data.
 * Used by the native desktop transport (the ESC/POS byte stream itself is
 * not renderable, so the structured sale is re-serialised here).
 */
export function buildReceiptHtml(sale, options = {}) {
  const paperWidth = Number(options.paperWidth) === 58 ? 58 : 80;
  const symbol = options.currencySymbol || '$';
  const template = options.template || {};
  const items = Array.isArray(sale.items) ? sale.items : [];
  const subtotal = Number(sale.totalAmount || 0);
  const taxRate = Number(sale.taxRate || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const grandTotal =
    sale.totalWithTax !== undefined && sale.totalWithTax !== null
      ? Number(sale.totalWithTax)
      : subtotal + taxAmount;
  const money = (v) => `${symbol}${Number(v || 0).toFixed(2)}`;
  const escape = (str) =>
    String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  // Image sources are attacker influenced (logo data URL comes from an
  // importable template) — only safe schemes are allowed and the value is
  // attribute-escaped.
  const escapeSrc = (value) => escapeUrlAttribute(value);
  const customCss = sanitizeCustomCss(template.customCss);

  const rows = items
    .map(
      (item) => `<tr>
        <td>${escape(item.name)}<br><span class="muted">${escape(item.quantity)} x ${escape(money(item.price))}</span></td>
        <td class="right">${escape(money(item.subtotal))}</td>
      </tr>`
    )
    .join('');

  const storeName = template.storeName || options.storeName || sale.storeAddress || 'OpenPOS';
  const branchAddress = template.branchAddress || options.branchAddress || '';
  const phone = template.phone || options.phone || '';
  const taxId = template.taxId || options.taxId || '';
  const headerMessage = renderTokens(template.headerMessage || '', template, sale);
  const footerMessage = renderTokens(
    template.footerMessage || 'Returns accepted within 7 days with this receipt.',
    template,
    sale
  );
  const showLogo = template.showLogo && template.logoDataUrl;
  const showQr = template.showQr !== false && options.includeQr !== false;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(PRINT_DOCUMENT_CSP)}" /><title>Receipt</title>
<style>
  @page { size: ${paperWidth}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: ${paperWidth}mm; margin: 0 auto; padding: 2mm; font-size: 10pt; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 16pt; }
  .muted { font-size: 8pt; }
  .right { text-align: right; white-space: nowrap; }
  .pre { white-space: pre-wrap; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 0.4mm 0; vertical-align: top; }
  ${customCss}
</style></head>
<body>
  ${showLogo ? `<div class="center"><img src="${escapeSrc(template.logoDataUrl)}" style="height:14mm"/></div>` : ''}
  <div class="center">
    <div class="bold big">${escape(storeName)}</div>
    ${branchAddress ? `<div>${escape(branchAddress)}</div>` : ''}
    ${phone ? `<div>${escape(phone)}</div>` : ''}
    ${taxId ? `<div class="muted">Tax ID: ${escape(taxId)}</div>` : ''}
    <div>Branch #${escape(sale.branchNumber || '-')}</div>
    <div class="muted">${escape(sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '')}</div>
    <div>Cashier: ${escape(sale.cashierName || '-')}</div>
    ${sale.customerName ? `<div>Customer: ${escape(sale.customerName)}</div>` : ''}
  </div>
  <hr>
  <div class="center">${escape(sale.transactionId || '')}</div>
  <div class="center muted">Paid via ${escape(String(sale.paymentMethod || 'CASH').toUpperCase())}</div>
  <hr>
  <table>${rows}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="right">${escape(money(subtotal))}</td></tr>
    <tr><td>Tax (${escape(taxRate)}%)</td><td class="right">${escape(money(taxAmount))}</td></tr>
    <tr class="bold big"><td>TOTAL</td><td class="right">${escape(money(grandTotal))}</td></tr>
  </table>
  <hr>
  <div class="center">
    ${sale.refundStatus === 'Refunded' ? '<div class="bold">*** REFUNDED ***</div>' : ''}
    ${headerMessage ? `<div class="pre">${escape(headerMessage)}</div>` : ''}
    <div class="pre">${escape(footerMessage)}</div>
    <div>Thank you!</div>
  </div>
  ${showQr && sale.qrCodeDataUrl ? `<div class="center"><img src="${escapeSrc(sale.qrCodeDataUrl)}" style="width:28mm;height:28mm"/></div>` : ''}
  <div class="center muted">Powered by OpenPOS — ${paperWidth}mm</div>
</body></html>`;
}

/**
 * Sends a byte stream (or the browser print dialog for the `system` transport).
 * @param {Uint8Array} bytes   ESC/POS payload for hardware transports.
 * @param {object} config      Printer configuration.
 * @param {object} sale        Receipt data (used by the native HTML transport).
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function sendToPrinter(bytes, config = getPrinterConfig(), sale = null) {
  try {
    switch (config.transport) {
      case 'native':
        return await printNative(bytes, config, sale);
      case 'escpos-network':
        return await printViaNetwork(bytes, config);
      case 'webusb':
        return await printViaUsb(bytes);
      case 'webbluetooth':
        return await printViaBluetooth(bytes, config);
      case 'serial':
        return await printViaSerial(bytes, config);
      case 'system':
      default: {
        window.print();
        return { ok: true, message: 'Opened the system print dialog.' };
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'Printing failed for the selected transport.',
    };
  }
}

/** OS printer list (desktop app only — [] in the browser). */
export async function getSystemPrinters() {
  return listSystemPrinters();
}
