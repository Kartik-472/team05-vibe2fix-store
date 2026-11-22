import axios from 'axios';

// In dev, Vite proxies /api to port 8080; in production, relative path '' targets the host origin
const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : '';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT from localStorage
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vibe2fix_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to normalize backend { data: ... } envelope and catch 401 session errors
client.interceptors.response.use(
  (response) => {
    if (response.config.preserveEnvelope) return response;
    if (response.data && response.data.data !== undefined) {
      const inner = response.data.data;
      if (Array.isArray(inner)) {
        const arrayData = [...inner];
        arrayData.data = inner;
        response.data = arrayData;
      } else if (typeof inner === 'object' && inner !== null) {
        response.data = { ...response.data, ...inner };
      }
    }
    return response;
  },
  (error) => {
    if (error.response) {
      // If token expired or account disabled, clear local token
      if (error.response.status === 401) {
        localStorage.removeItem('vibe2fix_token');
        localStorage.removeItem('vibe2fix_user');
      }
    }
    return Promise.reject(error);
  }
);

export default client;
