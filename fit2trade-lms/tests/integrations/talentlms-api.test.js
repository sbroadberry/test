/** The TalentLMS adapter against a mock of the TalentLMS REST API v1, then applied to a fresh LMS. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

function startTalentMock() {
  const app = express();
  const auth = (req, res, next) => { const h = req.headers.authorization || ''; const [key] = Buffer.from(h.replace('Basic ', ''), 'base64').toString().split(':'); return key === 'tl-key' ? next() : res.status(401).json({ error: { message: 'Invalid API key' } }); };
  app.get('/api/v1/courses', auth, (req, res) => res.json([{ id: '10', name: 'Manual Handling', code: 'MH', category_name: 'Safety', description: 'd' }, { id: '11', name: 'Fire Safety', code: 'FS' }]));
  app.get('/api/v1/users', auth, (req, res) => res.json([{ id: '1', login: 'aoife', email: 'aoife.tl@example.com', first_name: 'Aoife', last_name: 'Murphy', user_type: 'Learner-Type', status: 'active' }, { id: '2', login: 'shane', email: 'shane.tl@example.com', first_name: 'Shane', last_name: 'Kelly', user_type: 'Trainer-Type', status: 'inactive' }]));
  app.get(/^\/api\/v1\/users\/id:(\d+)$/, auth, (req, res) => {
    if (req.params[0] === '1') return res.json({ id: '1', email: 'aoife.tl@example.com', first_name: 'Aoife', last_name: 'Murphy', user_type: 'Learner-Type', status: 'active', created_on: '12/01/2024, 10:00:00', groups: [{ id: '5', name: 'Hospitality' }],
      courses: [{ id: '10', name: 'Manual Handling', completion_status: 'Completed', completion_percentage: '100', enrolled_on: '01/02/2025, 09:00:00', completed_on: '10/02/2025, 11:30:00', total_time_seconds: 1800, score: 91 }, { id: '11', name: 'Fire Safety', completion_status: 'Not completed', completion_percentage: '35', enrolled_on: '05/03/2025, 09:00:00', completed_on: '' }],
      certifications: [{ course_id: '10', course_name: 'Manual Handling', issued_date: '10/02/2025', expiration_date: '10/02/2027', download_url: 'https://x/cert.pdf' }] });
    return res.json({ id: '2', email: 'shane.tl@example.com', first_name: 'Shane', last_name: 'Kelly', user_type: 'Trainer-Type', status: 'inactive', courses: [], certifications: [] });
  });
  return new Promise((r) => { const s = app.listen(0, () => r(s)); });
}

test('TalentLMS API adapter -> dataset -> applied to LMS', async () => {
  const server = await startTalentMock();
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const { fromApi } = await import('../../server/services/importers/talentlms.js');
    await assert.rejects(() => fromApi({ apiKey: 'bad', baseUrl }), /TalentLMS API \/courses failed \(401\)/);
    const ds = await fromApi({ domain: 'fit2trade.talentlms.com', apiKey: 'tl-key', baseUrl });
    assert.equal(ds.source, 'talentlms'); assert.equal(ds.users.length, 2); assert.equal(ds.courses.length, 2);
    const aoife = ds.users.find((u) => u.email === 'aoife.tl@example.com');
    assert.equal(aoife.role, 'learner'); assert.deepEqual(aoife.groups, ['Hospitality']); assert.equal(aoife.external_id, '1');
    assert.equal(ds.users.find((u) => u.email === 'shane.tl@example.com').role, 'instructor');
    assert.equal(ds.users.find((u) => u.email === 'shane.tl@example.com').status, 'inactive');
    assert.equal(ds.enrollments.length, 2);
    const mh = ds.enrollments.find((e) => e.course === 'Manual Handling'); assert.equal(mh.status, 'completed'); assert.equal(mh.score, 91); assert.equal(mh.completed_at.slice(0, 10), '2025-02-10'); assert.equal(mh.time_spent_sec, 1800);
    assert.equal(ds.enrollments.find((e) => e.course === 'Fire Safety').status, 'in_progress');
    assert.equal(ds.certificates.length, 1); assert.equal(ds.certificates[0].expires_at.slice(0, 10), '2027-02-10');

    // apply to an isolated LMS via the HTTP API (mode=api with the mock base URL)
    const { startTestServer } = await import('../helpers/server.js');
    const srv = await startTestServer();
    try {
      const admin = srv.client(); await admin.login('admin@fit2trade.com', 'Admin123!');
      const form = new FormData(); form.append('source', 'talentlms'); form.append('mode', 'api'); form.append('domain', 'fit2trade.talentlms.com'); form.append('apiKey', 'tl-key'); form.append('baseUrl', baseUrl);
      const preview = await admin.post('/api/import/preview', undefined, { form });
      assert.equal(preview.status, 200, JSON.stringify(preview.data));
      assert.equal(preview.data.summary.users.total, 2); assert.equal(preview.data.summary.certificates.withExpiry, 1);
      const run = await admin.post(`/api/import/jobs/${preview.data.jobId}/run`, { options: { skipInactive: true, assignGroup: 'Migrated from TalentLMS' } });
      assert.deepEqual(run.data.result.users, { created: 1, updated: 0, skipped: 1 });
      assert.equal(run.data.result.courses.created, 2); assert.equal(run.data.result.enrollments.created, 2); assert.equal(run.data.result.certificates.created, 1);
      const users = await admin.get('/api/users?q=aoife.tl');
      assert.equal(users.data.users.length, 1); assert.equal(users.data.users[0].group_names.includes('Hospitality'), true); assert.equal(users.data.users[0].group_names.includes('Migrated from TalentLMS'), true);
      const rec = await admin.get(`/api/users/${users.data.users[0].id}`);
      assert.equal(rec.data.certificates.length, 1); assert.equal(rec.data.enrollments.length, 2);
      const expiry = await admin.get('/api/reports/expiry?days=365'); assert.equal(expiry.data.certificates.length, 1);
      const bad = await admin.post('/api/import/preview', undefined, { form: (() => { const f = new FormData(); f.append('source', 'talentlms'); f.append('mode', 'api'); f.append('apiKey', 'nope'); f.append('baseUrl', baseUrl); return f; })() });
      assert.equal(bad.status, 400); assert.match(bad.data.error, /401/);
    } finally { await srv.close(); }
  } finally { server.close(); }
});
