const mongoose = require('mongoose');

// Decides whether a monthly-reset request targets one cashier or the whole
// store. A missing/invalid cashierId NEVER falls through to a store-wide wipe:
// global resets must be explicitly requested with scope:'global'.
function resolveResetScope(body = {}) {
  const raw = body && body.cashierId;
  const cashierId = typeof raw === 'string' ? raw.trim() : raw ? String(raw).trim() : '';

  if (cashierId) {
    if (!mongoose.isValidObjectId(cashierId)) {
      return { ok: false, message: 'Invalid cashier id.' };
    }
    return { ok: true, scope: 'cashier', cashierId };
  }

  const explicitGlobal = body.scope === 'global' || body.global === true;
  if (explicitGlobal) {
    return { ok: true, scope: 'global' };
  }

  return {
    ok: false,
    message:
      'cashierId is required. Send scope:"global" only for an intentional store-wide reset.',
  };
}

module.exports = { resolveResetScope };
