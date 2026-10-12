/** Single sign-on with Google and Microsoft (OpenID Connect authorization-code flow). */
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const env = process.env;
export const providers = {
  google: {
    id: 'google', label: 'Google',
    clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    userinfoUrl: env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile', extra: { prompt: 'select_account', access_type: 'online' },
  },
  microsoft: {
    id: 'microsoft', label: 'Microsoft',
    clientId: env.MS_SSO_CLIENT_ID || '', clientSecret: env.MS_SSO_CLIENT_SECRET || '',
    authUrl: `${(env.MS_SSO_AUTHORITY || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${env.MS_SSO_TENANT || 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: `${(env.MS_SSO_AUTHORITY || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${env.MS_SSO_TENANT || 'common'}/oauth2/v2.0/token`,
    userinfoUrl: env.MS_SSO_USERINFO_URL || 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile', extra: { prompt: 'select_account', response_mode: 'query' },
  },
};

export const isConfigured = (id) => Boolean(providers[id]?.clientId && providers[id]?.clientSecret);
export const configuredProviders = () => Object.values(providers).filter((p) => isConfigured(p.id)).map((p) => ({ id: p.id, label: p.label }));
export const redirectUri = (id) => `${config.publicUrl}/api/auth/sso/${id}/callback`;

/** Build the provider authorisation URL plus a signed state token (10 minutes). */
export function buildAuthorizeUrl(id, { companySlug = '', redirect = '/' } = {}) {
  const p = providers[id];
  if (!p) throw new Error('Unknown SSO provider');
  if (!isConfigured(id)) throw new Error(`${p.label} sign-in is not configured`);
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const state = jwt.sign({ p: id, c: companySlug, r: redirect, n: nonce }, config.jwtSecret, { expiresIn: '10m' });
  const params = new URLSearchParams({ client_id: p.clientId, redirect_uri: redirectUri(id), response_type: 'code', scope: p.scope, state, nonce, ...p.extra });
  return { url: `${p.authUrl}?${params}`, state };
}

export function verifyState(state) { return jwt.verify(state, config.jwtSecret); }

/** Exchange the code and return a normalised profile { email, firstName, lastName, verified, raw }. */
export async function fetchProfile(id, code, fetchImpl = fetch) {
  const p = providers[id];
  const res = await fetchImpl(p.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: redirectUri(id), grant_type: 'authorization_code' }) });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !(tokens.id_token || tokens.access_token)) throw new Error(`${p.label} token exchange failed (${res.status}): ${tokens.error_description || tokens.error || 'no token returned'}`);
  let claims = tokens.id_token ? decodeJwt(tokens.id_token) : {};
  if ((!claims.email && !claims.preferred_username) && tokens.access_token) {
    const ui = await fetchImpl(p.userinfoUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (ui.ok) claims = { ...claims, ...(await ui.json().catch(() => ({}))) };
  }
  const email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
  if (!email || !email.includes('@')) throw new Error(`${p.label} did not return an email address`);
  const name = String(claims.name || '').trim();
  const [first, ...rest] = name.split(/\s+/);
  return { email, firstName: claims.given_name || first || email.split('@')[0], lastName: claims.family_name || rest.join(' ') || '', verified: claims.email_verified !== false, nonce: claims.nonce, raw: claims };
}

export function decodeJwt(token) {
  try { const payload = token.split('.')[1]; return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return {}; }
}
