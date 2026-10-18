import React, { useEffect } from 'react';
import { QrCode, Search, UploadCloud } from 'lucide-react';

const ScanInputSection = ({
  qrInput,
  setQrInput,
  handleScanSubmit,
  handleFileUpload,
  scanInputRef,
  fileInputRef,
}) => {
  // Keyboard-wedge barcode scanners type characters fast and finish with
  // Enter. If focus is lost (e.g. after a modal or alert), typing anywhere
  // on the page should pull focus back into the scan field automatically.
  useEffect(() => {
    const handleGlobalKeydown = (event) => {
      const target = event.target;
      const tagName = target?.tagName;

      // Don't steal focus from form fields or keyboard shortcuts.
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return; // ignore Enter/Escape/Tab/modifiers

      scanInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [scanInputRef]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center space-x-2">
        <QrCode className="h-4 w-4 text-blue-600" />
        <span>Scan QR / Enter SKU / Upload QR Image</span>
      </label>

      <div className="flex gap-2">
        <form onSubmit={handleScanSubmit} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <input
              ref={scanInputRef}
              type="text"
              autoFocus
              placeholder="Enter SKU (e.g. PROD-1001) or scan QR..."
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono"
            />
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white font-semibold text-xs px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
          >
            Add Item
          </button>
        </form>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-xl border transition"
          title="Upload QR Code Image"
        >
          <UploadCloud className="h-4 w-4 text-slate-600" />
          <span>Upload QR</span>
        </button>
      </div>

      <p className="text-[10px] text-slate-400">
        Tip: USB barcode scanners work out of the box - just scan into the field above. Start typing
        anywhere on the page to jump back to the scan box.
      </p>
    </div>
  );
};

export default ScanInputSection;
