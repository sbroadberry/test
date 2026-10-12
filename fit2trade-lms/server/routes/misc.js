/** Learning paths, reports, certificates, notifications, settings, admin jobs. */
import { Router } from 'express';
import { all, get, run, uid, now, audit, tx, getSetting, setSetting } from '../db.js';
import { authenticate, requireRole, isStaff, publicUser } from '../auth.js';
import { enrolUser } from '../services/progress.js';
import { renderCertificate } from '../services/certificates.js';
import { runAllReminderJobs, runCertificateExpiryCheck, DEFAULT_WINDOWS } from '../services/reminders.js';
import { outbox, outboxItem, isMailConfigured, sendMail, layout } from '../services/mailer.js';
import { listProviders } from '../integrations/index.js';
import { providers as ssoProviders, isConfigured as ssoConfigured, redirectUri } from '../services/sso.js';
const ssoStatus = () => Object.values(ssoProviders).map((p) => ({ id: p.id, label: p.label, configured: ssoConfigured(p.id), redirectUri: redirectUri(p.id), detail: ssoConfigured(p.id) ? `Client ID ${p.clientId.slice(0, 12)}…` : (p.id === 'google' ? 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' : 'Set MS_SSO_CLIENT_ID, MS_SSO_CLIENT_SECRET (and MS_SSO_TENANT)') }));
import { config } from '../config.js';

// ---------------- Learning paths ----------------
export const pathsRouter = Router();
pathsRouter.use(authenticate);
pathsRouter.get('/', (req, res) => {
  const rows = all(`SELECT p.*, (SELECT COUNT(*) FROM learning_path_courses lpc WHERE lpc.path_id = p.id) AS course_count, (SELECT COUNT(*) FROM path_enrollments pe WHERE pe.path_id = p.id) AS learner_count,
     (SELECT 1 FROM path_enrollments pe WHERE pe.path_id = p.id AND pe.user_id = ?) AS enrolled FROM learning_paths p ${isStaff(req.user) ? '' : "WHERE p.status = 'published'"} ORDER BY p.title`, req.user.id);
  res.json({ paths: rows });
});
pathsRouter.get('/:id', (req, res) => {
  const p = get('SELECT * FROM learning_paths WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Path not found' });
  const courses = all(`SELECT c.id, c.title, c.category, c.duration_minutes, c.thumbnail_url, lpc.position, e.id AS enrollment_id, e.status AS my_status, e.progress_pct AS my_progress
     FROM learning_path_courses lpc JOIN courses c ON c.id = lpc.course_id LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = ? WHERE lpc.path_id = ? ORDER BY lpc.position`, req.user.id, p.id);
  const learners = isStaff(req.user) ? all('SELECT u.id, u.email, u.first_name, u.last_name, pe.enrolled_at FROM path_enrollments pe JOIN users u ON u.id = pe.user_id WHERE pe.path_id = ?', p.id) : undefined;
  res.json({ path: p, courses, learners });
});
pathsRouter.post('/', requireRole('instructor'), (req, res) => {
  const { title, description = '', status = 'draft', courseIds = [] } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = uid();
  tx(() => { run('INSERT INTO learning_paths(id, title, description, status, created_at) VALUES (?,?,?,?,?)', id, title, description, status, now()); courseIds.forEach((c, i) => run('INSERT INTO learning_path_courses(path_id, course_id, position) VALUES (?,?,?)', id, c, i)); })();
  res.status(201).json({ path: get('SELECT * FROM learning_paths WHERE id = ?', id) });
});
pathsRouter.put('/:id', requireRole('instructor'), (req, res) => {
  const { title, description, status, courseIds } = req.body || {};
  tx(() => {
    run('UPDATE learning_paths SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?', title, description, status, req.params.id);
    if (Array.isArray(courseIds)) { run('DELETE FROM learning_path_courses WHERE path_id = ?', req.params.id); courseIds.forEach((c, i) => run('INSERT INTO learning_path_courses(path_id, course_id, position) VALUES (?,?,?)', req.params.id, c, i)); }
  })();
  res.json({ path: get('SELECT * FROM learning_paths WHERE id = ?', req.params.id) });
});
pathsRouter.delete('/:id', requireRole('manager'), (req, res) => { run('DELETE FROM learning_paths WHERE id = ?', req.params.id); res.json({ ok: true }); });
pathsRouter.post('/:id/enrol', (req, res) => {
  const p = get('SELECT * FROM learning_paths WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Path not found' });
  const userIds = isStaff(req.user) && req.body?.userIds?.length ? req.body.userIds : [req.user.id];
  let created = 0;
  for (const u of userIds) {
    run('INSERT OR IGNORE INTO path_enrollments(id, path_id, user_id, enrolled_at) VALUES (?,?,?,?)', uid(), p.id, u, now());
    for (const c of all('SELECT course_id FROM learning_path_courses WHERE path_id = ?', p.id)) { if (enrolUser(u, c.course_id, { source: 'path' }).created) created += 1; }
  }
  res.status(201).json({ ok: true, created });
});

// ---------------- Reports ----------------
export const reportsRouter = Router();
reportsRouter.use(authenticate, requireRole('instructor'));
reportsRouter.get('/overview', (req, res) => {
  const totals = {
    users: get("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").n,
    courses: get("SELECT COUNT(*) AS n FROM courses WHERE status = 'published'").n,
    enrollments: get('SELECT COUNT(*) AS n FROM enrollments').n,
    completions: get("SELECT COUNT(*) AS n FROM enrollments WHERE status = 'completed'").n,
    inProgress: get("SELECT COUNT(*) AS n FROM enrollments WHERE status = 'in_progress'").n,
    overdue: get("SELECT COUNT(*) AS n FROM enrollments WHERE due_at < datetime('now') AND status != 'completed'").n,
    certificates: get('SELECT COUNT(*) AS n FROM certificates').n,
    expiringSoon: get("SELECT COUNT(*) AS n FROM certificates WHERE expires_at IS NOT NULL AND expires_at BETWEEN datetime('now') AND datetime('now', '+60 days')").n,
    expired: get("SELECT COUNT(*) AS n FROM certificates WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").n,
    upcomingSessions: get("SELECT COUNT(*) AS n FROM live_sessions WHERE starts_at > datetime('now') AND status = 'scheduled'").n,
    avgScore: Math.round(get('SELECT AVG(score) AS n FROM enrollments WHERE score IS NOT NULL').n || 0),
  };
  totals.completionRate = totals.enrollments ? Math.round((totals.completions / totals.enrollments) * 100) : 0;
  const byCourse = all(`SELECT c.id, c.title, c.category, COUNT(e.id) AS enrolled, SUM(e.status = 'completed') AS completed, SUM(e.status = 'in_progress') AS in_progress, SUM(e.status = 'failed') AS failed, ROUND(AVG(e.score)) AS avg_score
    FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id GROUP BY c.id ORDER BY enrolled DESC LIMIT 12`);
  const byDepartment = all(`SELECT COALESCE(NULLIF(u.department, ''), 'Unassigned') AS department, COUNT(e.id) AS enrolled, COALESCE(SUM(e.status = 'completed'), 0) AS completed FROM users u LEFT JOIN enrollments e ON e.user_id = u.id GROUP BY department ORDER BY enrolled DESC LIMIT 10`);
  const completionsByMonth = all(`SELECT substr(completed_at, 1, 7) AS month, COUNT(*) AS n FROM enrollments WHERE completed_at IS NOT NULL AND completed_at >= date('now', '-11 months', 'start of month') GROUP BY month ORDER BY month`);
  const recent = all(`SELECT e.completed_at, u.first_name, u.last_name, c.title FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id WHERE e.status = 'completed' ORDER BY e.completed_at DESC LIMIT 8`);
  res.json({ totals, byCourse, byDepartment, completionsByMonth, recent });
});
reportsRouter.get('/expiry', (req, res) => {
  const days = Number(req.query.days || 90);
  const rows = all(`SELECT ce.id, ce.code, ce.issued_at, ce.expires_at, u.id AS user_id, u.email, u.first_name, u.last_name, u.department, c.id AS course_id, c.title AS course_title,
     CAST((julianday(ce.expires_at) - julianday('now')) AS INTEGER) AS days_left
     FROM certificates ce JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id WHERE ce.expires_at IS NOT NULL AND ce.expires_at <= datetime('now', '+' || ? || ' days') ORDER BY ce.expires_at`, days);
  res.json({ certificates: rows, reminders: all('SELECT * FROM reminders_sent ORDER BY sent_at DESC LIMIT 200') });
});
reportsRouter.get('/export.csv', (req, res) => {
  const { type = 'enrollments', courseId = '', group = '' } = req.query;
  let rows, headers;
  if (type === 'users') {
    rows = all(`SELECT u.email, u.first_name, u.last_name, u.role, u.status, u.department, u.job_title, u.created_at, u.last_login_at, (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollments, (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.status='completed') AS completions FROM users u ORDER BY u.last_name`);
    headers = ['email', 'first_name', 'last_name', 'role', 'status', 'department', 'job_title', 'created_at', 'last_login_at', 'enrollments', 'completions'];
  } else if (type === 'certificates') {
    rows = all(`SELECT ce.code, u.email, u.first_name, u.last_name, u.department, c.title AS course, ce.issued_at, ce.expires_at FROM certificates ce JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id ORDER BY ce.issued_at DESC`);
    headers = ['code', 'email', 'first_name', 'last_name', 'department', 'course', 'issued_at', 'expires_at'];
  } else if (type === 'sessions') {
    rows = all(`SELECT s.title, s.provider, s.starts_at, s.ends_at, u.email, u.first_name, u.last_name, r.status, r.attended_minutes FROM session_registrations r JOIN live_sessions s ON s.id = r.session_id JOIN users u ON u.id = r.user_id ORDER BY s.starts_at DESC`);
    headers = ['title', 'provider', 'starts_at', 'ends_at', 'email', 'first_name', 'last_name', 'status', 'attended_minutes'];
  } else {
    const where = ['1=1']; const params = [];
    if (courseId) { where.push('e.course_id = ?'); params.push(courseId); }
    if (group) { where.push('e.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)'); params.push(group); }
    rows = all(`SELECT u.email, u.first_name, u.last_name, u.department, c.title AS course, c.category, e.status, e.progress_pct, e.score, e.enrolled_at, e.started_at, e.completed_at, e.due_at, e.expires_at, e.source FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id WHERE ${where.join(' AND ')} ORDER BY e.enrolled_at DESC`, ...params);
    headers = ['email', 'first_name', 'last_name', 'department', 'course', 'category', 'status', 'progress_pct', 'score', 'enrolled_at', 'started_at', 'completed_at', 'due_at', 'expires_at', 'source'];
  }
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fit2trade-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});
reportsRouter.get('/audit', requireRole('manager'), (req, res) => res.json({ entries: all('SELECT a.*, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200') }));

// ---------------- Certificates ----------------
export const certificatesRouter = Router();
certificatesRouter.get('/verify/:code', (req, res) => {
  const c = get('SELECT ce.code, ce.issued_at, ce.expires_at, u.first_name, u.last_name, co.title FROM certificates ce JOIN users u ON u.id = ce.user_id JOIN courses co ON co.id = ce.course_id WHERE ce.code = ?', req.params.code);
  if (!c) return res.status(404).json({ valid: false });
  res.json({ valid: !c.expires_at || new Date(c.expires_at) > new Date(), certificate: c });
});
certificatesRouter.use(authenticate);
certificatesRouter.get('/', (req, res) => {
  const userId = isStaff(req.user) && req.query.userId ? req.query.userId : req.user.id;
  res.json({ certificates: all('SELECT ce.*, c.title AS course_title, c.category FROM certificates ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = ? ORDER BY ce.issued_at DESC', userId) });
});
certificatesRouter.get('/:id/pdf', (req, res) => {
  const c = get('SELECT * FROM certificates WHERE id = ?', req.params.id);
  if (!c) return res.status(404).json({ error: 'Certificate not found' });
  if (c.user_id !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Forbidden' });
  renderCertificate(res, { certificate: c, user: get('SELECT * FROM users WHERE id = ?', c.user_id), course: get('SELECT * FROM courses WHERE id = ?', c.course_id) });
});

// ---------------- Notifications ----------------
export const notificationsRouter = Router();
notificationsRouter.use(authenticate);
notificationsRouter.get('/', (req, res) => res.json({ notifications: all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id), unread: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n }));
notificationsRouter.post('/read', (req, res) => {
  const ids = req.body?.ids;
  if (Array.isArray(ids) && ids.length) ids.forEach((id) => run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', id, req.user.id));
  else run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

// ---------------- Settings / admin ----------------
export const settingsRouter = Router();
settingsRouter.get('/public', (req, res) => res.json({ brand: { ...config.brand, ...getSetting('branding', {}) } })); // legacy; use /api/branding
settingsRouter.use(authenticate, requireRole('manager'));
settingsRouter.get('/', (req, res) => res.json({
  branding: { ...config.brand, ...getSetting('branding', {}) }, reminderWindows: getSetting('reminder_windows', DEFAULT_WINDOWS),
  integrations: { live: listProviders(), email: { configured: isMailConfigured(), host: process.env.SMTP_HOST || '', from: process.env.SMTP_FROM || '' }, sso: ssoStatus() },
  publicUrl: config.publicUrl,
}));
settingsRouter.put('/', requireRole('admin'), (req, res) => {
  const { branding, reminderWindows } = req.body || {};
  if (branding) setSetting('branding', branding);
  if (Array.isArray(reminderWindows)) setSetting('reminder_windows', reminderWindows.map(Number).filter((n) => Number.isFinite(n)));
  audit(req.user.id, 'settings.update', 'settings', null, req.body);
  res.json({ ok: true });
});
settingsRouter.post('/jobs/reminders', async (req, res) => {
  const at = req.body?.at ? new Date(req.body.at) : new Date();
  const result = req.body?.only === 'certificates' ? { certificates: await runCertificateExpiryCheck({ at }) } : await runAllReminderJobs({ at });
  audit(req.user.id, 'jobs.reminders', 'job', null, result);
  res.json(result);
});
settingsRouter.get('/outbox', (req, res) => res.json({ configured: isMailConfigured(), emails: outbox(Number(req.query.limit || 100)) }));
settingsRouter.get('/outbox/:id', (req, res) => { const e = outboxItem(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' }); res.json({ email: e }); });
settingsRouter.post('/test-email', async (req, res) => {
  const to = req.body?.to || req.user.email;
  const r = await sendMail({ to, subject: 'Test email from Fit2Trade Learn', category: 'test', text: 'If you can read this, email delivery works.', html: layout({ title: 'Email delivery works', intro: 'This is a test message from Fit2Trade Learn.', cta: 'Open Fit2Trade Learn', ctaUrl: config.publicUrl }) });
  res.json(r);
});
