/** Shared helpers for turning exports from other LMS platforms into the Fit2Trade Learn import dataset. */
import { parse } from 'csv-parse/sync';
import { rowsFromXlsx } from './xlsx.js';

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
  return { source, users: [], courses: [], groups: [], enrollments: [], certificates: [], warnings: [], mappings: {}, headers: {}, unresolved: [] };
}

const STATUS_CELL = /^(completed?|passed|failed|in[ -]?progress|not[ -]?(started|attempted|completed)|incomplete|enrol+ed|assigned|yes|no|n\/a|-|—|\d{1,3}\s*%|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i;
function looksLikeStatusColumn(rows, header) {
  const values = rows.map((r) => String(r[header] ?? '').trim()).filter(Boolean);
  if (!values.length) return false;
  const hits = values.filter((v) => STATUS_CELL.test(v) || /^(completed|passed|failed|in progress|not started)/i.test(v)).length;
  return hits / values.length >= 0.8;
}

/** "Aoife Murphy (aoife.m)" / "aoife.m - Aoife Murphy" / "Murphy, Aoife" -> { name, login } */
export function parseUserRef(value) {
  const s = String(value || '').trim();
  let m = /^(.*?)\s*[\(\[]([^\)\]]+)[\)\]]\s*$/.exec(s);
  if (m) return { name: m[1].trim(), login: m[2].trim() };
  m = /^([^\s@]+)\s+[-–|]\s+(.+)$/.exec(s);
  if (m) return { name: m[2].trim(), login: m[1].trim() };
  if (s.includes('@')) return { name: '', login: s };
  return { name: s, login: '' };
}

/** Pre-pass over a set of files: returns [{ name, rows, headers, map, hasCourse, isMatrix, courseColumns }] with user files first. */
export function analyseFiles(files, { overrides = {} } = {}) {
  const out = [];
  for (const f of files) {
    const rows = f.rows || parseCsv(f.text);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const ov = overrides[f.name] || overrides.__all__ || {};
    const map = mapHeaders(headers, ov);
    const mapped = new Set(Object.values(map));
    let courseColumns = [];
    if (!map.course && !map.course_code) {
      const cands = headers.filter((h) => !mapped.has(h) && !/^(id|login|username|user ?id|branch|branches|groups?|custom|last login|phone|notes?)$/i.test(norm(h)));
      courseColumns = cands.filter((h) => looksLikeStatusColumn(rows, h));
      if (courseColumns.length && courseColumns.length < cands.length - 2 && courseColumns.length < 2) courseColumns = []; // a lone status-like column is more likely "Status"
    }
    const hasCourse = Boolean(map.course || map.course_code) || courseColumns.length > 0;
    out.push({ name: f.name, rows, headers, map, hasCourse, isMatrix: courseColumns.length > 0, courseColumns });
  }
  return out.sort((a, b) => Number(a.hasCourse) - Number(b.hasCourse));
}

/**
 * Convert parsed rows into the import dataset. Handles three layouts:
 *  - user exports (email column, no course column)
 *  - learning-record exports (one row per user+course, user given as email, login or "Name (login)")
 *  - training-matrix exports (one row per user, one column per course containing the status)
 * opts.lookupUser(ref) may resolve a login/name to an email from the existing LMS.
 */
export function datasetFromCsvRows(rows, { source = 'csv', dateFormat = 'dmy', overrides = {}, fileName = 'file.csv', lookupUser } = {}, dataset = emptyDataset(source), analysed = null) {
  const info = analysed || analyseFiles([{ name: fileName, rows }], { overrides })[0];
  const { headers, map, hasCourse, isMatrix, courseColumns } = info;
  dataset.mappings = dataset.mappings || {}; dataset.headers = dataset.headers || {}; dataset.unresolved = dataset.unresolved || [];
  dataset.headers[fileName] = headers;
  dataset.mappings[fileName] = isMatrix ? { ...map, course_columns: courseColumns.join(' | ') } : map;
  if (!rows.length) { dataset.warnings.push(`${fileName}: no rows found`); return dataset; }
  const col = (row, f) => (map[f] ? row[map[f]] : undefined);
  if (!map.email && !map.username && !map.full_name) { dataset.warnings.push(`${fileName}: could not find an Email, Login or Name column (headers: ${headers.join(', ')}). Use the column mapping to choose one.`); return dataset; }

  // users already known from earlier files (users exports are processed first)
  const byLogin = new Map(), byName = new Map();
  for (const u of dataset.users) { if (u.external_id) byLogin.set(u.external_id.toLowerCase(), u.email); byName.set(`${u.first_name} ${u.last_name}`.trim().toLowerCase(), u.email); byName.set(`${u.last_name}, ${u.first_name}`.trim().toLowerCase(), u.email); }
  const resolve = (row) => {
    let email = String(col(row, 'email') || '').trim().toLowerCase();
    const username = String(col(row, 'username') || '').trim();
    const ref = parseUserRef(col(row, 'full_name') || '');
    const login = username || ref.login;
    if (!email && login.includes('@')) email = login.toLowerCase();
    if (!email && login && byLogin.has(login.toLowerCase())) email = byLogin.get(login.toLowerCase());
    if (!email && ref.name && byName.has(ref.name.toLowerCase())) email = byName.get(ref.name.toLowerCase());
    if (!email && lookupUser) { const found = lookupUser({ login, name: ref.name }); if (found) email = found.toLowerCase(); }
    return { email, login, name: ref.name };
  };

  let n = 0;
  for (const row of rows) {
    n += 1;
    const { email, login, name } = resolve(row);
    if (!email) {
      const label = name || login || '(blank)';
      dataset.unresolved.push({ file: fileName, row: n, user: label });
      if (dataset.unresolved.length <= 25) dataset.warnings.push(`${fileName} row ${n}: user "${label}" has no email and could not be matched to a known user`);
      continue;
    }
    let first = col(row, 'first_name'), last = col(row, 'last_name');
    if (!first && !last) { const sp = splitName(name || email.split('@')[0]); first = sp.first; last = sp.last; }
    const known = dataset.users.find((u) => u.email === email);
    const user = {
      email, first_name: String(first || known?.first_name || '').trim(), last_name: String(last || known?.last_name || '').trim(),
      role: map.role ? normaliseRole(col(row, 'role')) : (known?.role || 'learner'),
      status: map.user_status ? normaliseUserStatus(col(row, 'user_status')) : (!hasCourse && map.status ? normaliseUserStatus(col(row, 'status')) : (known?.status || 'active')),
      job_title: String(col(row, 'job_title') || known?.job_title || '').trim(), department: String(col(row, 'department') || known?.department || '').trim(), location: String(col(row, 'location') || known?.location || '').trim(),
      groups: [...new Set([...(known?.groups || []), ...String(col(row, 'group') || '').split(/[;,|]/).map((g) => g.trim()).filter(Boolean)])],
      external_id: known?.external_id || (hasCourse ? login : String(col(row, 'external_id') || login || '').trim()),
      created_at: known?.created_at || parseDate(col(row, 'created_at'), dateFormat),
    };
    if (known) Object.assign(known, user); else { dataset.users.push(user); if (user.external_id) byLogin.set(user.external_id.toLowerCase(), email); byName.set(`${user.first_name} ${user.last_name}`.trim().toLowerCase(), email); }
    if (!hasCourse) continue;

    const records = [];
    if (isMatrix) {
      for (const h of courseColumns) {
        const cell = String(row[h] ?? '').trim();
        if (!cell || /^(-|—|n\/a)$/i.test(cell)) continue;
        const dateIn = /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})/.exec(cell);
        const pct = /(\d{1,3})\s*%/.exec(cell);
        const completedAt = dateIn ? parseDate(dateIn[1], dateFormat) : null;
        const status = normaliseStatus(cell.replace(/\(.*\)/, '').trim(), { progress: pct ? Number(pct[1]) : null, completedAt });
        records.push({ courseTitle: h.trim(), courseCode: '', status, progress: pct ? Number(pct[1]) : null, score: null, enrolledAt: null, completedAt: status === 'completed' ? completedAt : null, dueAt: null, expiresAt: null, timeSpent: 0, certCode: '' });
      }
    } else {
      const courseTitle = String(col(row, 'course') || '').trim();
      const courseCode = String(col(row, 'course_code') || '').trim();
      if (!courseTitle && !courseCode) continue;
      const progress = toNumber(col(row, 'progress'));
      const completedAt = parseDate(col(row, 'completed_at'), dateFormat);
      const status = normaliseStatus(col(row, 'status'), { progress, completedAt });
      records.push({ courseTitle, courseCode, status, progress, score: toNumber(col(row, 'score')), enrolledAt: parseDate(col(row, 'enrolled_at'), dateFormat), completedAt: status === 'completed' ? (completedAt || parseDate(col(row, 'enrolled_at'), dateFormat)) : null,
        dueAt: parseDate(col(row, 'due_at'), dateFormat), expiresAt: parseDate(col(row, 'expires_at'), dateFormat), timeSpent: toSeconds(col(row, 'time_spent')), certCode: String(col(row, 'certificate_code') || '').trim() });
    }
    for (const r of records) {
      dataset.courses.push({ title: r.courseTitle || r.courseCode, code: r.courseCode, category: String(col(row, 'category') || '').trim() });
      dataset.enrollments.push({ email, course: r.courseTitle, course_code: r.courseCode, status: r.status, progress_pct: r.progress ?? (r.status === 'completed' ? 100 : 0), score: r.score, enrolled_at: r.enrolledAt, completed_at: r.completedAt, due_at: r.dueAt, expires_at: r.expiresAt, time_spent_sec: r.timeSpent });
      const certFlag = /^(yes|y|true|issued|1)$/i.test(r.certCode);
      if (r.status === 'completed' && (r.certCode || r.expiresAt || map.certificate_code)) {
        dataset.certificates.push({ email, course: r.courseTitle, course_code: r.courseCode, code: certFlag ? '' : r.certCode, issued_at: r.completedAt, expires_at: r.expiresAt });
      }
    }
  }
  return dataset;
}

/** Parse all uploaded files (CSV/TSV or XLSX) into one dataset: user exports first, then learning records. */
export function datasetFromFiles(files, opts = {}) {
  const ds = emptyDataset(opts.source || 'csv');
  const prepared = files.map((f) => ({ name: f.name, rows: f.rows || (f.buffer && /\.xlsx$/i.test(f.name) ? rowsFromXlsx(f.buffer) : parseCsv(f.text ?? (f.buffer ? f.buffer.toString('utf8') : ''))) }));
  for (const info of analyseFiles(prepared, { overrides: opts.overrides || {} })) datasetFromCsvRows(info.rows, { ...opts, fileName: info.name }, ds, info);
  const seen = new Set();
  ds.courses = ds.courses.filter((c) => { const k = `${c.code}|${c.title}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return ds;
}

