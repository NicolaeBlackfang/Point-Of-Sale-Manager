import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import API from '../../services/api';
import {
  SlidersHorizontal,
  Save,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Globe,
  Bell,
  ChevronDown,
  Search,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

// Sequential fixed UTC offsets, from UTC-12:00 to UTC+14:00. Whole-hour entries
// use the fixed `Etc/GMT±N` zones (note the inverted sign — `Etc/GMT+5` is
// UTC-05:00) which never observe DST, so this stays a true offset list. The
// fractional offsets use the representative IANA zone for that offset.
const UTC_OFFSETS = [
  { tz: 'Etc/GMT+12', offset: 'UTC-12:00', place: 'Baker Island' },
  { tz: 'Etc/GMT+11', offset: 'UTC-11:00', place: 'Samoa' },
  { tz: 'Etc/GMT+10', offset: 'UTC-10:00', place: 'Hawaii' },
  { tz: 'Etc/GMT+9', offset: 'UTC-09:00', place: 'Alaska' },
  { tz: 'Pacific/Marquesas', offset: 'UTC-09:30', place: 'Marquesas Islands' },
  { tz: 'Etc/GMT+8', offset: 'UTC-08:00', place: 'Pacific Time' },
  { tz: 'Etc/GMT+7', offset: 'UTC-07:00', place: 'Mountain Time' },
  { tz: 'Etc/GMT+6', offset: 'UTC-06:00', place: 'Central Time' },
  { tz: 'Etc/GMT+5', offset: 'UTC-05:00', place: 'Eastern Time' },
  { tz: 'Etc/GMT+4', offset: 'UTC-04:00', place: 'Atlantic Time' },
  { tz: 'America/St_Johns', offset: 'UTC-03:30', place: 'Newfoundland' },
  { tz: 'Etc/GMT+3', offset: 'UTC-03:00', place: 'Brasília' },
  { tz: 'Etc/GMT+2', offset: 'UTC-02:00', place: 'Mid-Atlantic' },
  { tz: 'Etc/GMT+1', offset: 'UTC-01:00', place: 'Azores / Cape Verde' },
  { tz: 'UTC', offset: 'UTC+00:00', place: 'GMT / UTC' },
  { tz: 'Etc/GMT-1', offset: 'UTC+01:00', place: 'Central European Time' },
  { tz: 'Etc/GMT-2', offset: 'UTC+02:00', place: 'Eastern European Time' },
  { tz: 'Etc/GMT-3', offset: 'UTC+03:00', place: 'Moscow / Riyadh' },
  { tz: 'Asia/Tehran', offset: 'UTC+03:30', place: 'Iran' },
  { tz: 'Etc/GMT-4', offset: 'UTC+04:00', place: 'Gulf Standard Time' },
  { tz: 'Asia/Kabul', offset: 'UTC+04:30', place: 'Afghanistan' },
  { tz: 'Etc/GMT-5', offset: 'UTC+05:00', place: 'Pakistan' },
  { tz: 'Asia/Kolkata', offset: 'UTC+05:30', place: 'India' },
  { tz: 'Asia/Kathmandu', offset: 'UTC+05:45', place: 'Nepal' },
  { tz: 'Etc/GMT-6', offset: 'UTC+06:00', place: 'Dhaka / BST' },
  { tz: 'Asia/Yangon', offset: 'UTC+06:30', place: 'Myanmar' },
  { tz: 'Etc/GMT-7', offset: 'UTC+07:00', place: 'Bangkok / Jakarta' },
  { tz: 'Etc/GMT-8', offset: 'UTC+08:00', place: 'Singapore / China' },
  { tz: 'Australia/Eucla', offset: 'UTC+08:45', place: 'Eucla' },
  { tz: 'Etc/GMT-9', offset: 'UTC+09:00', place: 'Japan / Korea' },
  { tz: 'Australia/Darwin', offset: 'UTC+09:30', place: 'Darwin / Adelaide' },
  { tz: 'Etc/GMT-10', offset: 'UTC+10:00', place: 'Sydney / Vladivostok' },
  { tz: 'Australia/Lord_Howe', offset: 'UTC+10:30', place: 'Lord Howe Island' },
  { tz: 'Etc/GMT-11', offset: 'UTC+11:00', place: 'Solomon Islands' },
  { tz: 'Etc/GMT-12', offset: 'UTC+12:00', place: 'New Zealand' },
  { tz: 'Pacific/Chatham', offset: 'UTC+12:45', place: 'Chatham Islands' },
  { tz: 'Etc/GMT-13', offset: 'UTC+13:00', place: 'Tonga / Samoa' },
  { tz: 'Etc/GMT-14', offset: 'UTC+14:00', place: 'Line Islands' },
];

const isValidTimezoneInput = (value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

// Display label for an IANA zone, e.g. "UTC-05:00 (EST)" or "UTC+05:30".
const timezoneLabel = (tz) => {
  try {
    const now = new Date();
    const partOf = (opts) =>
      new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value || '';

    let offset = '';
    try {
      offset = partOf({ timeZoneName: 'longOffset' });
    } catch {
      offset = partOf({ timeZoneName: 'shortOffset' });
    }
    offset = (offset || 'GMT+00:00').replace('GMT', 'UTC');

    const short = partOf({ timeZoneName: 'short' });
    const abbrev = short && !/^(UTC|GMT)/i.test(short) ? ` (${short})` : '';
    return `${offset}${abbrev}`;
  } catch {
    return tz;
  }
};

const inputClass =
  'w-full text-xs p-2.5 border border-slate-300 rounded-lg transition placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none';

// Searchable timezone combobox: shows the city id plus its UTC offset label.
const TimezoneSelect = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const options = useMemo(
    () =>
      UTC_OFFSETS.map(({ tz, offset, place }) => ({
        tz,
        offset,
        place,
        text: `${offset} (${place})`,
      })),
    []
  );

  const currentTz = value || 'UTC';
  const all = useMemo(() => {
    if (options.some((o) => o.tz === currentTz)) return options;
    return [{ tz: currentTz, offset: '', place: currentTz, text: timezoneLabel(currentTz) }, ...options];
  }, [options, currentTz]);

  const term = query.trim().toLowerCase();
  const visible = term
    ? all.filter(
        (o) =>
          o.tz.toLowerCase().includes(term) ||
          o.offset.toLowerCase().includes(term) ||
          o.place.toLowerCase().includes(term)
      )
    : all;

  const current = all.find((o) => o.tz === currentTz) || {
    tz: currentTz,
    text: timezoneLabel(currentTz),
  };

  const select = (tz) => {
    onChange(tz);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${inputClass} flex items-center justify-between gap-2 text-left cursor-pointer`}
      >
        <span className="flex flex-col items-start min-w-0">
          <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{current.text}</span>
          <span className="truncate font-mono text-[10px] text-slate-400">{currentTz}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[280px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search UTC offset or region..."
                className="w-full text-xs p-2 pl-8 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {visible.map((opt) => {
              const isSelected = opt.tz === currentTz;
              return (
                <li key={opt.tz}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(opt.tz)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-xs transition ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate font-medium">{opt.text}</span>
                    <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {opt.tz}
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="px-3 py-3 text-xs text-slate-400 text-center">
                No timezone matches “{query.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

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
    if (form.timezone && !isValidTimezoneInput(form.timezone)) {
      setMessage({
        type: 'error',
        text: 'Timezone must be a valid IANA timezone (e.g. UTC, Europe/Berlin).',
      });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        currencySymbol: form.currencySymbol,
        currencyCode: form.currencyCode,
        taxRate: Number(form.taxRate),
        lowStockThreshold: Number(form.lowStockThreshold),
        timezone: (form.timezone || 'UTC').trim(),
        webhookUrl: (form.webhookUrl || '').trim(),
        smtpHost: (form.smtpHost || '').trim(),
        smtpPort: Number(form.smtpPort) || 587,
        smtpUser: form.smtpUser || '',
        smtpPass: form.smtpPass ?? '',
        emailRecipient: (form.emailRecipient || '').trim(),
        lowStockEmailEnabled: Boolean(form.lowStockEmailEnabled),
        dailyReportEnabled: Boolean(form.dailyReportEnabled),
        dailyReportHour: Number.isInteger(Number(form.dailyReportHour))
          ? Number(form.dailyReportHour)
          : 8,
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

  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5';
  const hintClass = 'text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed';
  const toggleClass =
    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex items-center justify-center w-full">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 shadow-sm space-y-5 max-w-2xl w-full mx-auto my-auto">
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
            <label className={labelClass}>Currency Symbol</label>
            <input
              type="text"
              value={form.currencySymbol}
              onChange={(e) => handleChange('currencySymbol', e.target.value)}
              maxLength={8}
              className={inputClass}
              placeholder="$"
            />
          </div>

          <div>
            <label className={labelClass}>Currency Code (ISO)</label>
            <input
              type="text"
              value={form.currencyCode}
              onChange={(e) => handleChange('currencyCode', e.target.value.toUpperCase())}
              maxLength={3}
              className={`${inputClass} font-mono uppercase`}
              placeholder="USD"
            />
          </div>

          <div>
            <label className={labelClass}>Tax Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.taxRate}
              onChange={(e) => handleChange('taxRate', e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </div>

          <div>
            <label className={labelClass}>Low Stock Alert Threshold</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.lowStockThreshold}
              onChange={(e) => handleChange('lowStockThreshold', e.target.value)}
              className={inputClass}
              placeholder="5"
            />
            <p className={hintClass}>
              Products at or below this quantity trigger a low-stock alert.
            </p>
          </div>
        </div>

        {/* Timezone */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-blue-600" />
            <h4 className="font-bold text-slate-800 text-xs">Store Timezone</h4>
          </div>
          <div>
            <label className={labelClass}>IANA Timezone</label>
            <TimezoneSelect
              value={form.timezone || 'UTC'}
              onChange={(tz) => handleChange('timezone', tz)}
            />
            <p className={hintClass}>
              All analytics days, monthly windows and the daily report use this timezone. Choose a
              UTC offset from UTC-12:00 to UTC+14:00; each entry shows its fixed offset and region.
            </p>
          </div>
        </div>

        {/* Notifications: webhook + SMTP */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <div className="flex items-center space-x-2">
            <Bell className="h-4 w-4 text-amber-600" />
            <h4 className="font-bold text-slate-800 text-xs">Alerts & Notifications (optional)</h4>
          </div>

          <div>
            <label className={labelClass}>
              Low-Stock Webhook URL (Slack / Discord / generic JSON)
            </label>
            <input
              type="url"
              value={form.webhookUrl || ''}
              onChange={(e) => handleChange('webhookUrl', e.target.value)}
              maxLength={500}
              className={`${inputClass} font-mono`}
              placeholder="https://hooks.example.com/services/..."
            />
            <p className={hintClass}>
              Leave empty to disable. Falls back to the LOW_STOCK_WEBHOOK_URL environment variable.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>SMTP Host</label>
              <input
                type="text"
                value={form.smtpHost || ''}
                onChange={(e) => handleChange('smtpHost', e.target.value)}
                maxLength={255}
                className={`${inputClass} font-mono`}
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <label className={labelClass}>SMTP Port</label>
              <input
                type="number"
                min="1"
                max="65535"
                value={form.smtpPort || 587}
                onChange={(e) => handleChange('smtpPort', e.target.value)}
                className={inputClass}
                placeholder="587"
              />
            </div>

            <div>
              <label className={labelClass}>SMTP Username</label>
              <input
                type="text"
                value={form.smtpUser || ''}
                onChange={(e) => handleChange('smtpUser', e.target.value)}
                maxLength={255}
                className={`${inputClass} font-mono`}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass}>SMTP Password</label>
              <input
                type="password"
                value={form.smtpPass ?? ''}
                onChange={(e) => handleChange('smtpPass', e.target.value)}
                maxLength={512}
                className={inputClass}
                autoComplete="new-password"
                placeholder="(unchanged)"
              />
            </div>
            <div>
              <label className={labelClass}>Notification Recipient</label>
              <input
                type="email"
                value={form.emailRecipient || ''}
                onChange={(e) => handleChange('emailRecipient', e.target.value)}
                maxLength={255}
                className={inputClass}
                placeholder="owner@example.com"
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 cursor-pointer">
            <span>
              E-mail me low-stock alerts
              <span className="block font-normal text-slate-400 text-[10px]">
                One digest e-mail per checkout with products at/below threshold.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(form.lowStockEmailEnabled)}
              onClick={() => handleChange('lowStockEmailEnabled', !form.lowStockEmailEnabled)}
              className={`${toggleClass} ${
                form.lowStockEmailEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.lowStockEmailEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 cursor-pointer">
            <span>
              Daily summary e-mail
              <span className="block font-normal text-slate-400 text-[10px]">
                Revenue, payment mix and top products for the previous store-local day.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(form.dailyReportEnabled)}
              onClick={() => handleChange('dailyReportEnabled', !form.dailyReportEnabled)}
              className={`${toggleClass} ${form.dailyReportEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.dailyReportEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <div className="w-40">
            <label className={labelClass}>Send daily report at (store time, 0–23)</label>
            <input
              type="number"
              min="0"
              max="23"
              step="1"
              value={form.dailyReportHour ?? 8}
              onChange={(e) => handleChange('dailyReportHour', e.target.value)}
              className={inputClass}
              placeholder="8"
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 border-t border-slate-200 dark:border-slate-700 pt-4">
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
    </div>
  );
};

export default StoreSettingsPanel;
