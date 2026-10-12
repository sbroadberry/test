/** Shared helpers for turning exports from other LMS platforms into the Fit2Trade Learn import dataset. */
import { parse } from 'csv-parse/sync';

export const SYNONYMS = {
  email: ['email', 'e-mail', 'email address', 'user email', 'learner email', 'emailaddress', 'mail'],
  username: ['username', 'login', 'user name', 'userid', 'user id'],
  first_name: ['first name', 'firstname', 'first_name', 'given name', 'forename', 'first'],
  last_name: ['last name', 'lastname', 'last_name', 'surname', 'family name', 'last'],
  full_name: ['name', 'full name', 'user', 'learner', 'learner name', 'student', 'student name', 'employee', 'employee name'],
  role: ['role', 'user type', 'usertype', 'type', 'account type', 'permission'],
  status: ['status', 'completion status', 'progress status', 'enrollment status', 'enrolment status', 'course status', 'state', 'result status'],
  user_status: ['user status', 'account status', 'active'],
  job_title: ['job title', 'position', 'job'],
  department: ['department', 'dept'],
  group: ['group', 'groups', 'branch', 'team', 'branches', 'group name'],
  location: ['location', 'site', 'office', 'store'],
  external_id: ['id', 'user id', 'userid', 'external id', 'learner id'],
  course: ['course', 'course name', 'course title', 'training', 'programme', 'program', 'learning', 'module', 'training course'],
  course_code: ['course code', 'code', 'course id', 'courseid', 'sku'],
  category: ['category', 'course category', 'topic'],
  progress: ['progress', 'completion %', 'completion percentage', 'percent complete', 'percentage', 'completion_percentage', 'progress %'],
  score: ['score', 'grade', 'result', 'mark', 'final score', 'best score', 'exam score'],
  enrolled_at: ['enrolled', 'enrolled on', 'enrollment date', 'enrolment date', 'date enrolled', 'enrolled date', 'start date', 'started', 'assigned', 'assigned date', 'enrolled_on'],
  completed_at: ['completed', 'completed on', 'completion date', 'date completed', 'completed date', 'certificate date', 'issued', 'issue date', 'issued on', 'issued date', 'date of completion', 'completed_on', 'finish date'],
  expires_at: ['expires', 'expiry', 'expiry date', 'expiration date', 'expires on', 'valid until', 'valid to', 'certificate expiry', 'expiration', 'renewal date', 'due for renewal', 'expiration_date'],
  due_at: ['due', 'due date', 'deadline', 'target date', 'complete by'],
  certificate_code: ['certificate code', 'certificate id', 'certificate number', 'serial', 'serial number', 'certificate', 'cert id', 'certificate no'],
  time_spent: ['time spent', 'total time', 'time', 'duration', 'time in course'],
  created_at: ['created', 'created on', 'date created', 'registration date', 'joined', 'date joined'],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/[^a-z0-9% ]/g, '').replace(/\s+/g, ' ').trim();

/** Map a header row to canonical field names. Returns { field: columnName }. */
export function mapHeaders(headers, overrides = {}) {
  const mapping = {};
  const used = new Set();
  for (const [field, col] of Object.entries(overrides)) if (col && headers.includes(col)) { mapping[field] = col; used.add(col); }
  for (const [field, names] of Object.entries(SYNONYMS)) {
    if (mapping[field]) continue;
    for (const h of headers) {
      if (used.has(h)) continue;
      if (names.includes(norm(h))) { mapping[field] = h; used.add(h); break; }
    }
  }
  return mapping;
}

export function parseCsv(text) {
  const clean = String(text).replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  return parse(clean, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true, bom: true, delimiter });
}
function detectDelimiter(text) {
  const head = text.split(/\r?\n/)[0] || '';
  const counts = { ',': (head.match(/,/g) || []).length, ';': (head.match(/;/g) || []).length, '\t': (head.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
/** Parse dates from the many formats LMS exports use. dateFormat: 'dmy' (Irish/UK default) or 'mdy'. */
export function parseDate(value, dateFormat = 'dmy') {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value) ? null : value.toISOString();
  const s = String(value).trim();
  if (!s || /^(n\/?a|never|none|-|null|0)$/i.test(s)) return null;
  if (/^\d{9,13}$/.test(s)) { const n = Number(s); return new Date(n < 1e11 ? n * 1000 : n).toISOString(); }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return toIso(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?/i.exec(s);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    let day, month;
    if (a > 12) { day = a; month = b; } else if (b > 12) { day = b; month = a; } else if (dateFormat === 'mdy') { month = a; day = b; } else { day = a; month = b; }
    let h = +(m[4] || 0); if (m[7] && /pm/i.test(m[7]) && h < 12) h += 12; if (m[7] && /am/i.test(m[7]) && h === 12) h = 0;
    return toIso(y, month - 1, day, h, +(m[5] || 0), +(m[6] || 0));
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[ \-]([a-z]{3,9})[ \-,]+(\d{4})/i.exec(s);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return toIso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = /^([a-z]{3,9})[ \-](\d{1,2})(?:st|nd|rd|th)?,?[ \-](\d{4})/i.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return toIso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
function toIso(y, mo, d, h = 0, mi = 0, s = 0) { const dt = new Date(Date.UTC(y, mo, d, h, mi, s)); return isNaN(dt) ? null : dt.toISOString(); }

export function normaliseStatus(value, { progress, completedAt } = {}) {
  const s = norm(value);
  if (/complet|passed|pass\b|finished|success|achieved|certified|done|100%/.test(s) && !/not |in ?complete|un/.test(s)) return 'completed';
  if (/fail|unsuccessful/.test(s)) return 'failed';
  if (/progress|started|incomplete|ongoing|partial|active|attempted|learning/.test(s) && !/not started/.test(s)) return 'in_progress';
  if (/not started|enrol|assigned|not attempted|pending|new|registered|unknown|^$/.test(s)) {
    if (completedAt) return 'completed';
    if (progress != null && progress >= 100) return 'completed';
    if (progress != null && progress > 0) return 'in_progress';
    return 'enrolled';
  }
  if (completedAt) return 'completed';
  if (progress != null && progress >= 100) return 'completed';
  if (progress != null && progress > 0) return 'in_progress';
  return 'enrolled';
}

export function normaliseRole(value) {
  const s = norm(value);
  if (/admin|super|owner/.test(s)) return 'admin';
  if (/manager|supervisor/.test(s)) return 'manager';
  if (/instructor|trainer|teacher|author|creator/.test(s)) return 'instructor';
  return 'learner';
}

export function normaliseUserStatus(value) {
  const s = norm(value);
  if (!s) return 'active';
  if (/inactive|disabled|deactivat|suspended|archived|locked|false|no|0/.test(s)) return 'inactive';
  return 'active';
}

export function splitName(full) {
  const raw = String(full || '').trim();
  if (raw.includes(',')) { const [l, f] = raw.split(','); return { first: (f || '').trim(), last: l.trim() }; }
  const parts = raw.split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[%,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Time spent like "1h 20m", "00:45:10", "4500" (seconds) or "75 min" -> seconds */
export function toSeconds(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  let m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
  let total = 0;
  m = /(\d+(?:\.\d+)?)\s*h/.exec(s); if (m) total += +m[1] * 3600;
  m = /(\d+(?:\.\d+)?)\s*m(?!s)/.exec(s); if (m) total += +m[1] * 60;
  m = /(\d+(?:\.\d+)?)\s*s/.exec(s); if (m) total += +m[1];
  return Math.round(total);
}

export function emptyDataset(source) {
  return { source, users: [], courses: [], groups: [], enrollments: [], certificates: [], warnings: [] };
}

/** Generic CSV -> dataset. Decides per file whether rows are users or course records from the mapped columns. */
export function datasetFromCsvRows(rows, { source = 'csv', dateFormat = 'dmy', overrides = {}, fileName = 'file.csv' } = {}, dataset = emptyDataset(source)) {
  if (!rows.length) { dataset.warnings.push(`${fileName}: no rows found`); return dataset; }
  const headers = Object.keys(rows[0]);
  const map = mapHeaders(headers, overrides);
  const col = (row, f) => (map[f] ? row[map[f]] : undefined);
  const hasCourse = Boolean(map.course || map.course_code);
  if (!map.email && !map.username && !map.full_name) { dataset.warnings.push(`${fileName}: could not find an email/user column (headers: ${headers.join(', ')})`); return dataset; }
  dataset.mappings = dataset.mappings || {};
  dataset.mappings[fileName] = map;
  let n = 0;
  for (const row of rows) {
    n += 1;
    let email = String(col(row, 'email') || '').trim().toLowerCase();
    const username = String(col(row, 'username') || '').trim();
    if (!email && username.includes('@')) email = username.toLowerCase();
    if (!email) { dataset.warnings.push(`${fileName} row ${n}: missing email, skipped`); continue; }
    let first = col(row, 'first_name'), last = col(row, 'last_name');
    if (!first && !last) { const sp = splitName(col(row, 'full_name') || email.split('@')[0]); first = sp.first; last = sp.last; }
    const user = {
      email, first_name: String(first || '').trim(), last_name: String(last || '').trim(),
      role: map.role ? normaliseRole(col(row, 'role')) : 'learner',
      status: map.user_status ? normaliseUserStatus(col(row, 'user_status')) : (!hasCourse && map.status ? normaliseUserStatus(col(row, 'status')) : 'active'),
      job_title: String(col(row, 'job_title') || '').trim(), department: String(col(row, 'department') || '').trim(), location: String(col(row, 'location') || '').trim(),
      groups: String(col(row, 'group') || '').split(/[;,|]/).map((g) => g.trim()).filter(Boolean),
      external_id: hasCourse ? '' : String(col(row, 'external_id') || username || '').trim(),
      created_at: parseDate(col(row, 'created_at'), dateFormat),
    };
    dataset.users.push(user);
    if (!hasCourse) continue;
    const courseTitle = String(col(row, 'course') || '').trim();
    const courseCode = String(col(row, 'course_code') || '').trim();
    if (!courseTitle && !courseCode) continue;
    dataset.courses.push({ title: courseTitle || courseCode, code: courseCode, category: String(col(row, 'category') || '').trim() });
    const progress = toNumber(col(row, 'progress'));
    const completedAt = parseDate(col(row, 'completed_at'), dateFormat);
    const status = normaliseStatus(col(row, 'status'), { progress, completedAt });
    const enrollment = {
      email, course: courseTitle, course_code: courseCode, status,
      progress_pct: progress ?? (status === 'completed' ? 100 : 0), score: toNumber(col(row, 'score')),
      enrolled_at: parseDate(col(row, 'enrolled_at'), dateFormat), completed_at: status === 'completed' ? (completedAt || parseDate(col(row, 'enrolled_at'), dateFormat)) : null,
      due_at: parseDate(col(row, 'due_at'), dateFormat), expires_at: parseDate(col(row, 'expires_at'), dateFormat), time_spent_sec: toSeconds(col(row, 'time_spent')),
    };
    dataset.enrollments.push(enrollment);
    const certCode = String(col(row, 'certificate_code') || '').trim();
    if (status === 'completed' && (certCode || enrollment.expires_at || map.certificate_code)) {
      dataset.certificates.push({ email, course: courseTitle, course_code: courseCode, code: certCode, issued_at: enrollment.completed_at, expires_at: enrollment.expires_at });
    }
  }
  return dataset;
}
