const cron = require('node-cron');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const { sendSettingsEmail } = require('./mailer');
const { round2 } = require('./validators');
const {
  normalizeTimezone,
  dayKeyToInstant,
  dayRange,
  dayKey,
  zonedParts,
  lastNDayKeys,
} = require('./timezone');

// dayKeys for which this process already queued a report (per-process guard).
const sentForDayKeys = new Set();

// Pure decision helper (unit-testable): should a report go out right now, and
// for which store-local day? Reports cover the PREVIOUS store-local day and
// fire once the store-local clock reaches dailyReportHour.
function planDailyReport(settings = {}, now = new Date()) {
  if (!settings.dailyReportEnabled) return { send: false };
  if (!settings.smtpHost || !settings.emailRecipient) return { send: false };

  const tz = normalizeTimezone(settings.timezone);
  const parts = zonedParts(now, tz);
  const hour = Number.isInteger(settings.dailyReportHour) ? settings.dailyReportHour : 8;
  if (parts.hour < hour) return { send: false };

  const [yesterday] = lastNDayKeys(2, tz, now);
  if (sentForDayKeys.has(yesterday)) return { send: false };

  return { send: true, dayKey: yesterday, timezone: tz };
}

async function buildDailyReport(dayKeyValue, tz) {
  const start = dayKeyToInstant(dayKeyValue, tz);
  const { end } = dayRange(start, tz);

  const [totals] = await Sale.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, isResetForYear: { $ne: true } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$totalWithTax' },
        transactions: { $sum: 1 },
        cash: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CASH'] }, '$totalWithTax', 0] },
        },
        card: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, '$totalWithTax', 0] },
        },
        mobile: {
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'MOBILE'] }, '$totalWithTax', 0] },
        },
      },
    },
  ]);

  const topProducts = await Sale.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, isResetForYear: { $ne: true } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.sku',
        name: { $first: '$items.name' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);

  const settings = await Setting.getSettings();
  const lowStockCount = await Product.countDocuments({
    isDeleted: false,
    stockQuantity: { $lte: settings.lowStockThreshold ?? 5 },
  });

  return {
    dayKey: dayKeyValue,
    revenue: round2(totals?.revenue || 0),
    transactions: totals?.transactions || 0,
    cash: round2(totals?.cash || 0),
    card: round2(totals?.card || 0),
    mobile: round2(totals?.mobile || 0),
    lowStockCount,
    topProducts: topProducts.map((p) => ({
      sku: p._id,
      name: p.name,
      units: p.units,
      revenue: round2(p.revenue),
    })),
    currency: settings.currencyCode,
    symbol: settings.currencySymbol,
  };
}

function formatDailyReport(report) {
  const money = (value) => `${report.symbol}${value.toFixed(2)} ${report.currency}`;
  const lines = [
    `Daily report for ${report.dayKey}`,
    '',
    `Revenue (incl. tax): ${money(report.revenue)}`,
    `Transactions: ${report.transactions}`,
    `Cash: ${money(report.cash)} | Card: ${money(report.card)} | Mobile: ${money(report.mobile)}`,
    `Products at/below low-stock threshold: ${report.lowStockCount}`,
    '',
    'Top products:',
    ...(report.topProducts.length
      ? report.topProducts.map(
          (p, i) => `  ${i + 1}. ${p.sku} ${p.name} — ${p.units} unit(s), ${money(p.revenue)}`
        )
      : ['  (no sales recorded)']),
  ];
  return lines.join('\n');
}

// Cron tick: decides, builds and sends. Failures are logged, never thrown.
async function runDailyReportTick(now = new Date()) {
  try {
    const settings = await Setting.getSettings();
    const plan = planDailyReport(settings, now);
    if (!plan.send) return { sent: false };

    const report = await buildDailyReport(plan.dayKey, plan.timezone);
    const result = await sendSettingsEmail(settings, {
      subject: `Daily report ${plan.dayKey} — ${report.transactions} sale(s), ${report.currency} ${report.revenue.toFixed(2)}`,
      text: formatDailyReport(report),
      enabled: true,
    });

    // Mark as sent either way so a misconfigured SMTP server cannot loop.
    sentForDayKeys.add(plan.dayKey);
    return { sent: Boolean(result.ok), dayKey: plan.dayKey };
  } catch (error) {
    console.error('Daily report job failed:', error.message);
    return { sent: false, error: error.message };
  }
}

// Every 15 minutes; planDailyReport gates on the store-local hour and dedupes.
function startDailyReportJob() {
  const task = cron.schedule('*/15 * * * *', () => {
    runDailyReportTick().catch((error) => console.error('Daily report tick failed:', error.message));
  });
  return task;
}

module.exports = { planDailyReport, buildDailyReport, formatDailyReport, runDailyReportTick, startDailyReportJob };
