/** LearnUpon adapter: REST API v1 (https://<portal>.learnupon.com/api/v1, basic auth) and CSV report exports. */
import { emptyDataset, parseCsv, datasetFromCsvRows, parseDate, normaliseRole, normaliseStatus } from './normalise.js';

export const meta = {
  id: 'learnupon', label: 'LearnUpon',
  api: { fields: [{ name: 'domain', label: 'Portal domain', placeholder: 'yourcompany.learnupon.com' }, { name: 'username', label: 'API username' }, { name: 'password', label: 'API password', secret: true }] },
  csv: 'Export the Users report and the Enrollments report (Reports > Export CSV). Column names are detected automatically.',
};

async function apiGet(base, auth, path, fetchImpl) {
  const res = await fetchImpl(`${base}${path}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64'), Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LearnUpon API ${path} failed (${res.status}): ${json.message || JSON.stringify(json)}`);
  return json;
}

export async function fromApi({ domain, username, password, baseUrl, fetchImpl = fetch } = {}) {
  if (!username || !password) throw new Error('LearnUpon API username and password are required');
  const base = (baseUrl || `https://${String(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/v1`).replace(/\/$/, '');
  const auth = { username, password };
  const ds = emptyDataset('learnupon');
  const courses = await apiGet(base, auth, '/courses', fetchImpl);
  const courseById = {};
  for (const c of courses?.courses || courses || []) {
    courseById[String(c.id)] = c;
    ds.courses.push({ external_id: String(c.id), title: c.name || c.title, code: c.reference_code || '', description: c.description_text || c.description || '' });
  }
  const users = await apiGet(base, auth, '/users', fetchImpl);
  for (const u of users?.user || users?.users || users || []) {
    const email = String(u.email || '').toLowerCase();
    if (!email) continue;
    ds.users.push({ email, first_name: u.first_name || '', last_name: u.last_name || '', external_id: String(u.id), role: normaliseRole(u.user_type || ''), status: u.enabled === false ? 'inactive' : 'active',
      groups: (u.groups || []).map((g) => g.title || g.name).filter(Boolean), job_title: u.job_title || '', department: u.department || '', location: u.location || '', created_at: parseDate(u.date_created, 'dmy') });
  }
  const enrollments = await apiGet(base, auth, '/enrollments', fetchImpl);
  for (const e of enrollments?.enrollments || enrollments?.enrollment || enrollments || []) {
    const email = String(e.email || e.user_email || e.login || '').toLowerCase();
    const course = courseById[String(e.course_id)] || { name: e.course_name };
    if (!email || !course.name) continue;
    const completedAt = parseDate(e.date_completed || e.completed_date, 'dmy');
    const status = normaliseStatus(e.status, { progress: e.percentage_complete, completedAt });
    ds.enrollments.push({ email, course: course.name, course_external_id: String(e.course_id || ''), status, progress_pct: Number(e.percentage_complete || (status === 'completed' ? 100 : 0)), score: e.percentage_score != null ? Number(e.percentage_score) : null,
      enrolled_at: parseDate(e.date_enrolled || e.enrolled_date, 'dmy'), completed_at: completedAt, expires_at: parseDate(e.date_expires || e.expiry_date, 'dmy'), due_at: parseDate(e.due_date, 'dmy') });
    if (status === 'completed' && (e.certificate_id || e.date_expires || e.expiry_date)) ds.certificates.push({ email, course: course.name, code: e.certificate_id || '', issued_at: completedAt, expires_at: parseDate(e.date_expires || e.expiry_date, 'dmy') });
  }
  return ds;
}

export function fromCsvFiles(files, opts = {}) {
  const ds = emptyDataset('learnupon');
  for (const f of files) datasetFromCsvRows(parseCsv(f.text), { ...opts, source: 'learnupon', fileName: f.name }, ds);
  return ds;
}
