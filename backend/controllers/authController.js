const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper to generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d',
  });
};

// @desc    Authenticate User & Get Token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide both username and password' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        role: user.role,
        roleTakerName: user.roleTakerName,
        branchNumber: user.branchNumber || null,
        storeAddress: user.storeAddress || null,
        operatorId: user.operatorId || null,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new staff member (Operator or Cashier) by Superadmin
// @route   POST /api/auth/register-staff
// @access  Private (Superadmin)
const registerStaff = async (req, res) => {
  const { username, password, role, roleTakerName, storeAddress, cashierAddress, operatorId, branchNumber } = req.body;

  try {
    if (!username || !password || !role || !roleTakerName) {
      return res.status(400).json({ message: 'Username, password, role, and role taker name are required.' });
    }

    // Normalize role string format to match User model Enum ('Operator' or 'Cashier')
    const formattedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    const finalAddress = storeAddress || cashierAddress;

    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this username already exists.' });
    }

    if (formattedRole === 'Operator' && operatorId) {
      const existingOp = await User.findOne({ operatorId: operatorId.trim() });
      if (existingOp) {
        return res.status(400).json({ message: 'Operator ID is already assigned.' });
      }
    }

    const newUser = await User.create({
      username: username.toLowerCase().trim(),
      password,
      role: formattedRole,
      roleTakerName: roleTakerName.trim(),
      storeAddress: formattedRole === 'Cashier' ? finalAddress?.trim() : undefined,
      operatorId: formattedRole === 'Operator' ? operatorId?.trim() : undefined,
      branchNumber: branchNumber?.trim() || '101',
    });

    res.status(201).json({
      message: `${formattedRole} account created successfully`,
      user: {
        _id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        roleTakerName: newUser.roleTakerName,
        branchNumber: newUser.branchNumber,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.json(req.user);
};

module.exports = { loginUser, registerStaff, getMe };