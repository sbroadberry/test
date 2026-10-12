import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, MODULE_LABEL, fmtDateTime } from '../../api.js';
import { useAsync, Spinner, Button, Badge, StatusBadge, Progress, useToast } from '../../components/Ui.jsx';
import { Icons, moduleIcon } from '../../components/Icons.jsx';
import { PROVIDER } from './Sessions.jsx';

export default function Player() {
  const { enrollmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { data, loading, reload, setData } = useAsync(() => api.get(`/api/learn/enrollments/${enrollmentId}`), [enrollmentId]);
  const modules = data?.course?.modules || [];
  // The active module is chosen once (URL param or first incomplete module) and only changes when the learner navigates,
  // so completing a module never yanks the learner away from what they are looking at.
  const [currentId, setCurrentId] = useState(params.get('module'));
  useEffect(() => { const p = params.get('module'); if (p && p !== currentId) setCurrentId(p); }, [params]); // eslint-disable-line
  useEffect(() => { if (!currentId && modules.length) setCurrentId((modules.find((m) => m.progress.status !== 'completed') || modules[0]).id); }, [modules.length, currentId]); // eslint-disable-line
  const current = modules.find((m) => m.id === currentId) || modules[0];
  if (loading) return <Spinner />;
  if (!data) return <div className="error">Enrolment not found.</div>;
  const { enrollment, course, certificate } = data;
  const idx = modules.indexOf(current);
  const goto = (m) => setParams({ module: m.id });
  const next = modules[idx + 1];
  const onProgress = (patch) => { if (patch?.enrollment) setData({ ...data, enrollment: { ...enrollment, ...patch.enrollment } }); reload(); };

  return (
    <div className="player" style={{ margin: -28 }}>
      <aside className="outline">
        <Link to={`/courses/${course.id}`} className="small"><Icons.arrowLeft /> Course overview</Link>
        <h3 style={{ marginTop: 10 }}>{course.title}</h3>
        <div className="row between small muted mb"><span>{enrollment.progress_pct}% complete</span><StatusBadge status={enrollment.status} /></div>
        <Progress value={enrollment.progress_pct} />
        <div className="stack mt" style={{ gap: 4 }}>
          {modules.map((m, i) => { const st = m.progress.status; const Ico = moduleIcon(m.type); return (
            <div key={m.id} className={`mod ${m.id === current?.id ? 'active' : ''}`} onClick={() => goto(m)} data-testid={`outline-${m.type}`}>
              <div className={`n ${st === 'completed' ? 'done' : st === 'failed' ? 'fail' : st === 'in_progress' ? 'prog' : ''}`}>{st === 'completed' ? '✓' : i + 1}</div>
              <div style={{ minWidth: 0 }}><div className="strong small" style={{ lineHeight: 1.3 }}>{m.title}</div><div className="tiny muted row" style={{ gap: 6 }}><Ico width="12" height="12" />{MODULE_LABEL[m.type]}{!m.required && ' · optional'}{m.progress.score != null && ` · ${m.progress.score}%`}</div></div>
            </div>); })}
        </div>
        {enrollment.status === 'completed' && <div className="notice mt" data-testid="course-complete"><strong>Course complete 🎉</strong>{certificate && <div className="mt" style={{ marginTop: 8 }}><a className="btn sm" href={`/api/certificates/${certificate.id}/pdf`} target="_blank" rel="noreferrer"><Icons.download />Certificate</a></div>}</div>}
      </aside>
      <section className="stage">
        {current ? <>
          <div className="row between mb"><div><div className="tiny muted">Module {idx + 1} of {modules.length} · {MODULE_LABEL[current.type]}</div><h2 style={{ margin: 0 }}>{current.title}</h2></div><div className="row">{idx > 0 && <Button variant="secondary" size="sm" onClick={() => goto(modules[idx - 1])}>Previous</Button>}{next && <Button variant="secondary" size="sm" onClick={() => goto(next)}>Next</Button>}</div></div>
          <ModuleView key={current.id} module={current} enrollment={enrollment} onProgress={onProgress} toast={toast} />
        </> : <div className="empty">This course has no content yet.</div>}
      </section>
    </div>
  );
}

function ModuleView({ module: m, enrollment, onProgress, toast }) {
  const done = m.progress.status === 'completed';
  const mark = async (status = 'completed', extra = {}) => { try { const d = await api.post(`/api/learn/enrollments/${enrollment.id}/modules/${m.id}/progress`, { status, ...extra }); onProgress(d); if (status === 'completed') toast.success('Module completed'); } catch (e) { toast.error(e); } };
  const startRef = useRef(Date.now());
  const spent = () => Math.round((Date.now() - startRef.current) / 1000);
  switch (m.type) {
    case 'scorm': return <ScormView module={m} enrollment={enrollment} onProgress={onProgress} />;
    case 'quiz': return <QuizView module={m} enrollment={enrollment} onProgress={onProgress} toast={toast} />;
    case 'video': return (<div className="stack">{m.content.url ? <iframe className="video-frame" src={m.content.url} title={m.title} allow="autoplay; fullscreen" allowFullScreen /> : <div className="notice amber">No video URL configured.</div>}<p>{m.content.description}</p><CompleteBar done={done} onDone={() => mark('completed', { timeSpentSec: spent() })} label="I have watched this video" /></div>);
    case 'document': return (<div className="stack">{m.content.url && (m.content.url.endsWith('.pdf') ? <iframe className="scorm-frame" style={{ height: 600 }} src={m.content.url} title={m.title} /> : <a className="btn secondary" href={m.content.url} target="_blank" rel="noreferrer"><Icons.download />Open document</a>)}<p>{m.content.description}</p><CompleteBar done={done} onDone={() => mark('completed', { timeSpentSec: spent() })} label="I have read this document" /></div>);
    case 'link': return (<div className="stack"><p>{m.content.description}</p><a className="btn secondary" href={m.content.url} target="_blank" rel="noreferrer"><Icons.external />Open {m.content.url}</a><CompleteBar done={done} onDone={() => mark('completed', { timeSpentSec: spent() })} label="I have reviewed this resource" /></div>);
    case 'page': return (<div className="stack"><div className="card pad rich" dangerouslySetInnerHTML={{ __html: m.content.html || '<p>No content.</p>' }} /><CompleteBar done={done} onDone={() => mark('completed', { timeSpentSec: spent() })} label="Mark as read" /></div>);
    case 'live': return <LiveView module={m} toast={toast} onProgress={onProgress} />;
    default: return <div className="notice">Unsupported module type: {m.type}</div>;
  }
}

const CompleteBar = ({ done, onDone, label }) => (<div className="row between card pad" style={{ padding: 14 }}>{done ? <Badge><Icons.check width="14" height="14" /> Completed</Badge> : <span className="muted small">When you're finished, mark this module complete to continue.</span>}{!done && <Button onClick={onDone} data-testid="mark-complete"><Icons.check />{label}</Button>}</div>);

function ScormView({ module: m, enrollment, onProgress }) {
  const [status, setStatus] = useState(null); const [item, setItem] = useState(null); const [live, setLive] = useState(null);
  const load = () => api.get(`/api/scorm/${enrollment.id}/${m.id}/status`).then((d) => { setStatus(d); setItem((i) => i || d.items[0]?.identifier); });
  useEffect(() => { load(); }, [m.id]);
  useEffect(() => { const h = (e) => { if (e.data?.source !== 'f2t-scorm' || e.data.moduleId !== m.id) return; if (e.data.type === 'scorm:progress') { setLive(e.data); load(); onProgress({ enrollment: e.data.enrollment }); } if (e.data.type === 'scorm:terminated') { load(); onProgress(); } }; window.addEventListener('message', h); return () => window.removeEventListener('message', h); }, [m.id]);
  if (!status) return <Spinner />;
  return (<div className="stack">
    <div className="row between"><div className="row small muted"><Badge tone="blue">SCORM {status.version}</Badge><span>{status.title}</span>{live?.moduleStatus && <span>· last saved: {live.moduleStatus}{live.score != null ? `, ${live.score}%` : ''}</span>}</div>
      {status.items.length > 1 && <div className="row">{status.items.map((i) => <button key={i.identifier} className={`btn sm ${i.identifier === item ? '' : 'secondary'}`} onClick={() => setItem(i.identifier)} data-testid={`sco-${i.identifier}`}>{i.status === 'completed' ? '✓ ' : ''}{i.title}</button>)}</div>}
    </div>
    <iframe className="scorm-frame" data-testid="scorm-frame" title={m.title} src={`/api/scorm/player/${enrollment.id}/${m.id}?item=${encodeURIComponent(item || '')}`} allow="autoplay; fullscreen" />
    <div className="small muted">Progress is saved automatically by the course. Status: <strong data-testid="scorm-status">{status.module.status}</strong>{status.module.score != null && <> · score <strong>{status.module.score}%</strong></>} · attempts {status.module.attempts}</div>
  </div>);
}

function QuizView({ module: m, enrollment, onProgress, toast }) {
  const quiz = m.content; const [answers, setAnswers] = useState({}); const [result, setResult] = useState(m.progress.data?.lastResult || null); const [busy, setBusy] = useState(false);
  const [started] = useState(Date.now());
  const toggle = (q, optId) => setAnswers((a) => { if (q.type === 'multi') { const cur = new Set(a[q.id] || []); cur.has(optId) ? cur.delete(optId) : cur.add(optId); return { ...a, [q.id]: [...cur] }; } return { ...a, [q.id]: [optId] }; });
  const submit = async () => { setBusy(true); try { const d = await api.post(`/api/learn/enrollments/${enrollment.id}/modules/${m.id}/quiz`, { answers, timeSpentSec: Math.round((Date.now() - started) / 1000) }); setResult(d.result); onProgress(d); toast[d.result.passed ? 'success' : 'error'](d.result.passed ? `Passed with ${d.result.score}%` : `Score ${d.result.score}% – pass mark is ${d.result.passMark}%`); } catch (e) { toast.error(e); } finally { setBusy(false); } };
  const done = m.progress.status === 'completed';
  const resultFor = (qid) => result?.results?.find((r) => r.questionId === qid);
  return (<div className="card pad quiz">
    <div className="row between mb"><div className="small muted">{quiz.questions?.length || 0} questions · pass mark {quiz.passMark ?? 70}%{quiz.attemptsAllowed ? ` · ${quiz.attemptsAllowed} attempts allowed (${m.progress.attempts} used)` : ''}</div>{result && <Badge tone={result.passed ? '' : 'red'} data-testid="quiz-result">{result.passed ? 'Passed' : 'Not passed'} · {result.score}%</Badge>}</div>
    {(quiz.questions || []).map((q, i) => { const r = resultFor(q.id); return (<div className="q" key={q.id}><div className="strong">{i + 1}. {q.text}</div>{q.type === 'multi' && <div className="tiny muted">Select all that apply</div>}
      {(q.options || []).map((o) => { const sel = (answers[q.id] || []).includes(o.id); const cls = r ? (r.expected.includes(String(o.id)) ? 'correct' : r.given.includes(String(o.id)) ? 'wrong' : '') : ''; return (<label key={o.id} className={`opt ${cls}`}><input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={q.id} checked={sel} onChange={() => toggle(q, o.id)} disabled={done && !!result} data-testid={`opt-${q.id}-${o.id}`} /> {o.text}</label>); })}</div>); })}
    <div className="row between mt">{done ? <Badge><Icons.check width="14" height="14" /> Assessment passed</Badge> : <span />}{(!done || !result) && <Button onClick={submit} disabled={busy} data-testid="quiz-submit">{busy ? 'Marking…' : result ? 'Try again' : 'Submit answers'}</Button>}</div>
  </div>);
}

function LiveView({ module: m, toast, onProgress }) {
  const sessions = m.sessions || [];
  const act = async (s, action) => { try { await api.post(`/api/sessions/${s.id}/${action}`); toast.success(action === 'register' ? 'Registered' : 'Cancelled'); onProgress(); } catch (e) { toast.error(e); } };
  return (<div className="stack"><p>{m.content.description}</p>
    {sessions.length === 0 && <div className="notice amber">No sessions have been scheduled for this module yet. Your trainer will add one.</div>}
    {sessions.map((s) => { const live = new Date(s.starts_at) - Date.now() < 15 * 60000 && new Date(s.ends_at) > Date.now(); return (<div className="card pad row between" key={s.id}><div><div className="strong">{s.title}</div><div className="small muted">{fmtDateTime(s.starts_at)} · {PROVIDER[s.provider]}{s.location ? ` · ${s.location}` : ''}</div></div>
      <div className="row">{s.attended ? <Badge>Attended</Badge> : s.registered ? <>{s.join_url && <a className={`btn sm ${live ? '' : 'secondary'}`} href={s.join_url} target="_blank" rel="noreferrer"><Icons.video />{live ? 'Join now' : 'Join link'}</a>}<Button size="sm" variant="ghost" onClick={() => act(s, 'unregister')}>Cancel</Button></> : <Button size="sm" onClick={() => act(s, 'register')}>Register</Button>}</div></div>); })}
    {m.progress.status === 'completed' && <Badge><Icons.check width="14" height="14" /> Attendance recorded</Badge>}
  </div>);
}
