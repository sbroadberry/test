import { all, get, run, uid, now, tx } from '../db.js';
import { notify } from './notifications.js';

export const TERMINAL = new Set(['completed', 'passed']);

export function getOrCreateModuleProgress(enrollmentId, moduleId) {
  let mp = get('SELECT * FROM module_progress WHERE enrollment_id = ? AND module_id = ?', enrollmentId, moduleId);
  if (!mp) {
    run('INSERT INTO module_progress(id, enrollment_id, module_id, status, updated_at) VALUES (?,?,?,?,?)',
      uid(), enrollmentId, moduleId, 'not_started', now());
    mp = get('SELECT * FROM module_progress WHERE enrollment_id = ? AND module_id = ?', enrollmentId, moduleId);
  }
  return mp;
}

/**
 * Update a single module's progress and then roll the result up to the enrollment.
 * patch: { status, score, timeSpentSec, data, attemptsInc }
 */
export const updateModuleProgress = tx((enrollmentId, moduleId, patch = {}) => {
  const mp = getOrCreateModuleProgress(enrollmentId, moduleId);
  const ts = now();
  const next = {
    status: patch.status || mp.status,
    score: patch.score ?? mp.score,
    time_spent_sec: mp.time_spent_sec + (patch.timeSpentSec || 0),
    attempts: mp.attempts + (patch.attemptsInc || 0),
    data_json: patch.data ? JSON.stringify(patch.data) : mp.data_json,
    started_at: mp.started_at || ts,
    completed_at: mp.completed_at || (TERMINAL.has(patch.status) ? ts : null),
  };
  if (next.status === 'not_started' && (patch.data || patch.timeSpentSec)) next.status = 'in_progress';
  run(`UPDATE module_progress SET status=?, score=?, time_spent_sec=?, attempts=?, data_json=?, started_at=?, completed_at=?, updated_at=? WHERE id=?`,
    next.status, next.score, next.time_spent_sec, next.attempts, next.data_json, next.started_at, next.completed_at, ts, mp.id);
  return recomputeEnrollment(enrollmentId);
});

export function recomputeEnrollment(enrollmentId) {
  const enrollment = get('SELECT * FROM enrollments WHERE id = ?', enrollmentId);
  if (!enrollment) return null;
  const course = get('SELECT * FROM courses WHERE id = ?', enrollment.course_id);
  const modules = all('SELECT * FROM modules WHERE course_id = ? ORDER BY position', enrollment.course_id);
  const progress = all('SELECT * FROM module_progress WHERE enrollment_id = ?', enrollmentId);
  const byModule = Object.fromEntries(progress.map((p) => [p.module_id, p]));

  const required = modules.filter((m) => m.required);
  const relevant = required.length ? required : modules;
  const done = relevant.filter((m) => TERMINAL.has(byModule[m.id]?.status));
  const failed = relevant.filter((m) => byModule[m.id]?.status === 'failed');
  const anyStarted = progress.some((p) => p.status !== 'not_started');
  const pct = relevant.length ? Math.round((done.length / relevant.length) * 100) : (anyStarted ? 100 : 0);

  const scored = modules.filter((m) => byModule[m.id]?.score != null);
  const score = scored.length ? Math.round(scored.reduce((s, m) => s + byModule[m.id].score, 0) / scored.length) : null;

  let status = enrollment.status;
  if (relevant.length && done.length === relevant.length) status = 'completed';
  else if (failed.length && failed.length + done.length === relevant.length) status = 'failed';
  else if (anyStarted) status = 'in_progress';
  else status = 'enrolled';
  if (enrollment.status === 'completed' && status !== 'completed') status = 'completed'; // never regress a completion
  const finalPct = status === 'completed' ? 100 : pct;

  const ts = now();
  const completedAt = status === 'completed' ? (enrollment.completed_at || ts) : enrollment.completed_at;
  const expiresAt = status === 'completed' && course.certificate_validity_months && !enrollment.expires_at
    ? addMonths(ts, course.certificate_validity_months) : enrollment.expires_at;
  run('UPDATE enrollments SET status=?, progress_pct=?, score=?, started_at=COALESCE(started_at, ?), completed_at=?, expires_at=? WHERE id=?',
    status, finalPct, score ?? enrollment.score, anyStarted ? ts : null, completedAt, expiresAt, enrollmentId);

  if (status === 'completed') {
    // issue the certificate whenever a completed enrolment lacks one (covers manual completion of module-less courses)
    if (course.certificate_enabled && !get('SELECT 1 FROM certificates WHERE enrollment_id = ?', enrollmentId)) issueCertificate(enrollment, course, expiresAt);
    if (enrollment.status !== 'completed' || !enrollment.completed_at) notify(enrollment.user_id, 'course_completed', `You completed ${course.title}`,
      course.certificate_enabled ? 'Your certificate is ready to download.' : 'Well done!', '/certificates');
  }
  return get('SELECT * FROM enrollments WHERE id = ?', enrollmentId);
}

export function issueCertificate(enrollment, course, expiresAt = null) {
  const existing = get('SELECT * FROM certificates WHERE enrollment_id = ?', enrollment.id);
  if (existing) return existing;
  const id = uid();
  const code = `F2T-${id.slice(0, 8).toUpperCase()}`;
  run('INSERT INTO certificates(id, code, enrollment_id, user_id, course_id, issued_at, expires_at) VALUES (?,?,?,?,?,?,?)',
    id, code, enrollment.id, enrollment.user_id, course.id, now(), expiresAt);
  return get('SELECT * FROM certificates WHERE id = ?', id);
}

export function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export const enrolUser = tx((userId, courseId, { source = 'manual', dueAt = null, actorId = null } = {}) => {
  const existing = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', userId, courseId);
  if (existing) return { enrollment: existing, created: false };
  const id = uid();
  run('INSERT INTO enrollments(id, user_id, course_id, status, source, enrolled_at, due_at) VALUES (?,?,?,?,?,?,?)',
    id, userId, courseId, 'enrolled', source, now(), dueAt);
  const course = get('SELECT title FROM courses WHERE id = ?', courseId);
  notify(userId, 'enrolled', `You have been enrolled in ${course?.title || 'a course'}`,
    dueAt ? `Due by ${new Date(dueAt).toLocaleDateString('en-IE')}` : 'Start learning whenever you are ready.', `/learn/${id}`);
  return { enrollment: get('SELECT * FROM enrollments WHERE id = ?', id), created: true };
});

export function gradeQuiz(quiz, answers) {
  const questions = quiz.questions || [];
  let correct = 0;
  const results = questions.map((q) => {
    const given = [].concat(answers?.[q.id] ?? []).map(String).sort();
    const expected = (q.options || []).filter((o) => o.correct).map((o) => String(o.id)).sort();
    const ok = given.length === expected.length && given.every((v, i) => v === expected[i]);
    if (ok) correct += 1;
    return { questionId: q.id, correct: ok, expected, given };
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 100;
  const passMark = quiz.passMark ?? 70;
  return { score, passed: score >= passMark, correct, total: questions.length, passMark, results };
}
