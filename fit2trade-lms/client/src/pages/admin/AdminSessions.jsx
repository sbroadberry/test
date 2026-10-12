import React, { useState } from 'react';
import { api, fmtDateTime } from '../../api.js';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, Textarea, StatusBadge, Badge, useToast, Empty } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { PROVIDER } from '../learner/Sessions.jsx';

const toLocal = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function AdminSessions() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get('/api/sessions'));
  const providers = useAsync(() => api.get('/api/sessions/providers')); const courses = useAsync(() => api.get('/api/courses')); const users = useAsync(() => api.get('/api/users?pageSize=500'));
  const [modal, setModal] = useState(null); const [detail, setDetail] = useState(null); const [busy, setBusy] = useState(false);
  const open = async (s) => setDetail(await api.get(`/api/sessions/${s.id}`));
  const save = async () => { setBusy(true); try { const body = { ...modal, starts_at: new Date(modal.starts_at).toISOString(), ends_at: new Date(modal.ends_at).toISOString() }; const d = modal.id ? await api.put(`/api/sessions/${modal.id}`, body) : await api.post('/api/sessions', body); toast.success(modal.id ? 'Session updated' : `Session created${d.session.join_url ? ' with meeting link' : ''}`); setModal(null); reload(); if (d.session) open(d.session); } catch (e) { toast.error(e); } finally { setBusy(false); } };
  const sync = async () => { try { const d = await api.post(`/api/sessions/${detail.session.id}/sync-attendance`, {}); toast.success(`Attendance synced from ${PROVIDER[d.provider]}: ${d.matched.length} matched, ${d.unmatched.length} unmatched`); open(detail.session); } catch (e) { toast.error(e); } };
  const mark = async (userId, status) => { await api.post(`/api/sessions/${detail.session.id}/attendance`, { attendance: [{ userId, status, attendedMinutes: status === 'attended' ? 60 : 0 }] }); open(detail.session); };
  const courseModules = (courseId) => courses.data?.courses.find((c) => c.id === courseId) ? [] : [];
  if (loading) return <Spinner />;
  const blank = { title: '', description: '', provider: providers.data?.providers.find((p) => p.configured)?.id || 'simulated', starts_at: toLocal(new Date(Date.now() + 86400000).toISOString()), ends_at: toLocal(new Date(Date.now() + 86400000 + 3600000).toISOString()), timezone: 'Europe/Dublin', capacity: 20, course_id: '', module_id: '', location: '', registerEnrolled: false };
  return (<>
    <PageHead title="Live sessions" sub="Schedule instructor-led training. Meetings are created automatically in Microsoft Teams or Cisco Webex and attendance can be synced back.">
      <a className="btn secondary" href="/api/reports/export.csv?type=sessions"><Icons.download />Attendance CSV</a><Button onClick={() => setModal(blank)} data-testid="new-session"><Icons.plus />Schedule session</Button></PageHead>
    <div className="row mb">{(providers.data?.providers || []).map((p) => <span key={p.id} className="chip" title={p.detail}>{p.configured ? '●' : '○'} {p.label}{!p.configured && p.id !== 'none' ? ' (not configured)' : ''}</span>)}</div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="card table-wrap"><table className="table"><thead><tr><th>Session</th><th>When</th><th>Provider</th><th>Registered</th><th>Status</th></tr></thead><tbody>
        {data.sessions.map((s) => <tr key={s.id} className="click" onClick={() => open(s)} data-testid="admin-session-row"><td className="strong">{s.title}<div className="tiny muted">{s.course_title || 'Standalone'}{s.instructor_name ? ` · ${s.instructor_name}` : ''}</div></td><td className="small">{fmtDateTime(s.starts_at)}</td><td><Badge tone="blue">{PROVIDER[s.provider]}</Badge></td><td>{s.registered_count}/{s.capacity}{s.attended_count ? <span className="tiny muted"> · {s.attended_count} attended</span> : ''}</td><td><StatusBadge status={s.status} /></td></tr>)}
        {data.sessions.length === 0 && <tr><td colSpan="5"><Empty icon={Icons.calendar} title="No sessions scheduled" /></td></tr>}</tbody></table></div>
      <div className="card">{!detail ? <Empty icon={Icons.video} title="Select a session">Manage registrations, join links and attendance.</Empty> : <>
        <div className="card-head"><h3>{detail.session.title}</h3><div className="row"><Button size="sm" variant="secondary" onClick={() => setModal({ ...detail.session, starts_at: toLocal(detail.session.starts_at), ends_at: toLocal(detail.session.ends_at), course_id: detail.session.course_id || '', module_id: detail.session.module_id || '' })}><Icons.edit />Edit</Button>{detail.session.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={async () => { if (confirm('Cancel this session? Registered learners will be notified.')) { await api.put(`/api/sessions/${detail.session.id}`, { status: 'cancelled' }); open(detail.session); reload(); } }}>Cancel session</Button>}</div></div>
        <div className="card-body stack">
          <dl className="kv"><dt>When</dt><dd>{fmtDateTime(detail.session.starts_at)} – {fmtDateTime(detail.session.ends_at)} ({detail.session.timezone})</dd><dt>Provider</dt><dd>{PROVIDER[detail.session.provider]}{detail.session.external_id && <span className="tiny muted"> · meeting id {detail.session.external_id.slice(0, 24)}…</span>}</dd>
            {detail.session.join_url && <><dt>Join link</dt><dd><a href={detail.session.join_url} target="_blank" rel="noreferrer" className="small">{detail.session.join_url}</a></dd></>}{detail.session.host_url && detail.session.host_url !== detail.session.join_url && <><dt>Host link</dt><dd><a href={detail.session.host_url} target="_blank" rel="noreferrer" className="small">{detail.session.host_url}</a></dd></>}
            {detail.session.external?.passcode && <><dt>Passcode</dt><dd>{detail.session.external.passcode}</dd></>}{detail.session.external?.meetingNumber && <><dt>Meeting number</dt><dd>{detail.session.external.meetingNumber}</dd></>}{detail.session.location && <><dt>Location</dt><dd>{detail.session.location}</dd></>}</dl>
          <div className="row between"><h4 style={{ margin: 0 }}>Registrations ({detail.registrations.length})</h4><div className="row">{detail.session.external_id && detail.session.provider !== 'simulated' && <Button size="sm" variant="secondary" onClick={sync} data-testid="sync-attendance"><Icons.refresh />Sync attendance from {PROVIDER[detail.session.provider]}</Button>}
            <Select onChange={(e) => { if (e.target.value) api.post(`/api/sessions/${detail.session.id}/register`, { userId: e.target.value }).then(() => open(detail.session)); e.target.value = ''; }}><option value="">+ Register learner…</option>{(users.data?.users || []).filter((u) => !detail.registrations.some((r) => r.user_id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</Select></div></div>
          <table className="table"><thead><tr><th>Learner</th><th>Status</th><th>Minutes</th><th></th></tr></thead><tbody>{detail.registrations.map((r) => <tr key={r.id}><td>{r.first_name} {r.last_name}<div className="tiny muted">{r.email}</div></td><td><StatusBadge status={r.status} /></td><td>{r.attended_minutes || '—'}</td><td className="actions"><Button size="sm" variant="secondary" onClick={() => mark(r.user_id, 'attended')}>Attended</Button><Button size="sm" variant="ghost" onClick={() => mark(r.user_id, 'absent')}>Absent</Button></td></tr>)}</tbody></table>
        </div></>}</div>
    </div>
    {modal && <Modal title={modal.id ? 'Edit session' : 'Schedule live session'} onClose={() => setModal(null)} footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={save} disabled={busy || !modal.title} data-testid="session-save">{busy ? 'Creating meeting…' : 'Save'}</Button></>}>
      <Field label="Title"><Input value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} data-testid="session-title" /></Field>
      <div className="form-row"><Field label="Starts"><Input type="datetime-local" value={modal.starts_at} onChange={(e) => setModal({ ...modal, starts_at: e.target.value })} /></Field><Field label="Ends"><Input type="datetime-local" value={modal.ends_at} onChange={(e) => setModal({ ...modal, ends_at: e.target.value })} /></Field></div>
      {!modal.id && <Field label="Delivery" hint={(providers.data?.providers || []).find((p) => p.id === modal.provider)?.detail}><Select value={modal.provider} onChange={(e) => setModal({ ...modal, provider: e.target.value })} data-testid="session-provider">{(providers.data?.providers || []).map((p) => <option key={p.id} value={p.id}>{p.label}{!p.configured && p.id !== 'none' ? ' — not configured (will use built-in classroom)' : ''}</option>)}</Select></Field>}
      <div className="form-row"><Field label="Linked course" hint="Attendance completes the course's live-session module."><Select value={modal.course_id} onChange={(e) => setModal({ ...modal, course_id: e.target.value, module_id: '' })}><option value="">— none —</option>{(courses.data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field><LinkedModule courseId={modal.course_id} value={modal.module_id} onChange={(v) => setModal({ ...modal, module_id: v })} /></div>
      <div className="form-row"><Field label="Capacity"><Input type="number" value={modal.capacity} onChange={(e) => setModal({ ...modal, capacity: Number(e.target.value) })} /></Field><Field label="Location (in person)"><Input value={modal.location} onChange={(e) => setModal({ ...modal, location: e.target.value })} /></Field></div>
      <Field label="Description"><Textarea value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} /></Field>
      {!modal.id && modal.course_id && <label className="check"><input type="checkbox" checked={modal.registerEnrolled} onChange={(e) => setModal({ ...modal, registerEnrolled: e.target.checked })} /> Register everyone currently enrolled in the course</label>}
    </Modal>}
  </>);
}
function LinkedModule({ courseId, value, onChange }) {
  const { data } = useAsync(() => (courseId ? api.get(`/api/courses/${courseId}`) : Promise.resolve(null)), [courseId]);
  const mods = (data?.course?.modules || []).filter((m) => m.type === 'live');
  return (<Field label="Live-session module"><Select value={value} onChange={(e) => onChange(e.target.value)} disabled={!courseId}><option value="">— none —</option>{mods.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>);
}
