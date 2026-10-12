/** Boots the API in-process on a random port with an isolated temporary data directory. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function startTestServer({ env = {}, seedDemo = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2t-lms-'));
  Object.assign(process.env, { DATA_DIR: dataDir, JWT_SECRET: 'test-secret', PUBLIC_URL: 'http://localhost:0', LIVE_PROVIDER_SIMULATE: 'true', SEED_DEMO: seedDemo ? 'true' : 'false', NODE_ENV: 'test' }, env);
  const { createApp } = await import('../../server/app.js');
  const { ensureSeed } = await import('../../server/seed.js');
  ensureSeed({ demo: seedDemo });
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_URL = baseUrl;
  return { baseUrl, dataDir, close: () => new Promise((r) => server.close(r)), client: (token) => makeClient(baseUrl, token) };
}

export function makeClient(baseUrl, token = null) {
  const c = {
    token,
    async request(method, p, body, { form, raw } = {}) {
      const headers = {}; if (c.token) headers.Authorization = `Bearer ${c.token}`;
      let payload; if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(baseUrl + p, { method, headers, body: payload });
      if (raw) return res;
      const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, ok: res.ok };
    },
    get: (p, o) => c.request('GET', p, undefined, o), post: (p, b, o) => c.request('POST', p, b, o), put: (p, b) => c.request('PUT', p, b), del: (p) => c.request('DELETE', p),
    async login(email, password) { const r = await c.post('/api/auth/login', { email, password }); if (!r.ok) throw new Error(`login failed: ${JSON.stringify(r.data)}`); c.token = r.data.token; return r.data.user; },
  };
  return c;
}

export async function uploadScorm(client, courseId, zipPath, moduleId = 'new') {
  const form = new FormData();
  form.append('package', new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' }), path.basename(zipPath));
  return client.post(`/api/courses/${courseId}/modules/${moduleId}/scorm`, undefined, { form });
}
