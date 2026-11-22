import client from './client';

export const authApi = {
  register: (userData) => client.post('/api/auth/register', userData),
  login: (credentials) => client.post('/api/auth/login', credentials),
  logout: () => client.post('/api/auth/logout'),
  sendCode: () => client.post('/api/auth/verification/request'),
  confirmCode: (code) => client.post('/api/auth/verification/confirm', { code }),
  getMe: () => client.get('/api/auth/me'),
  forgotPassword: (email) => client.post('/api/auth/forgot-password', { email }),
  resetPassword: (payload) => client.post('/api/auth/reset-password', payload),
};
