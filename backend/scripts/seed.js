const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');

dotenv.config();

const seedSuperadmin = async () => {
  try {
    await connectDB();
    const existing = await User.findOne({ username: 'admin' });
    if (!existing) {
      await User.create({
        username: 'admin',
        password: 'password123',
        role: 'Superadmin',
        roleTakerName: 'System Administrator',
      });
      console.log('--------------------------------------------------');
      console.log('Superadmin created successfully!');
      console.log('Username: admin');
      console.log('Password: password123');
      console.log('--------------------------------------------------');
    } else {
      console.log('--------------------------------------------------');
      console.log('Superadmin account already exists.');
      console.log('Username: admin');
      console.log('--------------------------------------------------');
    }
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
};

seedSuperadmin();