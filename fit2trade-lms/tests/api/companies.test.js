import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let srv, admin;
before(async () => { srv = await startTestServer({ seedDemo: true }); admin = srv.client(); await admin.login('admin@fit2trade.com', 'Admin123!'); });
after(() => srv.close());

test('sample companies exist with the EazySAFE and IACT themes, resolved by slug and by hostname', async () => {
  const list = (await admin.get('/api/companies')).data.companies;
  assert.deepEqual(list.map((c) => c.slug).sort(), ['eazysafe', 'fit2trade', 'iact']);
  const es = list.find((c) => c.slug === 'eazysafe');
  assert.equal(es.theme.primary, '#e8002a'); assert.equal(es.theme.logoUrl, '/brand/eazysafe-logo.png'); assert.equal(es.theme.sidebar, 'dark'); assert.ok(es.users >= 2);
  const iact = list.find((c) => c.slug === 'iact'); assert.equal(iact.theme.primary, '#2f2c7b'); assert.equal(iact.theme.portalName, 'IACT Academy');
  const byHost = await fetch(`${srv.baseUrl}/api/branding`, { headers: { 'x-forwarded-host': 'academy.iact.ie' } }).then((r) => r.json());
  assert.equal(byHost.company.slug, 'iact');
  const def = await fetch(`${srv.baseUrl}/api/branding`).then((r) => r.json());
  assert.equal(def.company.slug, 'fit2trade'); assert.equal(def.theme.primary, '#275c4d'); assert.equal(def.companies.length, 3);
  const presets = (await admin.get('/api/companies/presets')).data; assert.deepEqual(presets.presets.map((p) => p.id), ['fit2trade', 'eazysafe', 'iact']);
});

test('create a company from a preset, customise it, upload a logo, assign users and private courses', async () => {
  const c = await admin.post('/api/companies', { name: 'Acme Hotels', website: 'https://acme.example', email_domains: 'acme.example', theme: { preset: 'eazysafe', portalName: 'Acme Academy', primary: '#123456', loginHeadline: 'Welcome to Acme' }, sso: { google: { enabled: false } } });
  assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(c.data.company.slug, 'acme-hotels');
  assert.equal(c.data.company.theme.primary, '#123456'); assert.equal(c.data.company.theme.accent, '#52555b'); // inherited from preset
  assert.equal(c.data.company.theme.portalName, 'Acme Academy'); assert.equal(c.data.company.theme.shades.text, '#ffffff'); assert.equal(c.data.company.sso.google.enabled, false); assert.equal(c.data.company.sso.microsoft.enabled, true);
  const dup = await admin.post('/api/companies', { name: 'Acme Hotels' }); assert.equal(dup.status, 409);
  const bad = await admin.post('/api/companies', { name: 'Bad Colour', theme: { primary: 'red' } }); assert.equal(bad.data.company.theme.primary, '#275c4d'); // invalid colour ignored
  // logo upload served publicly
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png'); form.append('kind', 'logo');
  const up = await admin.post(`/api/companies/${c.data.company.id}/assets`, undefined, { form });
  assert.equal(up.status, 201, JSON.stringify(up.data)); assert.match(up.data.url, /^\/brand-assets\/acme-hotels-logo-/);
  const asset = await fetch(srv.baseUrl + up.data.url); assert.equal(asset.status, 200); assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(srv.baseUrl + '/brand-assets/..%2F..%2Fserver%2Fconfig.js')).status, 404);
  const branding = await fetch(`${srv.baseUrl}/api/branding?company=acme-hotels`).then((r) => r.json());
  assert.equal(branding.theme.logoUrl, up.data.url); assert.equal(branding.theme.loginHeadline, 'Welcome to Acme');
  // users + private course visibility
  const u = await admin.post('/api/users', { email: 'guest@acme.example', password: 'Learner123!', first_name: 'Guest', company_id: c.data.company.id });
  assert.equal(u.data.user.company_id, c.data.company.id);
  const priv = await admin.post('/api/courses', { title: 'Acme Induction', status: 'published', self_enrol: true, company_id: c.data.company.id });
  const learner = srv.client(); const lu = await learner.login('guest@acme.example', 'Learner123!');
  const meRes = await learner.get('/api/auth/me'); assert.equal(meRes.data.company.theme.portalName, 'Acme Academy');
  const cat = (await learner.get('/api/courses')).data.courses.map((x) => x.title);
  assert.ok(cat.includes('Acme Induction')); assert.ok(cat.includes('Manual Handling Theory')); // shared courses still visible
  const other = srv.client(); await other.login('aoife.murphy@example.com', 'Learner123!');
  assert.ok(!(await other.get('/api/courses')).data.courses.some((x) => x.title === 'Acme Induction'));
  assert.equal((await other.get(`/api/courses/${priv.data.course.id}`)).status, 404);
  const filtered = await admin.get(`/api/users?company=${c.data.company.id}`); assert.deepEqual(filtered.data.users.map((x) => x.email), ['guest@acme.example']);
  // certificate PDF renders with the company theme (no crash with uploaded logo)
  const cert = await admin.put(`/api/enrollments/${(await admin.post('/api/enrollments', { userIds: [u.data.user.id], courseIds: [priv.data.course.id] }), (await admin.get(`/api/enrollments?userId=${u.data.user.id}`)).data.enrollments[0].id)}`, { status: 'completed' });
  const certs = (await learner.get('/api/certificates')).data.certificates; assert.equal(certs.length, 1);
  const pdf = await learner.get(`/api/certificates/${certs[0].id}/pdf`, { raw: true }); assert.equal(pdf.status, 200);
  // delete moves users to the default company; default cannot be deleted
  const del = await admin.del(`/api/companies/${c.data.company.id}`); assert.equal(del.data.ok, true);
  assert.equal((await admin.get('/api/users?q=guest@acme')).data.users[0].company_name, 'Fit2Trade');
  const defId = (await admin.get('/api/companies')).data.companies.find((x) => x.is_default).id;
  assert.equal((await admin.del(`/api/companies/${defId}`)).status, 400);
  const mgr = srv.client(); await mgr.login('manager@fit2trade.com', 'Manager123!');
  assert.equal((await mgr.post('/api/companies', { name: 'Nope' })).status, 403); // managers can view, only admins change
});
