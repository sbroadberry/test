import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, MODULE_LABEL, fmtDate } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useAsync, Spinner, Button, Badge, StatusBadge, useToast } from '../../components/Ui.jsx';
import { Icons, moduleIcon } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function CourseDetail() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast(); const { isStaff } = useAuth();
  const { data, loading, reload } = useAsync(() => api.get(`/api/courses/${id}`), [id]);
  if (loading) return <Spinner />;
  if (!data) return <div className="error">Course not found.</div>;
  const { course, enrollment, stats } = data;
  const enrol = async () => { try { const d = await api.post(`/api/courses/${id}/enrol`); toast.success('You are enrolled'); nav(`/learn/${d.enrollment.id}`); } catch (e) { toast.error(e); } };
  const renew = async () => { try { const d = await api.post(`/api/learn/courses/${id}/renew`); toast.success('Course reset for renewal'); nav(`/learn/${d.enrollment.id}`); } catch (e) { toast.error(e); } };
  return (
    <>
      <PageHead title={course.title} sub={`${course.category} · ${course.duration_minutes} min · ${course.level}`}>
        {isStaff && <Link className="btn secondary" to={`/admin/courses/${course.id}`}><Icons.edit />Edit course</Link>}
        {enrollment ? (enrollment.status === 'completed' ? <><Link className="btn secondary" to={`/learn/${enrollment.id}`}>Review content</Link><Button onClick={renew}><Icons.refresh />Re-take / renew</Button></> : <Link className="btn" to={`/learn/${enrollment.id}`}><Icons.play />{enrollment.status === 'enrolled' ? 'Start course' : 'Continue'}</Link>)
          : (course.self_enrol || isStaff) ? <Button onClick={enrol} data-testid="enrol-btn"><Icons.plus />Enrol</Button> : <Badge tone="outline">Enrolment by administrator</Badge>}
      </PageHead>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="stack">
          <div className="card pad"><h3>About this course</h3><p style={{ whiteSpace: 'pre-line' }}>{course.description || 'No description yet.'}</p>
            <div className="row small muted"><span>Pass mark {course.pass_mark}%</span><span>·</span><span>{course.certificate_enabled ? (course.certificate_validity_months ? `Certificate valid ${course.certificate_validity_months} months` : 'Certificate on completion') : 'No certificate'}</span></div></div>
          <div className="card"><div className="card-head"><h3>Course content</h3><span className="muted small">{course.modules.length} modules</span></div>
            <div className="card-body stack">{course.modules.map((m, i) => { const Ico = moduleIcon(m.type); return <div key={m.id} className="module-row"><div className="type"><Ico /></div><div className="grow"><div className="strong">{i + 1}. {m.title}</div><div className="small muted">{MODULE_LABEL[m.type]}{m.package ? ` · SCORM ${m.package.version}` : ''}{m.required ? '' : ' · optional'}</div></div></div>; })}</div></div>
        </div>
        <div className="stack">
          {enrollment && <div className="card pad"><h3>Your status</h3><div className="kv"><dt>Status</dt><dd><StatusBadge status={enrollment.status} /></dd><dt>Progress</dt><dd>{enrollment.progress_pct}%</dd>{enrollment.score != null && <><dt>Score</dt><dd>{enrollment.score}%</dd></>}<dt>Enrolled</dt><dd>{fmtDate(enrollment.enrolled_at)}</dd>{enrollment.due_at && <><dt>Due</dt><dd>{fmtDate(enrollment.due_at)}</dd></>}{enrollment.completed_at && <><dt>Completed</dt><dd>{fmtDate(enrollment.completed_at)}</dd></>}{enrollment.expires_at && <><dt>Valid until</dt><dd>{fmtDate(enrollment.expires_at)}</dd></>}</div></div>}
          <div className="card pad"><h3>Learners</h3><div className="kv"><dt>Enrolled</dt><dd>{stats.enrolled}</dd><dt>Completed</dt><dd>{stats.completed}</dd><dt>Average score</dt><dd>{stats.avg_score ? Math.round(stats.avg_score) + '%' : '—'}</dd></div></div>
        </div>
      </div>
    </>
  );
}
