import { all, get, run, uid, now } from '../db.js';
import { resolveTheme, PRESETS, sanitiseTheme } from './themes.js';

export const DEFAULT_SSO = { google: { enabled: true }, microsoft: { enabled: true }, autoProvision: true, defaultRole: 'learner', defaultGroup: '' };

export function parseSso(company) { try { return { ...DEFAULT_SSO, ...JSON.parse(company?.sso_json || '{}') }; } catch { return { ...DEFAULT_SSO }; } }
export const listDomains = (s) => String(s || '').split(/[,\s;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

export function getDefaultCompany() { return get('SELECT * FROM companies WHERE is_default = 1') || get('SELECT * FROM companies ORDER BY created_at LIMIT 1'); }
export function getCompany(id) { return id ? get('SELECT * FROM companies WHERE id = ?', id) : null; }
export function getCompanyBySlug(slug) { return slug ? get('SELECT * FROM companies WHERE lower(slug) = lower(?)', slug) : null; }
export function getCompanyByHost(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (!h) return null;
  for (const c of all("SELECT * FROM companies WHERE domains != ''")) if (listDomains(c.domains).some((d) => h === d || h.endsWith('.' + d))) return c;
  return null;
}
export function getCompanyByEmailDomain(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  if (!domain) return null;
  for (const c of all("SELECT * FROM companies WHERE email_domains != ''")) if (listDomains(c.email_domains).includes(domain)) return c;
  return null;
}

/** Resolve the company a request is about: explicit slug/id, then hostname, then the default. */
export function resolveCompany({ slug, id, host } = {}) {
  return (slug && getCompanyBySlug(slug)) || (id && getCompany(id)) || getCompanyByHost(host) || getDefaultCompany();
}

export function publicCompany(c) {
  if (!c) return null;
  const sso = parseSso(c);
  return { id: c.id, name: c.name, slug: c.slug, website: c.website, theme: resolveTheme(c), sso: { google: !!sso.google?.enabled, microsoft: !!sso.microsoft?.enabled } };
}

export function createCompany({ name, slug, website = '', domains = '', email_domains = '', theme = {}, sso = {}, is_default = 0 }) {
  const id = uid();
  run('INSERT INTO companies(id, name, slug, website, domains, email_domains, theme_json, sso_json, is_default, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, name, slugify(slug || name), website, domains, email_domains, JSON.stringify(sanitiseTheme(theme)), JSON.stringify({ ...DEFAULT_SSO, ...sso }), is_default ? 1 : 0, 'active', now());
  return getCompany(id);
}
export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company';

/** Create the default company (and sample themed companies when demo data is requested). */
export function ensureCompanies({ demo = false } = {}) {
  if (!getDefaultCompany()) createCompany({ name: 'Fit2Trade', slug: 'fit2trade', website: 'https://www.fit2trade.com', email_domains: 'fit2trade.com', theme: { preset: 'fit2trade' }, is_default: 1 });
  if (demo) {
    if (!getCompanyBySlug('eazysafe')) createCompany({ name: 'EazySAFE', slug: 'eazysafe', website: 'https://www.eazysafe.com', domains: 'learn.eazysafe.com', email_domains: 'eazysafe.com', theme: { preset: 'eazysafe' } });
    if (!getCompanyBySlug('iact')) createCompany({ name: 'IACT', slug: 'iact', website: 'https://www.iact.ie', domains: 'academy.iact.ie', email_domains: 'iact.ie', theme: { preset: 'iact' } });
  }
  const def = getDefaultCompany();
  run('UPDATE users SET company_id = ? WHERE company_id IS NULL', def.id);
  return def;
}
export { PRESETS };
