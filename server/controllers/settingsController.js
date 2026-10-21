const Setting = require('../models/Setting');
const { logAudit } = require('../utils/audit');
const { validateSettingsInput } = require('../utils/validators');

const SETTING_KEYS = [
  'currencySymbol',
  'currencyCode',
  'taxRate',
  'lowStockThreshold',
  'timezone',
  'webhookUrl',
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'smtpPass',
  'emailRecipient',
  'lowStockEmailEnabled',
  'dailyReportEnabled',
  'dailyReportHour',
];

// Fields that must never leave the server for non-superadmin sessions.
const SECRET_KEYS = ['smtpPass'];

// @desc    Get store settings (currency, tax, timezone, notifications)
// @route   GET /api/settings
// @access  Private (All authenticated users)
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.getSettings();
    const payload = {};
    for (const key of SETTING_KEYS) {
      if (SECRET_KEYS.includes(key) && req.user?.role !== 'Superadmin') continue;
      payload[key] = settings[key];
    }
    res.json(payload);
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

    const settings = await Setting.getSettingsDoc();
    const changes = {};

    for (const key of SETTING_KEYS) {
      if (value[key] !== undefined && value[key] !== settings[key]) {
        changes[key] =
          key === 'smtpPass'
            ? { from: '(hidden)', to: value[key] ? '(updated)' : '(cleared)' }
            : { from: settings[key], to: value[key] };
        settings[key] = value[key];
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.json({ message: 'No changes to save.', settings });
    }

    await settings.save();
    Setting.invalidateCache();

    await logAudit({
      action: 'UPDATE_SETTINGS',
      entityType: 'Settings',
      entityId: 'store',
      entityLabel: 'Store Settings',
      user: req.user,
      req,
      details: { changes },
    });

    res.json({ message: 'Settings updated successfully.', settings: await Setting.getSettings() });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Unable to update settings.' });
  }
};

module.exports = { getSettings, updateSettings };
