import React from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAsync, Spinner, Stat, Bars, HBars } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function AdminDashboard() {
  const { data, loading } = useAsync(() => api.get('/api/reports/overview'));
  if (loading) return <Spinner />;
  const t = data.totals;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i); const key = d.toISOString().slice(0, 7); return { label: d.toLocaleString('en-IE', { month: 'short' }), value: data.completionsByMonth.find((m) => m.month === key)?.n || 0 }; });
  return (
    <>
      <PageHead title="Admin overview" sub="Portal-wide activity, compliance and upcoming sessions."><Link className="btn secondary" to="/admin/reports"><Icons.chart />Reports</Link><Link className="btn" to="/admin/courses"><Icons.plus />New course</Link></PageHead>
      <div className="grid cols-4 mb">
        <Stat icon={Icons.users} value={t.users} label="Active learners" /><Stat icon={Icons.book} value={t.courses} label="Published courses" /><Stat icon={Icons.tick} value={`${t.completionRate}%`} label={`Completion rate (${t.completions}/${t.enrollments})`} /><Stat icon={Icons.alert} tone={t.overdue ? 'red' : ''} value={t.overdue} label="Overdue enrolments" />
      </div>
      <div className="grid cols-4 mb">
        <Stat icon={Icons.award} value={t.certificates} label="Certificates issued" /><Stat icon={Icons.clock} tone="amber" value={t.expiringSoon} label="Expiring in 60 days" /><Stat icon={Icons.alert} tone={t.expired ? 'red' : ''} value={t.expired} label="Expired certificates" /><Stat icon={Icons.video} tone="blue" value={t.upcomingSessions} label="Upcoming live sessions" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Completions by month</h3></div><div className="card-body"><Bars data={months} /></div></div>
          <div className="card"><div className="card-head"><h3>Course performance</h3><Link to="/admin/reports" className="small">Full report</Link></div><div className="table-wrap"><table className="table"><thead><tr><th>Course</th><th>Enrolled</th><th>Completed</th><th>In progress</th><th>Avg score</th></tr></thead><tbody>
            {data.byCourse.map((c) => <tr key={c.id} className="click" onClick={() => (window.location.href = `/admin/courses/${c.id}`)}><td className="strong">{c.title}<div className="tiny muted">{c.category}</div></td><td>{c.enrolled}</td><td>{c.completed || 0} <span className="tiny muted">({c.enrolled ? Math.round(((c.completed || 0) / c.enrolled) * 100) : 0}%)</span></td><td>{c.in_progress || 0}</td><td>{c.avg_score ?? '—'}</td></tr>)}
          </tbody></table></div></div>
        </div>
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Completion by department</h3></div><div className="card-body"><HBars data={data.byDepartment} labelKey="department" valueKey="completed" totalKey="enrolled" /></div></div>
          <div className="card"><div className="card-head"><h3>Recent completions</h3></div><div className="card-body stack" style={{ gap: 8 }}>{data.recent.length === 0 && <span className="muted small">None yet.</span>}{data.recent.map((r, i) => <div key={i} className="small"><strong>{r.first_name} {r.last_name}</strong> completed {r.title} <span className="muted">· {fmtDate(r.completed_at)}</span></div>)}</div></div>
        </div>
      </div>
    </>
  );
}
