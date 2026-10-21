import React, { useState } from 'react';
import {
  Printer,
  Usb,
  Bluetooth,
  Cable,
  Monitor,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  getPrinterConfig,
  savePrinterConfig,
  buildTestPage,
  sendToPrinter,
} from '../../utils/printer';
import ReceiptDocument from '../pos/ReceiptDocument';

const TRANSPORTS = [
  {
    value: 'system',
    label: 'System Print',
    icon: Monitor,
    hint: 'Browser print dialog — works with any printer (paper/dialog size set by the browser).',
  },
  {
    value: 'webusb',
    label: 'WebUSB',
    icon: Usb,
    hint: 'Direct ESC/POS over USB (Chrome/Edge, localhost or HTTPS).',
  },
  {
    value: 'webbluetooth',
    label: 'Web Bluetooth',
    icon: Bluetooth,
    hint: 'Wireless thermal printers (Chrome/Edge, HTTPS or localhost).',
  },
  {
    value: 'serial',
    label: 'Serial (ESC/POS)',
    icon: Cable,
    hint: 'RS-232/USB-serial printers via the Web Serial API.',
  },
];

const DEMO_SALE = {
  transactionId: 'TXN-TEST-OPENPOS',
  storeAddress: 'OpenPOS Printer Test',
  branchNumber: '000',
  cashierName: 'Printer test',
  paymentMethod: 'cash',
  paymentStatus: 'Completed',
  currency: 'USD',
  taxRate: 0,
  taxAmount: 0,
  createdAt: null,
  items: [
    { sku: 'TEST-1', name: 'Test line A', price: 1.0, quantity: 1, subtotal: 1.0 },
    { sku: 'TEST-2', name: 'Test line B', price: 2.5, quantity: 2, subtotal: 5.0 },
  ],
  totalAmount: 6.0,
  totalWithTax: 6.0,
};

/**
 * Thermal printer configuration for THIS device (stored in localStorage —
 * hardware setup is per terminal, not a shared store setting).
 */
const ThermalPrinterPanel = () => {
  const [config, setConfig] = useState(() => getPrinterConfig());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showTestReceipt, setShowTestReceipt] = useState(false);

  const capabilities = {
    usb: typeof navigator !== 'undefined' && Boolean(navigator.usb),
    bluetooth: typeof navigator !== 'undefined' && Boolean(navigator.bluetooth),
    serial: typeof navigator !== 'undefined' && Boolean(navigator.serial),
  };

  const update = (patch) => {
    const next = savePrinterConfig(patch);
    setConfig(next);
    setSaved(true);
    window.clearTimeout(update._timer);
    update._timer = window.setTimeout(() => setSaved(false), 1600);
  };

  const handleTestPrint = async () => {
    setTestResult(null);

    // System Print can only print what is on screen, so show a receipt to print.
    if (config.transport === 'system') {
      setShowTestReceipt(true);
      return;
    }

    setTesting(true);
    try {
      const result = await sendToPrinter(buildTestPage(config), config);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const transportUnavailable =
    (config.transport === 'webusb' && !capabilities.usb) ||
    (config.transport === 'webbluetooth' && !capabilities.bluetooth) ||
    (config.transport === 'serial' && !capabilities.serial);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-3">
        <div className="flex items-center space-x-2">
          <Printer className="h-5 w-5 text-blue-600" />
          <h2 className="font-bold text-slate-800">Thermal Printer (this device)</h2>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          Paper, transport and auto-print are stored locally for this terminal.
        </p>
      </div>

      {/* Paper width */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Paper width</p>
        <div className="flex gap-2">
          {[80, 58].map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => update({ paperWidth: width })}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition ${
                config.paperWidth === width
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {width}mm
              <span className="block text-[10px] font-normal opacity-80">
                {width === 80 ? '48 columns' : '32 columns'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Transport */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Connection / transport</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {TRANSPORTS.map((transport) => {
            const Icon = transport.icon;
            const selected = config.transport === transport.value;
            const unavailable =
              (transport.value === 'webusb' && !capabilities.usb) ||
              (transport.value === 'webbluetooth' && !capabilities.bluetooth) ||
              (transport.value === 'serial' && !capabilities.serial);
            return (
              <button
                key={transport.value}
                type="button"
                onClick={() => update({ transport: transport.value })}
                className={`text-left p-3 rounded-xl border transition ${
                  selected
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Icon className="h-4 w-4 text-slate-500" />
                  {transport.label}
                  {unavailable ? (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      unsupported here
                    </span>
                  ) : null}
                </span>
                <span className="block text-[11px] text-slate-500 mt-1 leading-snug">
                  {transport.hint}
                </span>
              </button>
            );
          })}
        </div>

        {transportUnavailable ? (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            This browser does not expose the selected API. Switch to System Print, or open the
            app in Chrome/Edge on localhost/HTTPS.
          </p>
        ) : null}
      </div>

      {/* Serial baud rate */}
      {config.transport === 'serial' ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Baud rate</p>
          <select
            value={config.baudRate}
            onChange={(e) => update({ baudRate: Number(e.target.value) })}
            className="border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {[2400, 4800, 9600, 19200, 38400, 57600, 115200].map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(config.autoPrint)}
            onChange={(e) => update({ autoPrint: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Auto-print the receipt after every successful payment
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.includeQr !== false}
            onChange={(e) => update({ includeQr: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Include the transaction QR code on printed receipts
        </label>
      </div>

      {/* Test print */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleTestPrint}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          {testing ? 'Sending test…' : 'Print test page'}
        </button>
        {testResult ? (
          <p
            className={`text-xs font-medium ${
              testResult.ok ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {testResult.message}
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Test page checks paper width, font and the selected transport.
          </p>
        )}
      </div>

      {showTestReceipt ? (
        <ReceiptDocument
          sale={{ ...DEMO_SALE, createdAt: new Date().toISOString() }}
          onClose={() => setShowTestReceipt(false)}
          closeLabel="Close"
        />
      ) : null}
    </div>
  );
};

export default ThermalPrinterPanel;
