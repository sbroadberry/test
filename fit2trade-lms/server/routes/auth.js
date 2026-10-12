import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run, now, audit } from '../db.js';
import { signToken, publicUser, authenticate } from '../auth.js';
import { config } from '../config.js';

export const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? get('SELECT * FROM users WHERE email = ?', String(email).trim()) : null;
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.status !== 'active') return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now(), user.id);
  const token = signToken(user);
  res.cookie('f2t_token', token, { httpOnly: true, sameSite: 'lax', secure: config.publicUrl.startsWith('https'), maxAge: 12 * 3600 * 1000 });
  audit(user.id, 'auth.login', 'user', user.id);
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', (req, res) => { res.clearCookie('f2t_token'); res.json({ ok: true }); });

router.get('/me', authenticate, (req, res) => {
  const unread = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n;
  res.json({ user: req.user, unreadNotifications: unread });
});

router.put('/me', authenticate, (req, res) => {
  const { first_name, last_name, job_title, department, location, email_notifications } = req.body || {};
  run('UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), job_title = COALESCE(?, job_title), department = COALESCE(?, department), location = COALESCE(?, location), email_notifications = COALESCE(?, email_notifications) WHERE id = ?',
    first_name, last_name, job_title, department, location, email_notifications == null ? null : (email_notifications ? 1 : 0), req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.put('/me/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', bcrypt.hashSync(newPassword, 10), user.id);
  res.json({ ok: true });
});
