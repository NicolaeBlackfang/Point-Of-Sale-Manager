import React, { useState, useEffect, useCallback } from 'react';
import API from '../../services/api';
import { SlidersHorizontal, Save, CheckCircle2, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const StoreSettingsPanel = () => {
  const { settings, refreshSettings } = useSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        currencySymbol: form.currencySymbol,
        currencyCode: form.currencyCode,
        taxRate: Number(form.taxRate),
        lowStockThreshold: Number(form.lowStockThreshold),
      };
      const { data } = await API.put('/settings', payload);
      setMessage({ type: 'success', text: data.message || 'Settings saved successfully.' });
      if (data.settings) refreshSettings();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }, [form, refreshSettings]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
      <div className="flex items-center space-x-2 border-b pb-3">
        <SlidersHorizontal className="h-5 w-5 text-blue-600" />
        <h3 className="font-bold text-slate-800 text-sm">Store Settings (Currency, Tax & Inventory)</h3>
      </div>

      {message.text && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: '', text: '' })}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Currency Symbol</label>
          <input
            type="text"
            value={form.currencySymbol}
            onChange={(e) => handleChange('currencySymbol', e.target.value)}
            maxLength={8}
            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="$"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Currency Code (ISO)</label>
          <input
            type="text"
            value={form.currencyCode}
            onChange={(e) => handleChange('currencyCode', e.target.value.toUpperCase())}
            maxLength={3}
            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono uppercase"
            placeholder="USD"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tax Rate (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.taxRate}
            onChange={(e) => handleChange('taxRate', e.target.value)}
            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Low Stock Alert Threshold</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.lowStockThreshold}
            onChange={(e) => handleChange('lowStockThreshold', e.target.value)}
            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="5"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Products at or below this quantity trigger a low-stock alert (optional webhook via LOW_STOCK_WEBHOOK_URL).
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 border-t pt-3">
        <button
          onClick={() => refreshSettings()}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Reload</span>
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>
    </div>
  );
};

export default StoreSettingsPanel;
