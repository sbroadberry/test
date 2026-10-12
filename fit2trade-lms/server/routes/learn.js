/** Learner-facing endpoints: my learning, module completion, quizzes, dashboard. */
import { Router } from 'express';
import { all, get, run, uid, now, audit, tx } from '../db.js';
import { authenticate, requireRole, isStaff } from '../auth.js';
import { updateModuleProgress, gradeQuiz, enrolUser, recomputeEnrollment, getOrCreateModuleProgress } from '../services/progress.js';
import { courseWithModules } from './courses.js';

export const router = Router();
router.use(authenticate);

function myEnrollment(req, res) {
  const e = get('SELECT * FROM enrollments WHERE id = ?', req.params.enrollmentId);
  if (!e) { res.status(404).json({ error: 'Enrolment not found' }); return null; }
  if (e.user_id !== req.user.id && !isStaff(req.user)) { res.status(403).json({ error: 'Not your enrolment' }); return null; }
  return e;
}

router.get('/dashboard', (req, res) => {
  const uid_ = req.user.id;
  const enrollments = all(`SELECT e.*, c.title, c.category, c.thumbnail_url, c.duration_minutes, (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count
    FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY CASE e.status WHEN 'in_progress' THEN 0 WHEN 'enrolled' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END, e.due_at IS NULL, e.due_at, e.enrolled_at DESC`, uid_);
  const stats = {
    enrolled: enrollments.length, inProgress: enrollments.filter((e) => e.status === 'in_progress').length, completed: enrollments.filter((e) => e.status === 'completed').length,
    overdue: enrollments.filter((e) => e.due_at && e.status !== 'completed' && new Date(e.due_at) < new Date()).length,
    certificates: get('SELECT COUNT(*) AS n FROM certificates WHERE user_id = ?', uid_).n,
    expiringSoon: get("SELECT COUNT(*) AS n FROM certificates WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now', '+60 days')", uid_).n,
    timeSpentSec: get('SELECT COALESCE(SUM(mp.time_spent_sec),0) AS n FROM module_progress mp JOIN enrollments e ON e.id = mp.enrollment_id WHERE e.user_id = ?', uid_).n,
  };
  const sessions = all(`SELECT s.*, r.status AS registration_status, c.title AS course_title FROM session_registrations r JOIN live_sessions s ON s.id = r.session_id LEFT JOIN courses c ON c.id = s.course_id
    WHERE r.user_id = ? AND s.ends_at >= datetime('now', '-1 day') AND r.status != 'cancelled' ORDER BY s.starts_at LIMIT 5`, uid_);
  const paths = all(`SELECT p.*, (SELECT COUNT(*) FROM learning_path_courses lpc WHERE lpc.path_id = p.id) AS course_count,
    (SELECT COUNT(*) FROM learning_path_courses lpc JOIN enrollments e ON e.course_id = lpc.course_id AND e.user_id = ? WHERE lpc.path_id = p.id AND e.status = 'completed') AS completed_count
    FROM learning_paths p JOIN path_enrollments pe ON pe.path_id = p.id WHERE pe.user_id = ?`, uid_, uid_);
  const notifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 8', uid_);
  res.json({ enrollments, stats, sessions, paths, notifications });
});

router.get('/enrollments/:enrollmentId', (req, res) => {
  const e = myEnrollment(req, res); if (!e) return;
  const course = courseWithModules(e.course_id);
  const progress = all('SELECT * FROM module_progress WHERE enrollment_id = ?', e.id);
  const byModule = Object.fromEntries(progress.map((p) => [p.module_id, { ...p, data: safe(p.data_json) }]));
  const registrations = all('SELECT * FROM session_registrations WHERE user_id = ?', e.user_id);
  const certificate = get('SELECT * FROM certificates WHERE enrollment_id = ?', e.id);
  course.modules = course.modules.map((m) => ({ ...m, progress: byModule[m.id] || { status: 'not_started', score: null, time_spent_sec: 0, attempts: 0, data: {} },
    sessions: m.sessions?.map((s) => ({ ...s, registered: registrations.some((r) => r.session_id === s.id && r.status !== 'cancelled'), attended: registrations.some((r) => r.session_id === s.id && r.status === 'attended') })) }));
  res.json({ enrollment: e, course, certificate });
});

/** Mark simple module types (page, video, document, link) complete, or record partial progress. */
router.post('/enrollments/:enrollmentId/modules/:moduleId/progress', (req, res) => {
  const e = myEnrollment(req, res); if (!e) return;
  const m = get('SELECT * FROM modules WHERE id = ? AND course_id = ?', req.params.moduleId, e.course_id);
  if (!m) return res.status(404).json({ error: 'Module not found' });
  const { status, timeSpentSec = 0, data } = req.body || {};
  if (m.type === 'quiz') return res.status(400).json({ error: 'Submit quiz answers via /quiz instead' });
  if (m.type === 'scorm') return res.status(400).json({ error: 'SCORM progress is tracked by the player' });
  if (m.type === 'live') return res.status(400).json({ error: 'Live session attendance is recorded by the instructor' });
  const allowed = ['in_progress', 'completed'];
  const enrollment = updateModuleProgress(e.id, m.id, { status: allowed.includes(status) ? status : undefined, timeSpentSec: Number(timeSpentSec) || 0, data });
  res.json({ enrollment, module: get('SELECT * FROM module_progress WHERE enrollment_id = ? AND module_id = ?', e.id, m.id) });
});

router.post('/enrollments/:enrollmentId/modules/:moduleId/quiz', (req, res) => {
  const e = myEnrollment(req, res); if (!e) return;
  const m = get('SELECT * FROM modules WHERE id = ? AND course_id = ?', req.params.moduleId, e.course_id);
  if (!m || m.type !== 'quiz') return res.status(404).json({ error: 'Quiz not found' });
  const quiz = safe(m.content_json);
  const mp = getOrCreateModuleProgress(e.id, m.id);
  if (quiz.attemptsAllowed && mp.attempts >= quiz.attemptsAllowed && mp.status !== 'completed') return res.status(400).json({ error: 'No attempts remaining' });
  const result = gradeQuiz(quiz, req.body?.answers || {});
  const data = { ...safe(mp.data_json), lastResult: result, submittedAt: now() };
  const best = Math.max(result.score, mp.score ?? 0);
  const status = result.passed || mp.status === 'completed' ? 'completed' : 'failed';
  const enrollment = updateModuleProgress(e.id, m.id, { status, score: best, attemptsInc: 1, data, timeSpentSec: Number(req.body?.timeSpentSec) || 0 });
  audit(req.user.id, 'quiz.submit', 'module', m.id, { score: result.score, passed: result.passed });
  res.json({ result: quiz.showAnswers === false ? { ...result, results: undefined } : result, enrollment, attemptsLeft: quiz.attemptsAllowed ? Math.max(0, quiz.attemptsAllowed - mp.attempts - 1) : null });
});

router.post('/enrollments/:enrollmentId/restart', (req, res) => {
  const e = myEnrollment(req, res); if (!e) return;
  if (e.status !== 'completed' && e.status !== 'failed' && !isStaff(req.user)) return res.status(400).json({ error: 'Course is still in progress' });
  tx(() => {
    run('DELETE FROM module_progress WHERE enrollment_id = ?', e.id);
    run("UPDATE enrollments SET status = 'enrolled', progress_pct = 0, score = NULL, started_at = NULL, completed_at = NULL, expires_at = NULL WHERE id = ?", e.id);
    run('DELETE FROM certificates WHERE enrollment_id = ?', e.id);
  })();
  res.json({ enrollment: get('SELECT * FROM enrollments WHERE id = ?', e.id) });
});

/** Re-enrol for a renewal: keeps history by archiving the old enrolment's completion into the audit log. */
router.post('/courses/:courseId/renew', (req, res) => {
  const e = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', req.user.id, req.params.courseId);
  if (!e) { const r = enrolUser(req.user.id, req.params.courseId, { source: 'self' }); return res.json({ enrollment: r.enrollment }); }
  audit(req.user.id, 'enrollment.renew', 'enrollment', e.id, { previousCompletedAt: e.completed_at, previousScore: e.score });
  tx(() => {
    run('DELETE FROM module_progress WHERE enrollment_id = ?', e.id);
    run("UPDATE enrollments SET status = 'enrolled', progress_pct = 0, score = NULL, started_at = NULL, completed_at = NULL, expires_at = NULL, enrolled_at = ? WHERE id = ?", now(), e.id);
  })();
  res.json({ enrollment: get('SELECT * FROM enrollments WHERE id = ?', e.id) });
});

// ------------- Admin enrolment management -------------
export const enrollmentsRouter = Router();
enrollmentsRouter.use(authenticate, requireRole('instructor'));
enrollmentsRouter.get('/', (req, res) => {
  const { courseId = '', userId = '', status = '', group = '', q = '', page = 1, pageSize = 50 } = req.query;
  const where = ['1=1']; const params = [];
  if (courseId) { where.push('e.course_id = ?'); params.push(courseId); }
  if (userId) { where.push('e.user_id = ?'); params.push(userId); }
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (group) { where.push('e.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)'); params.push(group); }
  if (q) { where.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR c.title LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const total = get(`SELECT COUNT(*) AS n FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id WHERE ${where.join(' AND ')}`, ...params).n;
  const rows = all(`SELECT e.*, u.email, u.first_name, u.last_name, u.department, c.title AS course_title, c.category FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
    WHERE ${where.join(' AND ')} ORDER BY e.enrolled_at DESC LIMIT ? OFFSET ?`, ...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
  res.json({ total, enrollments: rows });
});
enrollmentsRouter.post('/', (req, res) => {
  const { userIds = [], groupIds = [], courseIds = [], dueAt = null } = req.body || {};
  const users = new Set(userIds);
  for (const g of groupIds) for (const m of all('SELECT user_id FROM group_members WHERE group_id = ?', g)) users.add(m.user_id);
  let created = 0, existing = 0;
  for (const u of users) for (const c of courseIds) { const r = enrolUser(u, c, { source: 'manual', dueAt, actorId: req.user.id }); r.created ? created++ : existing++; }
  audit(req.user.id, 'enrollment.bulk', 'enrollment', null, { created, existing });
  res.status(201).json({ created, existing });
});
enrollmentsRouter.put('/:id', (req, res) => {
  const e = get('SELECT * FROM enrollments WHERE id = ?', req.params.id);
  if (!e) return res.status(404).json({ error: 'Enrolment not found' });
  const { dueAt, status, score, expiresAt } = req.body || {};
  if (dueAt !== undefined) run('UPDATE enrollments SET due_at = ? WHERE id = ?', dueAt, e.id);
  if (expiresAt !== undefined) run('UPDATE enrollments SET expires_at = ? WHERE id = ?', expiresAt, e.id);
  if (status === 'completed' && e.status !== 'completed') {
    // manual completion by an admin/instructor (e.g. classroom course)
    run("UPDATE enrollments SET status = 'completed', progress_pct = 100, score = COALESCE(?, score), completed_at = ? WHERE id = ?", score, now(), e.id);
    for (const m of all('SELECT id FROM modules WHERE course_id = ?', e.course_id)) updateModuleProgress(e.id, m.id, { status: 'completed' });
    recomputeEnrollment(e.id);
    audit(req.user.id, 'enrollment.manual_complete', 'enrollment', e.id);
  } else if (status === 'reset') {
    run('DELETE FROM module_progress WHERE enrollment_id = ?', e.id);
    run("UPDATE enrollments SET status = 'enrolled', progress_pct = 0, score = NULL, started_at = NULL, completed_at = NULL, expires_at = NULL WHERE id = ?", e.id);
    run('DELETE FROM certificates WHERE enrollment_id = ?', e.id);
  }
  res.json({ enrollment: get('SELECT * FROM enrollments WHERE id = ?', e.id) });
});
enrollmentsRouter.delete('/:id', requireRole('manager'), (req, res) => { run('DELETE FROM enrollments WHERE id = ?', req.params.id); res.json({ ok: true }); });

function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
