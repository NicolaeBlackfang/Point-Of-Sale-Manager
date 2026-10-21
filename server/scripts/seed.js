const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');

dotenv.config();

const seedSuperadmin = async () => {
  try {
    await connectDB();

    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!password) {
      console.error('SEED_ADMIN_PASSWORD environment variable is required to seed the Superadmin account.');
      process.exit(1);
    }

    const existing = await User.findOne({ username });
    if (!existing) {
      await User.create({
        username: username.toLowerCase().trim(),
        password,
        role: 'Superadmin',
        roleTakerName: process.env.SEED_ADMIN_NAME || 'System Administrator',
      });
      console.log('--------------------------------------------------');
      console.log('Superadmin created successfully!');
      console.log(`Username: ${username}`);
      console.log('--------------------------------------------------');
    } else {
      console.log('--------------------------------------------------');
      console.log('Superadmin account already exists.');
      console.log(`Username: ${username}`);
      console.log('--------------------------------------------------');
    }
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
};

seedSuperadmin();
