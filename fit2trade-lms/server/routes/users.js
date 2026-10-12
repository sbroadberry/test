import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run, uid, now, audit, tx } from '../db.js';
import { authenticate, requireRole, publicUser, ROLES } from '../auth.js';
import { enrolUser } from '../services/progress.js';

export const router = Router();
router.use(authenticate, requireRole('manager'));

router.get('/', (req, res) => {
  const { q = '', role = '', status = '', group = '', company = '', page = 1, pageSize = 25 } = req.query;
  const where = ['1=1']; const params = [];
  if (q) { where.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.department LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  if (group) { where.push('u.id IN (SELECT user_id FROM group_members WHERE group_id = ?)'); params.push(group); }
  if (company) { where.push('u.company_id = ?'); params.push(company); }
  const total = get(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, ...params).n;
  const rows = all(`SELECT u.*, (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollments,
      (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.status = 'completed') AS completions,
      (SELECT GROUP_CONCAT(g.name, ', ') FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = u.id) AS group_names,
      (SELECT name FROM companies c WHERE c.id = u.company_id) AS company_name
    FROM users u WHERE ${where.join(' AND ')} ORDER BY u.last_name, u.first_name LIMIT ? OFFSET ?`, ...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
  res.json({ total, page: Number(page), pageSize: Number(pageSize), users: rows.map(publicUser) });
});

router.get('/:id', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const enrollments = all(`SELECT e.*, c.title AS course_title, c.category FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY e.enrolled_at DESC`, user.id);
  const groups = all('SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?', user.id);
  const certificates = all('SELECT ce.*, c.title AS course_title FROM certificates ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = ? ORDER BY ce.issued_at DESC', user.id);
  const sessions = all('SELECT s.*, r.status AS registration_status FROM session_registrations r JOIN live_sessions s ON s.id = r.session_id WHERE r.user_id = ? ORDER BY s.starts_at DESC', user.id);
  res.json({ user: publicUser(user), company: user.company_id ? get('SELECT id, name, slug FROM companies WHERE id = ?', user.company_id) : null, enrollments, groups, certificates, sessions });
});

router.post('/', (req, res) => {
  const { email, password, first_name, last_name, role = 'learner', job_title = '', department = '', location = '', groups = [], email_notifications = 1, company_id = null } = req.body || {};
  if (!email || !first_name) return res.status(400).json({ error: 'email and first_name are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can create admins' });
  if (get('SELECT 1 FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'A user with that email already exists' });
  const id = uid();
  const pw = password || `Welcome${Math.random().toString(36).slice(2, 8)}!`;
  const companyId = company_id || get('SELECT id FROM companies WHERE is_default = 1')?.id || null;
  run(`INSERT INTO users(id, email, password_hash, first_name, last_name, role, status, job_title, department, location, email_notifications, must_change_password, company_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, String(email).trim(), bcrypt.hashSync(pw, 10), first_name, last_name || '', role, 'active', job_title, department, location, email_notifications ? 1 : 0, password ? 0 : 1, companyId, now());
  for (const g of groups) run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', g, id);
  audit(req.user.id, 'user.create', 'user', id);
  res.status(201).json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', id)), temporaryPassword: password ? undefined : pw });
});

router.put('/:id', (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  if (b.role && !ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid role' });
  if ((b.role === 'admin' || user.role === 'admin') && req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can change admin accounts' });
  run(`UPDATE users SET email = COALESCE(?, email), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), role = COALESCE(?, role), status = COALESCE(?, status),
       job_title = COALESCE(?, job_title), department = COALESCE(?, department), location = COALESCE(?, location), email_notifications = COALESCE(?, email_notifications), company_id = COALESCE(?, company_id) WHERE id = ?`,
    b.email, b.first_name, b.last_name, b.role, b.status, b.job_title, b.department, b.location, b.email_notifications == null ? null : (b.email_notifications ? 1 : 0), b.company_id || null, user.id);
  if (b.password) run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', bcrypt.hashSync(b.password, 10), user.id);
  if (Array.isArray(b.groups)) {
    run('DELETE FROM group_members WHERE user_id = ?', user.id);
    for (const g of b.groups) run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', g, user.id);
  }
  audit(req.user.id, 'user.update', 'user', user.id, b);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  run('DELETE FROM users WHERE id = ?', req.params.id);
  audit(req.user.id, 'user.delete', 'user', req.params.id);
  res.json({ ok: true });
});

/** Quick bulk create from JSON rows [{email, first_name, last_name, role, department, groups:[names]}] */
router.post('/bulk', (req, res) => {
  const rows = Array.isArray(req.body?.users) ? req.body.users : [];
  const created = [], skipped = [];
  const doAll = tx(() => {
    for (const r of rows) {
      if (!r.email || get('SELECT 1 FROM users WHERE email = ?', r.email)) { skipped.push(r.email || '(blank)'); continue; }
      const id = uid();
      run(`INSERT INTO users(id, email, password_hash, first_name, last_name, role, status, job_title, department, location, must_change_password, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
        id, r.email.trim(), bcrypt.hashSync(r.password || 'Welcome2Learn!', 8), r.first_name || r.email.split('@')[0], r.last_name || '', ROLES.includes(r.role) ? r.role : 'learner', 'active', r.job_title || '', r.department || '', r.location || '', now());
      for (const name of r.groups || []) {
        let g = get('SELECT id FROM groups WHERE lower(name) = lower(?)', name);
        if (!g) { const gid = uid(); run('INSERT INTO groups(id, name, description, created_at) VALUES (?,?,?,?)', gid, name, '', now()); g = { id: gid }; }
        run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', g.id, id);
      }
      created.push(r.email);
    }
  });
  doAll();
  audit(req.user.id, 'user.bulk_create', 'user', null, { created: created.length, skipped: skipped.length });
  res.json({ created, skipped });
});

// ---------------- Groups ----------------
export const groupsRouter = Router();
groupsRouter.use(authenticate, requireRole('manager'));

groupsRouter.get('/', (req, res) => {
  res.json({ groups: all(`SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS members,
    (SELECT COUNT(*) FROM group_courses gc WHERE gc.group_id = g.id) AS courses FROM groups g ORDER BY g.name`) });
});
groupsRouter.get('/:id', (req, res) => {
  const group = get('SELECT * FROM groups WHERE id = ?', req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const members = all('SELECT u.* FROM users u JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = ? ORDER BY u.last_name', group.id).map(publicUser);
  const courses = all('SELECT c.id, c.title, c.category, gc.due_days FROM courses c JOIN group_courses gc ON gc.course_id = c.id WHERE gc.group_id = ?', group.id);
  res.json({ group, members, courses });
});
groupsRouter.post('/', (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (get('SELECT 1 FROM groups WHERE lower(name) = lower(?)', name)) return res.status(409).json({ error: 'Group already exists' });
  const id = uid();
  run('INSERT INTO groups(id, name, description, created_at) VALUES (?,?,?,?)', id, name, description, now());
  res.status(201).json({ group: get('SELECT * FROM groups WHERE id = ?', id) });
});
groupsRouter.put('/:id', (req, res) => {
  const { name, description } = req.body || {};
  run('UPDATE groups SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?', name, description, req.params.id);
  res.json({ group: get('SELECT * FROM groups WHERE id = ?', req.params.id) });
});
groupsRouter.delete('/:id', (req, res) => { run('DELETE FROM groups WHERE id = ?', req.params.id); res.json({ ok: true }); });
groupsRouter.post('/:id/members', (req, res) => {
  const userIds = req.body?.userIds || [];
  const courses = all('SELECT * FROM group_courses WHERE group_id = ?', req.params.id);
  let enrolled = 0;
  for (const u of userIds) {
    run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', req.params.id, u);
    for (const gc of courses) { const r = enrolUser(u, gc.course_id, { source: 'group', dueAt: gc.due_days ? new Date(Date.now() + gc.due_days * 86400000).toISOString() : null }); if (r.created) enrolled += 1; }
  }
  res.json({ ok: true, enrolled });
});
groupsRouter.delete('/:id/members/:userId', (req, res) => { run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', req.params.id, req.params.userId); res.json({ ok: true }); });
/** Assign a course to a group: every current (and future) member is enrolled. */
groupsRouter.post('/:id/courses', (req, res) => {
  const { courseId, dueDays = null } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId is required' });
  run('INSERT OR REPLACE INTO group_courses(group_id, course_id, due_days) VALUES (?,?,?)', req.params.id, courseId, dueDays);
  let enrolled = 0;
  for (const m of all('SELECT user_id FROM group_members WHERE group_id = ?', req.params.id)) {
    const r = enrolUser(m.user_id, courseId, { source: 'group', dueAt: dueDays ? new Date(Date.now() + dueDays * 86400000).toISOString() : null });
    if (r.created) enrolled += 1;
  }
  audit(req.user.id, 'group.assign_course', 'group', req.params.id, { courseId, enrolled });
  res.json({ ok: true, enrolled });
});
groupsRouter.delete('/:id/courses/:courseId', (req, res) => { run('DELETE FROM group_courses WHERE group_id = ? AND course_id = ?', req.params.id, req.params.courseId); res.json({ ok: true }); });
