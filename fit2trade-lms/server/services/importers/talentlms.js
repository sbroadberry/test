/** TalentLMS adapter: REST API v1 (https://<domain>.talentlms.com/api/v1) and CSV exports. */
import { emptyDataset, parseCsv, datasetFromCsvRows, parseDate, normaliseRole, normaliseUserStatus, normaliseStatus } from './normalise.js';

export const meta = {
  id: 'talentlms', label: 'TalentLMS',
  api: { fields: [{ name: 'domain', label: 'Portal domain', placeholder: 'yourcompany.talentlms.com' }, { name: 'apiKey', label: 'API key', secret: true }] },
  csv: 'Export Users (Users > Export) and the Course progress / Training matrix report as CSV. Column names are detected automatically.',
};

async function apiGet(base, apiKey, path, fetchImpl) {
  const res = await fetchImpl(`${base}${path}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64'), Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`TalentLMS API ${path} failed (${res.status}): ${json.error?.message || JSON.stringify(json)}`);
  return json;
}

export async function fromApi({ domain, apiKey, baseUrl, concurrency = 4, fetchImpl = fetch, onProgress } = {}) {
  if (!apiKey) throw new Error('TalentLMS API key is required');
  const base = (baseUrl || `https://${String(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/v1`).replace(/\/$/, '');
  const ds = emptyDataset('talentlms');
  const courses = await apiGet(base, apiKey, '/courses', fetchImpl);
  const courseById = {};
  for (const c of courses || []) {
    courseById[String(c.id)] = c;
    ds.courses.push({ external_id: String(c.id), title: c.name, code: c.code || '', description: c.description || '', category: c.category_name || c.category || '' });
  }
  const users = await apiGet(base, apiKey, '/users', fetchImpl);
  let done = 0;
  const queue = [...(users || [])];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      let detail = u;
      try { detail = await apiGet(base, apiKey, `/users/id:${u.id}`, fetchImpl); } catch (e) { ds.warnings.push(`User ${u.email || u.id}: ${e.message}`); }
      const email = String(detail.email || u.email || '').toLowerCase();
      if (!email) { ds.warnings.push(`User id ${u.id} has no email, skipped`); continue; }
      ds.users.push({
        email, first_name: detail.first_name || '', last_name: detail.last_name || '', external_id: String(detail.id || u.id),
        role: normaliseRole(detail.user_type || ''), status: normaliseUserStatus(detail.status || 'active'),
        groups: (detail.groups || []).map((g) => g.name).filter(Boolean), created_at: parseDate(detail.created_on, 'dmy'),
        job_title: '', department: '', location: '',
      });
      for (const c of detail.courses || []) {
        const course = courseById[String(c.id)] || { name: c.name, code: c.code };
        const completedAt = parseDate(c.completed_on, 'dmy');
        const status = normaliseStatus(c.completion_status, { progress: Number(c.completion_percentage || 0), completedAt });
        const completed = status === 'completed';
        ds.enrollments.push({
          email, course: course.name, course_code: course.code || '', course_external_id: String(c.id), status,
          progress_pct: Number(c.completion_percentage || (completed ? 100 : 0)), score: c.score != null ? Number(c.score) : null,
          enrolled_at: parseDate(c.enrolled_on, 'dmy'), completed_at: completedAt, expires_at: parseDate(c.expired_on || c.expiration_date, 'dmy'),
          time_spent_sec: Number(c.total_time_seconds || 0),
        });
      }
      for (const cert of detail.certifications || []) {
        ds.certificates.push({ email, course: cert.course_name, course_external_id: String(cert.course_id || ''), code: cert.certificate_id || cert.id || '', issued_at: parseDate(cert.issued_date, 'dmy'), expires_at: parseDate(cert.expiration_date, 'dmy'), download_url: cert.download_url || '' });
      }
      done += 1;
      if (onProgress) onProgress({ done, total: users.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  return ds;
}

export function fromCsvFiles(files, opts = {}) {
  const ds = emptyDataset('talentlms');
  for (const f of files) {
    const rows = parseCsv(f.text);
    datasetFromCsvRows(rows, { ...opts, source: 'talentlms', fileName: f.name }, ds);
  }
  return ds;
}
