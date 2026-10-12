import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { Button, Field, Input } from '../../components/Ui.jsx';

const GoogleIcon = () => (<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.7 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" /><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.2-13.6-10l-7.8 6C6.5 42.6 14.6 48 24 48z" /></svg>);
const MicrosoftIcon = () => (<svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" /><rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" /></svg>);

export default function Login() {
  const { login, theme, branding, company, loadBranding } = useAuth();
  const nav = useNavigate(); const loc = useLocation(); const { slug } = useParams(); const [params] = useSearchParams();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(params.get('error') || ''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (slug && slug !== company?.slug) loadBranding(slug); }, [slug]); // eslint-disable-line
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { const u = await login(email, password); nav(loc.state?.from || (['admin', 'manager', 'instructor'].includes(u.role) ? '/admin' : '/')); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const ssoUrl = (p) => `/api/auth/sso/${p}/start?company=${encodeURIComponent(company?.slug || '')}&redirect=${encodeURIComponent(loc.state?.from || '/')}`;
  const heroStyle = theme.loginBackground === 'image' && theme.loginImageUrl ? { backgroundImage: `linear-gradient(160deg, rgba(0,0,0,.55), rgba(0,0,0,.35)), url(${theme.loginImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : theme.loginBackground === 'solid' ? { background: theme.primary } : { background: `linear-gradient(160deg, ${theme.shades?.[700] || theme.primary}, ${theme.primary} 60%, ${theme.accent || theme.primary})` };
  const showSso = branding.sso?.google || branding.sso?.microsoft;
  return (
    <div className="login-wrap">
      <section className="login-hero" style={heroStyle}>
        <div><span className="pill">✓ SCORM 1.2 &amp; 2004</span><span className="pill">✓ Teams &amp; Webex classrooms</span><span className="pill">✓ Certificates &amp; expiry reminders</span></div>
        <div><h1>{theme.loginHeadline}</h1><p>{theme.loginSubtext}{theme.tagline ? ` — ${theme.tagline}.` : ''}</p></div>
        <div className="small" style={{ opacity: .8 }}>© {new Date().getFullYear()} {theme.companyName}{theme.footerText ? ` · ${theme.footerText}` : ''}</div>
      </section>
      <section className="login-panel">
        <form className="login-box" onSubmit={submit}>
          <img className="logo" src={theme.logoUrl} alt={theme.companyName} style={{ background: theme.logoBackground, borderRadius: 8 }} data-testid="login-logo" />
          <h2>Sign in to {theme.portalName}</h2>
          <p className="muted">Use your work email address.</p>
          {error && <div className="error mb" data-testid="login-error">{error}</div>}
          {showSso && <div className="stack mb" style={{ gap: 8 }}>
            {branding.sso.google && <a className="btn secondary block" href={ssoUrl('google')} data-testid="sso-google"><GoogleIcon />Continue with Google</a>}
            {branding.sso.microsoft && <a className="btn secondary block" href={ssoUrl('microsoft')} data-testid="sso-microsoft"><MicrosoftIcon />Continue with Microsoft</a>}
            <div className="row" style={{ gap: 10, alignItems: 'center' }}><span style={{ flex: 1, height: 1, background: 'var(--f2t-line)' }} /><span className="tiny muted">or with your password</span><span style={{ flex: 1, height: 1, background: 'var(--f2t-line)' }} /></div>
          </div>}
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required data-testid="email" autoComplete="username" /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="password" autoComplete="current-password" /></Field>
          <Button size="lg" className="block" disabled={busy} data-testid="login-submit">{busy ? 'Signing in…' : 'Sign in'}</Button>
          {theme.supportEmail && <p className="small muted mt">Need help? <a href={`mailto:${theme.supportEmail}`}>{theme.supportEmail}</a></p>}
          {branding.companies?.length > 1 && <p className="tiny muted mt">Portal: <strong>{company?.name}</strong> · switch to {branding.companies.filter((c) => c.slug !== company?.slug).map((c, i) => <span key={c.slug}>{i > 0 && ', '}<a href={`/c/${c.slug}/login`}>{c.name}</a></span>)}</p>}
        </form>
      </section>
    </div>
  );
}
