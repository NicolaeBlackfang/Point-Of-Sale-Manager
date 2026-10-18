import React, { useState, useEffect } from 'react';
import API from '../../services/api';
import { BarChart3, TrendingUp, CreditCard } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

// Lightweight SVG charts (no external chart library required).

const DailyRevenueChart = ({ daily, formatCurrency }) => {
  if (!daily || daily.length === 0) {
    return <p className="text-xs text-slate-400 py-8 text-center">No sales data in the last 14 days.</p>;
  }

  const max = Math.max(...daily.map((d) => d.revenue), 1);
  const width = 640;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 28, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = Math.max(chartWidth / daily.length - 4, 4);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52" role="img" aria-label="Daily revenue chart">
        {/* Y-axis gridlines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + chartHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-slate-200" strokeWidth="1" />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">
                {formatCurrency(max * ratio)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {daily.map((entry, index) => {
          const barHeight = (entry.revenue / max) * chartHeight;
          const x = padding.left + (chartWidth / daily.length) * index + 2;
          const y = padding.top + chartHeight - barHeight;
          return (
            <g key={entry.date}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 1)} rx="2" className="fill-blue-500">
                <title>{`${entry.date}: ${formatCurrency(entry.revenue)} (${entry.transactions} txns)`}</title>
              </rect>
              {daily.length <= 14 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-400"
                  fontSize="8"
                >
                  {entry.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const TopProductsList = ({ topProducts, formatCurrency }) => {
  if (!topProducts || topProducts.length === 0) {
    return <p className="text-xs text-slate-400 py-8 text-center">No product sales in the last 30 days.</p>;
  }

  const maxRevenue = Math.max(...topProducts.map((p) => p.revenue), 1);

  return (
    <div className="space-y-2">
      {topProducts.map((product, index) => (
        <div key={`${product.sku}-${index}`} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 truncate">
              {index + 1}. {product.name}
              <span className="text-slate-400 font-mono ml-1">({product.sku})</span>
            </span>
            <span className="text-slate-600 font-bold whitespace-nowrap">
              {formatCurrency(product.revenue)} · {product.quantitySold} sold
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${(product.revenue / maxRevenue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const PaymentBreakdown = ({ breakdown, formatCurrency }) => {
  if (!breakdown || breakdown.length === 0) {
    return <p className="text-xs text-slate-400 py-8 text-center">No payment data in the last 30 days.</p>;
  }

  const total = breakdown.reduce((sum, entry) => sum + entry.revenue, 0) || 1;
  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];

  return (
    <div className="space-y-3">
      {breakdown.map((entry, index) => {
        const percentage = (entry.revenue / total) * 100;
        return (
          <div key={entry.method || index} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 uppercase">{entry.method || 'UNKNOWN'}</span>
              <span className="text-slate-600">
                {formatCurrency(entry.revenue)} · {entry.count} txns · {percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${colors[index % colors.length]}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AnalyticsCharts = () => {
  const { formatCurrency } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/analytics/charts');
        setData(data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load chart data.');
      }
    };
    load();
  }, []);

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>;
  }

  if (!data) {
    return <p className="text-xs text-slate-400 py-8 text-center">Loading charts...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2 border-b pb-3 mb-4">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <h3 className="font-bold text-slate-800 text-sm">Daily Revenue (Last 14 Days)</h3>
        </div>
        <DailyRevenueChart daily={data.daily} formatCurrency={formatCurrency} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 border-b pb-3 mb-4">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-sm">Top Products (Last 30 Days)</h3>
          </div>
          <TopProductsList topProducts={data.topProducts} formatCurrency={formatCurrency} />
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 border-b pb-3 mb-4">
            <CreditCard className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-slate-800 text-sm">Payment Mix (Last 30 Days)</h3>
          </div>
          <PaymentBreakdown breakdown={data.paymentBreakdown} formatCurrency={formatCurrency} />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
