// Thermal printer support for receipt output — hand-rolled ESC/POS byte
// building plus browser transport adapters (System Print / WebUSB / WebBluetooth
// / Web Serial). No third-party printer library is used.

export const DEFAULT_PRINTER_CONFIG = {
  // Roll width in millimetres: 80mm → 48 columns, 58mm → 32 columns.
  paperWidth: 80,
  // 'system' uses the browser print dialog (works everywhere).
  transport: 'system',
  baudRate: 9600,
  // Print automatically after a successful payment (System Print only when the
  // receipt is on screen; hardware transports print the ESC/POS byte stream).
  autoPrint: false,
  includeQr: true,
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
 * Sends a byte stream (or the browser print dialog for the `system` transport).
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function sendToPrinter(bytes, config = getPrinterConfig()) {
  try {
    switch (config.transport) {
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
