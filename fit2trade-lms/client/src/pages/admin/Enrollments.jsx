import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, StatusBadge, useToast } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Enrollments() {
  const toast = useToast();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [courseId, setCourseId] = useState(''); const [modal, setModal] = useState(false);
  const { data, loading, reload } = useAsync(() => api.get(`/api/enrollments?q=${encodeURIComponent(q)}&status=${status}&courseId=${courseId}&pageSize=200`), [q, status, courseId]);
  const courses = useAsync(() => api.get('/api/courses')); const users = useAsync(() => api.get('/api/users?pageSize=500')); const groups = useAsync(() => api.get('/api/groups'));
  const [f, setF] = useState({ userIds: [], groupIds: [], courseIds: [], dueAt: '' });
  const bulk = async () => { try { const d = await api.post('/api/enrollments', { ...f, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null }); toast.success(`${d.created} enrolments created, ${d.existing} already existed`); setModal(false); reload(); } catch (e) { toast.error(e); } };
  return (<>
    <PageHead title="Enrolments" sub="Assign courses to individuals or whole groups, set due dates and track status."><a className="btn secondary" href={`/api/reports/export.csv?type=enrollments&courseId=${courseId}`}><Icons.download />Export CSV</a><Button onClick={() => setModal(true)} data-testid="bulk-enrol"><Icons.plus />Enrol learners</Button></PageHead>
    <div className="row mb"><Input placeholder="Search learner or course…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">All courses</option>{(courses.data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="enrolled">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="failed">Failed</option></Select></div>
    {loading ? <Spinner /> : <div className="card table-wrap"><table className="table"><thead><tr><th>Learner</th><th>Course</th><th>Status</th><th>Progress</th><th>Score</th><th>Enrolled</th><th>Due</th><th>Expires</th><th></th></tr></thead><tbody>
      {data.enrollments.map((e) => { const overdue = e.due_at && e.status !== 'completed' && new Date(e.due_at) < new Date(); return (<tr key={e.id}><td className="strong"><Link to={`/admin/users/${e.user_id}`}>{e.first_name} {e.last_name}</Link><div className="tiny muted">{e.department}</div></td><td>{e.course_title}</td><td><StatusBadge status={e.status} /></td><td>{e.progress_pct}%</td><td>{e.score ?? '—'}</td><td className="small">{fmtDate(e.enrolled_at)}</td><td className={`small ${overdue ? 'strong' : ''}`} style={overdue ? { color: 'var(--f2t-red)' } : {}}>{fmtDate(e.due_at)}</td><td className="small">{fmtDate(e.expires_at)}</td><td className="actions">{e.status !== 'completed' && <Button size="sm" variant="secondary" onClick={() => api.put(`/api/enrollments/${e.id}`, { status: 'completed' }).then(reload)}>Complete</Button>}<button className="btn ghost sm" title="Remove" onClick={() => confirm('Remove this enrolment?') && api.del(`/api/enrollments/${e.id}`).then(reload)}><Icons.x /></button></td></tr>); })}
    </tbody></table><div className="card-body small muted">{data.total} enrolments</div></div>}
    {modal && <Modal title="Enrol learners" onClose={() => setModal(false)} footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={bulk} disabled={!f.courseIds.length || (!f.userIds.length && !f.groupIds.length)} data-testid="bulk-enrol-submit">Enrol</Button></>}>
      <Field label="Courses"><select multiple className="select" style={{ height: 140 }} value={f.courseIds} onChange={(e) => setF({ ...f, courseIds: [...e.target.selectedOptions].map((o) => o.value) })}>{(courses.data?.courses || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      <div className="form-row"><Field label="Groups"><select multiple className="select" style={{ height: 120 }} value={f.groupIds} onChange={(e) => setF({ ...f, groupIds: [...e.target.selectedOptions].map((o) => o.value) })}>{(groups.data?.groups || []).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}</select></Field>
        <Field label="Individuals"><select multiple className="select" style={{ height: 120 }} value={f.userIds} onChange={(e) => setF({ ...f, userIds: [...e.target.selectedOptions].map((o) => o.value) })}>{(users.data?.users || []).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></Field></div>
      <Field label="Due date (optional)"><Input type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
    </Modal>}
  </>);
}
