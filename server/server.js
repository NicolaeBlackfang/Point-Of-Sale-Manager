const connectDB = require('./config/db');
const app = require('./app');
const { startDailyReportJob } = require('./utils/dailyReport');
const { backfillRecentReceipts } = require('./utils/receiptsBackfill');

// Once the DB is reachable, seed the TTL'd receipt history with any sales from
// the last 7 days that predate receipt snapshots (idempotent, non-blocking).
connectDB().then(() => backfillRecentReceipts());

// Optional daily e-mail report (configured in Store Settings, store timezone).
startDailyReportJob();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
