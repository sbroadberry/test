import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { get } from './db.js';

export const ROLES = ['admin', 'manager', 'instructor', 'learner'];
const RANK = { admin: 4, manager: 3, instructor: 2, learner: 1 };

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, name: `${u.first_name} ${u.last_name}`.trim(), company_id: u.company_id || null };
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.f2t_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account unavailable' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const minRank = Math.min(...roles.map((r) => RANK[r] ?? 99));
    if (roles.includes(req.user.role) || RANK[req.user.role] >= minRank) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

export const isStaff = (user) => RANK[user.role] >= RANK.instructor;
export const isAdmin = (user) => RANK[user.role] >= RANK.manager;
