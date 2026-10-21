const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validatePasswordStrength, normalizeStaffRole } = require('../utils/security');

// Helper to generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d',
  });
};

// A real bcrypt hash of a random throw-away secret. It is compared against
// whenever the submitted username does not exist (or the account is disabled)
// so the login endpoint always performs exactly one bcrypt round-trip. Without
// it, response timing leaks whether a username is registered (user enumeration).
const DUMMY_PASSWORD_HASH =
  '$2b$10$OZJSX0ly43N6asA8MzrtAug4tAXqXLwjHSUkLStIzerkVABAoceVa';

// Longest accepted profile values — keeps a single request from bloating the
// user collection with megabyte-long names.
const MAX_USERNAME_LENGTH = 60;
const MAX_NAME_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 250;
const MAX_BRANCH_LENGTH = 40;

/**
 * Burns the same amount of CPU as a real password check. Used when the
 * submitted username does not exist so both branches of the login flow take
 * the same amount of time (defeats username enumeration via timing).
 */
async function bcryptCompareDummy(password) {
  try {
    const bcrypt = require('bcryptjs');
    await bcrypt.compare(typeof password === 'string' ? password : '', DUMMY_PASSWORD_HASH);
  } catch {
    /* never let the equalizer break the login flow */
  }
  return false;
}

// @desc    Authenticate User & Get Token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { username, password } = req.body;

  // Only accept scalar credentials — an object here would be a NoSQL-injection
  // attempt (e.g. { username: { $gt: '' } }).
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password
  ) {
    return res.status(400).json({ message: 'Please provide both username and password' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    // Always run exactly one bcrypt comparison so the response time does not
    // reveal whether the username exists.
    const passwordMatches = user
      ? await user.comparePassword(password).catch(() => false)
      : await bcryptCompareDummy(password);

    if (user && user.isActive !== false && passwordMatches) {
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Register a new staff member (Operator or Cashier) by Superadmin
// @route   POST /api/auth/register-staff
// @access  Private (Superadmin)
const registerStaff = async (req, res) => {
  const { username, password, role, roleTakerName, storeAddress, cashierAddress, operatorId, branchNumber } = req.body;

  try {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string' ||
      typeof roleTakerName !== 'string' ||
      !username.trim() ||
      !password ||
      !role.trim() ||
      !roleTakerName.trim()
    ) {
      return res.status(400).json({ message: 'Username, password, role, and role taker name are required.' });
    }

    // Only managed staff roles may be created here — a Superadmin account can
    // never be minted through the staff-registration endpoint.
    const roleResult = normalizeStaffRole(role);
    if (!roleResult.ok) {
      return res.status(400).json({ message: roleResult.error });
    }
    const formattedRole = roleResult.role;

    // Password policy (the model validator only ever sees the bcrypt hash).
    const passwordResult = validatePasswordStrength(password);
    if (!passwordResult.ok) {
      return res.status(400).json({ message: passwordResult.error });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanName = roleTakerName.trim();
    const finalAddress = storeAddress || cashierAddress;

    if (cleanUsername.length > MAX_USERNAME_LENGTH) {
      return res
        .status(400)
        .json({ message: `Username must be at most ${MAX_USERNAME_LENGTH} characters.` });
    }
    if (cleanName.length > MAX_NAME_LENGTH) {
      return res
        .status(400)
        .json({ message: `Name must be at most ${MAX_NAME_LENGTH} characters.` });
    }
    if (finalAddress && String(finalAddress).trim().length > MAX_ADDRESS_LENGTH) {
      return res
        .status(400)
        .json({ message: `Store address must be at most ${MAX_ADDRESS_LENGTH} characters.` });
    }
    if (branchNumber && String(branchNumber).trim().length > MAX_BRANCH_LENGTH) {
      return res
        .status(400)
        .json({ message: `Branch number must be at most ${MAX_BRANCH_LENGTH} characters.` });
    }
    if (formattedRole === 'Operator' && !operatorId) {
      return res.status(400).json({ message: 'An operator ID is required for Operators.' });
    }
    if (formattedRole === 'Cashier' && !finalAddress) {
      return res.status(400).json({ message: 'A store address is required for Cashiers.' });
    }

    const existingUser = await User.findOne({ username: cleanUsername });
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
      username: cleanUsername,
      password,
      role: formattedRole,
      roleTakerName: cleanName,
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
    console.error(error);
    res.status(400).json({ message: 'Unable to create staff account.' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  const user = req.user;
  res.json({
    _id: user._id,
    username: user.username,
    role: user.role,
    roleTakerName: user.roleTakerName,
    branchNumber: user.branchNumber || null,
    storeAddress: user.storeAddress || null,
    operatorId: user.operatorId || null,
    isActive: user.isActive !== false,
  });
};

module.exports = { loginUser, registerStaff, getMe };