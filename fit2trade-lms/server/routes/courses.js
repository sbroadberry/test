import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { all, get, run, uid, now, audit, tx } from '../db.js';
import { authenticate, requireRole, isStaff } from '../auth.js';
import { config } from '../config.js';
import { parseManifest } from '../scorm/manifest.js';
import { enrolUser } from '../services/progress.js';

export const router = Router();
router.use(authenticate);

const MODULE_TYPES = ['scorm', 'video', 'document', 'page', 'quiz', 'live', 'survey', 'link'];
const upload = multer({ dest: config.uploadsDir, limits: { fileSize: 1024 * 1024 * 1024 } });

const parseJson = (s, fb = {}) => { try { return JSON.parse(s || '{}'); } catch { return fb; } };

export function courseWithModules(id, { includeAnswers = false } = {}) {
  const course = get('SELECT * FROM courses WHERE id = ?', id);
  if (!course) return null;
  const modules = all('SELECT * FROM modules WHERE course_id = ? ORDER BY position', id).map((m) => {
    const content = parseJson(m.content_json);
    if (m.type === 'quiz' && !includeAnswers) content.questions = (content.questions || []).map((q) => ({ ...q, options: (q.options || []).map(({ correct, ...o }) => o) }));
    const pkg = m.type === 'scorm' ? get('SELECT id, version, title, launch_path, mastery_score, original_filename, created_at FROM scorm_packages WHERE module_id = ?', m.id) : null;
    const session = m.type === 'live' ? all('SELECT * FROM live_sessions WHERE module_id = ? ORDER BY starts_at', m.id) : undefined;
    return { ...m, content, package: pkg, sessions: session };
  });
  return { ...course, modules };
}

/** Catalogue for learners: published courses (+ enrolment state). Staff see everything. */
router.get('/', (req, res) => {
  const staff = isStaff(req.user);
  const { q = '', category = '', status = '' } = req.query;
  const where = [staff ? '1=1' : "c.status = 'published' AND (c.company_id IS NULL OR c.company_id = ?)"]; const params = staff ? [] : [req.user.company_id || ''];
  if (q) { where.push('(c.title LIKE ? OR c.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push('c.category = ?'); params.push(category); }
  if (status && staff) { where.push('c.status = ?'); params.push(status); }
  const rows = all(`SELECT c.*, (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status = 'completed') AS completed_count,
      (SELECT e.id FROM enrollments e WHERE e.course_id = c.id AND e.user_id = ?) AS my_enrollment_id,
      (SELECT e.status FROM enrollments e WHERE e.course_id = c.id AND e.user_id = ?) AS my_status,
      (SELECT e.progress_pct FROM enrollments e WHERE e.course_id = c.id AND e.user_id = ?) AS my_progress
    FROM courses c WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC`, req.user.id, req.user.id, req.user.id, ...params);
  const companies = staff ? all('SELECT id, name FROM companies ORDER BY name') : [];
  const categories = all("SELECT DISTINCT category FROM courses WHERE status = 'published' ORDER BY category").map((r) => r.category);
  res.json({ courses: rows, categories, companies });
});

router.get('/:id', (req, res) => {
  const course = courseWithModules(req.params.id, { includeAnswers: isStaff(req.user) });
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (!isStaff(req.user) && (course.status !== 'published' || (course.company_id && course.company_id !== req.user.company_id))) return res.status(404).json({ error: 'Course not found' });
  const enrollment = get('SELECT * FROM enrollments WHERE course_id = ? AND user_id = ?', course.id, req.user.id);
  const stats = get(`SELECT COUNT(*) AS enrolled, SUM(status = 'completed') AS completed, AVG(score) AS avg_score FROM enrollments WHERE course_id = ?`, course.id);
  res.json({ course, enrollment, stats });
});

router.post('/', requireRole('instructor'), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'title is required' });
  const id = uid(); const ts = now();
  run(`INSERT INTO courses(id, title, description, category, thumbnail_url, status, self_enrol, duration_minutes, pass_mark, certificate_enabled, certificate_validity_months, level, created_by, created_at, updated_at, company_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, b.title, b.description || '', b.category || 'General', b.thumbnail_url || '', b.status || 'draft', b.self_enrol ? 1 : 0,
    b.duration_minutes ?? 30, b.pass_mark ?? 70, b.certificate_enabled === false ? 0 : 1, b.certificate_validity_months || null, b.level || 'All levels', req.user.id, ts, ts, b.company_id || null);
  audit(req.user.id, 'course.create', 'course', id);
  res.status(201).json({ course: courseWithModules(id, { includeAnswers: true }) });
});

router.put('/:id', requireRole('instructor'), (req, res) => {
  const b = req.body || {};
  if (!get('SELECT 1 FROM courses WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'Course not found' });
  run(`UPDATE courses SET title = COALESCE(?, title), description = COALESCE(?, description), category = COALESCE(?, category), thumbnail_url = COALESCE(?, thumbnail_url), status = COALESCE(?, status),
       self_enrol = COALESCE(?, self_enrol), duration_minutes = COALESCE(?, duration_minutes), pass_mark = COALESCE(?, pass_mark), certificate_enabled = COALESCE(?, certificate_enabled),
       certificate_validity_months = ?, level = COALESCE(?, level), updated_at = ?, company_id = CASE WHEN ? THEN ? ELSE company_id END WHERE id = ?`,
    b.title, b.description, b.category, b.thumbnail_url, b.status, b.self_enrol == null ? null : (b.self_enrol ? 1 : 0), b.duration_minutes, b.pass_mark,
    b.certificate_enabled == null ? null : (b.certificate_enabled ? 1 : 0), b.certificate_validity_months === undefined ? get('SELECT certificate_validity_months v FROM courses WHERE id = ?', req.params.id).v : (b.certificate_validity_months || null), b.level, now(), b.company_id !== undefined ? 1 : 0, b.company_id || null, req.params.id);
  audit(req.user.id, 'course.update', 'course', req.params.id);
  res.json({ course: courseWithModules(req.params.id, { includeAnswers: true }) });
});

router.post('/:id/duplicate', requireRole('instructor'), (req, res) => {
  const src = courseWithModules(req.params.id, { includeAnswers: true });
  if (!src) return res.status(404).json({ error: 'Course not found' });
  const id = uid(); const ts = now();
  tx(() => {
    run(`INSERT INTO courses(id, title, description, category, thumbnail_url, status, self_enrol, duration_minutes, pass_mark, certificate_enabled, certificate_validity_months, level, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, `${src.title} (copy)`, src.description, src.category, src.thumbnail_url, 'draft', src.self_enrol, src.duration_minutes, src.pass_mark, src.certificate_enabled, src.certificate_validity_months, src.level, req.user.id, ts, ts);
    for (const m of src.modules) {
      const mid = uid();
      run('INSERT INTO modules(id, course_id, title, type, position, required, content_json, created_at) VALUES (?,?,?,?,?,?,?,?)', mid, id, m.title, m.type, m.position, m.required, JSON.stringify(m.content), ts);
      if (m.type === 'scorm' && m.package) { const p = get('SELECT * FROM scorm_packages WHERE module_id = ?', m.id); run('INSERT INTO scorm_packages(id, module_id, version, identifier, title, launch_path, mastery_score, manifest_json, original_filename, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', p.id + '-' + mid.slice(0, 4), mid, p.version, p.identifier, p.title, p.launch_path, p.mastery_score, p.manifest_json, p.original_filename, ts);
        fs.cpSync(path.join(config.scormDir, p.id), path.join(config.scormDir, p.id + '-' + mid.slice(0, 4)), { recursive: true }); }
    }
  })();
  res.status(201).json({ course: courseWithModules(id, { includeAnswers: true }) });
});

router.delete('/:id', requireRole('manager'), (req, res) => {
  for (const p of all('SELECT id FROM scorm_packages WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?)', req.params.id)) fs.rmSync(path.join(config.scormDir, p.id), { recursive: true, force: true });
  run('DELETE FROM courses WHERE id = ?', req.params.id);
  audit(req.user.id, 'course.delete', 'course', req.params.id);
  res.json({ ok: true });
});

/** Self-enrol (catalogue) */
router.post('/:id/enrol', (req, res) => {
  const course = get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course || course.status !== 'published') return res.status(404).json({ error: 'Course not found' });
  if (!course.self_enrol && !isStaff(req.user)) return res.status(403).json({ error: 'This course requires an administrator to enrol you' });
  const { enrollment } = enrolUser(req.user.id, course.id, { source: 'self' });
  res.status(201).json({ enrollment });
});

// ---------------- Modules ----------------
router.post('/:id/modules', requireRole('instructor'), (req, res) => {
  const b = req.body || {};
  if (!get('SELECT 1 FROM courses WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'Course not found' });
  if (!MODULE_TYPES.includes(b.type)) return res.status(400).json({ error: `type must be one of ${MODULE_TYPES.join(', ')}` });
  const id = uid();
  const pos = (get('SELECT MAX(position) AS p FROM modules WHERE course_id = ?', req.params.id).p ?? -1) + 1;
  run('INSERT INTO modules(id, course_id, title, type, position, required, content_json, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, req.params.id, b.title || defaultTitle(b.type), b.type, pos, b.required === false ? 0 : 1, JSON.stringify(b.content || {}), now());
  run('UPDATE courses SET updated_at = ? WHERE id = ?', now(), req.params.id);
  res.status(201).json({ module: get('SELECT * FROM modules WHERE id = ?', id), course: courseWithModules(req.params.id, { includeAnswers: true }) });
});

router.put('/:id/modules/:moduleId', requireRole('instructor'), (req, res) => {
  const b = req.body || {};
  const m = get('SELECT * FROM modules WHERE id = ? AND course_id = ?', req.params.moduleId, req.params.id);
  if (!m) return res.status(404).json({ error: 'Module not found' });
  run('UPDATE modules SET title = COALESCE(?, title), required = COALESCE(?, required), content_json = COALESCE(?, content_json) WHERE id = ?',
    b.title, b.required == null ? null : (b.required ? 1 : 0), b.content ? JSON.stringify(b.content) : null, m.id);
  res.json({ course: courseWithModules(req.params.id, { includeAnswers: true }) });
});

router.put('/:id/modules-order', requireRole('instructor'), (req, res) => {
  const order = req.body?.order || [];
  tx(() => order.forEach((mid, i) => run('UPDATE modules SET position = ? WHERE id = ? AND course_id = ?', i, mid, req.params.id)))();
  res.json({ course: courseWithModules(req.params.id, { includeAnswers: true }) });
});

router.delete('/:id/modules/:moduleId', requireRole('instructor'), (req, res) => {
  for (const p of all('SELECT id FROM scorm_packages WHERE module_id = ?', req.params.moduleId)) fs.rmSync(path.join(config.scormDir, p.id), { recursive: true, force: true });
  run('DELETE FROM modules WHERE id = ? AND course_id = ?', req.params.moduleId, req.params.id);
  res.json({ course: courseWithModules(req.params.id, { includeAnswers: true }) });
});

/** Upload a SCORM zip for a module (creates the module if moduleId is "new"). */
router.post('/:id/modules/:moduleId/scorm', requireRole('instructor'), upload.single('package'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload a .zip SCORM package in the "package" field' });
  try {
    const zip = new AdmZip(file.path);
    const entries = zip.getEntries();
    const manifestEntry = entries.find((e) => /(^|\/)imsmanifest\.xml$/i.test(e.entryName));
    if (!manifestEntry) throw new Error('imsmanifest.xml not found in the zip. Export the course as a SCORM 1.2 or SCORM 2004 package.');
    const prefix = manifestEntry.entryName.replace(/imsmanifest\.xml$/i, '');
    const manifest = parseManifest(manifestEntry.getData().toString('utf8'));
    let moduleId = req.params.moduleId;
    const ts = now();
    const pkgId = uid();
    const dest = path.join(config.scormDir, pkgId);
    fs.mkdirSync(dest, { recursive: true });
    for (const e of entries) {
      if (e.isDirectory || !e.entryName.startsWith(prefix)) continue;
      const rel = e.entryName.slice(prefix.length);
      const target = path.resolve(dest, rel);
      if (!target.startsWith(dest + path.sep)) continue; // zip-slip guard
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.getData());
    }
    tx(() => {
      if (moduleId === 'new') {
        moduleId = uid();
        const pos = (get('SELECT MAX(position) AS p FROM modules WHERE course_id = ?', req.params.id).p ?? -1) + 1;
        run('INSERT INTO modules(id, course_id, title, type, position, required, content_json, created_at) VALUES (?,?,?,?,?,1,?,?)', moduleId, req.params.id, req.body?.title || manifest.title, 'scorm', pos, '{}', ts);
      } else {
        const m = get('SELECT * FROM modules WHERE id = ? AND course_id = ?', moduleId, req.params.id);
        if (!m) throw new Error('Module not found');
        for (const p of all('SELECT id FROM scorm_packages WHERE module_id = ?', moduleId)) { fs.rmSync(path.join(config.scormDir, p.id), { recursive: true, force: true }); run('DELETE FROM scorm_packages WHERE id = ?', p.id); }
        run("UPDATE modules SET type = 'scorm', title = COALESCE(?, title) WHERE id = ?", req.body?.title || null, moduleId);
      }
      run('INSERT INTO scorm_packages(id, module_id, version, identifier, title, launch_path, mastery_score, manifest_json, original_filename, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        pkgId, moduleId, manifest.version, manifest.identifier, manifest.title, manifest.launchPath, manifest.masteryScore, JSON.stringify(manifest), file.originalname, ts);
      run('UPDATE courses SET updated_at = ? WHERE id = ?', ts, req.params.id);
    })();
    audit(req.user.id, 'scorm.upload', 'module', moduleId, { version: manifest.version, launchPath: manifest.launchPath });
    res.status(201).json({ moduleId, package: { id: pkgId, version: manifest.version, title: manifest.title, launchPath: manifest.launchPath, items: manifest.items.filter((i) => i.href).length }, course: courseWithModules(req.params.id, { includeAnswers: true }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    fs.rm(file.path, { force: true }, () => {});
  }
});

/** Upload a file asset (PDF / video / image) for a module. Returns a URL to use in module content. */
router.post('/:id/assets', requireRole('instructor'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const name = `${uid()}${ext}`;
  fs.renameSync(req.file.path, path.join(config.uploadsDir, name));
  res.status(201).json({ url: `/uploads/${name}`, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
});

/** Enrolment management for a course */
router.get('/:id/enrollments', requireRole('instructor'), (req, res) => {
  res.json({ enrollments: all(`SELECT e.*, u.email, u.first_name, u.last_name, u.department FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.course_id = ? ORDER BY e.enrolled_at DESC`, req.params.id) });
});

function defaultTitle(type) { return { scorm: 'SCORM package', video: 'Video', document: 'Document', page: 'Page', quiz: 'Assessment', live: 'Live session', survey: 'Survey', link: 'Web link' }[type] || 'Module'; }
