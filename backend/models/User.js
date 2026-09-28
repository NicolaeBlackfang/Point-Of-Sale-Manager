const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username or ID is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    role: {
      type: String,
      enum: ['Superadmin', 'Operator', 'Cashier'],
      required: [true, 'User role is required'],
    },
    roleTakerName: {
      type: String,
      required: [true, "Role Taker's Name is required"],
      trim: true,
    },
    storeAddress: {
      type: String,
      trim: true,
      required: function () {
        return this.role === 'Cashier';
      },
    },
    operatorId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      required: function () {
        return this.role === 'Operator';
      },
    },
    branchNumber: {
      type: String,
      trim: true,
      required: function () {
        return this.role === 'Operator' || this.role === 'Cashier';
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Monthly Performance Tracking
    monthlySalesRevenue: {
      type: Number,
      default: 0,
    },
    monthlyTransactionsCount: {
      type: Number,
      default: 0,
    },
    // Annual Performance Tracking (Persists across monthly resets)
    annualSalesRevenue: {
      type: Number,
      default: 0,
    },
    annualTransactionsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Password hashing hook
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);