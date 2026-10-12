import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);
const FALLBACK_THEME = { portalName: 'Fit2Trade Learn', companyName: 'Fit2Trade Ltd', tagline: 'making workplaces better', logoUrl: '/brand/fit2trade-logo.png', primary: '#275c4d', accent: '#3f8a73', ink: '#3b3a3a', background: '#f4f6f5', sidebar: 'light', website: 'https://www.fit2trade.com', shades: { 600: '#204c3f', 700: '#193c32', 100: '#e4efea', 50: '#f1f6f4', text: '#ffffff' } };

/** Which company's branding should the (unauthenticated) page use? /c/<slug>/…, ?company=, or the last one used. */
export function companySlugFromLocation() {
  const m = /^\/c\/([a-z0-9-]+)/i.exec(window.location.pathname);
  const q = new URLSearchParams(window.location.search).get('company');
  const slug = (m && m[1]) || q || '';
  if (slug) { try { localStorage.setItem('f2t_company', slug); } catch {} return slug; }
  try { return localStorage.getItem('f2t_company') || ''; } catch { return ''; }
}

/** Apply a theme to the document: CSS variables, title and favicon. */
export function applyTheme(theme) {
  const t = { ...FALLBACK_THEME, ...theme, shades: { ...FALLBACK_THEME.shades, ...(theme?.shades || {}) } };
  const r = document.documentElement.style;
  r.setProperty('--f2t-green', t.primary); r.setProperty('--f2t-green-600', t.shades[600]); r.setProperty('--f2t-green-700', t.shades[700]);
  r.setProperty('--f2t-green-100', t.shades[100]); r.setProperty('--f2t-green-50', t.shades[50]); r.setProperty('--f2t-on-primary', t.shades.text);
  r.setProperty('--f2t-accent', t.accent || t.primary); r.setProperty('--f2t-ink', t.ink); r.setProperty('--f2t-bg', t.background);
  if (t.font && t.font !== 'Inter') r.setProperty('--font', `'${t.font}', 'Inter', system-ui, sans-serif`); else r.removeProperty('--font');
  document.documentElement.dataset.sidebar = t.sidebar || 'light';
  document.title = t.portalName || 'Learning portal';
  let link = document.querySelector('link[rel="icon"]'); if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = t.faviconUrl || t.logoUrl;
  let css = document.getElementById('company-css'); if (!css) { css = document.createElement('style'); css.id = 'company-css'; document.head.appendChild(css); }
  css.textContent = t.customCss || '';
  return t;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [company, setCompany] = useState(null);
  const [branding, setBranding] = useState({ theme: FALLBACK_THEME, sso: { google: false, microsoft: false }, companies: [] });

  const loadBranding = useCallback(async (slug = companySlugFromLocation()) => {
    try { const d = await api.get(`/api/branding${slug ? `?company=${encodeURIComponent(slug)}` : ''}`); setBranding(d); setCompany(d.company); applyTheme(d.theme); return d; } catch { applyTheme(FALLBACK_THEME); return null; }
  }, []);

  const refresh = useCallback(async () => {
    try { const d = await api.get('/api/auth/me'); setUser(d.user); setUnread(d.unreadNotifications || 0); if (d.company) { setCompany(d.company); setBranding((b) => ({ ...b, theme: d.company.theme, sso: d.company.sso })); applyTheme(d.company.theme); try { localStorage.setItem('f2t_company', d.company.slug); } catch {} } }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBranding().finally(refresh); }, [refresh, loadBranding]);

  const login = async (email, password) => { const d = await api.post('/api/auth/login', { email, password }); setUser(d.user); if (d.company) { setCompany(d.company); applyTheme(d.company.theme); } await refresh(); return d.user; };
  const logout = async () => { await api.post('/api/auth/logout'); setUser(null); };
  const isStaff = user && ['admin', 'manager', 'instructor'].includes(user.role);
  const isAdmin = user && ['admin', 'manager'].includes(user.role);
  const theme = { ...FALLBACK_THEME, ...(branding.theme || {}) };
  const brand = { name: theme.portalName, company: theme.companyName, tagline: theme.tagline, website: theme.website, primary: theme.primary, ink: theme.ink, logoUrl: theme.logoUrl };
  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh, unread, setUnread, isStaff, isAdmin, brand, theme, company, branding, loadBranding }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
