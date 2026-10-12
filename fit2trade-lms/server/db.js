import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner',
  status TEXT NOT NULL DEFAULT 'active',
  job_title TEXT DEFAULT '',
  department TEXT DEFAULT '',
  location TEXT DEFAULT '',
  email_notifications INTEGER NOT NULL DEFAULT 1,
  external_source TEXT DEFAULT '',
  external_id TEXT DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS group_courses (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  due_days INTEGER,
  PRIMARY KEY (group_id, course_id)
);
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  thumbnail_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  self_enrol INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 30,
  pass_mark INTEGER DEFAULT 70,
  certificate_enabled INTEGER NOT NULL DEFAULT 1,
  certificate_validity_months INTEGER,
  level TEXT DEFAULT 'All levels',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1,
  content_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scorm_packages (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  identifier TEXT,
  title TEXT,
  launch_path TEXT NOT NULL,
  mastery_score REAL,
  manifest_json TEXT NOT NULL,
  original_filename TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  score REAL,
  source TEXT NOT NULL DEFAULT 'manual',
  enrolled_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  due_at TEXT,
  expires_at TEXT,
  UNIQUE (user_id, course_id)
);
CREATE TABLE IF NOT EXISTS module_progress (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  score REAL,
  time_spent_sec INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (enrollment_id, module_id)
);
CREATE TABLE IF NOT EXISTS learning_paths (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_path_courses (
  path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (path_id, course_id)
);
CREATE TABLE IF NOT EXISTS path_enrollments (
  id TEXT PRIMARY KEY,
  path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL,
  UNIQUE (path_id, user_id)
);
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'simulated',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Dublin',
  capacity INTEGER DEFAULT 50,
  instructor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  location TEXT DEFAULT '',
  join_url TEXT DEFAULT '',
  host_url TEXT DEFAULT '',
  external_id TEXT DEFAULT '',
  external_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_registrations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered',
  attended_minutes INTEGER DEFAULT 0,
  registered_at TEXT NOT NULL,
  UNIQUE (session_id, user_id)
);
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  issued_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT DEFAULT '',
  category TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS reminders_sent (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview',
  options_json TEXT NOT NULL DEFAULT '{}',
  dataset_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS external_refs (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  PRIMARY KEY (entity, source, external_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id, position);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON live_sessions(starts_at);
`;
db.exec(schema);

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function get(sql, ...params) { return db.prepare(sql).get(...params); }
export function all(sql, ...params) { return db.prepare(sql).all(...params); }
export function run(sql, ...params) { return db.prepare(sql).run(...params); }
export const tx = (fn) => db.transaction(fn);

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
export function audit(userId, action, entity, entityId, meta = {}) {
  run('INSERT INTO audit_log(user_id, action, entity, entity_id, meta_json, created_at) VALUES (?,?,?,?,?,?)',
    userId, action, entity, entityId, JSON.stringify(meta), now());
}
