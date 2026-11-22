import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/auth.api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('vibe2fix_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('vibe2fix_token'));
  const [loading, setLoading] = useState(true);

  // Load user details if token exists
  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await authApi.getMe();
        const userData = response.data?.user || response.data?.data?.user || response.data;
        setUser(userData);
        localStorage.setItem('vibe2fix_user', JSON.stringify(userData));
      } catch (err) {
        console.error('Session expired or invalid:', err);
        if (err.response?.status === 401 || err.response?.status === 403) clearSession();
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, [token]);

  const login = async (email, password) => {
    const response = await authApi.login({ email, password });
    const receivedToken = response.data?.token || response.data?.data?.token;
    const receivedUser = response.data?.user || response.data?.data?.user || response.data;
    localStorage.setItem('vibe2fix_token', receivedToken);
    localStorage.setItem('vibe2fix_user', JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    return receivedUser;
  };

  const register = async (name, email, password, phone = '') => {
    const response = await authApi.register({ name, email, password, phone });
    return response.data;
  };

  const clearSession = () => {
    localStorage.removeItem('vibe2fix_token');
    localStorage.removeItem('vibe2fix_user');
    setToken(null);
    setUser(null);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      if (err.response?.status !== 401) throw err;
    }
    clearSession();
  };

  const updateUser = (updatedData) => {
    setUser((prev) => ({ ...prev, ...updatedData }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role?.toLowerCase() === 'admin',
        loading,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
