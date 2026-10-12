import React from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, daysUntil, fmtDuration } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useAsync, Spinner, Stat, Progress, StatusBadge, Button, Empty, Badge } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useAsync(() => api.get('/api/learn/dashboard'));
  if (loading) return <Spinner />;
  const { enrollments, stats, sessions, paths, notifications } = data;
  const active = enrollments.filter((e) => e.status !== 'completed');
  const done = enrollments.filter((e) => e.status === 'completed');
  return (
    <>
      <PageHead title={`Welcome back, ${user.first_name}`} sub="Here's what's on your learning plan."><Link className="btn secondary" to="/catalog"><Icons.grid />Browse catalogue</Link></PageHead>
      <div className="grid cols-4 mb">
        <Stat icon={Icons.book} value={stats.inProgress + enrollments.filter((e) => e.status === 'enrolled').length} label="Courses to complete" />
        <Stat icon={Icons.check} value={stats.completed} label="Completed" />
        <Stat icon={Icons.alert} tone={stats.overdue ? 'red' : ''} value={stats.overdue} label="Overdue" />
        <Stat icon={Icons.award} tone={stats.expiringSoon ? 'amber' : ''} value={stats.certificates} label={stats.expiringSoon ? `Certificates · ${stats.expiringSoon} expiring soon` : 'Certificates'} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>My courses</h3><span className="muted small">{fmtDuration(stats.timeSpentSec)} learning time</span></div>
            <div className="card-body stack">
              {active.length === 0 && <Empty title="Nothing outstanding">Browse the catalogue to find your next course.</Empty>}
              {active.map((e) => { const d = daysUntil(e.due_at); return (
                <div key={e.id} className="row between" style={{ gap: 16 }} data-testid="enrollment-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row"><Link to={`/learn/${e.id}`} className="strong">{e.title}</Link><StatusBadge status={e.status} />{d != null && e.status !== 'completed' && <Badge tone={d < 0 ? 'red' : d <= 7 ? 'amber' : 'grey'}>{d < 0 ? `Overdue by ${-d}d` : `Due in ${d}d`}</Badge>}</div>
                    <div className="small muted">{e.category} · {e.module_count} modules · {e.duration_minutes} min{e.due_at ? ` · due ${fmtDate(e.due_at)}` : ''}</div>
                    <div className="mt" style={{ marginTop: 8 }}><Progress value={e.progress_pct} /></div>
                  </div>
                  <Link className="btn sm" to={`/learn/${e.id}`}><Icons.play />{e.status === 'enrolled' ? 'Start' : 'Continue'}</Link>
                </div>); })}
            </div>
          </div>
          {done.length > 0 && <div className="card"><div className="card-head"><h3>Completed</h3><Link to="/certificates" className="small">View certificates</Link></div><div className="card-body stack">
            {done.map((e) => <div key={e.id} className="row between"><div><Link to={`/learn/${e.id}`} className="strong">{e.title}</Link><div className="small muted">Completed {fmtDate(e.completed_at)}{e.score != null ? ` · score ${e.score}%` : ''}{e.expires_at ? ` · valid until ${fmtDate(e.expires_at)}` : ''}</div></div><StatusBadge status="completed" /></div>)}
          </div></div>}
          {paths.length > 0 && <div className="card"><div className="card-head"><h3>Learning paths</h3></div><div className="card-body stack">
            {paths.map((p) => <div key={p.id}><div className="row between"><Link to={`/paths/${p.id}`} className="strong">{p.title}</Link><span className="small muted">{p.completed_count} / {p.course_count} courses</span></div><div style={{ marginTop: 6 }}><Progress value={p.course_count ? (p.completed_count / p.course_count) * 100 : 0} /></div></div>)}
          </div></div>}
        </div>
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Upcoming live sessions</h3><Link to="/sessions" className="small">All</Link></div><div className="card-body stack">
            {sessions.length === 0 && <div className="muted small">No sessions booked. <Link to="/sessions">Browse sessions</Link></div>}
            {sessions.map((s) => <div key={s.id}><div className="strong">{s.title}</div><div className="small muted">{fmtDateTime(s.starts_at)} · {({ teams: 'Microsoft Teams', webex: 'Webex', simulated: 'Virtual classroom', none: 'In person' })[s.provider]}</div>{s.join_url && <a className="btn sm secondary mt" style={{ marginTop: 8 }} href={s.join_url} target="_blank" rel="noreferrer"><Icons.video />Join</a>}</div>)}
          </div></div>
          <div className="card"><div className="card-head"><h3>Notifications</h3></div><div className="card-body stack">
            {notifications.length === 0 && <div className="muted small">No notifications yet.</div>}
            {notifications.slice(0, 5).map((n) => <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}><div><div className="t small">{n.title}</div><div className="b tiny">{n.body}</div></div></div>)}
          </div></div>
        </div>
      </div>
    </>
  );
}
