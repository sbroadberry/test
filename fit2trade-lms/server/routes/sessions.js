/** Live sessions (instructor-led / webinar) with Teams & Webex integration. */
import { Router } from 'express';
import { all, get, run, uid, now, audit, tx } from '../db.js';
import { authenticate, requireRole, isStaff } from '../auth.js';
import { getProvider, listProviders } from '../integrations/index.js';
import { notify } from '../services/notifications.js';
import { sendMail, layout } from '../services/mailer.js';
import { updateModuleProgress } from '../services/progress.js';
import { config } from '../config.js';

export const router = Router();
router.use(authenticate);

const withExtras = (s, userId) => ({
  ...s, external: safe(s.external_json),
  registered_count: get("SELECT COUNT(*) AS n FROM session_registrations WHERE session_id = ? AND status != 'cancelled'", s.id).n,
  attended_count: get("SELECT COUNT(*) AS n FROM session_registrations WHERE session_id = ? AND status = 'attended'", s.id).n,
  my_registration: userId ? get('SELECT status FROM session_registrations WHERE session_id = ? AND user_id = ?', s.id, userId)?.status || null : null,
  instructor_name: s.instructor_id ? (get('SELECT first_name || \' \' || last_name AS n FROM users WHERE id = ?', s.instructor_id)?.n || '') : '',
  course_title: s.course_id ? get('SELECT title FROM courses WHERE id = ?', s.course_id)?.title : null,
});

router.get('/providers', (req, res) => res.json({ providers: listProviders() }));

router.get('/', (req, res) => {
  const { from, to, courseId, mine } = req.query;
  const where = ['1=1']; const params = [];
  if (from) { where.push('s.ends_at >= ?'); params.push(from); }
  if (to) { where.push('s.starts_at <= ?'); params.push(to); }
  if (courseId) { where.push('s.course_id = ?'); params.push(courseId); }
  if (mine === '1') { where.push("s.id IN (SELECT session_id FROM session_registrations WHERE user_id = ? AND status != 'cancelled')"); params.push(req.user.id); }
  if (!isStaff(req.user)) where.push("s.status != 'cancelled'");
  const rows = all(`SELECT s.* FROM live_sessions s WHERE ${where.join(' AND ')} ORDER BY s.starts_at`, ...params);
  res.json({ sessions: rows.map((s) => withExtras(s, req.user.id)) });
});

router.get('/:id', (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const registrations = isStaff(req.user) ? all(`SELECT r.*, u.email, u.first_name, u.last_name, u.department FROM session_registrations r JOIN users u ON u.id = r.user_id WHERE r.session_id = ? ORDER BY u.last_name`, s.id) : undefined;
  res.json({ session: withExtras(s, req.user.id), registrations });
});

router.post('/', requireRole('instructor'), async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.starts_at || !b.ends_at) return res.status(400).json({ error: 'title, starts_at and ends_at are required' });
  if (new Date(b.ends_at) <= new Date(b.starts_at)) return res.status(400).json({ error: 'ends_at must be after starts_at' });
  const id = uid();
  const session = { id, course_id: b.course_id || null, module_id: b.module_id || null, title: b.title, description: b.description || '', provider: b.provider || (config.simulateLive ? 'simulated' : 'none'),
    starts_at: new Date(b.starts_at).toISOString(), ends_at: new Date(b.ends_at).toISOString(), timezone: b.timezone || 'Europe/Dublin', capacity: b.capacity ?? 50, instructor_id: b.instructor_id || req.user.id, location: b.location || '' };
  let meeting = { externalId: '', joinUrl: b.join_url || '', hostUrl: b.join_url || '', raw: {} };
  try {
    const provider = getProvider(session.provider);
    if (provider) { meeting = await provider.createMeeting(session, { invitees: [] }); session.provider = provider.name; }
  } catch (err) { return res.status(502).json({ error: `Could not create the online meeting: ${err.message}` }); }
  run(`INSERT INTO live_sessions(id, course_id, module_id, title, description, provider, starts_at, ends_at, timezone, capacity, instructor_id, location, join_url, host_url, external_id, external_json, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, session.course_id, session.module_id, session.title, session.description, session.provider, session.starts_at, session.ends_at, session.timezone, session.capacity,
    session.instructor_id, session.location, meeting.joinUrl || '', meeting.hostUrl || '', meeting.externalId || '', JSON.stringify(meeting.raw || {}), 'scheduled', now());
  // auto-register everyone enrolled in the linked course when requested
  let registered = 0;
  if (b.registerEnrolled && session.course_id) {
    for (const e of all("SELECT user_id FROM enrollments WHERE course_id = ? AND status != 'completed'", session.course_id)) { if (register(id, e.user_id)) registered += 1; }
  }
  audit(req.user.id, 'session.create', 'session', id, { provider: session.provider, externalId: meeting.externalId });
  res.status(201).json({ session: withExtras(get('SELECT * FROM live_sessions WHERE id = ?', id), req.user.id), registered });
});

router.put('/:id', requireRole('instructor'), async (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const b = req.body || {};
  const next = { ...s, title: b.title ?? s.title, description: b.description ?? s.description, starts_at: b.starts_at ? new Date(b.starts_at).toISOString() : s.starts_at, ends_at: b.ends_at ? new Date(b.ends_at).toISOString() : s.ends_at,
    timezone: b.timezone ?? s.timezone, capacity: b.capacity ?? s.capacity, instructor_id: b.instructor_id ?? s.instructor_id, location: b.location ?? s.location, status: b.status ?? s.status, join_url: b.join_url ?? s.join_url };
  try {
    const provider = s.external_id ? getProvider(s.provider) : null;
    if (provider && (next.title !== s.title || next.starts_at !== s.starts_at || next.ends_at !== s.ends_at)) {
      const m = await provider.updateMeeting(next);
      next.join_url = m.joinUrl || next.join_url; next.host_url = m.hostUrl || s.host_url;
    }
    if (provider && next.status === 'cancelled' && s.status !== 'cancelled') await provider.deleteMeeting(s);
  } catch (err) { return res.status(502).json({ error: `Meeting update failed: ${err.message}` }); }
  run(`UPDATE live_sessions SET title=?, description=?, starts_at=?, ends_at=?, timezone=?, capacity=?, instructor_id=?, location=?, status=?, join_url=?, host_url=? WHERE id=?`,
    next.title, next.description, next.starts_at, next.ends_at, next.timezone, next.capacity, next.instructor_id, next.location, next.status, next.join_url, next.host_url || '', s.id);
  if (next.starts_at !== s.starts_at || next.status === 'cancelled') {
    for (const r of all("SELECT user_id FROM session_registrations WHERE session_id = ? AND status != 'cancelled'", s.id)) {
      notify(r.user_id, 'session_updated', next.status === 'cancelled' ? `Cancelled: ${next.title}` : `Rescheduled: ${next.title}`, next.status === 'cancelled' ? 'This live session has been cancelled.' : `New time: ${fmtDate(next.starts_at)}`, '/sessions');
    }
  }
  res.json({ session: withExtras(get('SELECT * FROM live_sessions WHERE id = ?', s.id), req.user.id) });
});

router.delete('/:id', requireRole('manager'), async (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  try { const p = s.external_id ? getProvider(s.provider) : null; if (p) await p.deleteMeeting(s); } catch (err) { console.warn('deleteMeeting failed', err.message); }
  run('DELETE FROM live_sessions WHERE id = ?', s.id);
  res.json({ ok: true });
});

function register(sessionId, userId) {
  const existing = get('SELECT * FROM session_registrations WHERE session_id = ? AND user_id = ?', sessionId, userId);
  if (existing && existing.status !== 'cancelled') return false;
  if (existing) run("UPDATE session_registrations SET status = 'registered' WHERE id = ?", existing.id);
  else run('INSERT INTO session_registrations(id, session_id, user_id, status, registered_at) VALUES (?,?,?,?,?)', uid(), sessionId, userId, 'registered', now());
  const s = get('SELECT * FROM live_sessions WHERE id = ?', sessionId);
  notify(userId, 'session_registered', `You're registered: ${s.title}`, `${fmtDate(s.starts_at)} · ${providerLabel(s.provider)}`, `/sessions/${s.id}`);
  const user = get('SELECT * FROM users WHERE id = ?', userId);
  if (user?.email_notifications) {
    sendMail({ to: user.email, subject: `Registered: ${s.title} · Fit2Trade Learn`, category: 'session', text: `${s.title} on ${fmtDate(s.starts_at)}. Join: ${s.join_url}`,
      html: layout({ title: `You're registered for ${s.title}`, intro: `Hi ${user.first_name},`, body: `<p style="font-size:15px">${fmtDate(s.starts_at)} – ${fmtDate(s.ends_at)} (${s.timezone})<br>${providerLabel(s.provider)}${s.location ? ' · ' + s.location : ''}</p>`, cta: s.join_url ? 'Join link' : 'View session', ctaUrl: s.join_url || `${config.publicUrl}/sessions/${s.id}` }) }).catch(() => {});
  }
  return true;
}

router.post('/:id/register', (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s || s.status === 'cancelled') return res.status(404).json({ error: 'Session not available' });
  const userId = isStaff(req.user) && req.body?.userId ? req.body.userId : req.user.id;
  const count = get("SELECT COUNT(*) AS n FROM session_registrations WHERE session_id = ? AND status != 'cancelled'", s.id).n;
  if (s.capacity && count >= s.capacity) return res.status(409).json({ error: 'This session is full' });
  const created = register(s.id, userId);
  // Webex supports invitees: add the learner so the meeting appears in their Webex calendar
  if (created && s.provider === 'webex' && s.external_id) {
    const u = get('SELECT email, first_name, last_name FROM users WHERE id = ?', userId);
    getProvider('webex')?.addInvitee?.(s, { email: u.email, name: `${u.first_name} ${u.last_name}` }).catch((e) => console.warn('Webex invitee failed', e.message));
  }
  res.status(created ? 201 : 200).json({ ok: true, created });
});

router.post('/:id/unregister', (req, res) => {
  const userId = isStaff(req.user) && req.body?.userId ? req.body.userId : req.user.id;
  run("UPDATE session_registrations SET status = 'cancelled' WHERE session_id = ? AND user_id = ?", req.params.id, userId);
  res.json({ ok: true });
});

/** Mark attendance manually: body { attendance: [{ userId, status: 'attended'|'absent', attendedMinutes }] } */
router.post('/:id/attendance', requireRole('instructor'), (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const rows = req.body?.attendance || [];
  tx(() => { for (const a of rows) applyAttendance(s, a.userId, a.status, a.attendedMinutes || 0); })();
  audit(req.user.id, 'session.attendance', 'session', s.id, { count: rows.length });
  res.json({ ok: true, registrations: all('SELECT r.*, u.email, u.first_name, u.last_name FROM session_registrations r JOIN users u ON u.id = r.user_id WHERE r.session_id = ?', s.id) });
});

/** Pull attendance from Teams/Webex and mark learners who joined for >= minMinutes (default 50% of the session) as attended. */
router.post('/:id/sync-attendance', requireRole('instructor'), async (req, res) => {
  const s = get('SELECT * FROM live_sessions WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  if (!s.external_id) return res.status(400).json({ error: 'This session has no online meeting to sync from' });
  const durationMin = (new Date(s.ends_at) - new Date(s.starts_at)) / 60000;
  const minMinutes = Number(req.body?.minMinutes ?? Math.round(durationMin * 0.5));
  let records;
  try { records = await getProvider(s.provider).getAttendance(s); } catch (err) { return res.status(502).json({ error: `Attendance sync failed: ${err.message}` }); }
  const matched = [], unmatched = [];
  tx(() => {
    for (const r of records) {
      const user = r.email ? get('SELECT id FROM users WHERE email = ?', r.email) : null;
      if (!user) { unmatched.push(r); continue; }
      const minutes = Math.round((r.durationSec || 0) / 60);
      applyAttendance(s, user.id, minutes >= minMinutes ? 'attended' : 'absent', minutes);
      matched.push({ userId: user.id, email: r.email, minutes, attended: minutes >= minMinutes });
    }
  })();
  audit(req.user.id, 'session.sync_attendance', 'session', s.id, { matched: matched.length, unmatched: unmatched.length });
  res.json({ matched, unmatched, minMinutes, provider: s.provider });
});

function applyAttendance(s, userId, status, attendedMinutes) {
  const existing = get('SELECT * FROM session_registrations WHERE session_id = ? AND user_id = ?', s.id, userId);
  if (existing) run('UPDATE session_registrations SET status = ?, attended_minutes = ? WHERE id = ?', status, attendedMinutes, existing.id);
  else run('INSERT INTO session_registrations(id, session_id, user_id, status, attended_minutes, registered_at) VALUES (?,?,?,?,?,?)', uid(), s.id, userId, status, attendedMinutes, now());
  if (status === 'attended' && s.module_id && s.course_id) {
    const e = get('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', userId, s.course_id);
    if (e) updateModuleProgress(e.id, s.module_id, { status: 'completed', timeSpentSec: attendedMinutes * 60 });
  }
}

function fmtDate(iso) { return new Date(iso).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Dublin' }); }
function providerLabel(p) { return { teams: 'Microsoft Teams', webex: 'Cisco Webex', simulated: 'Virtual classroom', none: 'In person' }[p] || p; }
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
