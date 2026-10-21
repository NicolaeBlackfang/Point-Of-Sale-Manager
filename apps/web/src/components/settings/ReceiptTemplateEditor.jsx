import React, { useMemo, useState, useRef } from 'react';
import {
  FileText,
  Save,
  Upload,
  Download,
  Image as ImageIcon,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  getReceiptTemplate,
  saveReceiptTemplate,
  exportReceiptTemplate,
  importReceiptTemplate,
  DEFAULT_RECEIPT_TEMPLATE,
  RECEIPT_TEMPLATE_TOKENS,
} from '../../utils/receiptTemplate';

const TOKENS = RECEIPT_TEMPLATE_TOKENS.map((entry) => entry.token);

const SAMPLE_ITEMS = [
  { name: 'Sample Product A', quantity: 2, price: 4.5, subtotal: 9.0 },
  { name: 'Sample Product B', quantity: 1, price: 12.0, subtotal: 12.0 },
];

/**
 * Editable receipt template (word-style form builder).
 *
 * Everything is stored locally in the browser's localStorage so the layout
 * travels with the terminal, and can be exported/imported as JSON.
 */
const ReceiptTemplateEditor = () => {
  const [template, setTemplate] = useState(() => getReceiptTemplate());
  const [message, setMessage] = useState(null);
  const fileRef = useRef(null);

  const preview = useMemo(() => {
    const cols = template.paperWidth === 58 ? 32 : 48;
    return {
      cols,
      total: 21.0,
      subtotal: 19.0,
      tax: 2.0,
    };
  }, [template.paperWidth]);

  const update = (patch) => {
    setTemplate((current) => ({ ...current, ...patch }));
  };

  const handleSave = () => {
    saveReceiptTemplate(template);
    setMessage({ type: 'success', text: 'Receipt template saved for this terminal.' });
    window.clearTimeout(handleSave._timer);
    handleSave._timer = window.setTimeout(() => setMessage(null), 2500);
  };

  const handleReset = () => {
    setTemplate({ ...DEFAULT_RECEIPT_TEMPLATE });
    setMessage({ type: 'info', text: 'Template reset to defaults — save to apply.' });
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setMessage({ type: 'error', text: 'Logo must be smaller than 1 MB.' });
      return;
    }
    // Only raster images are accepted: SVG logos are scriptable and would be
    // dropped by the print pipeline anyway.
    if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.type || '')) {
      setMessage({ type: 'error', text: 'Logo must be a PNG, JPEG, GIF or WebP image.' });
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ logoDataUrl: String(reader.result || '') });
      setMessage({ type: 'success', text: 'Logo loaded — save the template to apply.' });
    };
    reader.onerror = () => setMessage({ type: 'error', text: 'Could not read that image file.' });
    reader.readAsDataURL(file);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importReceiptTemplate(file);
      setTemplate(imported);
      setMessage({ type: 'success', text: 'Template imported and applied.' });
    } catch {
      setMessage({ type: 'error', text: 'That file is not a valid OpenPOS receipt template.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-3">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-violet-600" />
          <h2 className="font-bold text-slate-800">Editable Receipt Template</h2>
        </div>
        <p className="text-xs text-slate-500">
          Layout is stored per terminal and applies to every printed receipt.
        </p>
      </div>

      {message ? (
        <div
          className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : message.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : message.type === 'error' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : null}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* --- Form builder --- */}
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Store name">
              <input
                type="text"
                value={template.storeName}
                onChange={(e) => update({ storeName: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Phone number">
              <input
                type="text"
                value={template.phone}
                onChange={(e) => update({ phone: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Branch address">
            <textarea
              rows={2}
              value={template.branchAddress}
              onChange={(e) => update({ branchAddress: e.target.value })}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <Field label="Tax registration ID">
            <input
              type="text"
              value={template.taxId}
              onChange={(e) => update({ taxId: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Header message">
            <input
              type="text"
              value={template.headerMessage}
              onChange={(e) => update({ headerMessage: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Footer message (return policy, greetings…)">
            <textarea
              rows={3}
              value={template.footerMessage}
              onChange={(e) => update({ footerMessage: e.target.value })}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Paper width">
              <select
                value={template.paperWidth}
                onChange={(e) => update({ paperWidth: Number(e.target.value) })}
                className={inputClass}
              >
                <option value={80}>80 mm — 48 columns</option>
                <option value={58}>58 mm — 32 columns</option>
              </select>
            </Field>
            <Field label="Custom logo">
              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Choose image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                {template.logoDataUrl ? (
                  <button
                    type="button"
                    onClick={() => update({ logoDataUrl: '' })}
                    className="px-2 py-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50"
                    title="Remove logo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Toggles</p>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(template.showLogo)}
                onChange={(e) => update({ showLogo: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              Print the store logo
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={template.showQr !== false}
                onChange={(e) => update({ showQr: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              Print the transaction QR code
            </label>
          </div>

          <Field label="Extra CSS (optional)">
            <textarea
              rows={3}
              value={template.customCss}
              onChange={(e) => update({ customCss: e.target.value })}
              placeholder={'body { letter-spacing: 0.2px; }'}
              className={`${inputClass} resize-none font-mono text-[11px]`}
            />
          </Field>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl transition"
            >
              <Save className="h-4 w-4" /> Save template
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              type="button"
              onClick={() => exportReceiptTemplate(template)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>

        {/* --- Live preview --- */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Live preview</p>
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex justify-center">
            <div
              className="bg-white shadow-sm px-4 py-4 font-mono text-[10px] leading-snug text-slate-800"
              style={{ width: template.paperWidth === 58 ? '210px' : '280px' }}
            >
              {template.showLogo && template.logoDataUrl ? (
                <div className="text-center mb-2">
                  <img src={template.logoDataUrl} alt="Store logo" className="h-12 object-contain" />
                </div>
              ) : null}
              <div className="text-center font-bold text-sm uppercase">
                {template.storeName || 'OpenPOS'}
              </div>
              <div className="text-center">{template.branchAddress}</div>
              <div className="text-center">{template.phone}</div>
              {template.taxId ? (
                <div className="text-center">Tax ID: {template.taxId}</div>
              ) : null}
              <div className="text-center">Branch #000</div>
              <div className="text-center">21/10/2026, 10:15:00</div>
              <div className="text-center">Cashier: Sample Cashier</div>
              <div className="text-center">Customer: Walk-in</div>
              <hr className="my-2 border-dashed border-slate-400" />
              <div className="text-center">TXN-SAMPLE-0001</div>
              <div className="text-center">Paid via CASH</div>
              <hr className="my-2 border-dashed border-slate-400" />
              {SAMPLE_ITEMS.map((item) => (
                <div key={item.name} className="flex justify-between gap-2">
                  <span>
                    {item.name}
                    <br />
                    <span className="text-slate-500">
                      {item.quantity} x ${item.price.toFixed(2)}
                    </span>
                  </span>
                  <span>${item.subtotal.toFixed(2)}</span>
                </div>
              ))}
              <hr className="my-2 border-dashed border-slate-400" />
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${preview.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (10%)</span>
                <span>${preview.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>${preview.total.toFixed(2)}</span>
              </div>
              <hr className="my-2 border-dashed border-slate-400" />
              <div className="text-center whitespace-pre-wrap">{template.headerMessage}</div>
              <div className="text-center whitespace-pre-wrap">{template.footerMessage}</div>
              {template.showQr !== false ? (
                <div className="flex justify-center my-2">
                  <div className="h-14 w-14 border border-slate-800 grid grid-cols-6 grid-rows-6">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <span
                        key={i}
                        className={i % 3 === 0 || i % 7 === 0 ? 'bg-slate-800' : 'bg-transparent'}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Dynamic tokens</p>
            <div className="flex flex-wrap gap-1.5">
              {TOKENS.map((token) => (
                <code
                  key={token}
                  className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono"
                >
                  {token}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const inputClass =
  'w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-violet-500 focus:outline-none';

const Field = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="block text-[11px] font-semibold text-slate-600">{label}</span>
    {children}
  </label>
);

export default ReceiptTemplateEditor;
