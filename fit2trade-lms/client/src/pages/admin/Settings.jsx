import React, { useState } from 'react';
import { api } from '../../api.js';
import { useAsync, Spinner, Button, Field, Input, useToast, StatusBadge, Tabs, Badge } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Settings() {
  const toast = useToast(); const [tab, setTab] = useState('integrations');
  const { data, loading, reload } = useAsync(() => api.get('/api/settings'));
  const outbox = useAsync(() => api.get('/api/settings/outbox'));
  const [windows, setWindows] = useState(null);
  if (loading) return <Spinner />;
  const w = windows ?? data.reminderWindows.join(', ');
  const saveWindows = async () => { try { await api.put('/api/settings', { reminderWindows: w.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n)) }); toast.success('Reminder windows saved'); reload(); } catch (e) { toast.error(e); } };
  const testEmail = async () => { const r = await api.post('/api/settings/test-email', {}); toast[r.status === 'sent' ? 'success' : 'info'](`Test email ${r.status}${r.error ? ': ' + r.error : ''}`); outbox.reload(); };
  return (<>
    <PageHead title="Settings" sub="Branding, integrations and notification rules." />
    <Tabs tabs={[{ id: 'integrations', label: 'Integrations' }, { id: 'notifications', label: 'Notifications & email' }, { id: 'branding', label: 'Branding' }]} value={tab} onChange={setTab} />
    {tab === 'integrations' && <div className="grid cols-2">
      {data.integrations.live.filter((p) => p.id !== 'none').map((p) => <div className="card pad" key={p.id}><div className="row between"><h3>{p.label}</h3>{p.configured ? <Badge>Connected</Badge> : <Badge tone="amber">Not configured</Badge>}</div><p className="small muted">{p.detail}</p>
        {p.id === 'teams' && <div className="small"><strong>Setup:</strong> register an app in Microsoft Entra ID, grant <code>OnlineMeetings.ReadWrite.All</code> (application) and <code>OnlineMeetingArtifact.Read.All</code> for attendance, create an application access policy for the organiser account, then set <code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code> and <code>MS_ORGANISER_USER_ID</code> in <code>.env</code>.</div>}
        {p.id === 'webex' && <div className="small"><strong>Setup:</strong> create a Webex integration or service app with the <code>meeting:schedules_write</code>, <code>meeting:schedules_read</code> and <code>meeting:participants_read</code> scopes and set <code>WEBEX_ACCESS_TOKEN</code> in <code>.env</code>.</div>}
        {p.id === 'simulated' && <div className="small">Used automatically whenever Teams/Webex credentials are missing so sessions can still be scheduled and tested. Disable with <code>LIVE_PROVIDER_SIMULATE=false</code>.</div>}</div>)}
      <div className="card pad"><div className="row between"><h3>Email (SMTP)</h3>{data.integrations.email.configured ? <Badge>Connected · {data.integrations.email.host}</Badge> : <Badge tone="amber">Not configured</Badge>}</div><p className="small muted">Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>SMTP_FROM</code>. Until then emails are recorded in the outbox but not delivered.</p><Button variant="secondary" size="sm" onClick={testEmail}><Icons.mail />Send test email</Button></div>
      {(data.integrations.sso || []).map((p) => <div className="card pad" key={p.id}><div className="row between"><h3>Single sign-on · {p.label}</h3>{p.configured ? <Badge>Connected</Badge> : <Badge tone="amber">Not configured</Badge>}</div><p className="small muted">{p.detail}</p><div className="small">Redirect URI to register with the provider: <code>{p.redirectUri}</code>. Enable per company under <a href="/admin/companies">Companies & branding</a>.</div></div>)}
      <div className="card pad"><h3>SCORM</h3><p className="small muted">SCORM 1.2 and SCORM 2004 (2nd–4th Edition) run-time environments are built in. Content is served from <code>{data.publicUrl}/scorm-content/…</code>. Uploads are limited to 1 GB per package.</p><Badge>Enabled</Badge></div>
    </div>}
    {tab === 'notifications' && <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
      <div className="card pad"><h3>Certificate expiry reminders</h3><Field label="Days before expiry" hint="Comma-separated. 0 = on the day it expires. The job runs every 6 hours and on start-up; each window is sent once per certificate."><Input value={w} onChange={(e) => setWindows(e.target.value)} /></Field><Button onClick={saveWindows}>Save</Button>
        <h4 className="mt-lg">What learners receive</h4><ul className="small muted"><li>In-app notification (bell icon + dashboard)</li><li>Email with a “Renew now” link (if enabled in their profile)</li></ul><h4>What admins receive</h4><ul className="small muted"><li>Digest of expired certificates with a link to the expiry report</li></ul></div>
      <div className="card"><div className="card-head"><h3>Email outbox</h3><Button size="sm" variant="ghost" onClick={outbox.reload}><Icons.refresh /></Button></div><div className="table-wrap"><table className="table"><thead><tr><th>To</th><th>Subject</th><th>Category</th><th>Status</th><th>When</th></tr></thead><tbody>
        {(outbox.data?.emails || []).map((e) => <tr key={e.id} data-testid="outbox-row"><td className="small">{e.to_email}</td><td className="small">{e.subject}</td><td><Badge tone="grey">{e.category}</Badge></td><td><StatusBadge status={e.status} /></td><td className="small">{new Date(e.created_at).toLocaleString('en-IE')}</td></tr>)}
        {(outbox.data?.emails || []).length === 0 && <tr><td colSpan="5" className="muted">No emails yet</td></tr>}</tbody></table></div></div>
    </div>}
    {tab === 'branding' && <div className="card pad" style={{ maxWidth: 640 }}><div className="row mb"><img src="/brand/fit2trade-logo.png" alt="fit2trade" style={{ width: 180 }} /></div>
      <dl className="kv"><dt>Portal name</dt><dd>{data.branding.name}</dd><dt>Company</dt><dd>{data.branding.company}</dd><dt>Tagline</dt><dd>{data.branding.tagline}</dd><dt>Primary colour</dt><dd><span className="row"><span style={{ width: 18, height: 18, borderRadius: 4, background: data.branding.primary, display: 'inline-block' }} /> {data.branding.primary} (logo tick)</span></dd><dt>Text colour</dt><dd><span className="row"><span style={{ width: 18, height: 18, borderRadius: 4, background: data.branding.ink, display: 'inline-block' }} /> {data.branding.ink} (logo wordmark)</span></dd><dt>Website</dt><dd>{data.branding.website}</dd></dl>
      <p className="small muted mt">Per-company themes (logo, colours, login page copy, SSO) are managed under <a href="/admin/companies">Companies & branding</a>, including ready-made themes for Fit2Trade, EazySAFE and IACT.</p></div>}
  </>);
}
