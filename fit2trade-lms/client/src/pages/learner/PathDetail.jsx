import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, Spinner, StatusBadge, Button, useToast } from '../../components/Ui.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function PathDetail() {
  const { id } = useParams(); const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get(`/api/paths/${id}`), [id]);
  if (loading) return <Spinner />;
  const { path, courses } = data;
  const enrol = async () => { try { await api.post(`/api/paths/${id}/enrol`); toast.success('Enrolled in all courses of this path'); reload(); } catch (e) { toast.error(e); } };
  return (<><PageHead title={path.title} sub={path.description}>{!courses.every((c) => c.enrollment_id) && <Button onClick={enrol}>Enrol in path</Button>}</PageHead>
    <div className="card"><div className="card-body stack">{courses.map((c, i) => <div key={c.id} className="module-row"><div className="type">{i + 1}</div><div className="grow"><Link to={`/courses/${c.id}`} className="strong">{c.title}</Link><div className="small muted">{c.category} · {c.duration_minutes} min</div></div><StatusBadge status={c.my_status || 'not_started'} />{c.enrollment_id && <Link className="btn sm secondary" to={`/learn/${c.enrollment_id}`}>Open</Link>}</div>)}</div></div></>);
}
