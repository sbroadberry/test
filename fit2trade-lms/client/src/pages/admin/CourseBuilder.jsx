import React, { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, MODULE_LABEL, fmtDate, fmtDateTime } from '../../api.js';
import { useAsync, Spinner, Button, Modal, Field, Input, Select, Textarea, StatusBadge, Badge, Tabs, useToast, Empty } from '../../components/Ui.jsx';
import { Icons, moduleIcon } from '../../components/Icons.jsx';
import { PageHead } from '../../components/Layout.jsx';

export default function CourseBuilder() {
  const { id } = useParams(); const toast = useToast(); const nav = useNavigate();
  const { data, loading, reload, setData } = useAsync(() => api.get(`/api/courses/${id}`), [id]);
  const [tab, setTab] = useState('content'); const [modal, setModal] = useState(null);
  if (loading) return <Spinner />;
  const course = data.course;
  const update = async (patch) => { try { const d = await api.put(`/api/courses/${id}`, patch); setData({ ...data, course: d.course }); toast.success('Saved'); } catch (e) { toast.error(e); } };
  const addModule = async (type, content = {}, title) => { try { const d = await api.post(`/api/courses/${id}/modules`, { type, content, title }); setData({ ...data, course: d.course }); setModal({ module: d.course.modules.find((m) => m.id === d.module.id) }); } catch (e) { toast.error(e); } };
  const saveModule = async (m, patch) => { try { const d = await api.put(`/api/courses/${id}/modules/${m.id}`, patch); setData({ ...data, course: d.course }); toast.success('Module saved'); setModal(null); } catch (e) { toast.error(e); } };
  const removeModule = async (m) => { if (!confirm(`Delete "${m.title}"?`)) return; const d = await api.del(`/api/courses/${id}/modules/${m.id}`); setData({ ...data, course: d.course }); };
  const move = async (i, dir) => { const order = course.modules.map((m) => m.id); const j = i + dir; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; const d = await api.put(`/api/courses/${id}/modules-order`, { order }); setData({ ...data, course: d.course }); };
  return (<>
    <PageHead title={course.title} sub={`${course.category} · ${course.modules.length} modules · ${data.stats.enrolled} enrolled`}>
      <StatusBadge status={course.status} />
      <Link className="btn secondary" to={`/courses/${id}`}><Icons.play />Preview</Link>
      {course.status !== 'published' ? <Button onClick={() => update({ status: 'published' })} data-testid="publish">Publish</Button> : <Button variant="secondary" onClick={() => update({ status: 'draft' })}>Unpublish</Button>}
    </PageHead>
    <Tabs tabs={[{ id: 'content', label: 'Content' }, { id: 'settings', label: 'Settings' }, { id: 'learners', label: `Learners (${data.stats.enrolled})` }]} value={tab} onChange={setTab} />
    {tab === 'content' && <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="card"><div className="card-head"><h3>Modules</h3><span className="small muted">Learners complete modules in order shown</span></div><div className="card-body stack" style={{ gap: 8 }}>
        {course.modules.length === 0 && <Empty title="No modules yet">Add content from the panel on the right.</Empty>}
        {course.modules.map((m, i) => { const Ico = moduleIcon(m.type); return (<div className="module-row" key={m.id} data-testid="module-row"><div className="type"><Ico /></div><div className="grow"><div className="strong">{i + 1}. {m.title}</div><div className="tiny muted">{MODULE_LABEL[m.type]}{m.package ? ` · SCORM ${m.package.version} · ${m.package.original_filename}` : ''}{m.type === 'quiz' ? ` · ${(m.content.questions || []).length} questions · pass ${m.content.passMark ?? 70}%` : ''}{m.type === 'live' ? ` · ${(m.sessions || []).length} session(s)` : ''}{m.required ? '' : ' · optional'}</div></div>
          <div className="row" style={{ gap: 4 }}><button className="btn ghost sm" onClick={() => move(i, -1)} title="Move up"><Icons.arrowUp /></button><button className="btn ghost sm" onClick={() => move(i, 1)} title="Move down"><Icons.arrowDown /></button><Button size="sm" variant="secondary" onClick={() => setModal({ module: m })}><Icons.edit />Edit</Button><button className="btn ghost sm" onClick={() => removeModule(m)} title="Delete"><Icons.trash /></button></div></div>); })}
      </div></div>
      <div className="stack">
        <div className="card pad"><h3>Add content</h3><div className="stack" style={{ gap: 6 }}>
          <Button variant="secondary" onClick={() => setModal({ scormUpload: true })} data-testid="add-scorm"><Icons.package />SCORM package (1.2 / 2004)</Button>
          <Button variant="secondary" onClick={() => addModule('video', { url: '', description: '' })}><Icons.video />Video</Button>
          <Button variant="secondary" onClick={() => addModule('document', { url: '', description: '' })}><Icons.file />Document (PDF)</Button>
          <Button variant="secondary" onClick={() => addModule('page', { html: '<h2>Heading</h2><p>Write your content here.</p>' })}><Icons.book />Page</Button>
          <Button variant="secondary" onClick={() => addModule('quiz', { passMark: course.pass_mark, attemptsAllowed: 3, showAnswers: true, questions: [] })} data-testid="add-quiz"><Icons.tick />Assessment</Button>
          <Button variant="secondary" onClick={() => addModule('live', { description: 'Join the trainer-led session.' })}><Icons.calendar />Live session (Teams / Webex)</Button>
          <Button variant="secondary" onClick={() => addModule('link', { url: 'https://', description: '' })}><Icons.link />Web link</Button>
        </div></div>
        <div className="card pad small muted"><strong>Tip:</strong> SCORM packages are exported from authoring tools such as Articulate Storyline/Rise, iSpring, Adobe Captivate or Lectora. Upload the .zip as exported; Fit2Trade Learn reads the manifest and tracks completion, score, time and bookmarks.</div>
      </div>
    </div>}
    {tab === 'settings' && <SettingsTab course={course} onSave={update} onDelete={async () => { if (confirm('Delete this course and all enrolments?')) { await api.del(`/api/courses/${id}`); nav('/admin/courses'); } }} />}
    {tab === 'learners' && <LearnersTab courseId={id} />}
    {modal?.scormUpload && <ScormUploadModal courseId={id} onClose={() => setModal(null)} onDone={(d) => { setData({ ...data, course: d.course }); setModal(null); toast.success(`SCORM ${d.package.version} package installed`); }} />}
    {modal?.module && <ModuleModal module={modal.module} courseId={id} onClose={() => setModal(null)} onSave={saveModule} />}
  </>);
}

function ScormUploadModal({ courseId, onClose, onDone }) {
  const [file, setFile] = useState(null); const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [over, setOver] = useState(false);
  const upload = async () => { if (!file) return; setBusy(true); setError(''); const form = new FormData(); form.append('package', file); if (title) form.append('title', title); try { onDone(await api.upload(`/api/courses/${courseId}/modules/new/scorm`, form)); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return (<Modal title="Upload SCORM package" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={upload} disabled={!file || busy} data-testid="scorm-upload-submit">{busy ? 'Uploading…' : 'Upload & install'}</Button></>}>
    {error && <div className="error mb">{error}</div>}
    <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); setFile(e.dataTransfer.files[0]); }}>
      <Icons.upload width="28" height="28" /><div className="mt">{file ? <strong>{file.name}</strong> : 'Drag a SCORM .zip here or choose a file'}</div>
      <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files[0])} className="mt" data-testid="scorm-file" />
    </div>
    <Field label="Module title (optional)" hint="Defaults to the title inside the package manifest."><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
    <div className="small muted">Supported: SCORM 1.2 and SCORM 2004 (2nd–4th Edition), single or multi-SCO, including packages where the content sits in a sub-folder.</div>
  </Modal>);
}

function ModuleModal({ module: m, courseId, onClose, onSave }) {
  const [title, setTitle] = useState(m.title); const [required, setRequired] = useState(!!m.required); const [content, setContent] = useState(m.content || {});
  const [sessionForm, setSessionForm] = useState(null); const toast = useToast(); const fileRef = useRef();
  const set = (k, v) => setContent({ ...content, [k]: v });
  const uploadAsset = async (file) => { const form = new FormData(); form.append('file', file); try { const d = await api.upload(`/api/courses/${courseId}/assets`, form); set('url', d.url); toast.success('File uploaded'); } catch (e) { toast.error(e); } };
  return (<Modal title={`Edit ${MODULE_LABEL[m.type]}`} onClose={onClose} wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(m, { title, required, content })} data-testid="module-save">Save module</Button></>}>
    <div className="form-row"><Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="module-title" /></Field><Field label="Completion"><label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required to complete the course</label></Field></div>
    {m.type === 'video' && <><Field label="Video URL" hint="YouTube/Vimeo embed URL, or upload an MP4 below."><Input value={content.url || ''} onChange={(e) => set('url', e.target.value)} placeholder="https://www.youtube.com/embed/…" /></Field><input type="file" accept="video/mp4" onChange={(e) => uploadAsset(e.target.files[0])} /><Field label="Instructions"><Textarea value={content.description || ''} onChange={(e) => set('description', e.target.value)} /></Field></>}
    {m.type === 'document' && <><Field label="Document URL"><Input value={content.url || ''} onChange={(e) => set('url', e.target.value)} /></Field><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx" onChange={(e) => uploadAsset(e.target.files[0])} /><Field label="Instructions"><Textarea value={content.description || ''} onChange={(e) => set('description', e.target.value)} /></Field></>}
    {m.type === 'link' && <><Field label="URL"><Input value={content.url || ''} onChange={(e) => set('url', e.target.value)} /></Field><Field label="Instructions"><Textarea value={content.description || ''} onChange={(e) => set('description', e.target.value)} /></Field></>}
    {m.type === 'page' && <Field label="Page content (HTML)" hint="Basic HTML is supported: headings, paragraphs, lists, images, links."><Textarea style={{ minHeight: 260, fontFamily: 'monospace' }} value={content.html || ''} onChange={(e) => set('html', e.target.value)} /></Field>}
    {m.type === 'live' && <><Field label="Instructions for learners"><Textarea value={content.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
      <h4>Scheduled sessions</h4>{(m.sessions || []).length === 0 && <div className="small muted mb">No sessions yet.</div>}{(m.sessions || []).map((s) => <div key={s.id} className="row between small mb"><span>{s.title} · {fmtDateTime(s.starts_at)} · <Badge tone="blue">{s.provider}</Badge></span><Link to={`/admin/sessions`}>Manage</Link></div>)}
      <div className="notice small">Schedule sessions for this module from <Link to="/admin/sessions">Live sessions</Link>, choosing this course and module. Attendance synced from Teams/Webex marks the module complete automatically.</div></>}
    {m.type === 'scorm' && <div className="notice small">SCORM package: <strong>{m.package?.original_filename}</strong> (version {m.package?.version}, launch <code>{m.package?.launch_path}</code>). To replace it, delete this module and upload a new package.</div>}
    {m.type === 'quiz' && <QuizEditor content={content} setContent={setContent} />}
  </Modal>);
}

function QuizEditor({ content, setContent }) {
  const qs = content.questions || [];
  const setQ = (i, patch) => setContent({ ...content, questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const addQ = () => setContent({ ...content, questions: [...qs, { id: `q${Date.now()}`, text: '', type: 'single', options: [{ id: 'a', text: '', correct: true }, { id: 'b', text: '' }] }] });
  return (<div>
    <div className="form-row"><Field label="Pass mark (%)"><Input type="number" value={content.passMark ?? 70} onChange={(e) => setContent({ ...content, passMark: Number(e.target.value) })} /></Field><Field label="Attempts allowed" hint="Blank = unlimited"><Input type="number" value={content.attemptsAllowed ?? ''} onChange={(e) => setContent({ ...content, attemptsAllowed: e.target.value ? Number(e.target.value) : null })} /></Field></div>
    <label className="check mb"><input type="checkbox" checked={content.showAnswers !== false} onChange={(e) => setContent({ ...content, showAnswers: e.target.checked })} /> Show correct answers after submission</label>
    {qs.map((q, i) => (<div className="card pad mb" key={q.id}><div className="row between"><strong>Question {i + 1}</strong><div className="row"><Select value={q.type} onChange={(e) => setQ(i, { type: e.target.value, options: e.target.value === 'truefalse' ? [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False' }] : q.options })} style={{ width: 150 }}><option value="single">Single choice</option><option value="multi">Multiple choice</option><option value="truefalse">True / false</option></Select><button className="btn ghost sm" onClick={() => setContent({ ...content, questions: qs.filter((_, j) => j !== i) })}><Icons.trash /></button></div></div>
      <Input className="input mt" placeholder="Question text" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} data-testid={`q-text-${i}`} />
      <div className="stack mt" style={{ gap: 6 }}>
        {q.options.map((o, k) => (
          <div className="row" key={o.id} style={{ flexWrap: 'nowrap' }}>
            <input type={q.type === 'multi' ? 'checkbox' : 'radio'} checked={!!o.correct} title="Correct answer"
              onChange={() => setQ(i, { options: q.options.map((x, l) => ({ ...x, correct: q.type === 'multi' ? (l === k ? !x.correct : x.correct) : l === k })) })} />
            <Input value={o.text} placeholder={'Option ' + (k + 1)} data-testid={'q-opt-' + i + '-' + k} style={{ flex: 1 }}
              onChange={(e) => setQ(i, { options: q.options.map((x, l) => (l === k ? { ...x, text: e.target.value } : x)) })} />
            {q.type !== 'truefalse' && (<button className="btn ghost sm" onClick={() => setQ(i, { options: q.options.filter((_, l) => l !== k) })}><Icons.x /></button>)}
          </div>
        ))}
        {q.type !== 'truefalse' && <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...q.options, { id: String.fromCharCode(97 + q.options.length), text: '' }] })}><Icons.plus />Option</Button>}</div></div>))}
    <Button variant="secondary" onClick={addQ} data-testid="add-question"><Icons.plus />Add question</Button>
  </div>);
}

function SettingsTab({ course, onSave, onDelete }) {
  const [f, setF] = useState({ title: course.title, description: course.description, category: course.category, level: course.level, duration_minutes: course.duration_minutes, pass_mark: course.pass_mark, self_enrol: !!course.self_enrol, certificate_enabled: !!course.certificate_enabled, certificate_validity_months: course.certificate_validity_months || '', thumbnail_url: course.thumbnail_url || '' });
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (<div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}><div className="card pad">
    <Field label="Title"><Input value={f.title} onChange={s('title')} /></Field><Field label="Description"><Textarea value={f.description} onChange={s('description')} /></Field>
    <div className="form-row"><Field label="Category"><Input value={f.category} onChange={s('category')} /></Field><Field label="Level"><Input value={f.level} onChange={s('level')} /></Field></div>
    <div className="form-row"><Field label="Duration (minutes)"><Input type="number" value={f.duration_minutes} onChange={s('duration_minutes')} /></Field><Field label="Pass mark (%)"><Input type="number" value={f.pass_mark} onChange={s('pass_mark')} /></Field></div>
    <Field label="Thumbnail" hint="Theme name (manual-handling, fire-safety, food-hygiene, first-aid, gdpr) or an image URL"><Input value={f.thumbnail_url} onChange={s('thumbnail_url')} /></Field>
    <label className="check mb"><input type="checkbox" checked={f.self_enrol} onChange={s('self_enrol')} /> Learners can self-enrol from the catalogue</label>
    <label className="check mb"><input type="checkbox" checked={f.certificate_enabled} onChange={s('certificate_enabled')} /> Issue a certificate on completion</label>
    <Field label="Certificate validity (months)" hint="Learners and admins are reminded 60, 30, 14 and 7 days before expiry and on the day it expires. Blank = never expires."><Input type="number" value={f.certificate_validity_months} onChange={s('certificate_validity_months')} style={{ width: 160 }} /></Field>
    <div className="row"><Button onClick={() => onSave({ ...f, duration_minutes: Number(f.duration_minutes), pass_mark: Number(f.pass_mark), certificate_validity_months: f.certificate_validity_months ? Number(f.certificate_validity_months) : null })}>Save settings</Button></div>
  </div><div className="card pad"><h3>Danger zone</h3><p className="small muted">Deleting a course removes all enrolments, progress and certificates.</p><Button variant="danger" onClick={onDelete}><Icons.trash />Delete course</Button></div></div>);
}

function LearnersTab({ courseId }) {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get(`/api/courses/${courseId}/enrollments`), [courseId]);
  const users = useAsync(() => api.get('/api/users?pageSize=500')); const groups = useAsync(() => api.get('/api/groups'));
  const [sel, setSel] = useState([]); const [grp, setGrp] = useState(''); const [due, setDue] = useState('');
  const enrol = async () => { try { const d = await api.post('/api/enrollments', { userIds: sel, groupIds: grp ? [grp] : [], courseIds: [courseId], dueAt: due ? new Date(due).toISOString() : null }); toast.success(`${d.created} enrolled (${d.existing} already enrolled)`); setSel([]); setGrp(''); reload(); } catch (e) { toast.error(e); } };
  if (loading) return <Spinner />;
  return (<div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
    <div className="card table-wrap"><table className="table"><thead><tr><th>Learner</th><th>Status</th><th>Progress</th><th>Score</th><th>Enrolled</th><th>Due</th><th>Completed</th><th></th></tr></thead><tbody>
      {data.enrollments.map((e) => <tr key={e.id}><td className="strong">{e.first_name} {e.last_name}<div className="tiny muted">{e.email}</div></td><td><StatusBadge status={e.status} /></td><td>{e.progress_pct}%</td><td>{e.score ?? '—'}</td><td className="small">{fmtDate(e.enrolled_at)}</td><td className="small">{fmtDate(e.due_at)}</td><td className="small">{fmtDate(e.completed_at)}</td><td className="actions">{e.status !== 'completed' && <Button size="sm" variant="secondary" onClick={() => api.put(`/api/enrollments/${e.id}`, { status: 'completed' }).then(reload)}>Mark complete</Button>}<button className="btn ghost sm" onClick={() => confirm('Remove enrolment?') && api.del(`/api/enrollments/${e.id}`).then(reload)}><Icons.x /></button></td></tr>)}
      {data.enrollments.length === 0 && <tr><td colSpan="8"><Empty title="No learners enrolled" /></td></tr>}</tbody></table></div>
    <div className="card pad"><h3>Enrol learners</h3>
      <Field label="Group"><Select value={grp} onChange={(e) => setGrp(e.target.value)}><option value="">— choose a group —</option>{(groups.data?.groups || []).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}</Select></Field>
      <Field label="Individuals"><select multiple className="select" style={{ height: 180 }} value={sel} onChange={(e) => setSel([...e.target.selectedOptions].map((o) => o.value))}>{(users.data?.users || []).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.email}</option>)}</select></Field>
      <Field label="Due date (optional)"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <Button onClick={enrol} disabled={!sel.length && !grp} data-testid="enrol-submit"><Icons.plus />Enrol</Button></div>
  </div>);
}
