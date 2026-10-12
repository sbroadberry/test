/** Import engine: applies a normalised dataset (users, courses, groups, enrolments, certificates) to the LMS. */
import bcrypt from 'bcryptjs';
import { db, all, get, run, uid, now, audit } from '../db.js';
import * as talentlms from './importers/talentlms.js';
import * as learnupon from './importers/learnupon.js';
import * as generic from './importers/generic.js';
import { notify } from './notifications.js';
import { SYNONYMS } from './importers/normalise.js';

export const SOURCES = [talentlms.meta, learnupon.meta, generic.meta, { id: 'moodle', label: 'Moodle (CSV export)', csv: generic.meta.csv }];

/** Resolve a login or "First Last" name from a records export against users already in the LMS. */
export function lookupUser({ login, name }) {
  if (login) { const u = get('SELECT email FROM users WHERE lower(external_id) = lower(?) OR lower(email) = lower(?)', login, login); if (u) return u.email; }
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0], last = parts.slice(1).join(' ');
      const u = get('SELECT email FROM users WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)', first, last) || get('SELECT email FROM users WHERE lower(first_name) = lower(?) AND lower(last_name) = lower(?)', last, first);
      if (u) return u.email;
    }
    const u = get("SELECT email FROM users WHERE lower(first_name || ' ' || last_name) = lower(?)", name.trim());
    if (u) return u.email;
  }
  return null;
}

export async function buildDataset({ source, mode, files = [], api = {}, dateFormat = 'dmy', overrides = {}, fetchImpl }) {
  const opts = { dateFormat, overrides, lookupUser };
  if (source === 'talentlms') return mode === 'api' ? talentlms.fromApi({ ...api, fetchImpl }) : talentlms.fromCsvFiles(files, opts);
  if (source === 'learnupon') return mode === 'api' ? learnupon.fromApi({ ...api, fetchImpl }) : learnupon.fromCsvFiles(files, opts);
  return generic.fromCsvFiles(files, { ...opts, source: source || 'csv' });
}

export function summariseDataset(ds) {
  const uniq = (arr, key) => new Set(arr.map(key)).size;
  const existingEmails = new Set(all('SELECT email FROM users').map((u) => u.email.toLowerCase()));
  const existingCourses = new Set(all('SELECT title FROM courses').map((c) => c.title.toLowerCase()));
  const emails = [...new Set(ds.users.map((u) => u.email))];
  const courses = [...new Set(ds.courses.map((c) => (c.title || '').toLowerCase()).filter(Boolean))];
  return {
    source: ds.source,
    users: { total: emails.length, new: emails.filter((e) => !existingEmails.has(e)).length, existing: emails.filter((e) => existingEmails.has(e)).length },
    courses: { total: courses.length, new: courses.filter((c) => !existingCourses.has(c)).length, existing: courses.filter((c) => existingCourses.has(c)).length },
    groups: uniq(ds.users.flatMap((u) => u.groups || []), (g) => g),
    enrollments: { total: ds.enrollments.length, completed: ds.enrollments.filter((e) => e.status === 'completed').length, inProgress: ds.enrollments.filter((e) => e.status === 'in_progress').length },
    certificates: { total: ds.certificates.length, withExpiry: ds.certificates.filter((c) => c.expires_at).length },
    warnings: ds.warnings.slice(0, 50),
    unresolved: (ds.unresolved || []).length,
    mappings: ds.mappings || {},
    headers: ds.headers || {},
    fields: Object.keys(SYNONYMS),
    sample: { users: [...new Map(ds.users.map((u) => [u.email, u])).values()].slice(0, 5), enrollments: ds.enrollments.slice(0, 5), certificates: ds.certificates.slice(0, 5) },
  };
}

/** Apply the dataset. options: { updateExisting, createMissingCourses, defaultPassword, notifyUsers, assignGroup, skipInactive } */
export function applyDataset(ds, options = {}, actorId = null) {
  const opts = { updateExisting: true, createMissingCourses: true, defaultPassword: 'Welcome2Learn!', notifyUsers: false, assignGroup: '', skipInactive: false, ...options };
  const result = { users: { created: 0, updated: 0, skipped: 0 }, groups: { created: 0 }, courses: { created: 0, matched: 0 }, enrollments: { created: 0, updated: 0, skipped: 0 }, certificates: { created: 0, skipped: 0 }, errors: [] };
  const ts = now();
  const passwordHash = bcrypt.hashSync(opts.defaultPassword, 8);
  const source = ds.source || 'import';

  const apply = db.transaction(() => {
    // ---- users ----
    const seen = new Map();
    for (const u of ds.users) {
      if (!u.email || !/^[^@\s]+@[^@\s]+$/.test(u.email)) { result.users.skipped += 1; continue; }
      if (opts.skipInactive && u.status === 'inactive') { result.users.skipped += 1; continue; }
      let user = get('SELECT * FROM users WHERE email = ?', u.email);
      if (!user) {
        const id = uid();
        run(`INSERT INTO users(id, email, password_hash, first_name, last_name, role, status, job_title, department, location, external_source, external_id, must_change_password, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)`, id, u.email, passwordHash, u.first_name || u.email.split('@')[0], u.last_name || '', u.role || 'learner', u.status || 'active',
          u.job_title || '', u.department || '', u.location || '', source, u.external_id || '', u.created_at || ts);
        user = get('SELECT * FROM users WHERE id = ?', id);
        result.users.created += 1;
        if (opts.notifyUsers) notify(id, 'welcome', 'Welcome to Fit2Trade Learn', 'Your learning history has been migrated. Please update your password from your profile.', '/profile');
      } else if (opts.updateExisting && !seen.has(u.email)) {
        run('UPDATE users SET first_name = COALESCE(NULLIF(?, \'\'), first_name), last_name = COALESCE(NULLIF(?, \'\'), last_name), job_title = COALESCE(NULLIF(?, \'\'), job_title), department = COALESCE(NULLIF(?, \'\'), department), location = COALESCE(NULLIF(?, \'\'), location), external_source = CASE WHEN external_source = \'\' THEN ? ELSE external_source END, external_id = CASE WHEN external_id = \'\' THEN ? ELSE external_id END WHERE id = ?',
          u.first_name || '', u.last_name || '', u.job_title || '', u.department || '', u.location || '', source, u.external_id || '', user.id);
        result.users.updated += 1;
      }
      seen.set(u.email, user.id);
      const groups = [...(u.groups || []), ...(opts.assignGroup ? [opts.assignGroup] : [])];
      for (const g of groups) addToGroup(user.id, g, result, ts);
    }
    const userId = (email) => seen.get(email) || get('SELECT id FROM users WHERE email = ?', email)?.id;

    // ---- courses ----
    const courseCache = new Map();
    const findCourse = (title, code, externalId) => {
      const key = `${(code || '').toLowerCase()}|${(title || '').toLowerCase()}`;
      if (courseCache.has(key)) return courseCache.get(key);
      let c = null;
      if (externalId) { const ref = get("SELECT entity_id FROM external_refs WHERE entity = 'course' AND source = ? AND external_id = ?", source, externalId); if (ref) c = get('SELECT * FROM courses WHERE id = ?', ref.entity_id); }
      if (!c && code) c = get('SELECT * FROM courses WHERE lower(title) = lower(?) OR id = ?', code, code) || get("SELECT c.* FROM courses c JOIN external_refs r ON r.entity = 'course' AND r.entity_id = c.id WHERE r.external_id = ?", code);
      if (!c && title) c = get('SELECT * FROM courses WHERE lower(title) = lower(?)', title);
      if (!c && opts.createMissingCourses && (title || code)) {
        const id = uid();
        run(`INSERT INTO courses(id, title, description, category, status, self_enrol, duration_minutes, pass_mark, certificate_enabled, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,0,30,70,1,?,?,?)`, id, title || code, `Migrated from ${sourceLabel(source)}. Add content modules to make this course launchable.`, 'Migrated', 'published', actorId, ts, ts);
        c = get('SELECT * FROM courses WHERE id = ?', id);
        result.courses.created += 1;
      } else if (c) result.courses.matched += 1;
      if (c && (externalId || code)) run('INSERT OR IGNORE INTO external_refs(entity, entity_id, source, external_id) VALUES (?,?,?,?)', 'course', c.id, source, externalId || code);
      courseCache.set(key, c);
      return c;
    };
    for (const c of ds.courses) findCourse(c.title, c.code, c.external_id);

    // ---- enrolments ----
    for (const e of ds.enrollments) {
      const uidv = userId(e.email);
      const course = findCourse(e.course, e.course_code, e.course_external_id);
      if (!uidv || !course) { result.enrollments.skipped += 1; if (!course) result.errors.push(`No course "${e.course || e.course_code}" for ${e.email}`); continue; }
      const existing = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', uidv, course.id);
      const completedAt = e.status === 'completed' ? (e.completed_at || e.enrolled_at || ts) : null;
      if (!existing) {
        run(`INSERT INTO enrollments(id, user_id, course_id, status, progress_pct, score, source, enrolled_at, started_at, completed_at, due_at, expires_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, uid(), uidv, course.id, e.status, e.status === 'completed' ? 100 : (e.progress_pct || 0), e.score, `import:${source}`,
          e.enrolled_at || completedAt || ts, e.status !== 'enrolled' ? (e.enrolled_at || completedAt || ts) : null, completedAt, e.due_at, e.expires_at);
        result.enrollments.created += 1;
      } else if (opts.updateExisting && existing.status !== 'completed' && (e.status === 'completed' || rank(e.status) > rank(existing.status))) {
        run('UPDATE enrollments SET status = ?, progress_pct = ?, score = COALESCE(?, score), completed_at = COALESCE(?, completed_at), expires_at = COALESCE(?, expires_at), due_at = COALESCE(due_at, ?) WHERE id = ?',
          e.status, e.status === 'completed' ? 100 : Math.max(existing.progress_pct, e.progress_pct || 0), e.score, completedAt, e.expires_at, e.due_at, existing.id);
        result.enrollments.updated += 1;
      } else result.enrollments.skipped += 1;
    }

    // ---- certificates ----
    for (const c of ds.certificates) {
      const uidv = userId(c.email);
      const course = findCourse(c.course, c.course_code, c.course_external_id);
      if (!uidv || !course) { result.certificates.skipped += 1; continue; }
      let enrollment = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', uidv, course.id);
      if (!enrollment) {
        run(`INSERT INTO enrollments(id, user_id, course_id, status, progress_pct, source, enrolled_at, started_at, completed_at, expires_at) VALUES (?,?,?,?,100,?,?,?,?,?)`,
          uid(), uidv, course.id, 'completed', `import:${source}`, c.issued_at || ts, c.issued_at || ts, c.issued_at || ts, c.expires_at);
        enrollment = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', uidv, course.id);
        result.enrollments.created += 1;
      } else if (enrollment.status !== 'completed') {
        run("UPDATE enrollments SET status = 'completed', progress_pct = 100, completed_at = COALESCE(completed_at, ?), expires_at = COALESCE(?, expires_at) WHERE id = ?", c.issued_at || ts, c.expires_at, enrollment.id);
        result.enrollments.updated += 1;
      } else if (c.expires_at && !enrollment.expires_at) run('UPDATE enrollments SET expires_at = ? WHERE id = ?', c.expires_at, enrollment.id);
      const existingCert = get('SELECT * FROM certificates WHERE enrollment_id = ?', enrollment.id) || (c.code ? get('SELECT * FROM certificates WHERE code = ?', c.code) : null);
      if (existingCert) {
        if (c.expires_at && !existingCert.expires_at) run('UPDATE certificates SET expires_at = ? WHERE id = ?', c.expires_at, existingCert.id);
        result.certificates.skipped += 1; continue;
      }
      const id = uid();
      let code = c.code || `F2T-${id.slice(0, 8).toUpperCase()}`;
      if (get('SELECT 1 FROM certificates WHERE code = ?', code)) code = `${code}-${id.slice(0, 4).toUpperCase()}`;
      run('INSERT INTO certificates(id, code, enrollment_id, user_id, course_id, issued_at, expires_at) VALUES (?,?,?,?,?,?,?)', id, code, enrollment.id, uidv, course.id, c.issued_at || enrollment.completed_at || ts, c.expires_at || enrollment.expires_at);
      result.certificates.created += 1;
    }
  });
  apply();
  audit(actorId, 'import.apply', 'import', source, result);
  return result;
}

function rank(status) { return { enrolled: 0, in_progress: 1, failed: 2, completed: 3 }[status] ?? 0; }
function sourceLabel(s) { return SOURCES.find((x) => x.id === s)?.label || s; }
function addToGroup(userId, name, result, ts) {
  let g = get('SELECT id FROM groups WHERE lower(name) = lower(?)', name);
  if (!g) { const id = uid(); run('INSERT INTO groups(id, name, description, created_at) VALUES (?,?,?,?)', id, name, 'Created by import', ts); g = { id }; result.groups.created += 1; }
  run('INSERT OR IGNORE INTO group_members(group_id, user_id) VALUES (?,?)', g.id, userId);
}
