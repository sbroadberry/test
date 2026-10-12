import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, all, run, now, audit, uid } from '../db.js';
import { enrolUser } from '../services/progress.js';
import { signToken, publicUser, authenticate } from '../auth.js';
import { config } from '../config.js';
import { getCompany, getCompanyBySlug, getCompanyByEmailDomain, getDefaultCompany, publicCompany, parseSso, listDomains, resolveCompany } from '../services/companies.js';
import * as sso from '../services/sso.js';
import { notify } from '../services/notifications.js';

export const router = Router();

function setSession(res, user) {
  const token = signToken(user);
  res.cookie('f2t_token', token, { httpOnly: true, sameSite: 'lax', secure: config.publicUrl.startsWith('https'), maxAge: 12 * 3600 * 1000 });
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
  return token;
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? get('SELECT * FROM users WHERE email = ?', String(email).trim()) : null;
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.status !== 'active') return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
  const token = setSession(res, user);
  audit(user.id, 'auth.login', 'user', user.id);
  res.json({ token, user: publicUser(user), company: publicCompany(getCompany(user.company_id) || getDefaultCompany()) });
});

router.post('/logout', (req, res) => { res.clearCookie('f2t_token'); res.json({ ok: true }); });

router.get('/me', authenticate, (req, res) => {
  const unread = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n;
  res.json({ user: req.user, unreadNotifications: unread, company: publicCompany(getCompany(req.user.company_id) || getDefaultCompany()) });
});

router.put('/me', authenticate, (req, res) => {
  const { first_name, last_name, job_title, department, location, email_notifications } = req.body || {};
  run('UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), job_title = COALESCE(?, job_title), department = COALESCE(?, department), location = COALESCE(?, location), email_notifications = COALESCE(?, email_notifications) WHERE id = ?',
    first_name, last_name, job_title, department, location, email_notifications == null ? null : (email_notifications ? 1 : 0), req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.put('/me/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', bcrypt.hashSync(newPassword, 10), user.id);
  res.json({ ok: true });
});

// ---------------- Single sign-on (Google / Microsoft) ----------------
router.get('/sso/providers', (req, res) => res.json({ providers: sso.configuredProviders(), redirectUris: Object.fromEntries(Object.keys(sso.providers).map((id) => [id, sso.redirectUri(id)])) }));

/** Step 1: redirect the browser to the identity provider. */
router.get('/sso/:provider/start', (req, res) => {
  const { provider } = req.params;
  const company = resolveCompany({ slug: req.query.company, host: req.headers['x-forwarded-host'] || req.headers.host });
  const settings = parseSso(company);
  if (!sso.providers[provider]) return res.status(404).json({ error: 'Unknown provider' });
  if (!sso.isConfigured(provider)) return res.status(400).json({ error: `${sso.providers[provider].label} sign-in is not configured on this server` });
  if (!settings[provider]?.enabled) return res.status(403).json({ error: `${sso.providers[provider].label} sign-in is disabled for ${company?.name || 'this company'}` });
  const redirect = typeof req.query.redirect === 'string' && req.query.redirect.startsWith('/') ? req.query.redirect : '/';
  const { url } = sso.buildAuthorizeUrl(provider, { companySlug: company?.slug || '', redirect });
  if (req.query.format === 'json') return res.json({ url });
  res.redirect(url);
});

/** Step 2: the provider sends the browser back with a code; exchange it, find or provision the user, sign in. */
router.get('/sso/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const loginUrl = (slug, error) => `/${slug ? `c/${slug}/` : ''}login?error=${encodeURIComponent(error)}`;
  let state;
  try { state = sso.verifyState(String(req.query.state || '')); } catch { return res.redirect(loginUrl('', 'Sign-in link expired. Please try again.')); }
  if (state.p !== provider) return res.redirect(loginUrl(state.c, 'Sign-in state mismatch.'));
  if (req.query.error) return res.redirect(loginUrl(state.c, `${sso.providers[provider]?.label || provider}: ${req.query.error_description || req.query.error}`));
  let profile;
  try { profile = await sso.fetchProfile(provider, String(req.query.code || '')); } catch (err) { return res.redirect(loginUrl(state.c, err.message)); }
  if (profile.nonce && profile.nonce !== state.n) return res.redirect(loginUrl(state.c, 'Sign-in could not be verified (nonce).'));
  if (!profile.verified) return res.redirect(loginUrl(state.c, 'Your email address is not verified with the identity provider.'));

  let user = get('SELECT * FROM users WHERE email = ?', profile.email);
  // Existing account -> its company. New account -> the company owning the email domain, else the portal the user started from.
  let company = user ? getCompany(user.company_id) : null;
  if (!company) company = getCompanyByEmailDomain(profile.email) || (state.c && getCompanyBySlug(state.c)) || getDefaultCompany();
  const settings = parseSso(company);
  if (!settings[provider]?.enabled) return res.redirect(loginUrl(state.c, `${sso.providers[provider].label} sign-in is disabled for ${company.name}.`));

  if (!user) {
    const allowed = listDomains(company.email_domains);
    const domain = profile.email.split('@')[1];
    if (!settings.autoProvision) return res.redirect(loginUrl(state.c, `No account exists for ${profile.email}. Ask your administrator to create one.`));
    if (allowed.length && !allowed.includes(domain)) return res.redirect(loginUrl(state.c, `Accounts from @${domain} cannot sign in to ${company.name}. Allowed: ${allowed.map((d) => '@' + d).join(', ')}.`));
    const id = uid();
    run(`INSERT INTO users(id, email, password_hash, first_name, last_name, role, status, company_id, sso_provider, external_source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, profile.email, bcrypt.hashSync(uid() + uid(), 8), profile.firstName, profile.lastName, ['learner', 'instructor', 'manager'].includes(settings.defaultRole) ? settings.defaultRole : 'learner', 'active', company.id, provider, `sso:${provider}`, now());
    if (settings.defaultGroup) {
      let g = get('SELECT id FROM groups WHERE lower(name) = lower(?)', settings.defaultGroup);
      if (!g) { const gid = uid(); run('INSERT INTO groups(id, name, description, created_at) VALUES (?,?,?,?)', gid, settings.defaultGroup, 'Created by SSO auto-provisioning', now()); g = { id: gid }; }
      run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', g.id, id);
      for (const gc of all('SELECT * FROM group_courses WHERE group_id = ?', g.id)) enrolUser(id, gc.course_id, { source: 'group', dueAt: gc.due_days ? new Date(Date.now() + gc.due_days * 86400000).toISOString() : null });
    }
    user = get('SELECT * FROM users WHERE id = ?', id);
    notify(id, 'welcome', `Welcome to ${company.name}'s learning portal`, 'Your account was created automatically from your single sign-on.', '/');
    audit(id, 'auth.sso_provision', 'user', id, { provider, company: company.slug });
  } else {
    if (user.status !== 'active') return res.redirect(loginUrl(state.c, 'This account is inactive. Contact your administrator.'));
    if (!user.sso_provider) run('UPDATE users SET sso_provider = ? WHERE id = ?', provider, user.id);
  }
  setSession(res, user);
  audit(user.id, 'auth.sso_login', 'user', user.id, { provider });
  res.redirect(state.r || '/');
});
