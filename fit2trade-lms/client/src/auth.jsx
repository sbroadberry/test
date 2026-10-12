import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [brand, setBrand] = useState({ name: 'Fit2Trade Learn', tagline: 'making workplaces better', primary: '#275c4d' });

  const refresh = useCallback(async () => {
    try { const d = await api.get('/api/auth/me'); setUser(d.user); setUnread(d.unreadNotifications || 0); } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); api.get('/api/settings/public').then((d) => setBrand((b) => ({ ...b, ...d.brand }))).catch(() => {}); }, [refresh]);

  const login = async (email, password) => { const d = await api.post('/api/auth/login', { email, password }); setUser(d.user); await refresh(); return d.user; };
  const logout = async () => { await api.post('/api/auth/logout'); setUser(null); };
  const isStaff = user && ['admin', 'manager', 'instructor'].includes(user.role);
  const isAdmin = user && ['admin', 'manager'].includes(user.role);
  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh, unread, setUnread, isStaff, isAdmin, brand }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
