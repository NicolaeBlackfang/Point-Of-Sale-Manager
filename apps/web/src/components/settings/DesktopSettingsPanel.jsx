import React, { useEffect, useState } from 'react';
import { Monitor, Rocket, RefreshCw, Database, Loader2, CheckCircle2, AlertTriangle, Server } from 'lucide-react';
import {
  isDesktop,
  getAppInfo,
  getAutoLaunch,
  setAutoLaunch,
  getSyncStatus,
  flushSync,
  getDesktopApiBase,
  setDesktopApiBase,
} from '../../services/electron';
import { getQueueCount, isSqliteBackend } from '../../services/offline';
import { getApiBase, setApiBase } from '../../services/api';

/**
 * Desktop-only settings: auto-launch on system startup, the local offline
 * database status, the backend endpoint and the background sync engine.
 */
const DesktopSettingsPanel = () => {
  const [desktop] = useState(() => isDesktop());
  const [appInfo, setAppInfo] = useState(null);
  const [autoLaunch, setAutoLaunchState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [storage, setStorage] = useState('IndexedDB');
  const [syncStatus, setSyncStatus] = useState(null);
  const [message, setMessage] = useState(null);
  const [apiBase, setApiBaseState] = useState('');
  const [apiBaseDraft, setApiBaseDraft] = useState('');

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;

    const load = async () => {
      const [info, launch, status, desktopBase] = await Promise.all([
        getAppInfo(),
        getAutoLaunch(),
        getSyncStatus(),
        getDesktopApiBase(),
      ]);
      if (cancelled) return;
      setAppInfo(info);
      setAutoLaunchState(Boolean(launch?.enabled));
      setSyncStatus(status);
      setQueueCount(await getQueueCount());
      setStorage((await isSqliteBackend()) ? 'SQLite (desktop)' : 'IndexedDB (browser)');
      const base = desktopBase || getApiBase();
      setApiBaseState(base);
      setApiBaseDraft(base);
    };

    load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktop]);

  const saveApiBase = async () => {
    const next = setApiBase(apiBaseDraft);
    setApiBaseState(next);
    const result = await setDesktopApiBase(next);
    setMessage({
      type: result?.ok ? 'success' : 'info',
      text: result?.ok
        ? `The app will now sync with ${next}.`
        : `The app will now sync with ${next} (browser storage only).`,
    });
  };

  const toggleAutoLaunch = async (enabled) => {
    setSaving(true);
    const result = await setAutoLaunch(enabled);
    setSaving(false);
    if (result?.ok) {
      setAutoLaunchState(enabled);
      setMessage({
        type: 'success',
        text: enabled
          ? 'OpenPOS will start automatically when you sign in.'
          : 'Automatic startup disabled.',
      });
    } else {
      setMessage({
        type: 'error',
        text: result?.error || 'Could not change the startup setting.',
      });
    }
  };

  const handleFlush = async () => {
    setSyncing(true);
    const result = await flushSync();
    setQueueCount(await getQueueCount());
    setSyncing(false);
    setMessage({
      type: result?.sent > 0 ? 'success' : 'info',
      text:
        result?.sent > 0
          ? `Synced ${result.sent} queued sale(s) to the server.`
          : 'Nothing to sync — the queue is empty or the server is unreachable.',
    });
  };

  if (!desktop) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <Monitor className="h-4 w-4 text-slate-400" />
          Desktop options are only available in the OpenPOS desktop app.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-3">
        <div className="flex items-center space-x-2">
          <Monitor className="h-5 w-5 text-slate-600" />
          <h2 className="font-bold text-slate-800">Desktop Application</h2>
        </div>
        {appInfo ? (
          <p className="text-xs text-slate-500">
            v{appInfo.version} · {appInfo.platform} · Electron {appInfo.electron}
          </p>
        ) : null}
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
        </div>
      ) : null}

      {/* Auto launch */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Rocket className="h-3.5 w-3.5 text-violet-600" /> Launch on system startup
          </p>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            OpenPOS starts automatically when this computer signs in, so the counter is ready
            before the first customer.
          </p>
        </div>
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={autoLaunch}
            disabled={saving}
            onChange={(e) => toggleAutoLaunch(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
          />
          <span className="text-xs font-semibold text-slate-600">Enabled</span>
        </label>
      </div>

      {/* Local storage + sync */}
      <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Local database
          </p>
          <p className="text-xs font-bold text-slate-800 mt-1">{storage}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500">Queued offline sales</p>
          <p className="text-xs font-bold text-slate-800 mt-1">{queueCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500">Last background sync</p>
          <p className="text-xs font-bold text-slate-800 mt-1">
            {syncStatus?.lastSyncAt
              ? new Date(syncStatus.lastSyncAt).toLocaleTimeString()
              : 'Waiting for the server'}
          </p>
        </div>
      </div>

      {/* Backend endpoint */}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-sky-600" /> Backend server
        </p>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug">
          The address of your OpenPOS server. Changing it re-points both the app and the background
          sync, so every terminal can point at the same remote server.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <input
            type="url"
            value={apiBaseDraft}
            onChange={(e) => setApiBaseDraft(e.target.value)}
            placeholder="https://pos.example.com/api"
            className="flex-1 min-w-[220px] px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-400 outline-none"
          />
          <button
            type="button"
            onClick={saveApiBase}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Save server
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Currently connected to {apiBase}</p>
      </div>

      <div className="pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={handleFlush}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync queued sales now
        </button>
        <p className="text-[11px] text-slate-400 mt-2">
          The desktop app retries automatically every 30 seconds while the backend is reachable.
        </p>
      </div>
    </div>
  );
};

export default DesktopSettingsPanel;
