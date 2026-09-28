import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

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