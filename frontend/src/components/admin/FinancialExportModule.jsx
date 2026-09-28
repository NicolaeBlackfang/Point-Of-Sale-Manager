import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { Download, Trash2, FileText, FileSpreadsheet, FileCode, ShieldAlert, CheckCircle2, AlertTriangle, X } from 'lucide-react';

const FinancialExportModule = () => {
  // Export Filter States
  const [scope, setScope] = useState('global');
  const [cashierId, setCashierId] = useState('');
  const [cashiersList, setCashiersList] = useState([]);
  const [timeframe, setTimeframe] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [isExporting, setIsExporting] = useState(false);

  // In-Page Notification State (Replaces browser default alert)
  const [statusAlert, setStatusAlert] = useState(null); // { type: 'success' | 'error' | 'info', message: string }

  // Destructive Hard Reset States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const REQUIRED_PHRASE = 'PERMANENTLY DELETE ALL SALES';

  // Helper to trigger inline alert messages
  const showAlert = (message, type = 'info') => {
    setStatusAlert({ message, type });
  };

  useEffect(() => {
    const fetchCashiers = async () => {
      try {
        const res = await API.get('/analytics/cashiers-monthly');
        setCashiersList(res.data || []);
      } catch (err) {
        console.error('Failed to load cashiers list:', err);
      }
    };
    fetchCashiers();
  }, []);

  const getNormalizedParams = () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const effectiveYear = year && !isNaN(parseInt(year)) ? parseInt(year) : currentYear;
    const effectiveMonth = month && !isNaN(parseInt(month)) ? parseInt(month) : currentMonth;

    const params = { scope, timeframe };

    if (scope === 'cashier') {
      params.cashierId = cashierId;
    }

    if (timeframe !== 'all') {
      params.year = effectiveYear;
    }

    if (timeframe === 'monthly') {
      params.month = effectiveMonth;
    }

    return { params, effectiveYear, effectiveMonth };
  };

  const getPeriodLabel = () => {
    const { effectiveYear, effectiveMonth } = getNormalizedParams();
    if (timeframe === 'monthly') {
      const monthName = new Date(0, effectiveMonth - 1).toLocaleString('default', { month: 'long' });
      return `${monthName} ${effectiveYear}`;
    }
    if (timeframe === 'annual') {
      return `Year ${effectiveYear}`;
    }
    return 'All Time';
  };

  const fetchExportData = async () => {
    const { params } = getNormalizedParams();
    const res = await API.get('/sales/export', { params });
    return res.data;
  };

  const convertToCSV = (sales) => {
    const periodLabel = getPeriodLabel();
    if (!sales || sales.length === 0) {
      return `STATUS,MESSAGE\nNO_DATA,"No sales done in ${periodLabel}"`;
    }

    const headers = [
      'Transaction ID',
      'Date/Time',
      'Cashier Name',
      'Branch',
      'Store Address',
      'Payment Method',
      'Payment Status',
      'Items Count',
      'Total Amount ($)',
    ];

    const rows = sales.map((sale) => [
      `"${sale.transactionId || sale._id}"`,
      `"${new Date(sale.createdAt).toLocaleString()}"`,
      `"${sale.cashier?.roleTakerName || sale.cashier?.username || 'N/A'}"`,
      `"${sale.branchNumber || 'N/A'}"`,
      `"${sale.storeAddress || 'N/A'}"`,
      `"${sale.paymentMethod || 'CASH'}"`,
      `"${sale.paymentStatus || 'Completed'}"`,
      sale.items?.length || 0,
      sale.totalAmount ? sale.totalAmount.toFixed(2) : '0.00',
    ]);

    return [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  };

  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generatePDFReport = (data) => {
    const sales = data.sales || [];
    const periodLabel = getPeriodLabel();
    const grandTotal = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAlert('Please allow popups to generate the PDF report.', 'error');
      return;
    }

    const isZeroSales = sales.length === 0 || grandTotal === 0;

    const tableRows = isZeroSales
      ? `<tr><td colspan="7" style="text-align:center; padding: 30px; font-weight: bold; color: #64748b; font-size: 14px;">
           ⚠️ No sales done in ${periodLabel}
         </td></tr>`
      : sales
          .map(
            (s, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
              <td style="padding: 8px;">${idx + 1}</td>
              <td style="padding: 8px; font-family: monospace;">${s.transactionId || s._id}</td>
              <td style="padding: 8px;">${new Date(s.createdAt).toLocaleString()}</td>
              <td style="padding: 8px;">${s.cashier?.roleTakerName || s.cashier?.username || 'N/A'}</td>
              <td style="padding: 8px;">${s.branchNumber || 'N/A'}</td>
              <td style="padding: 8px;">${s.paymentMethod || 'CASH'}</td>
              <td style="padding: 8px; text-align: right; font-weight: bold;">$${(s.totalAmount || 0).toFixed(2)}</td>
            </tr>
          `
          )
          .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Financial Sales Report - ${periodLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
            .title { font-size: 20px; font-weight: bold; color: #0f172a; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 30px; }
            .no-sales-banner { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
            .stat { font-size: 12px; }
            .stat-val { font-size: 16px; font-weight: bold; color: ${isZeroSales ? '#94a3b8' : '#10b981'}; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #f1f5f9; text-align: left; padding: 8px; font-size: 11px; font-weight: 700; color: #475569; border-bottom: 2px solid #cbd5e1; }
            .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 15px;">
            <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">
              Print / Save as PDF
            </button>
          </div>
          <div class="header">
            <div>
              <div class="title">Financial Sales Report</div>
              <div class="subtitle">Scope: ${scope.toUpperCase()} | Period: ${periodLabel}</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #64748b;">
              <div>Generated: ${new Date().toLocaleString()}</div>
              <div>System: POS Control Panel</div>
            </div>
          </div>

          ${
            isZeroSales
              ? `<div class="no-sales-banner">ℹ️ No sales done in ${periodLabel} ($0.00 revenue recorded).</div>`
              : ''
          }

          <div class="summary-box">
            <div class="stat">
              <div>Total Transactions:</div>
              <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${sales.length}</div>
            </div>
            <div class="stat">
              <div>Grand Total Revenue:</div>
              <div class="stat-val">$${grandTotal.toFixed(2)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transaction ID</th>
                <th>Date / Time</th>
                <th>Cashier</th>
                <th>Branch</th>
                <th>Payment</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            Confidential Document &bull; Generated by POS Control Panel
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportJSON = async () => {
    try {
      setIsExporting(true);
      const data = await fetchExportData();
      const periodLabel = getPeriodLabel();

      const outputData =
        !data.sales || data.sales.length === 0
          ? { status: 'NO_DATA', message: `No sales done in ${periodLabel}`, sales: [] }
          : data;

      const filename = `sales_report_${scope}_${timeframe}_${Date.now()}.json`;
      triggerDownload(JSON.stringify(outputData, null, 2), filename, 'application/json');
      showAlert('JSON file downloaded successfully.', 'success');
    } catch (err) {
      showAlert(err.response?.data?.message || 'Failed to generate JSON export', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const data = await fetchExportData();
      const csvContent = convertToCSV(data.sales);
      const filename = `sales_report_${scope}_${timeframe}_${Date.now()}.csv`;
      triggerDownload(csvContent, filename, 'text/csv;charset=utf-8;');
      showAlert('CSV file downloaded successfully.', 'success');
    } catch (err) {
      showAlert(err.response?.data?.message || 'Failed to generate CSV export', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const data = await fetchExportData();
      generatePDFReport(data);
    } catch (err) {
      showAlert(err.response?.data?.message || 'Failed to generate PDF report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleHardReset = async () => {
    if (confirmationInput !== REQUIRED_PHRASE) return;

    try {
      setIsResetting(true);
      const res = await API.delete('/sales/hard-reset', {
        data: { confirmationPhrase: confirmationInput },
      });

      const count = res.data.deletedCount || 0;
      setIsModalOpen(false);
      setConfirmationInput('');

      if (count === 0) {
        showAlert('Hard reset completed. No sales records were found to delete.', 'info');
      } else {
        showAlert(`Success: ${count} sales records permanently deleted.`, 'success');
      }
    } catch (err) {
      showAlert(err.response?.data?.message || 'Hard reset operation failed.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 my-6">
      <div className="flex items-center justify-between border-b pb-4 border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" />
            Financial Export & Administrative Hard Reset
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Download transaction logs in PDF/CSV/JSON formats or perform permanent database cleanups.
          </p>
        </div>
      </div>

      {/* IN-PAGE NOTIFICATION BANNER */}
      {statusAlert && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
            statusAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusAlert.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusAlert.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusAlert.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
            {statusAlert.type === 'info' && <ShieldAlert className="w-4 h-4 text-blue-600" />}
            <span>{statusAlert.message}</span>
          </div>
          <button
            onClick={() => setStatusAlert(null)}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Export Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Target Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="global">Company-Wide (Global)</option>
            <option value="cashier">Individual Cashier</option>
          </select>
        </div>

        {scope === 'cashier' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Select Cashier</label>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Choose Cashier --</option>
              {cashiersList.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.roleTakerName || c.username} ({c.branchNumber})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="monthly">Monthly Period</option>
            <option value="annual">Full Annual Term</option>
            <option value="all">All Time (No Date Filter)</option>
          </select>
        </div>

        {timeframe === 'monthly' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
        )}

        {timeframe !== 'all' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder={new Date().getFullYear().toString()}
              className="w-full text-xs p-2 rounded border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Export Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportPDF}
            disabled={isExporting || (scope === 'cashier' && !cashierId)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded transition"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>

          <button
            onClick={handleExportCSV}
            disabled={isExporting || (scope === 'cashier' && !cashierId)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>

          <button
            onClick={handleExportJSON}
            disabled={isExporting || (scope === 'cashier' && !cashierId)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded transition"
          >
            <FileCode className="w-4 h-4" />
            Export JSON
          </button>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium py-2 px-4 rounded transition"
        >
          <Trash2 className="w-4 h-4" />
          Hard Reset Sales Data
        </button>
      </div>

      {/* HARD RESET CONFIRMATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <ShieldAlert className="w-8 h-8 flex-shrink-0" />
              <h3 className="text-lg font-bold">Destructive Action Warning</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action will <strong className="text-rose-600 font-bold">PERMANENTLY DELETE ALL</strong> transaction records from the MongoDB database collection.
            </p>

            <div className="bg-rose-50 border border-rose-200 p-3 rounded text-xs text-rose-800">
              Please type <span className="font-mono font-bold select-all">{REQUIRED_PHRASE}</span> below to confirm:
            </div>

            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="Type phrase here..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setConfirmationInput('');
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition"
              >
                Cancel
              </button>

              <button
                onClick={handleHardReset}
                disabled={confirmationInput !== REQUIRED_PHRASE || isResetting}
                className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded transition flex items-center gap-1"
              >
                {isResetting ? 'Wiping Database...' : 'Confirm Hard Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialExportModule;