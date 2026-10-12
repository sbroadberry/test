import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, Textarea, StatusBadge, useToast } from '../../components/Ui.jsx';
import { Icons } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function Courses() {
  const nav = useNavigate(); const toast = useToast();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [modal, setModal] = useState(false);
  const { data, loading, reload } = useAsync(() => api.get(`/api/courses?q=${encodeURIComponent(q)}&status=${status}`), [q, status]);
  const [f, setF] = useState({ title: '', category: 'Health & Safety', description: '', self_enrol: false, certificate_validity_months: '' });
  const create = async () => { try { const d = await api.post('/api/courses', { ...f, certificate_validity_months: f.certificate_validity_months ? Number(f.certificate_validity_months) : null }); toast.success('Course created'); nav(`/admin/courses/${d.course.id}`); } catch (e) { toast.error(e); } };
  return (<>
    <PageHead title="Courses" sub="Build courses from SCORM packages, video, documents, pages, assessments and live sessions."><Button onClick={() => setModal(true)} data-testid="new-course"><Icons.plus />New course</Button></PageHead>
    <div className="row mb"><Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></div>
    {loading ? <Spinner /> : <div className="card table-wrap"><table className="table"><thead><tr><th>Course</th><th>Category</th><th>Modules</th><th>Enrolled</th><th>Completed</th><th>Enrolment</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>
      {data.courses.map((c) => <tr key={c.id} className="click" onClick={() => nav(`/admin/courses/${c.id}`)}><td className="strong">{c.title}</td><td>{c.category}</td><td>{c.module_count}</td><td>{c.enrolled_count}</td><td>{c.completed_count}</td><td className="small">{c.self_enrol ? 'Open' : 'Assigned'}</td><td><StatusBadge status={c.status} /></td><td className="small">{fmtDate(c.updated_at)}</td><td className="actions"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); api.post(`/api/courses/${c.id}/duplicate`).then(reload); }}>Duplicate</Button></td></tr>)}
    </tbody></table></div>}
    {modal && <Modal title="New course" onClose={() => setModal(false)} footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={create} disabled={!f.title} data-testid="create-course">Create course</Button></>}>
      <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus data-testid="course-title" /></Field>
      <div className="form-row"><Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} list="cats" /><datalist id="cats">{(data?.categories || []).map((c) => <option key={c} value={c} />)}</datalist></Field><Field label="Certificate validity (months)" hint="Blank = never expires"><Input type="number" value={f.certificate_validity_months} onChange={(e) => setF({ ...f, certificate_validity_months: e.target.value })} /></Field></div>
      <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={f.self_enrol} onChange={(e) => setF({ ...f, self_enrol: e.target.checked })} /> Allow learners to self-enrol from the catalogue</label>
    </Modal>}
  </>);
}
