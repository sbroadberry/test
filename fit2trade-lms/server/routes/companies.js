/** Companies (tenants): branding themes, SSO settings and logo uploads. */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { all, get, run, now, audit } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { config } from '../config.js';
import { PRESETS, DEFAULT_THEME, resolveTheme, sanitiseTheme } from '../services/themes.js';
import { createCompany, getCompany, getCompanyBySlug, publicCompany, parseSso, slugify, DEFAULT_SSO, resolveCompany } from '../services/companies.js';
import { configuredProviders } from '../services/sso.js';

export const router = Router();
const brandDir = path.join(config.dataDir, 'brand');
fs.mkdirSync(brandDir, { recursive: true });
const upload = multer({ dest: config.uploadsDir, limits: { fileSize: 5 * 1024 * 1024 } });

/** Public: branding for the login page. Resolved from ?company=slug, the request host, or the default company. */
export function publicBranding(req, res) {
  const company = resolveCompany({ slug: req.query.company, host: req.headers['x-forwarded-host'] || req.headers.host });
  const pub = publicCompany(company);
  const configured = configuredProviders().map((p) => p.id);
  res.json({ company: pub && { id: pub.id, name: pub.name, slug: pub.slug, website: pub.website }, theme: pub?.theme || { ...DEFAULT_THEME }, sso: { google: !!pub?.sso.google && configured.includes('google'), microsoft: !!pub?.sso.microsoft && configured.includes('microsoft') }, companies: all("SELECT name, slug FROM companies WHERE status = 'active' ORDER BY is_default DESC, name") });
}

router.use(authenticate, requireRole('manager'));
const withCounts = (c) => ({ ...c, theme: resolveTheme(c), sso: parseSso(c), users: get('SELECT COUNT(*) AS n FROM users WHERE company_id = ?', c.id).n, courses: get('SELECT COUNT(*) AS n FROM courses WHERE company_id = ?', c.id).n, theme_json: undefined, sso_json: undefined, stored_theme: safe(c.theme_json) });

router.get('/presets', (req, res) => res.json({ presets: Object.entries(PRESETS).map(([id, t]) => ({ id, label: t.companyName, theme: t })), fields: Object.keys(DEFAULT_THEME), providers: configuredProviders() }));
router.get('/', (req, res) => res.json({ companies: all('SELECT * FROM companies ORDER BY is_default DESC, name').map(withCounts) }));
router.get('/:id', (req, res) => { const c = getCompany(req.params.id); if (!c) return res.status(404).json({ error: 'Company not found' }); res.json({ company: withCounts(c) }); });

router.post('/', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  const slug = slugify(b.slug || b.name);
  if (getCompanyBySlug(slug)) return res.status(409).json({ error: `A company with the slug "${slug}" already exists` });
  const c = createCompany({ name: b.name, slug, website: b.website || '', domains: b.domains || '', email_domains: b.email_domains || '', theme: b.theme || {}, sso: b.sso || {} });
  audit(req.user.id, 'company.create', 'company', c.id, { slug });
  res.status(201).json({ company: withCounts(c) });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const c = getCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  const b = req.body || {};
  if (b.slug) { const s = slugify(b.slug); const other = getCompanyBySlug(s); if (other && other.id !== c.id) return res.status(409).json({ error: 'Slug already in use' }); b.slug = s; }
  const theme = b.theme ? JSON.stringify(sanitiseTheme(b.theme)) : c.theme_json;
  const sso = b.sso ? JSON.stringify({ ...DEFAULT_SSO, ...parseSso(c), ...b.sso }) : c.sso_json;
  run('UPDATE companies SET name = COALESCE(?, name), slug = COALESCE(?, slug), website = COALESCE(?, website), domains = COALESCE(?, domains), email_domains = COALESCE(?, email_domains), theme_json = ?, sso_json = ?, status = COALESCE(?, status) WHERE id = ?',
    b.name, b.slug, b.website, b.domains, b.email_domains, theme, sso, b.status, c.id);
  if (b.is_default) { run('UPDATE companies SET is_default = 0'); run('UPDATE companies SET is_default = 1 WHERE id = ?', c.id); }
  audit(req.user.id, 'company.update', 'company', c.id);
  res.json({ company: withCounts(getCompany(c.id)) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const c = getCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  if (c.is_default) return res.status(400).json({ error: 'The default company cannot be deleted' });
  const def = get('SELECT id FROM companies WHERE is_default = 1');
  run('UPDATE users SET company_id = ? WHERE company_id = ?', def?.id || null, c.id);
  run('DELETE FROM companies WHERE id = ?', c.id);
  audit(req.user.id, 'company.delete', 'company', c.id);
  res.json({ ok: true });
});

/** Upload a logo / favicon / login image. Stored under DATA_DIR/brand and served publicly at /brand-assets/<file>. */
router.post('/:id/assets', requireRole('admin'), upload.single('file'), (req, res) => {
  const c = getCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico'].includes(ext)) { fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ error: 'Use a PNG, JPG, SVG, WEBP, GIF or ICO image' }); }
  const kind = ['logo', 'favicon', 'loginImage'].includes(req.body?.kind) ? req.body.kind : 'logo';
  const name = `${c.slug}-${kind}-${Date.now()}${ext}`;
  fs.renameSync(req.file.path, path.join(brandDir, name));
  const url = `/brand-assets/${name}`;
  const theme = safe(c.theme_json);
  theme[kind === 'logo' ? 'logoUrl' : kind === 'favicon' ? 'faviconUrl' : 'loginImageUrl'] = url;
  run('UPDATE companies SET theme_json = ? WHERE id = ?', JSON.stringify(theme), c.id);
  res.status(201).json({ url, company: withCounts(getCompany(c.id)) });
});

export function brandAsset(req, res) {
  const file = path.resolve(brandDir, path.basename(req.params.file || ''));
  if (!file.startsWith(brandDir) || !fs.existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(file);
}

function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
