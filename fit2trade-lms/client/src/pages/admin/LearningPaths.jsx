import React, { useState } from 'react';
import { api } from '../../api.js';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, Textarea, StatusBadge, useToast, Empty } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function LearningPaths() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get('/api/paths'));
  const courses = useAsync(() => api.get('/api/courses')); const users = useAsync(() => api.get('/api/users?pageSize=500'));
  const [modal, setModal] = useState(null); const [detail, setDetail] = useState(null);
  const save = async () => { try { const body = { ...modal, courseIds: modal.courseIds }; if (modal.id) await api.put(`/api/paths/${modal.id}`, body); else await api.post('/api/paths', body); toast.success('Learning path saved'); setModal(null); reload(); } catch (e) { toast.error(e); } };
  const open = async (p) => setDetail(await api.get(`/api/paths/${p.id}`));
  const enrol = async (userIds) => { try { const d = await api.post(`/api/paths/${detail.path.id}/enrol`, { userIds }); toast.success(`${d.created} course enrolments created`); open(detail.path); reload(); } catch (e) { toast.error(e); } };
  if (loading) return <Spinner />;
  return (<>
    <PageHead title="Learning paths" sub="Bundle courses into a sequenced programme, e.g. a 30-day onboarding plan."><Button onClick={() => setModal({ title: '', description: '', status: 'published', courseIds: [] })}><Icons.plus />New path</Button></PageHead>
    <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
      <div className="stack">{data.paths.map((p) => <div key={p.id} className="card pad" style={{ cursor: 'pointer', borderColor: detail?.path.id === p.id ? 'var(--f2t-green)' : undefined }} onClick={() => open(p)}><div className="row between"><strong>{p.title}</strong><StatusBadge status={p.status} /></div><div className="small muted">{p.course_count} courses · {p.learner_count} learners</div></div>)}{data.paths.length === 0 && <div className="card"><Empty title="No learning paths yet" /></div>}</div>
      <div className="card">{!detail ? <Empty icon={Icons.layers} title="Select a path" /> : <>
        <div className="card-head"><h3>{detail.path.title}</h3><div className="row"><Button size="sm" variant="secondary" onClick={() => setModal({ ...detail.path, courseIds: detail.courses.map((c) => c.id) })}><Icons.edit />Edit</Button><Button size="sm" variant="danger" onClick={async () => { if (confirm('Delete path?')) { await api.del(`/api/paths/${detail.path.id}`); setDetail(null); reload(); } }}><Icons.trash /></Button></div></div>
        <div className="card-body grid cols-2"><div><h4>Courses in order</h4>{detail.courses.map((c, i) => <div key={c.id} className="list-item small"><span className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>{i + 1}</span>{c.title}</div>)}</div>
          <div><h4>Learners ({detail.learners.length})</h4><div className="stack" style={{ gap: 4 }}>{detail.learners.map((u) => <div key={u.id} className="small">{u.first_name} {u.last_name} <span className="muted">· {u.email}</span></div>)}</div>
            <Select className="select mt" onChange={(e) => { if (e.target.value) enrol([e.target.value]); e.target.value = ''; }}><option value="">+ Enrol learner…</option>{(users.data?.users || []).filter((u) => !detail.learners.some((l) => l.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</Select></div></div></>}</div>
    </div>
    {modal && <Modal title={modal.id ? 'Edit learning path' : 'New learning path'} onClose={() => setModal(null)} footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={save} disabled={!modal.title}>Save</Button></>}>
      <Field label="Title"><Input value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} /></Field><Field label="Description"><Textarea value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} /></Field>
      <Field label="Status"><Select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></Select></Field>
      <Field label="Courses (in order)"><div className="stack" style={{ gap: 6 }}>{modal.courseIds.map((id, i) => <div key={id} className="row between small chip"><span>{i + 1}. {(courses.data?.courses || []).find((c) => c.id === id)?.title}</span><button className="btn ghost sm" onClick={() => setModal({ ...modal, courseIds: modal.courseIds.filter((x) => x !== id) })}><Icons.x /></button></div>)}</div>
        <Select className="select mt" onChange={(e) => { if (e.target.value) setModal({ ...modal, courseIds: [...modal.courseIds, e.target.value] }); e.target.value = ''; }}><option value="">+ Add course…</option>{(courses.data?.courses || []).filter((c) => !modal.courseIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
    </Modal>}
  </>);
}
