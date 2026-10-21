const mongoose = require('mongoose'); // Fixed: Changed from 'import' to 'require'

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`🚀 MongoDB Atlas Connected Successfully: ${conn.connection.host}`);
    console.log(`📂 Active Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Exit process with failure code if connection drops
    process.exit(1);
  }
};

module.exports = connectDB;
