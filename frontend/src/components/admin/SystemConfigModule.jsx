import React, { useState } from 'react';
import API from '../../services/api';
import { Settings, RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle, X } from 'lucide-react';

const SystemConfigModule = ({ onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Modal Control States
  const [isMonthlyModalOpen, setIsMonthlyModalOpen] = useState(false);
  const [isAnnualModalOpen, setIsAnnualModalOpen] = useState(false);
  const [annualVerificationInput, setAnnualVerificationInput] = useState('');
  const REQUIRED_ANNUAL_CODE = 'RESET-ANNUAL';

  const handleGlobalMonthlyReset = async () => {
    setLoading(true);
    try {
      const { data } = await API.post('/analytics/reset-monthly', {});
      setMessage({ type: 'success', text: data.message || 'Global monthly figures reset successfully.' });
      setIsMonthlyModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to perform monthly reset' });
    } finally {
      setLoading(false);
    }
  };

  const handleAnnualYearEndReset = async () => {
    if (annualVerificationInput !== REQUIRED_ANNUAL_CODE) {
      setMessage({ type: 'error', text: 'Verification code incorrect. Action aborted.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await API.post('/analytics/reset-annual', {});
      setMessage({ type: 'success', text: data.message || 'Annual statistics reset successfully.' });
      setIsAnnualModalOpen(false);
      setAnnualVerificationInput('');
      if (onRefresh) onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to reset annual statistics' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
          <Settings className="h-5 w-5 text-blue-600" />
          <span>System Configuration & Data Overrides</span>
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          Superadmin-level tools to manage system reset schedules and financial tracking windows.
        </p>
      </div>

      {/* DYNAMIC INLINE ALERT BANNER */}
      {message.text && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly Cycle Reset */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-amber-600 font-bold text-sm">
            <RefreshCw className="h-4 w-4" />
            <h4>End of Month Cycle Reset</h4>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            Resets all monthly sales revenue and transaction counters to zero for all active cashiers. Annual totals remain intact.
          </p>
          <button
            onClick={() => setIsMonthlyModalOpen(true)}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
          >
            Trigger Global Monthly Reset
          </button>
        </div>

        {/* Annual Financial Year Reset */}
        <div className="bg-white p-5 rounded-2xl border border-red-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
            <ShieldAlert className="h-4 w-4" />
            <h4>Year-End Financial Override</h4>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            Wipes all cumulative annual revenue and transaction records across all cashiers to mark the conclusion of the financial year.
          </p>
          <button
            onClick={() => setIsAnnualModalOpen(true)}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
          >
            Execute Annual Metric Reset
          </button>
        </div>
      </div>

      {/* GLOBAL MONTHLY RESET MODAL */}
      {isMonthlyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-amber-200">
            <div className="flex items-center space-x-3 text-amber-600">
              <RefreshCw className="h-6 w-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">Confirm Global Monthly Reset</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              WARNING: Reset ALL cashier monthly figures to $0.00? Annual counters will NOT be affected.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsMonthlyModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGlobalMonthlyReset}
                disabled={loading}
                className="px-3.5 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition"
              >
                {loading ? 'Resetting...' : 'Confirm Global Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANNUAL YEAR-END RESET MODAL */}
      {isAnnualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <ShieldAlert className="h-7 w-7 flex-shrink-0" />
              <h3 className="text-base font-bold text-slate-800">Critical System Override</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              To clear all ANNUAL system revenue and reset metric tracking for a new financial year, type <span className="font-mono font-bold text-rose-600 select-all">{REQUIRED_ANNUAL_CODE}</span> below:
            </p>
            <input
              type="text"
              value={annualVerificationInput}
              onChange={(e) => setAnnualVerificationInput(e.target.value)}
              placeholder="Type RESET-ANNUAL here..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setIsAnnualModalOpen(false);
                  setAnnualVerificationInput('');
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAnnualYearEndReset}
                disabled={annualVerificationInput !== REQUIRED_ANNUAL_CODE || loading}
                className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg transition"
              >
                {loading ? 'Resetting Annual...' : 'Execute Annual Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemConfigModule;