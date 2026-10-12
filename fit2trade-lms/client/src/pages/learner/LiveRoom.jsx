import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, fmtDateTime } from '../../api.js';
import { useAsync, Spinner } from '../../components/Ui.jsx';

/** Built-in "virtual classroom" page used when Teams/Webex are not configured (demo + tests). */
export default function LiveRoom() {
  const { id } = useParams(); const [params] = useSearchParams();
  const { data, loading } = useAsync(() => api.get(`/api/sessions/${id}`), [id]);
  if (loading) return <Spinner />;
  const s = data?.session;
  return (
    <div className="live-room">
      <div className="row between" style={{ padding: '16px 24px', background: '#0f1a16' }}><div className="row"><img src="/brand/fit2trade-logo.png" alt="" style={{ height: 30, background: '#fff', borderRadius: 6, padding: 2 }} /><strong>{s?.title}</strong></div><span className="small" style={{ opacity: .8 }}>{params.get('host') ? 'Host view' : 'Attendee view'} · {fmtDateTime(s?.starts_at)}</span></div>
      <div className="stage"><div className="tile"><div><div style={{ fontSize: 40 }}>🎥</div>Built-in virtual classroom (demo mode)<div className="small" style={{ opacity: .8, marginTop: 10 }}>Configure Microsoft Teams or Cisco Webex credentials in <code style={{ color: '#fff', background: 'rgba(255,255,255,.1)' }}>.env</code> to replace this with a real meeting link.</div></div></div></div>
      <div className="row between" style={{ padding: '16px 24px', background: '#0f1a16' }}><span className="small">{s?.description}</span><Link to="/sessions" className="btn secondary sm">Leave</Link></div>
    </div>
  );
}
