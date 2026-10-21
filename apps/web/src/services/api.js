import axios from 'axios';
import { setSyncToken } from './electron';

const DEFAULT_API_BASE = 'http://localhost:5000/api';

// The API base can be overridden at runtime (the desktop app stores it in
// settings so a single build can point at any server), falling back to the
// build-time VITE_API_URL and finally the local development server.
let apiBase =
  (typeof window !== 'undefined' && window.localStorage?.getItem('openpos.apiBase')) ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_API_BASE;

const API = axios.create({
  baseURL: apiBase,
});

// Backend origin (API_BASE minus its trailing /api) — used to resolve stored
// asset paths such as `/uploads/products/<id>.jpg`.
export const getApiOrigin = () => apiBase.replace(/\/api\/?$/, '');

export const getApiBase = () => apiBase;

/** Points the app at a different backend server and persists the choice. */
export function setApiBase(url) {
  const next = (url || '').trim().replace(/\/+$/, '');
  if (!next) return apiBase;
  apiBase = next;
  API.defaults.baseURL = apiBase;
  try {
    window.localStorage?.setItem('openpos.apiBase', apiBase);
  } catch {
    /* storage unavailable - keep the in-memory value */
  }
  return apiBase;
}

export const assetUrl = (path) => {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${getApiOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
};

// Interceptor to attach Bearer token on outgoing requests
API.interceptors.request.use((config) => {
  // Check standalone token first, or fallback to parsing the user object
  let token = localStorage.getItem('token');

  if (!token) {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        token = parsedUser?.token;
      }
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // Keep the desktop app's background sync engine authenticated so queued
    // offline sales can be pushed to the server when the network returns.
    setSyncToken(token);
  }

  return config;
});

export default API;
