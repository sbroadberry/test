import React, { useState } from 'react';
import { api } from '../../api.js';
import { useAuth, applyTheme } from '../../auth.jsx';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, Textarea, Badge, useToast, Tabs, Empty } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

const COLOR_FIELDS = [['primary', 'Primary colour', 'Buttons, links, active menu and the login panel'], ['accent', 'Accent colour', 'Gradient end and course tiles'], ['ink', 'Text colour', 'Body text'], ['background', 'Page background', 'Behind cards'], ['logoBackground', 'Logo background', 'Behind the logo in the sidebar and login']];

export default function Companies() {
  const toast = useToast(); const { company: myCompany, loadBranding, refresh } = useAuth();
  const { data, loading, reload } = useAsync(() => api.get('/api/companies'));
  const presets = useAsync(() => api.get('/api/companies/presets'));
  const [modal, setModal] = useState(null);
  if (loading || presets.loading) return <Spinner />;
  const open = (c) => setModal(c ? { id: c.id, name: c.name, slug: c.slug, website: c.website, domains: c.domains, email_domains: c.email_domains, status: c.status, is_default: c.is_default, theme: { ...c.theme, ...c.stored_theme }, sso: c.sso } : { name: '', slug: '', website: '', domains: '', email_domains: '', theme: { ...presets.data.presets[0].theme, preset: 'fit2trade' }, sso: { google: { enabled: true }, microsoft: { enabled: true }, autoProvision: true, defaultRole: 'learner', defaultGroup: '' } });
  const save = async (f) => {
    try {
      const body = { ...f, theme: Object.fromEntries(Object.entries(f.theme).filter(([k]) => k !== 'shades')) };
      const d = f.id ? await api.put(`/api/companies/${f.id}`, body) : await api.post('/api/companies', body);
      toast.success(f.id ? 'Company saved' : 'Company created'); setModal(null); reload();
      if (d.company.id === myCompany?.id) { await refresh(); }
    } catch (e) { toast.error(e); }
  };
  return (<>
    <PageHead title="Companies & branding" sub="Each company gets its own themed login page and learning environment, single sign-on rules and learners."><Button onClick={() => open(null)} data-testid="new-company"><Icons.plus />New company</Button></PageHead>
    <div className="grid auto">{data.companies.map((c) => (
      <div className="card" key={c.id} data-testid="company-card">
        <div style={{ background: `linear-gradient(135deg, ${c.theme.shades?.[700] || c.theme.primary}, ${c.theme.primary} 60%, ${c.theme.accent})`, padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}><img src={c.theme.logoUrl} alt="" style={{ height: 36, background: c.theme.logoBackground || '#fff', borderRadius: 6, padding: 4 }} /><div style={{ color: '#fff' }}><div className="strong">{c.theme.portalName}</div><div className="tiny" style={{ opacity: .85 }}>{c.theme.tagline}</div></div></div>
        <div className="card-body stack" style={{ gap: 8 }}>
          <div className="row between"><h3 style={{ margin: 0 }}>{c.name}</h3>{c.is_default ? <Badge>Default</Badge> : <Badge tone="grey">{c.status}</Badge>}</div>
          <div className="small muted">Login: <a href={`/c/${c.slug}/login`} target="_blank" rel="noreferrer">/c/{c.slug}/login</a>{c.domains ? ` · ${c.domains}` : ''}</div>
          <div className="row small"><span className="chip"><span className="swatch" style={{ background: c.theme.primary, width: 14, height: 14 }} /> {c.theme.primary}</span><span className="chip"><span className="swatch" style={{ background: c.theme.accent, width: 14, height: 14 }} /> {c.theme.accent}</span><span className="chip">{c.theme.sidebar} sidebar</span></div>
          <div className="row small muted"><span>{c.users} users</span><span>·</span><span>{c.courses} private courses</span><span>·</span><span>SSO: {[c.sso.google?.enabled && 'Google', c.sso.microsoft?.enabled && 'Microsoft'].filter(Boolean).join(', ') || 'off'}</span></div>
          <div className="row"><Button size="sm" variant="secondary" onClick={() => open(c)} data-testid={`edit-${c.slug}`}><Icons.edit />Edit theme & SSO</Button><Button size="sm" variant="ghost" onClick={() => { applyTheme(c.theme); toast.info(`Previewing ${c.name} theme – reload to reset`); }}><Icons.play />Preview here</Button>{!c.is_default && <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Delete ${c.name}? Its users move to the default company.`)) { await api.del(`/api/companies/${c.id}`); reload(); } }}><Icons.trash /></Button>}</div>
        </div>
      </div>))}</div>
    {modal && <CompanyModal f={modal} presets={presets.data} onClose={() => setModal(null)} onSave={save} />}
  </>);
}

function CompanyModal({ f: init, presets, onClose, onSave }) {
  const toast = useToast();
  const [f, setF] = useState(init); const [tab, setTab] = useState('details');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setT = (k, v) => setF({ ...f, theme: { ...f.theme, [k]: v } });
  const setS = (patch) => setF({ ...f, sso: { ...f.sso, ...patch } });
  const applyPreset = (id) => { const p = presets.presets.find((x) => x.id === id); if (p) setF({ ...f, theme: { ...p.theme, preset: id, portalName: f.theme.portalName && !f.id ? f.theme.portalName : p.theme.portalName } }); };
  const upload = async (kind, file) => { if (!f.id) return toast.error('Save the company first, then upload images.'); const form = new FormData(); form.append('file', file); form.append('kind', kind); try { const d = await api.upload(`/api/companies/${f.id}/assets`, form); setF({ ...f, theme: { ...f.theme, ...d.company.stored_theme, [kind === 'logo' ? 'logoUrl' : kind === 'favicon' ? 'faviconUrl' : 'loginImageUrl']: d.url } }); toast.success('Image uploaded'); } catch (e) { toast.error(e); } };
  const t = f.theme;
  return (<Modal title={f.id ? `Edit ${f.name}` : 'New company'} onClose={onClose} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(f)} disabled={!f.name} data-testid="company-save">Save company</Button></>}>
    <Tabs tabs={[{ id: 'details', label: 'Details' }, { id: 'theme', label: 'Theme & branding' }, { id: 'sso', label: 'Single sign-on' }]} value={tab} onChange={setTab} />
    {tab === 'details' && <>
      <div className="form-row"><Field label="Company name"><Input value={f.name} onChange={set('name')} data-testid="company-name" /></Field><Field label="Portal slug" hint={`Login page: /c/${f.slug || 'slug'}/login`}><Input value={f.slug} onChange={set('slug')} placeholder="eazysafe" /></Field></div>
      <div className="form-row"><Field label="Website"><Input value={f.website} onChange={set('website')} placeholder="https://www.example.com" /></Field><Field label="Portal hostnames" hint="Optional. Visitors arriving on these hostnames see this company's login page automatically."><Input value={f.domains} onChange={set('domains')} placeholder="learn.example.com" /></Field></div>
      <Field label="Email domains" hint="Users with these email domains belong to this company. Used to route single sign-on and to decide who may self-provision."><Input value={f.email_domains} onChange={set('email_domains')} placeholder="example.com, example.ie" data-testid="company-email-domains" /></Field>
      {f.id && <div className="form-row"><Field label="Status"><Select value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field><Field label="Default company"><label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={!!f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked ? 1 : 0 })} /> Use for the main login page and new users</label></Field></div>}
    </>}
    {tab === 'theme' && <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
      <div>
        <Field label="Start from a sample theme"><div className="row">{presets.presets.map((p) => <button key={p.id} type="button" className={`btn sm ${t.preset === p.id ? '' : 'secondary'}`} onClick={() => applyPreset(p.id)} data-testid={`preset-${p.id}`}><span className="swatch" style={{ background: p.theme.primary, width: 12, height: 12 }} />{p.label}</button>)}</div></Field>
        <div className="form-row"><Field label="Portal name"><Input value={t.portalName || ''} onChange={(e) => setT('portalName', e.target.value)} /></Field><Field label="Company name (certificates, emails)"><Input value={t.companyName || ''} onChange={(e) => setT('companyName', e.target.value)} /></Field></div>
        <Field label="Tagline"><Input value={t.tagline || ''} onChange={(e) => setT('tagline', e.target.value)} /></Field>
        <div className="form-row"><Field label="Logo" hint="PNG/SVG, ideally wide. Upload or paste a URL."><Input value={t.logoUrl || ''} onChange={(e) => setT('logoUrl', e.target.value)} /><input type="file" accept="image/*" onChange={(e) => e.target.files[0] && upload('logo', e.target.files[0])} /></Field><Field label="Favicon"><Input value={t.faviconUrl || ''} onChange={(e) => setT('faviconUrl', e.target.value)} /><input type="file" accept="image/*" onChange={(e) => e.target.files[0] && upload('favicon', e.target.files[0])} /></Field></div>
        <div className="grid cols-2">{COLOR_FIELDS.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><div className="row"><input type="color" value={t[k] || '#ffffff'} onChange={(e) => setT(k, e.target.value)} style={{ width: 44, height: 34, border: '1px solid var(--f2t-line-2)', borderRadius: 6, padding: 2, background: '#fff' }} data-testid={`color-${k}`} /><Input value={t[k] || ''} onChange={(e) => setT(k, e.target.value)} style={{ width: 110 }} /></div></Field>)}</div>
        <div className="form-row"><Field label="Sidebar style"><Select value={t.sidebar || 'light'} onChange={(e) => setT('sidebar', e.target.value)}><option value="light">Light</option><option value="dark">Dark (primary colour)</option></Select></Field><Field label="Font"><Select value={t.font || 'Inter'} onChange={(e) => setT('font', e.target.value)}>{['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3', 'Nunito'].map((x) => <option key={x}>{x}</option>)}</Select></Field></div>
        <h4>Login page</h4>
        <Field label="Headline"><Input value={t.loginHeadline || ''} onChange={(e) => setT('loginHeadline', e.target.value)} /></Field>
        <Field label="Sub-text"><Textarea style={{ minHeight: 60 }} value={t.loginSubtext || ''} onChange={(e) => setT('loginSubtext', e.target.value)} /></Field>
        <div className="form-row"><Field label="Background"><Select value={t.loginBackground || 'gradient'} onChange={(e) => setT('loginBackground', e.target.value)}><option value="gradient">Brand gradient</option><option value="solid">Solid primary colour</option><option value="image">Photo</option></Select></Field><Field label="Photo (for image background)"><Input value={t.loginImageUrl || ''} onChange={(e) => setT('loginImageUrl', e.target.value)} /><input type="file" accept="image/*" onChange={(e) => e.target.files[0] && upload('loginImage', e.target.files[0])} /></Field></div>
        <div className="form-row"><Field label="Support email"><Input value={t.supportEmail || ''} onChange={(e) => setT('supportEmail', e.target.value)} /></Field><Field label="Footer text"><Input value={t.footerText || ''} onChange={(e) => setT('footerText', e.target.value)} /></Field></div>
        <Field label="Custom CSS (advanced)"><Textarea style={{ minHeight: 70, fontFamily: 'monospace' }} value={t.customCss || ''} onChange={(e) => setT('customCss', e.target.value)} /></Field>
      </div>
      <div><h4>Live preview</h4><ThemePreview theme={t} /></div>
    </div>}
    {tab === 'sso' && <div className="stack">
      <div className="notice small">Single sign-on lets people use their Google Workspace or Microsoft 365 account. The server-level credentials are set in <code>.env</code> (Settings → Integrations shows whether they are configured); here you choose which providers this company allows and how new accounts are created.</div>
      {presets.providers.length === 0 && <div className="notice amber small">No SSO provider is configured on the server yet, so the buttons will not appear on the login page until GOOGLE_CLIENT_ID/SECRET or MS_SSO_CLIENT_ID/SECRET are set.</div>}
      <label className="check"><input type="checkbox" checked={!!f.sso.google?.enabled} onChange={(e) => setS({ google: { enabled: e.target.checked } })} data-testid="sso-google-enabled" /> Allow "Continue with Google"</label>
      <label className="check"><input type="checkbox" checked={!!f.sso.microsoft?.enabled} onChange={(e) => setS({ microsoft: { enabled: e.target.checked } })} data-testid="sso-microsoft-enabled" /> Allow "Continue with Microsoft"</label>
      <label className="check"><input type="checkbox" checked={!!f.sso.autoProvision} onChange={(e) => setS({ autoProvision: e.target.checked })} /> Create accounts automatically for people who sign in with SSO (restricted to the email domains above)</label>
      <div className="form-row"><Field label="Role for new SSO accounts"><Select value={f.sso.defaultRole || 'learner'} onChange={(e) => setS({ defaultRole: e.target.value })}><option value="learner">Learner</option><option value="instructor">Instructor</option><option value="manager">Manager</option></Select></Field><Field label="Add new SSO accounts to group" hint="They inherit the group's course assignments."><Input value={f.sso.defaultGroup || ''} onChange={(e) => setS({ defaultGroup: e.target.value })} placeholder="e.g. All staff" /></Field></div>
    </div>}
  </Modal>);
}

export function ThemePreview({ theme: t }) {
  const sh = t.shades || {};
  const grad = t.loginBackground === 'solid' ? t.primary : `linear-gradient(160deg, ${sh[700] || t.primary}, ${t.primary} 60%, ${t.accent || t.primary})`;
  const dark = t.sidebar === 'dark';
  return (<div className="theme-preview" style={{ fontFamily: t.font ? `'${t.font}', Inter, sans-serif` : undefined }}>
    <div className="tp-hero" style={{ background: grad }}><img src={t.logoUrl} alt="" style={{ height: 26, background: t.logoBackground || '#fff', borderRadius: 4, padding: 3 }} /><div className="strong" style={{ fontSize: 13, marginTop: 10 }}>{t.loginHeadline}</div><div className="tiny" style={{ opacity: .85 }}>{t.loginSubtext}</div><div style={{ marginTop: 8 }}><span style={{ background: '#fff', color: t.primary, fontSize: 9, padding: '4px 8px', borderRadius: 4, fontWeight: 600 }}>Sign in to {t.portalName}</span></div></div>
    <div className="tp-app" style={{ background: t.background, color: t.ink }}>
      <div className="tp-side" style={{ background: dark ? (sh[700] || t.primary) : '#fff', color: dark ? '#fff' : t.ink }}><img src={t.logoUrl} alt="" style={{ width: 60, background: t.logoBackground || '#fff', borderRadius: 3, padding: 2, marginBottom: 6 }} /><div style={{ background: dark ? 'rgba(255,255,255,.18)' : (sh[100] || '#eee'), color: dark ? '#fff' : (sh[700] || t.primary), fontWeight: 600 }}>Dashboard</div><div>Catalogue</div><div>Live sessions</div><div>Certificates</div></div>
      <div className="tp-main"><div className="strong" style={{ fontSize: 12 }}>Welcome back</div><div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>{['4 to do', '1 done', '0 overdue'].map((x) => <div key={x} style={{ background: '#fff', border: '1px solid #e3e7e5', borderRadius: 6, padding: '6px 8px', flex: 1 }}><span style={{ color: t.primary, fontWeight: 700 }}>{x.split(' ')[0]}</span> {x.split(' ').slice(1).join(' ')}</div>)}</div><div style={{ height: 6, background: '#e9edeb', borderRadius: 3 }}><div style={{ width: '55%', height: 6, background: t.primary, borderRadius: 3 }} /></div><div style={{ marginTop: 8 }}><span style={{ background: t.primary, color: sh.text || '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600 }}>Continue course</span></div></div>
    </div>
  </div>);
}
