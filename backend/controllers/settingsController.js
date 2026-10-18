const Setting = require('../models/Setting');
const { logAudit } = require('../utils/audit');
const { validateSettingsInput } = require('../utils/validators');

// @desc    Get store settings (currency, tax rate, low-stock threshold)
// @route   GET /api/settings
// @access  Private (All authenticated users)
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    res.json({
      currencySymbol: settings.currencySymbol,
      currencyCode: settings.currencyCode,
      taxRate: settings.taxRate,
      lowStockThreshold: settings.lowStockThreshold,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// @desc    Update store settings
// @route   PUT /api/settings
// @access  Private (Superadmin)
const updateSettings = async (req, res) => {
  try {
    const { ok, error, value } = validateSettingsInput(req.body);
    if (!ok) {
      return res.status(400).json({ message: error });
    }

    const settings = await Setting.getSettings();
    const changes = {};

    for (const key of ['currencySymbol', 'currencyCode', 'taxRate', 'lowStockThreshold']) {
      if (value[key] !== undefined && value[key] !== settings[key]) {
        changes[key] = { from: settings[key], to: value[key] };
        settings[key] = value[key];
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.json({ message: 'No changes to save.', settings });
    }

    await settings.save();

    await logAudit({
      action: 'UPDATE_SETTINGS',
      entityType: 'Settings',
      entityId: 'store',
      entityLabel: 'Store Settings',
      user: req.user,
      req,
      details: { changes },
    });

    res.json({ message: 'Settings updated successfully.', settings });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Unable to update settings.' });
  }
};

module.exports = { getSettings, updateSettings };
