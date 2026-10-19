const connectDB = require('./config/db');
const app = require('./app');
const { startDailyReportJob } = require('./utils/dailyReport');

connectDB();

// Optional daily e-mail report (configured in Store Settings, store timezone).
startDailyReportJob();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
