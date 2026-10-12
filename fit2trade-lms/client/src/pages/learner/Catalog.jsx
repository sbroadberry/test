import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsync, Spinner, Progress, Badge, Empty, Select, Input } from '../../components/Ui.jsx';
import { PageHead } from '../../components/Layout.jsx';

export function CourseCard({ c, cta }) {
  const thumb = c.thumbnail_url && !c.thumbnail_url.startsWith('/') && !c.thumbnail_url.startsWith('http') ? `t-${c.thumbnail_url}` : '';
  return (
    <div className="card course-card" data-testid="course-card">
      <div className={`thumb ${thumb}`} style={c.thumbnail_url?.startsWith('/') || c.thumbnail_url?.startsWith('http') ? { backgroundImage: `url(${c.thumbnail_url})`, backgroundSize: 'cover' } : {}}><span className="cat">{c.category}</span></div>
      <div className="body">
        <h3><Link to={`/courses/${c.id}`}>{c.title}</Link></h3>
        <div className="desc">{c.description}</div>
        <div className="row small muted"><span>{c.module_count} modules</span><span>·</span><span>{c.duration_minutes} min</span>{c.level && <><span>·</span><span>{c.level}</span></>}</div>
        {c.my_enrollment_id && c.my_status !== 'completed' && <Progress value={c.my_progress || 0} />}
        <div className="foot">
          {c.my_status === 'completed' ? <Badge>Completed</Badge> : c.my_enrollment_id ? <Badge tone="blue">Enrolled</Badge> : c.self_enrol ? <Badge tone="grey">Open enrolment</Badge> : <Badge tone="outline">Assigned by admin</Badge>}
          {cta || (c.my_enrollment_id ? <Link className="btn sm" to={`/learn/${c.my_enrollment_id}`}>{c.my_status === 'completed' ? 'Review' : c.my_status === 'enrolled' ? 'Start' : 'Continue'}</Link> : <Link className="btn sm secondary" to={`/courses/${c.id}`}>View</Link>)}
        </div>
      </div>
    </div>
  );
}

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || ''; const category = params.get('category') || '';
  const { data, loading } = useAsync(() => api.get(`/api/courses?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`), [q, category]);
  const [query, setQuery] = useState(q);
  return (
    <>
      <PageHead title="Course catalogue" sub="Self-enrol in open courses or review the ones assigned to you.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); setParams({ q: query, category }); }}>
          <Input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
          <Select value={category} onChange={(e) => setParams({ q, category: e.target.value })} style={{ width: 180 }}><option value="">All categories</option>{(data?.categories || []).map((c) => <option key={c}>{c}</option>)}</Select>
        </form>
      </PageHead>
      {loading ? <Spinner /> : data.courses.length === 0 ? <Empty title="No courses found">Try a different search or category.</Empty> : <div className="grid auto">{data.courses.map((c) => <CourseCard key={c.id} c={c} />)}</div>}
    </>
  );
}
