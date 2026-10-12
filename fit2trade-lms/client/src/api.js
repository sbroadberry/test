/** Tiny fetch wrapper for the Fit2Trade Learn API (cookie-based auth). */
export class ApiError extends Error { constructor(message, status, body) { super(message); this.status = status; this.body = body; } }

export async function api(path, { method = 'GET', body, form, headers = {} } = {}) {
  const opts = { method, credentials: 'include', headers: { Accept: 'application/json', ...headers } };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new ApiError(data?.error || `${res.status} ${res.statusText}`, res.status, data);
  return data;
}
api.get = (p) => api(p);
api.post = (p, body) => api(p, { method: 'POST', body });
api.put = (p, body) => api(p, { method: 'PUT', body });
api.del = (p) => api(p, { method: 'DELETE' });
api.upload = (p, form, method = 'POST') => api(p, { method, form });

export const fmtDate = (iso, opts = {}) => (iso ? new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', ...opts }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDuration = (sec) => { if (!sec) return '0m'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
export const daysUntil = (iso) => (iso ? Math.ceil((new Date(iso) - Date.now()) / 86400000) : null);
export const STATUS_LABEL = { enrolled: 'Not started', in_progress: 'In progress', completed: 'Completed', failed: 'Failed', not_started: 'Not started' };
export const MODULE_LABEL = { scorm: 'SCORM', video: 'Video', document: 'Document', page: 'Page', quiz: 'Assessment', live: 'Live session', survey: 'Survey', link: 'Web link' };
