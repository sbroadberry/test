import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, StatusBadge, Badge, useToast, Tabs, Empty } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Users() {
  const [tab, setTab] = useState('users');
  return (<><PageHead title="Users & groups" sub="Manage learner accounts, roles and group-based enrolment."><Link className="btn secondary" to="/admin/import"><Icons.database />Migrate from another LMS</Link></PageHead>
    <Tabs tabs={[{ id: 'users', label: 'Users' }, { id: 'groups', label: 'Groups' }]} value={tab} onChange={setTab} />
    {tab === 'users' ? <UsersTab /> : <GroupsTab />}</>);
}

function UsersTab() {
  const toast = useToast(); const { user: me } = useAuth();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [companyId, setCompanyId] = useState(''); const [modal, setModal] = useState(null);
  const { data, loading, reload } = useAsync(() => api.get(`/api/users?q=${encodeURIComponent(q)}&role=${role}&status=${status}&company=${companyId}&pageSize=100`), [q, role, status, companyId]);
  const companies = useAsync(() => api.get('/api/companies'));
  const groups = useAsync(() => api.get('/api/groups'));
  const save = async (f) => { try { if (f.id) await api.put(`/api/users/${f.id}`, f); else { const d = await api.post('/api/users', f); if (d.temporaryPassword) toast.info(`Temporary password: ${d.temporaryPassword}`); } toast.success('User saved'); setModal(null); reload(); } catch (e) { toast.error(e); } };
  return (<>
    <div className="row between mb"><div className="row"><Input placeholder="Search name, email, department…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} data-testid="user-search" /><Select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="instructor">Instructor</option><option value="learner">Learner</option></Select><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></Select><Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} data-testid="user-company-filter"><option value="">All companies</option>{(companies.data?.companies || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      <div className="row"><a className="btn secondary" href="/api/reports/export.csv?type=users"><Icons.download />Export CSV</a><Button onClick={() => setModal({ role: 'learner', groups: [] })} data-testid="add-user"><Icons.plus />Add user</Button></div></div>
    {loading ? <Spinner /> : <div className="card table-wrap"><table className="table"><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Department</th><th>Groups</th><th>Enrolled</th><th>Completed</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>
      {data.users.map((u) => <tr key={u.id} className="click" onClick={() => setModal({ ...u, groups: groups.data?.groups.filter((g) => (u.group_names || '').split(', ').includes(g.name)).map((g) => g.id) || [] })}><td><div className="strong">{u.first_name} {u.last_name}</div><div className="tiny muted">{u.email}{u.external_source ? ` · migrated from ${u.external_source}` : ''}</div></td><td className="small">{u.company_name || '—'}{u.sso_provider ? <div className="tiny muted">SSO: {u.sso_provider}</div> : null}</td><td><Badge tone={u.role === 'learner' ? 'grey' : 'blue'}>{u.role}</Badge></td><td>{u.department || '—'}</td><td className="small">{u.group_names || '—'}</td><td>{u.enrollments}</td><td>{u.completions}</td><td className="small">{fmtDate(u.last_login_at)}</td><td><StatusBadge status={u.status} /></td><td className="actions"><Link className="btn sm secondary" to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()}>Record</Link></td></tr>)}
    </tbody></table>{data.users.length === 0 && <Empty title="No users match" />}<div className="card-body small muted">{data.total} users</div></div>}
    {modal && <UserModal f={modal} groups={groups.data?.groups || []} companies={companies.data?.companies || []} onClose={() => setModal(null)} onSave={save} me={me} />}
  </>);
}

function UserModal({ f: init, groups, companies = [], onClose, onSave, me }) {
  const [f, setF] = useState({ ...init, password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (<Modal title={f.id ? 'Edit user' : 'Add user'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(f)} data-testid="save-user">Save</Button></>}>
    <div className="form-row"><Field label="First name"><Input value={f.first_name || ''} onChange={set('first_name')} data-testid="first-name" /></Field><Field label="Last name"><Input value={f.last_name || ''} onChange={set('last_name')} data-testid="last-name" /></Field></div>
    <Field label="Email"><Input type="email" value={f.email || ''} onChange={set('email')} data-testid="user-email" /></Field>
    <div className="form-row"><Field label="Role"><Select value={f.role} onChange={set('role')}><option value="learner">Learner</option><option value="instructor">Instructor</option><option value="manager">Manager</option>{me.role === 'admin' && <option value="admin">Admin</option>}</Select></Field><Field label="Status"><Select value={f.status || 'active'} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field></div>
    <div className="form-row"><Field label="Job title"><Input value={f.job_title || ''} onChange={set('job_title')} /></Field><Field label="Department"><Input value={f.department || ''} onChange={set('department')} /></Field></div>
    <Field label="Company" hint="Determines the branding the user sees and which private courses appear in their catalogue."><Select value={f.company_id || ''} onChange={set('company_id')} data-testid="user-company"><option value="">Default company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
    <Field label="Groups" hint="Members are automatically enrolled in the group's courses."><div className="row">{groups.map((g) => <label key={g.id} className="check chip"><input type="checkbox" checked={(f.groups || []).includes(g.id)} onChange={(e) => setF({ ...f, groups: e.target.checked ? [...(f.groups || []), g.id] : f.groups.filter((x) => x !== g.id) })} />{g.name}</label>)}</div></Field>
    <Field label={f.id ? 'Reset password (optional)' : 'Password (optional)'} hint="Leave blank to generate a temporary password the user must change."><Input type="text" value={f.password} onChange={set('password')} /></Field>
  </Modal>);
}

function GroupsTab() {
  const toast = useToast(); const nav = useNavigate();
  const { data, loading, reload } = useAsync(() => api.get('/api/groups'));
  const courses = useAsync(() => api.get('/api/courses?status=published'));
  const users = useAsync(() => api.get('/api/users?pageSize=500'));
  const [sel, setSel] = useState(null); const [detail, setDetail] = useState(null); const [newName, setNewName] = useState('');
  const open = async (g) => { setSel(g); setDetail(await api.get(`/api/groups/${g.id}`)); };
  const create = async () => { if (!newName) return; try { await api.post('/api/groups', { name: newName }); setNewName(''); toast.success('Group created'); reload(); } catch (e) { toast.error(e); } };
  const addMember = async (userId) => { await api.post(`/api/groups/${sel.id}/members`, { userIds: [userId] }); open(sel); reload(); };
  const assignCourse = async (courseId, dueDays) => { try { const d = await api.post(`/api/groups/${sel.id}/courses`, { courseId, dueDays: dueDays ? Number(dueDays) : null }); toast.success(`Course assigned · ${d.enrolled} learners enrolled`); open(sel); } catch (e) { toast.error(e); } };
  if (loading) return <Spinner />;
  return (<div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
    <div className="card"><div className="card-head"><h3>Groups</h3></div><div className="card-body stack">
      <div className="row"><Input placeholder="New group name" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="group-name" /><Button onClick={create} data-testid="group-create"><Icons.plus /></Button></div>
      {data.groups.map((g) => <div key={g.id} className={`module-row ${sel?.id === g.id ? 'active' : ''}`} style={{ cursor: 'pointer', borderColor: sel?.id === g.id ? 'var(--f2t-green)' : undefined }} onClick={() => open(g)}><div className="type"><Icons.users /></div><div className="grow"><div className="strong">{g.name}</div><div className="tiny muted">{g.members} members · {g.courses} courses</div></div></div>)}
    </div></div>
    <div className="card">{!detail ? <Empty icon={Icons.users} title="Select a group">Groups drive automatic enrolment: assign a course to a group and every member (current and future) is enrolled.</Empty> : <>
      <div className="card-head"><h3>{detail.group.name}</h3><Button size="sm" variant="danger" onClick={async () => { if (confirm('Delete this group?')) { await api.del(`/api/groups/${sel.id}`); setDetail(null); setSel(null); reload(); } }}><Icons.trash />Delete</Button></div>
      <div className="card-body grid cols-2">
        <div><h4>Members ({detail.members.length})</h4><div className="stack" style={{ gap: 6 }}>{detail.members.map((u) => <div key={u.id} className="row between small"><span>{u.first_name} {u.last_name} <span className="muted">· {u.email}</span></span><button className="btn ghost sm" onClick={async () => { await api.del(`/api/groups/${sel.id}/members/${u.id}`); open(sel); reload(); }}><Icons.x /></button></div>)}</div>
          <Select className="select mt" onChange={(e) => { if (e.target.value) addMember(e.target.value); e.target.value = ''; }}><option value="">+ Add member…</option>{(users.data?.users || []).filter((u) => !detail.members.some((m) => m.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>)}</Select></div>
        <div><h4>Assigned courses ({detail.courses.length})</h4><div className="stack" style={{ gap: 6 }}>{detail.courses.map((c) => <div key={c.id} className="row between small"><span>{c.title}{c.due_days ? <span className="muted"> · due in {c.due_days} days</span> : ''}</span><button className="btn ghost sm" onClick={async () => { await api.del(`/api/groups/${sel.id}/courses/${c.id}`); open(sel); }}><Icons.x /></button></div>)}</div>
          <AssignCourse courses={(courses.data?.courses || []).filter((c) => !detail.courses.some((x) => x.id === c.id))} onAssign={assignCourse} /></div>
      </div></>}</div>
  </div>);
}
function AssignCourse({ courses, onAssign }) {
  const [c, setC] = useState(''); const [d, setD] = useState('30');
  return (<div className="row mt"><Select value={c} onChange={(e) => setC(e.target.value)} style={{ flex: 1 }}><option value="">Assign course…</option>{courses.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select><Input type="number" value={d} onChange={(e) => setD(e.target.value)} style={{ width: 90 }} title="Due in days" /><Button size="sm" disabled={!c} onClick={() => { onAssign(c, d); setC(''); }}>Assign</Button></div>);
}

export function UserRecord() {
  const id = window.location.pathname.split('/').pop(); const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get(`/api/users/${id}`), [id]);
  if (loading) return <Spinner />;
  const { user, enrollments, groups, certificates, sessions } = data;
  const setStatus = async (e, status) => { try { await api.put(`/api/enrollments/${e.id}`, { status }); toast.success('Updated'); reload(); } catch (err) { toast.error(err); } };
  return (<><PageHead title={`${user.first_name} ${user.last_name}`} sub={`${user.email} · ${user.role} · ${user.department || 'no department'}${user.external_source ? ` · migrated from ${user.external_source}` : ''}`}><Link className="btn secondary" to="/admin/users"><Icons.arrowLeft />All users</Link><a className="btn secondary" href={`/api/reports/export.csv?type=enrollments`}><Icons.download />Export</a></PageHead>
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="stack">
        <div className="card"><div className="card-head"><h3>Training record</h3><span className="small muted">{enrollments.length} enrolments</span></div><div className="table-wrap"><table className="table"><thead><tr><th>Course</th><th>Status</th><th>Progress</th><th>Score</th><th>Completed</th><th>Expires</th><th></th></tr></thead><tbody>
          {enrollments.map((e) => <tr key={e.id}><td className="strong">{e.course_title}<div className="tiny muted">{e.source}</div></td><td><StatusBadge status={e.status} /></td><td>{e.progress_pct}%</td><td>{e.score ?? '—'}</td><td className="small">{fmtDate(e.completed_at)}</td><td className="small">{fmtDate(e.expires_at)}</td><td className="actions">{e.status !== 'completed' && <Button size="sm" variant="secondary" onClick={() => setStatus(e, 'completed')}>Mark complete</Button>}<Button size="sm" variant="ghost" onClick={() => confirm('Reset progress?') && setStatus(e, 'reset')}>Reset</Button></td></tr>)}
        </tbody></table></div></div>
        <div className="card"><div className="card-head"><h3>Certificates</h3></div><div className="table-wrap"><table className="table"><thead><tr><th>Course</th><th>ID</th><th>Issued</th><th>Expires</th><th></th></tr></thead><tbody>{certificates.map((c) => <tr key={c.id}><td>{c.course_title}</td><td><code>{c.code}</code></td><td>{fmtDate(c.issued_at)}</td><td>{fmtDate(c.expires_at)}</td><td className="actions"><a className="btn sm secondary" href={`/api/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></td></tr>)}{certificates.length === 0 && <tr><td colSpan="5" className="muted">None</td></tr>}</tbody></table></div></div>
      </div>
      <div className="stack"><div className="card pad"><h3>Groups</h3>{groups.length === 0 ? <span className="muted small">No groups</span> : groups.map((g) => <div key={g.id} className="chip" style={{ marginRight: 6 }}>{g.name}</div>)}</div>
        <div className="card pad"><h3>Live sessions</h3>{sessions.length === 0 ? <span className="muted small">None</span> : sessions.map((s) => <div key={s.id} className="row between small"><span>{s.title}</span><StatusBadge status={s.registration_status} /></div>)}</div>
        <div className="card pad"><h3>Account</h3><dl className="kv"><dt>Created</dt><dd>{fmtDate(user.created_at)}</dd><dt>Last login</dt><dd>{fmtDate(user.last_login_at)}</dd><dt>Email alerts</dt><dd>{user.email_notifications ? 'On' : 'Off'}</dd></dl></div></div>
    </div></>);
}
