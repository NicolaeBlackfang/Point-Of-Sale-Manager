import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../services/api';

export const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  currencySymbol: '$',
  currencyCode: 'USD',
  taxRate: 0,
  lowStockThreshold: 5,
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const refreshSettings = useCallback(async () => {
    try {
      const { data } = await API.get('/settings');
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch (error) {
      console.error('Failed to load store settings:', error);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const formatCurrency = useCallback(
    (amount) => {
      const value = Number(amount || 0);
      return `${settings.currencySymbol}${value.toFixed(2)}`;
    },
    [settings.currencySymbol]
  );

  // Mirrors the server-side tax calculation (round2(subtotal * rate / 100)).
  const taxAmountFor = useCallback(
    (subtotal) => Math.round((Number(subtotal || 0) * settings.taxRate + Number.EPSILON) * 100) / 100,
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

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
