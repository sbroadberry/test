import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { Button, Field, Input } from '../../components/Ui.jsx';

export default function Login() {
  const { login, brand } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { const u = await login(email, password); nav(loc.state?.from || (['admin', 'manager', 'instructor'].includes(u.role) ? '/admin' : '/')); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div><span className="pill">✓ SCORM 1.2 &amp; 2004</span><span className="pill">✓ Teams &amp; Webex classrooms</span><span className="pill">✓ Certificates &amp; expiry reminders</span></div>
        <div><h1>Learning, safety and compliance in one connected platform.</h1><p>Fit2Trade Learn gives your teams self-paced courses, live virtual classrooms and audit-ready records — {brand.tagline}.</p></div>
        <div className="small" style={{ opacity: .8 }}>© {new Date().getFullYear()} Fit2Trade Ltd · 32 Fitzwilliam Street Upper, Dublin 2</div>
      </section>
      <section className="login-panel">
        <form className="login-box" onSubmit={submit}>
          <img className="logo" src="/brand/fit2trade-logo.png" alt="fit2trade" />
          <h2>Sign in to {brand.name}</h2>
          <p className="muted">Use your work email address.</p>
          {error && <div className="error mb" data-testid="login-error">{error}</div>}
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required data-testid="email" /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="password" /></Field>
          <Button size="lg" className="block" disabled={busy} data-testid="login-submit">{busy ? 'Signing in…' : 'Sign in'}</Button>
          <p className="small muted mt">Demo accounts: admin@fit2trade.com / Admin123! · aoife.murphy@example.com / Learner123!</p>
        </form>
      </section>
    </div>
  );
}
