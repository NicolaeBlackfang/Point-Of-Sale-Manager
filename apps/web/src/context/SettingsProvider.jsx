import React, { useState, useEffect, useCallback, useContext } from 'react';
import API from '../services/api';
import { SettingsContext } from './SettingsContext';
import { AuthContext } from './AuthContext';

const DEFAULT_SETTINGS = {
  currencySymbol: '$',
  currencyCode: 'USD',
  taxRate: 0,
  lowStockThreshold: 5,
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Must be nested inside AuthProvider (see App.jsx) so settings load as soon
  // as a session exists — not before, when the request would just 401.
  const { user } = useContext(AuthContext) || {};

  const refreshSettings = useCallback(async () => {
    try {
      const { data } = await API.get('/settings');
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch (error) {
      console.error('Failed to load store settings:', error);
    }
  }, []);

  // /api/settings is auth-protected. Fetching on mount alone is not enough:
  // the provider mounts at the login screen (no token yet) and login does not
  // remount it, so settings would stay at the defaults for the whole session.
  useEffect(() => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    refreshSettings();
  }, [user, refreshSettings]);

  const formatCurrency = useCallback(
    (amount) => {
      const value = Number(amount || 0);
      return `${settings.currencySymbol}${value.toFixed(2)}`;
    },
    [settings.currencySymbol]
  );

  // Mirrors the server-side tax calculation (round2(subtotal * rate / 100)).
  const taxAmountFor = useCallback(
    (subtotal) =>
      Math.round(
        ((Number(subtotal || 0) * Number(settings.taxRate || 0)) / 100 + Number.EPSILON) * 100
      ) / 100,
    [settings.taxRate]
  );

  return (
    <SettingsContext.Provider
      value={{ settings, setSettings, refreshSettings, formatCurrency, taxAmountFor }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
