import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const API = axios.create({
  baseURL: API_BASE,
});

// Backend origin (API_BASE minus its trailing /api) — used to resolve stored
// asset paths such as `/uploads/products/<id>.jpg`.
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

export const assetUrl = (path) => {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
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
  }

  return config;
});

export default API;