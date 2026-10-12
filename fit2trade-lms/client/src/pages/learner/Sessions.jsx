import React from 'react';
import { api, fmtDateTime } from '../../api.js';
import { useAsync, Spinner, Button, Badge, Empty, useToast, StatusBadge } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export const PROVIDER = { teams: 'Microsoft Teams', webex: 'Cisco Webex', simulated: 'Virtual classroom', none: 'In person' };

export default function Sessions() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get(`/api/sessions?from=${new Date(Date.now() - 86400000).toISOString()}`));
  if (loading) return <Spinner />;
  const act = async (s, action) => { try { await api.post(`/api/sessions/${s.id}/${action}`); toast.success(action === 'register' ? 'Registered' : 'Registration cancelled'); reload(); } catch (e) { toast.error(e); } };
  return (
    <>
      <PageHead title="Live sessions" sub="Instructor-led classrooms delivered over Microsoft Teams, Webex or in person." />
      {data.sessions.length === 0 ? <div className="card"><Empty icon={Icons.calendar} title="No upcoming sessions">Check back soon or ask your manager.</Empty></div> : (
        <div className="grid auto">{data.sessions.map((s) => { const live = new Date(s.starts_at) - Date.now() < 15 * 60000 && new Date(s.ends_at) > Date.now(); return (
          <div className="card pad stack" key={s.id} data-testid="session-card">
            <div className="row between"><Badge tone="blue">{PROVIDER[s.provider] || s.provider}</Badge>{s.my_registration && <StatusBadge status={s.my_registration} />}</div>
            <div><h3>{s.title}</h3><div className="small muted">{s.course_title && <>{s.course_title} · </>}{fmtDateTime(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })} ({s.timezone})</div>{s.instructor_name && <div className="small muted">Trainer: {s.instructor_name}</div>}{s.location && <div className="small muted">Location: {s.location}</div>}</div>
            <p className="small">{s.description}</p>
            <div className="row between"><span className="small muted">{s.registered_count}/{s.capacity} places</span>
              <div className="row">{s.my_registration === 'registered' && s.join_url && <a className={`btn sm ${live ? '' : 'secondary'}`} href={s.join_url} target="_blank" rel="noreferrer"><Icons.video />{live ? 'Join now' : 'Join link'}</a>}
                {s.my_registration === 'registered' ? <Button size="sm" variant="ghost" onClick={() => act(s, 'unregister')}>Cancel</Button> : s.my_registration === 'attended' ? null : <Button size="sm" onClick={() => act(s, 'register')} disabled={s.registered_count >= s.capacity}>Register</Button>}</div></div>
          </div>); })}</div>)}
    </>
  );
}
