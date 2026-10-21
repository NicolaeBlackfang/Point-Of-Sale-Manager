// Native desktop printing helpers for the Electron main process.
// - printHtml(): silent native print of an HTML receipt (no browser dialog).
// - printEscPosOverNetwork(): raw ESC/POS byte stream to a networked printer
//   (socket 9100, the de-facto standard for POS receipt printers).
// - listPrinters(): OS printer list via webContents.getPrintersAsync().

const { BrowserWindow } = require('electron');
const net = require('net');

const DEFAULT_ESC_POS_PORT = 9100;

// A network printer is addressed by hostname or IP — nothing else is
// accepted, so a stray value can never point the raw byte stream at an
// arbitrary service.
const HOSTNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/;

function isValidPrinterHost(host) {
  if (typeof host !== 'string') return false;
  const value = host.trim();
  if (!value || value.length > 255) return false;
  if (value.includes('://') || value.includes('/') || value.includes('@')) return false;
  return HOSTNAME_PATTERN.test(value);
}

function isValidPrinterPort(port) {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * Prints an HTML document without showing any dialog.
 * @param {object} options { html, deviceName, silent, paperWidth }
 * @returns {Promise<{ok: boolean, message: string}>}
 */
function printHtml(options = {}) {
  const {
    html = '',
    deviceName = '',
    silent = true,
    paperWidth = 80,
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (win && !win.isDestroyed()) win.destroy();
      } catch {}
      resolve(result);
    };

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });

    // The receipt document must never open windows or navigate away.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });

    win.webContents.once('did-finish-load', () => {
      const is58 = Number(paperWidth) === 58;
      setTimeout(() => {
        win.webContents.print(
          {
            silent: silent !== false,
            printBackground: true,
            deviceName: deviceName || '',
            margins: { marginType: 'none' },
            landscape: false,
            scaleFactor: 1,
            pagesPerSheet: 1,
            // 58mm rolls hold fewer columns than 80mm — let the driver scale.
            ...(is58 ? {} : {}),
          },
          (success, errorType) => {
            if (success) {
              finish({ ok: true, message: 'Receipt sent to the printer.' });
            } else {
              finish({
                ok: false,
                message: errorType ? `Print failed: ${errorType}` : 'Print failed.',
              });
            }
          }
        );
      }, 120);
    });

    win.webContents.once('did-fail-load', () => {
      finish({ ok: false, message: 'Could not render the receipt for printing.' });
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    win.loadURL(dataUrl).catch(() => {
      finish({ ok: false, message: 'Could not render the receipt for printing.' });
    });
  });
}

/**
 * Sends a raw ESC/POS byte stream to a networked thermal printer.
 * @param {object} options { host, port, bytes, timeoutMs }
 */
function printEscPosOverNetwork(options = {}) {
  const {
    host = '',
    port = DEFAULT_ESC_POS_PORT,
    bytes,
    timeoutMs = 15000,
  } = options;

  return new Promise((resolve) => {
    if (!host) {
      resolve({ ok: false, message: 'A printer IP address is required.' });
      return;
    }
    if (!isValidPrinterHost(host)) {
      resolve({ ok: false, message: 'Enter a valid printer hostname or IP address.' });
      return;
    }
    if (!isValidPrinterPort(port)) {
      resolve({ ok: false, message: 'Enter a valid printer port (1-65535).' });
      return;
    }
    if (!bytes || !bytes.length) {
      resolve({ ok: false, message: 'Nothing to print.' });
      return;
    }

    const buffer = Buffer.from(bytes);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };

    const socket = net.createConnection({ host: host.trim(), port: Number(port) || DEFAULT_ESC_POS_PORT });
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.write(buffer, () => {
        // Give the printer a moment to consume the buffer before closing.
        setTimeout(() => finish({ ok: true, message: `Sent ${buffer.length} bytes to ${host}.` }), 150);
      });
    });

    socket.on('timeout', () => {
      finish({ ok: false, message: `Timed out connecting to ${host}:${port}.` });
    });

    socket.on('error', (err) => {
      finish({ ok: false, message: `Printer connection failed: ${err.message}` });
    });

    socket.on('close', () => {
      finish({ ok: true, message: `Sent ${buffer.length} bytes to ${host}.` });
    });
  });
}

async function listPrinters(webContents) {
  if (!webContents) return [];
  try {
    const printers = await webContents.getPrintersAsync();
    return (printers || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status ?? 0,
      isDefault: Boolean(p.isDefault),
      defaultPrinter: Boolean(p.defaultPrinter),
    }));
  } catch {
    return [];
  }
}

module.exports = {
  printHtml,
  printEscPosOverNetwork,
  listPrinters,
  DEFAULT_ESC_POS_PORT,
  isValidPrinterHost,
  isValidPrinterPort,
};
