import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAsync, Spinner, Tabs, Badge, HBars, Button, useToast, StatusBadge } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Reports() {
  const [params] = useSearchParams(); const [tab, setTab] = useState(params.get('view') || 'courses'); const toast = useToast();
  const overview = useAsync(() => api.get('/api/reports/overview'));
  const expiry = useAsync(() => api.get('/api/reports/expiry?days=120'));
  const audit = useAsync(() => api.get('/api/reports/audit').catch(() => ({ entries: [] })));
  const runReminders = async () => { try { const r = await api.post('/api/settings/jobs/reminders', {}); toast.success(`Reminders run: ${r.certificates.notified} certificate alerts, ${r.dueDates.notified} due-date alerts`); expiry.reload(); } catch (e) { toast.error(e); } };
  return (<>
    <PageHead title="Reports" sub="Compliance and training analytics. Export any report to CSV for auditors."><a className="btn secondary" href="/api/reports/export.csv?type=enrollments"><Icons.download />Enrolments CSV</a><a className="btn secondary" href="/api/reports/export.csv?type=certificates"><Icons.download />Certificates CSV</a><a className="btn secondary" href="/api/reports/export.csv?type=users"><Icons.download />Users CSV</a></PageHead>
    <Tabs tabs={[{ id: 'courses', label: 'Course completion' }, { id: 'expiry', label: 'Certificate expiry' }, { id: 'departments', label: 'Departments' }, { id: 'audit', label: 'Audit log' }]} value={tab} onChange={setTab} />
    {tab === 'courses' && (overview.loading ? <Spinner /> : <div className="card table-wrap"><table className="table"><thead><tr><th>Course</th><th>Enrolled</th><th>Completed</th><th>In progress</th><th>Failed</th><th>Completion</th><th>Avg score</th></tr></thead><tbody>
      {overview.data.byCourse.map((c) => <tr key={c.id}><td className="strong"><Link to={`/admin/courses/${c.id}`}>{c.title}</Link><div className="tiny muted">{c.category}</div></td><td>{c.enrolled}</td><td>{c.completed || 0}</td><td>{c.in_progress || 0}</td><td>{c.failed || 0}</td><td style={{ width: 180 }}><div className="progress"><span style={{ width: `${c.enrolled ? ((c.completed || 0) / c.enrolled) * 100 : 0}%` }} /></div></td><td>{c.avg_score ?? '—'}</td></tr>)}</tbody></table></div>)}
    {tab === 'expiry' && (expiry.loading ? <Spinner /> : <div className="stack">
      <div className="row between"><div className="small muted">Certificates expiring within 120 days or already expired. Learners receive in-app and email reminders at 60, 30, 14 and 7 days and on expiry; admins get a digest of expired certificates.</div><Button variant="secondary" onClick={runReminders} data-testid="run-reminders"><Icons.bell />Run reminder job now</Button></div>
      <div className="card table-wrap"><table className="table"><thead><tr><th>Learner</th><th>Course</th><th>Certificate</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead><tbody>
        {expiry.data.certificates.map((c) => <tr key={c.id} data-testid="expiry-row"><td className="strong"><Link to={`/admin/users/${c.user_id}`}>{c.first_name} {c.last_name}</Link><div className="tiny muted">{c.email} · {c.department}</div></td><td>{c.course_title}</td><td><code>{c.code}</code></td><td className="small">{fmtDate(c.issued_at)}</td><td className="small">{fmtDate(c.expires_at)}</td><td>{c.days_left < 0 ? <Badge tone="red">Expired {-c.days_left} days ago</Badge> : <Badge tone={c.days_left <= 14 ? 'red' : 'amber'}>{c.days_left} days left</Badge>}</td></tr>)}
        {expiry.data.certificates.length === 0 && <tr><td colSpan="6" className="muted">No certificates expiring in this window.</td></tr>}</tbody></table></div>
      <div className="card"><div className="card-head"><h3>Reminders sent</h3></div><div className="table-wrap"><table className="table"><thead><tr><th>Type</th><th>Window</th><th>Sent</th></tr></thead><tbody>{expiry.data.reminders.slice(0, 30).map((r) => <tr key={r.key}><td>{r.kind === 'certificate' ? 'Certificate expiry' : 'Due date'}</td><td>{r.window_days === 0 ? (r.kind === 'certificate' ? 'Expired' : 'Overdue') : `${r.window_days} days before`}</td><td className="small">{new Date(r.sent_at).toLocaleString('en-IE')}</td></tr>)}{expiry.data.reminders.length === 0 && <tr><td colSpan="3" className="muted">None yet</td></tr>}</tbody></table></div></div>
    </div>)}
    {tab === 'departments' && (overview.loading ? <Spinner /> : <div className="card pad"><HBars data={overview.data.byDepartment} labelKey="department" valueKey="completed" totalKey="enrolled" /></div>)}
    {tab === 'audit' && (audit.loading ? <Spinner /> : <div className="card table-wrap"><table className="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th></tr></thead><tbody>{(audit.data?.entries || []).map((a) => <tr key={a.id}><td className="small">{new Date(a.created_at).toLocaleString('en-IE')}</td><td className="small">{a.email || 'system'}</td><td><code>{a.action}</code></td><td className="small muted">{a.entity} {a.entity_id?.slice(0, 8)}</td></tr>)}</tbody></table></div>)}
  </>);
}
