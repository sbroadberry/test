/** Google / Microsoft single sign-on against a local mock OpenID Connect provider (authorization-code flow). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const users = { 'code-dara': { email: 'dara@eazysafe.com', email_verified: true, given_name: 'Dara', family_name: 'Fitzgerald', name: 'Dara Fitzgerald' },
  'code-outsider': { email: 'someone@gmail.com', email_verified: true, name: 'Some One' },
  'code-admin': { email: 'admin@fit2trade.com', email_verified: true, name: 'Fit2Trade Admin' },
  'code-ms': { preferred_username: 'katie@iact.ie', name: 'Katie Byrne' } };
const seen = [];
function startIdp() {
  const app = express(); app.use(express.urlencoded({ extended: true }));
  app.get('/authorize', (req, res) => { seen.push({ authorize: req.query }); const code = req.query.state.includes('x') ? 'code-dara' : 'code-dara'; res.redirect(`${req.query.redirect_uri}?code=${req.query.code_hint || 'code-dara'}&state=${encodeURIComponent(req.query.state)}`); });
  app.post('/token', (req, res) => { seen.push({ token: req.body }); const claims = users[req.body.code]; if (!claims || req.body.client_secret !== 'secret') return res.status(400).json({ error: 'invalid_grant', error_description: 'bad code' });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); res.json({ access_token: 'at-' + req.body.code, id_token: `${b64({ alg: 'none' })}.${b64({ ...claims, nonce: req.body.nonce_echo })}.sig`, token_type: 'Bearer' }); });
  app.get('/common/oauth2/v2.0/authorize', (req, res) => res.redirect(`${req.query.redirect_uri}?code=code-dara&state=${encodeURIComponent(req.query.state)}`));
  app.post('/common/oauth2/v2.0/token', (req, res) => { const claims = users[req.body.code]; if (!claims) return res.status(400).json({ error: 'invalid_grant' }); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); res.json({ access_token: 'at', id_token: `${b64({ alg: 'none' })}.${b64(claims)}.sig` }); });
  app.get('/userinfo', (req, res) => res.json({ email: 'katie@iact.ie', email_verified: true, given_name: 'Katie', family_name: 'Byrne' }));
  return new Promise((r) => { const s = app.listen(0, () => r(s)); });
}

let idp, idpUrl, srv;
before(async () => {
  idp = await startIdp(); idpUrl = `http://127.0.0.1:${idp.address().port}`;
  const { startTestServer } = await import('../helpers/server.js');
  srv = await startTestServer({ seedDemo: true, env: { GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_AUTH_URL: `${idpUrl}/authorize`, GOOGLE_TOKEN_URL: `${idpUrl}/token`, GOOGLE_USERINFO_URL: `${idpUrl}/userinfo`,
    MS_SSO_CLIENT_ID: 'ms-client', MS_SSO_CLIENT_SECRET: 'secret', MS_SSO_AUTHORITY: idpUrl, MS_SSO_TENANT: 'common', MS_SSO_USERINFO_URL: `${idpUrl}/userinfo` } });
  // the mock authority exposes /common/oauth2/v2.0/{authorize,token} for Microsoft
  idp.on('request', () => {});
});
after(async () => { await srv?.close(); idp?.close(); });

const noRedirect = { redirect: 'manual' };
async function runFlow(provider, { company = '', code = 'code-dara' } = {}) {
  const start = await fetch(`${srv.baseUrl}/api/auth/sso/${provider}/start?company=${company}`, noRedirect);
  assert.equal(start.status, 302, await start.text());
  const authorizeUrl = new URL(start.headers.get('location'));
  // emulate the identity provider: user authenticates, provider redirects back with a code + the same state
  const callback = `${authorizeUrl.searchParams.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(authorizeUrl.searchParams.get('state'))}`;
  const cb = await fetch(callback, noRedirect);
  return { authorizeUrl, cb, cookie: (cb.headers.get('set-cookie') || '').split(';')[0], location: cb.headers.get('location') };
}
const me = (cookie) => fetch(`${srv.baseUrl}/api/auth/me`, { headers: { cookie } }).then((r) => r.json());

test('providers endpoint and login branding advertise configured SSO', async () => {
  const p = await (await fetch(`${srv.baseUrl}/api/auth/sso/providers`)).json();
  assert.deepEqual(p.providers.map((x) => x.id), ['google', 'microsoft']);
  assert.match(p.redirectUris.google, /\/api\/auth\/sso\/google\/callback$/);
  const b = await (await fetch(`${srv.baseUrl}/api/branding?company=eazysafe`)).json();
  assert.equal(b.company.slug, 'eazysafe'); assert.equal(b.theme.primary, '#e8002a'); assert.deepEqual(b.sso, { google: true, microsoft: true });
});

test('Google SSO provisions a new EazySAFE learner from an allowed email domain', async () => {
  const { authorizeUrl, cb, cookie, location } = await runFlow('google', { company: 'eazysafe' });
  assert.equal(authorizeUrl.origin, idpUrl); assert.equal(authorizeUrl.searchParams.get('client_id'), 'google-client'); assert.equal(authorizeUrl.searchParams.get('scope'), 'openid email profile'); assert.ok(authorizeUrl.searchParams.get('nonce'));
  assert.equal(cb.status, 302, await cb.text()); assert.equal(location, '/'); assert.match(cookie, /^f2t_token=/);
  const m = await me(cookie);
  assert.equal(m.user.email, 'dara@eazysafe.com'); assert.equal(m.user.first_name, 'Dara'); assert.equal(m.user.role, 'learner'); assert.equal(m.user.sso_provider, 'google');
  assert.equal(m.company.slug, 'eazysafe'); assert.equal(m.company.theme.portalName, 'EazySAFE Learning');
  assert.ok(seen.some((s) => s.token && s.token.grant_type === 'authorization_code' && s.token.client_id === 'google-client'));
  // second sign-in reuses the account
  const again = await runFlow('google', { company: 'eazysafe' });
  assert.equal((await me(again.cookie)).user.id, m.user.id);
  const admin = srv.client(); await admin.login('admin@fit2trade.com', 'Admin123!');
  assert.equal((await admin.get('/api/users?q=dara@eazysafe')).data.users.length, 1);
});

test('SSO refuses email domains the company does not allow, and disabled providers', async () => {
  const { cb, location } = await runFlow('google', { company: 'eazysafe', code: 'code-outsider' });
  assert.equal(cb.status, 302); assert.match(decodeURIComponent(location), /\/c\/eazysafe\/login\?error=.*gmail\.com cannot sign in to EazySAFE/);
  const admin = srv.client(); await admin.login('admin@fit2trade.com', 'Admin123!');
  const iact = (await admin.get('/api/companies')).data.companies.find((c) => c.slug === 'iact');
  await admin.put(`/api/companies/${iact.id}`, { sso: { google: { enabled: false } } });
  const start = await fetch(`${srv.baseUrl}/api/auth/sso/google/start?company=iact`, noRedirect);
  assert.equal(start.status, 403); assert.match((await start.json()).error, /disabled for IACT/);
  const branding = await (await fetch(`${srv.baseUrl}/api/branding?company=iact`)).json();
  assert.deepEqual(branding.sso, { google: false, microsoft: true });
  await admin.put(`/api/companies/${iact.id}`, { sso: { google: { enabled: true }, autoProvision: false } });
  const noProv = await runFlow('google', { company: 'iact', code: 'code-outsider' });
  assert.match(decodeURIComponent(noProv.location), /No account exists/);
  await admin.put(`/api/companies/${iact.id}`, { sso: { autoProvision: true } });
});

test('Microsoft SSO signs an existing user in (matched by email, company inferred from the account)', async () => {
  const { authorizeUrl, cb, cookie } = await runFlow('microsoft', { code: 'code-admin' });
  assert.match(authorizeUrl.pathname, /\/common\/oauth2\/v2\.0\/authorize$/); assert.equal(authorizeUrl.searchParams.get('client_id'), 'ms-client');
  assert.equal(cb.status, 302, await cb.text());
  const m = await me(cookie);
  assert.equal(m.user.email, 'admin@fit2trade.com'); assert.equal(m.user.role, 'admin'); assert.equal(m.company.slug, 'fit2trade');
});

test('Microsoft SSO falls back to userinfo when the id_token has no email and routes by email domain', async () => {
  const { cb, cookie, location } = await runFlow('microsoft', { code: 'code-ms' });
  assert.equal(cb.status, 302, await cb.text()); assert.equal(location, '/');
  const m = await me(cookie);
  assert.equal(m.user.email, 'katie@iact.ie'); assert.equal(m.company.slug, 'iact');
});

test('tampered or expired state is rejected', async () => {
  const cb = await fetch(`${srv.baseUrl}/api/auth/sso/google/callback?code=code-dara&state=not-a-valid-state`, noRedirect);
  assert.equal(cb.status, 302); assert.match(decodeURIComponent(cb.headers.get('location')), /expired/);
  const bad = await fetch(`${srv.baseUrl}/api/auth/sso/google/start?company=eazysafe`, noRedirect);
  const state = new URL(bad.headers.get('location')).searchParams.get('state');
  const wrong = await fetch(`${srv.baseUrl}/api/auth/sso/microsoft/callback?code=code-dara&state=${encodeURIComponent(state)}`, noRedirect);
  assert.match(decodeURIComponent(wrong.headers.get('location')), /state mismatch/);
});
