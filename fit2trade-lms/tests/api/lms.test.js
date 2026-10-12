import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startTestServer, uploadScorm } from '../helpers/server.js';

let srv, admin, learner, learnerId, courseId, quizModuleId, groupId;
const fixtures = path.resolve('tests/fixtures/packages');

before(async () => {
  srv = await startTestServer();
  admin = srv.client();
  await admin.login('admin@fit2trade.com', 'Admin123!');
});
after(() => srv.close());

test('health + auth basics', async () => {
  const h = await srv.client().get('/api/health'); assert.equal(h.data.ok, true);
  const bad = await srv.client().post('/api/auth/login', { email: 'admin@fit2trade.com', password: 'wrong' }); assert.equal(bad.status, 401);
  const me = await admin.get('/api/auth/me'); assert.equal(me.data.user.role, 'admin');
  const anon = await srv.client().get('/api/users'); assert.equal(anon.status, 401);
});

test('admin creates a learner, group and course with quiz; group assignment auto-enrols', async () => {
  const u = await admin.post('/api/users', { email: 'test.learner@example.com', password: 'Learner123!', first_name: 'Test', last_name: 'Learner', department: 'QA' });
  assert.equal(u.status, 201); learnerId = u.data.user.id;
  const dup = await admin.post('/api/users', { email: 'test.learner@example.com', first_name: 'X' }); assert.equal(dup.status, 409);
  const g = await admin.post('/api/groups', { name: 'QA team' }); groupId = g.data.group.id;
  await admin.post(`/api/groups/${groupId}/members`, { userIds: [learnerId] });
  const c = await admin.post('/api/courses', { title: 'Test Course', category: 'Testing', self_enrol: false, certificate_validity_months: 12 });
  assert.equal(c.status, 201); courseId = c.data.course.id;
  await admin.post(`/api/courses/${courseId}/modules`, { type: 'page', title: 'Intro', content: { html: '<p>hi</p>' } });
  const q = await admin.post(`/api/courses/${courseId}/modules`, { type: 'quiz', title: 'Quiz', content: { passMark: 50, attemptsAllowed: 2, questions: [{ id: 'q1', type: 'single', text: '1+1', options: [{ id: 'a', text: '2', correct: true }, { id: 'b', text: '3' }] }, { id: 'q2', type: 'truefalse', text: 'Sky is blue', options: [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False' }] }] } });
  quizModuleId = q.data.module.id;
  await admin.put(`/api/courses/${courseId}`, { status: 'published' });
  const assign = await admin.post(`/api/groups/${groupId}/courses`, { courseId, dueDays: 14 });
  assert.equal(assign.data.enrolled, 1);
  // learner cannot see quiz answers
  learner = srv.client(); await learner.login('test.learner@example.com', 'Learner123!');
  const course = await learner.get(`/api/courses/${courseId}`);
  assert.equal(course.data.enrollment.source, 'group');
  assert.ok(course.data.enrollment.due_at);
  const quiz = course.data.course.modules.find((m) => m.type === 'quiz');
  assert.equal(quiz.content.questions[0].options[0].correct, undefined);
  // learner cannot access admin endpoints
  assert.equal((await learner.get('/api/users')).status, 403);
  assert.equal((await learner.post('/api/courses', { title: 'x' })).status, 403);
});

test('learner completes page + quiz -> enrolment completed, certificate issued with expiry, notification sent', async () => {
  const dash = await learner.get('/api/learn/dashboard');
  const enr = dash.data.enrollments.find((e) => e.course_id === courseId);
  const detail = await learner.get(`/api/learn/enrollments/${enr.id}`);
  const page = detail.data.course.modules.find((m) => m.type === 'page');
  const p = await learner.post(`/api/learn/enrollments/${enr.id}/modules/${page.id}/progress`, { status: 'completed', timeSpentSec: 30 });
  assert.equal(p.data.enrollment.status, 'in_progress'); assert.equal(p.data.enrollment.progress_pct, 50);
  const fail = await learner.post(`/api/learn/enrollments/${enr.id}/modules/${quizModuleId}/quiz`, { answers: { q1: ['b'], q2: ['f'] } });
  assert.equal(fail.data.result.score, 0); assert.equal(fail.data.enrollment.status, 'failed'); assert.equal(fail.data.attemptsLeft, 1);
  const pass = await learner.post(`/api/learn/enrollments/${enr.id}/modules/${quizModuleId}/quiz`, { answers: { q1: ['a'], q2: ['t'] } });
  assert.equal(pass.data.result.score, 100); assert.equal(pass.data.enrollment.status, 'completed'); assert.equal(pass.data.enrollment.progress_pct, 100);
  const third = await learner.post(`/api/learn/enrollments/${enr.id}/modules/${quizModuleId}/quiz`, { answers: {} });
  assert.equal(third.status, 200); assert.equal(third.data.enrollment.status, 'completed'); // a passed quiz never regresses
  const certs = await learner.get('/api/certificates');
  assert.equal(certs.data.certificates.length, 1); assert.ok(certs.data.certificates[0].expires_at); assert.match(certs.data.certificates[0].code, /^F2T-/);
  const pdf = await learner.get(`/api/certificates/${certs.data.certificates[0].id}/pdf`, { raw: true });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await pdf.arrayBuffer()); assert.equal(buf.subarray(0, 4).toString(), '%PDF');
  const verify = await srv.client().get(`/api/certificates/verify/${certs.data.certificates[0].code}`); assert.equal(verify.data.valid, true);
  const notifs = await learner.get('/api/notifications');
  assert.ok(notifs.data.notifications.some((n) => n.type === 'course_completed'));
  assert.ok(notifs.data.notifications.some((n) => n.type === 'enrolled'));
  // other learner cannot read this enrolment
  const other = await admin.post('/api/users', { email: 'other@example.com', password: 'Other123!', first_name: 'Other' });
  const otherC = srv.client(); await otherC.login('other@example.com', 'Other123!');
  assert.equal((await otherC.get(`/api/learn/enrollments/${enr.id}`)).status, 403);
});

test('SCORM upload (1.2, 2004, nested, broken) and tracking via commit endpoint', async () => {
  const c = await admin.post('/api/courses', { title: 'SCORM Course', status: 'published' });
  const scormCourse = c.data.course.id;
  const r12 = await uploadScorm(admin, scormCourse, path.join(fixtures, 'scorm12-fire-safety.zip'));
  assert.equal(r12.status, 201, JSON.stringify(r12.data)); assert.equal(r12.data.package.version, '1.2'); assert.equal(r12.data.package.launchPath, 'index.html');
  const r2004 = await uploadScorm(admin, scormCourse, path.join(fixtures, 'scorm2004-food-hygiene.zip'));
  assert.equal(r2004.status, 201); assert.equal(r2004.data.package.version, '2004'); assert.equal(r2004.data.package.items, 2);
  const nested = await uploadScorm(admin, scormCourse, path.join(fixtures, 'scorm12-nested.zip'));
  assert.equal(nested.status, 201); assert.equal(nested.data.package.launchPath, 'index.html');
  const broken = await uploadScorm(admin, scormCourse, path.join(fixtures, 'scorm12-broken.zip'));
  assert.equal(broken.status, 400); assert.match(broken.data.error, /imsmanifest/);
  await admin.post('/api/enrollments', { userIds: [learnerId], courseIds: [scormCourse] });
  const dash = await learner.get('/api/learn/dashboard');
  const enr = dash.data.enrollments.find((e) => e.course_id === scormCourse);
  // player page exposes config + content is served with auth
  const player = await learner.get(`/api/scorm/player/${enr.id}/${r12.data.moduleId}`, { raw: true });
  const html = await player.text();
  assert.match(html, /scorm-runtime\.js/); assert.match(html, /"version":"1\.2"/); assert.match(html, /\/scorm-content\//);
  const contentUrl = /"contentUrl":"([^"]+)"/.exec(html)[1];
  const content = await learner.get(contentUrl, { raw: true }); assert.equal(content.status, 200); assert.match(await content.text(), /Fire Safety Awareness/);
  assert.equal((await srv.client().get(contentUrl, { raw: true })).status, 401); // no auth, no content
  assert.equal((await learner.get(contentUrl.replace('index.html', '..%2F..%2Fetc%2Fpasswd'), { raw: true })).status, 400);
  assert.equal((await learner.get(contentUrl.replace('index.html', 'missing.html'), { raw: true })).status, 404);
  // interim commit (bookmark) then final commit with score
  const c1 = await learner.post(`/api/scorm/${enr.id}/${r12.data.moduleId}/commit`, { item: 'ITEM1', cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': 'page2', 'cmi.suspend_data': 'x' }, final: false });
  assert.equal(c1.data.moduleStatus, 'in_progress');
  const resumed = await (await learner.get(`/api/scorm/player/${enr.id}/${r12.data.moduleId}`, { raw: true })).text();
  assert.match(resumed, /"cmi.core.lesson_location":"page2"/);
  const c2 = await learner.post(`/api/scorm/${enr.id}/${r12.data.moduleId}/commit`, { item: 'ITEM1', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90', 'cmi.core.total_time': '0000:02:00.00' }, sessionTimeSec: 120, final: true });
  assert.equal(c2.data.moduleStatus, 'completed'); assert.equal(c2.data.score, 90);
  // 2004 multi-SCO: one SCO done -> module still in progress; both -> completed
  const a = await learner.post(`/api/scorm/${enr.id}/${r2004.data.moduleId}/commit`, { item: 'LESSON1', cmi: { 'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9' }, final: true });
  assert.equal(a.data.moduleStatus, 'in_progress');
  const b = await learner.post(`/api/scorm/${enr.id}/${r2004.data.moduleId}/commit`, { item: 'LESSON2', cmi: { 'cmi.completion_status': 'completed', 'cmi.score.scaled': '1' }, final: true });
  assert.equal(b.data.moduleStatus, 'completed'); assert.equal(b.data.score, 95);
  const status = await learner.get(`/api/scorm/${enr.id}/${r2004.data.moduleId}/status`);
  assert.deepEqual(status.data.items.map((i) => i.status), ['completed', 'completed']);
  await learner.post(`/api/scorm/${enr.id}/${nested.data.moduleId}/commit`, { item: 'ITEM1', cmi: { 'cmi.core.lesson_status': 'completed' }, final: true });
  const final = await learner.get(`/api/learn/enrollments/${enr.id}`);
  assert.equal(final.data.enrollment.status, 'completed');
  assert.equal(final.data.enrollment.score, Math.round((90 + 95) / 2));
});

test('reports, CSV export and audit log', async () => {
  const o = await admin.get('/api/reports/overview');
  assert.ok(o.data.totals.completions >= 2); assert.ok(o.data.byCourse.length >= 2);
  const csv = await admin.get('/api/reports/export.csv?type=enrollments', { raw: true });
  const text = await csv.text(); assert.match(text, /email,first_name/); assert.match(text, /test.learner@example.com/);
  const certsCsv = await (await admin.get('/api/reports/export.csv?type=certificates', { raw: true })).text(); assert.match(certsCsv, /F2T-/);
  const audit = await admin.get('/api/reports/audit'); assert.ok(audit.data.entries.some((e) => e.action === 'scorm.upload'));
  const learnerAudit = await learner.get('/api/reports/audit'); assert.equal(learnerAudit.status, 403);
});

test('certificate expiry reminders: in-app notification + email outbox, deduplicated, admin digest', async () => {
  // make the learner's certificate expire in 5 days
  const certs = await admin.get(`/api/certificates?userId=${learnerId}`);
  const cert = certs.data.certificates[0];
  const { run } = await import('../../server/db.js');
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  run('UPDATE certificates SET expires_at = ? WHERE id = ?', soon, cert.id);
  const r1 = await admin.post('/api/settings/jobs/reminders', { only: 'certificates' });
  assert.equal(r1.data.certificates.notified, 1);
  const notifs = await learner.get('/api/notifications');
  const n = notifs.data.notifications.find((x) => x.type === 'certificate_expiring');
  assert.ok(n); assert.match(n.title, /expires in 5 days/);
  const outbox = await admin.get('/api/settings/outbox');
  const mail = outbox.data.emails.find((e) => e.category === 'certificate_expiry' && e.to_email === 'test.learner@example.com');
  assert.ok(mail); assert.equal(mail.status, 'skipped'); // SMTP not configured in tests -> recorded, not sent
  const full = await admin.get(`/api/settings/outbox/${mail.id}`); assert.match(full.data.email.html, /Renew now/);
  const r2 = await admin.post('/api/settings/jobs/reminders', { only: 'certificates' });
  assert.equal(r2.data.certificates.notified, 0); // same window not sent twice
  // now expired -> learner gets expired notice and admins get a digest
  run('UPDATE certificates SET expires_at = ? WHERE id = ?', new Date(Date.now() - 86400000).toISOString(), cert.id);
  const r3 = await admin.post('/api/settings/jobs/reminders', { only: 'certificates' });
  assert.equal(r3.data.certificates.notified, 1); assert.equal(r3.data.certificates.expired.length, 1);
  const adminNotifs = await admin.get('/api/notifications');
  assert.ok(adminNotifs.data.notifications.some((x) => x.type === 'compliance_alert'));
  const report = await admin.get('/api/reports/expiry?days=30');
  assert.ok(report.data.certificates.some((c) => c.id === cert.id && c.days_left < 0));
  assert.ok(report.data.reminders.length >= 2);
  // learner who opts out of email gets in-app only
  await learner.put('/api/auth/me', { email_notifications: false });
  const me = await learner.get('/api/auth/me'); assert.equal(me.data.user.email_notifications, 0);
});

test('migration import: CSV preview + run is idempotent and creates certificates', async () => {
  const csv = 'Email,First name,Last name,Role,Department,Group,Course,Course code,Status,Progress,Score,Enrolled on,Completed on,Expiry date,Certificate code\n' +
    'mig.one@example.com,Mig,One,learner,Ops,Migrated Dublin,Test Course,,Completed,100,88,01/02/2025,15/02/2025,15/02/2027,TLMS-001\n' +
    'mig.one@example.com,Mig,One,learner,Ops,Migrated Dublin,Legacy Course,LC-1,In progress,40,,01/03/2025,,,\n' +
    'mig.two@example.com,Mig,Two,trainer,Ops,Migrated Dublin,Legacy Course,LC-1,Not started,0,,05/03/2025,,,\n';
  const form = new FormData(); form.append('source', 'talentlms'); form.append('mode', 'csv'); form.append('files', new Blob([csv], { type: 'text/csv' }), 'talentlms-progress.csv');
  const preview = await admin.post('/api/import/preview', undefined, { form });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const s = preview.data.summary;
  assert.equal(s.users.total, 2); assert.equal(s.users.new, 2); assert.equal(s.courses.total, 2); assert.equal(s.courses.existing, 1); assert.equal(s.enrollments.total, 3); assert.equal(s.certificates.total, 1);
  assert.equal(s.mappings['talentlms-progress.csv'].expires_at, 'Expiry date');
  const run1 = await admin.post(`/api/import/jobs/${preview.data.jobId}/run`, { options: { notifyUsers: true } });
  assert.deepEqual(run1.data.result.users, { created: 2, updated: 0, skipped: 0 });
  assert.equal(run1.data.result.courses.created, 1); assert.equal(run1.data.result.enrollments.created, 3); assert.equal(run1.data.result.certificates.created, 1); assert.equal(run1.data.result.groups.created, 1);
  const u = await admin.get('/api/users?q=mig.one');
  assert.equal(u.data.users[0].external_source, 'talentlms'); assert.equal(u.data.users[0].completions, 1); assert.equal(u.data.users[0].group_names, 'Migrated Dublin');
  const u2 = await admin.get('/api/users?q=mig.two'); assert.equal(u2.data.users[0].role, 'instructor');
  const rec = await admin.get(`/api/users/${u.data.users[0].id}`);
  const cert = rec.data.certificates[0]; assert.equal(cert.code, 'TLMS-001'); assert.equal(cert.expires_at.slice(0, 10), '2027-02-15');
  assert.equal(rec.data.enrollments.find((e) => e.course_title === 'Legacy Course').status, 'in_progress');
  // migrated user must change password and can log in with the default temporary password
  const migrated = srv.client(); const mu = await migrated.login('mig.one@example.com', 'Welcome2Learn!'); assert.equal(mu.must_change_password, 1);
  // re-run: nothing duplicated
  const form2 = new FormData(); form2.append('source', 'talentlms'); form2.append('mode', 'csv'); form2.append('files', new Blob([csv], { type: 'text/csv' }), 'talentlms-progress.csv');
  const preview2 = await admin.post('/api/import/preview', undefined, { form: form2 });
  assert.equal(preview2.data.summary.users.existing, 2);
  const run2 = await admin.post(`/api/import/jobs/${preview2.data.jobId}/run`, { options: {} });
  assert.equal(run2.data.result.users.created, 0); assert.equal(run2.data.result.enrollments.created, 0); assert.equal(run2.data.result.certificates.created, 0); assert.equal(run2.data.result.certificates.skipped, 1);
  const jobs = await admin.get('/api/import/jobs'); assert.equal(jobs.data.jobs.filter((j) => j.status === 'completed').length, 2);
  const tmpl = await (await admin.get('/api/import/templates/records.csv', { raw: true })).text(); assert.match(tmpl, /Certificate code/);
  const manager = srv.client(); await admin.post('/api/users', { email: 'mgr@example.com', password: 'Manager123!', first_name: 'M', role: 'manager' }); await manager.login('mgr@example.com', 'Manager123!');
  assert.equal((await manager.get('/api/import/sources')).status, 200); // managers may migrate too
  const learnerC = srv.client(); await learnerC.login('test.learner@example.com', 'Learner123!');
  assert.equal((await learnerC.get('/api/import/sources')).status, 403);
});

test('migration import: TalentLMS users + progress exports (learners by name/login), xlsx and manual mapping', async () => {
  const { makeXlsx } = await import('../unit/importer-formats.test.js');
  const users = '"Login","First name","Last name","Email","User type","Status","Groups"\n"pb","Patrick","Byrne","patrick.b@example.com","Learner-Type","Active","Cork"\n';
  const progress = '"User","Course","Enrolled on","Completed on","Progress (%)","Score","Status","Certificate"\n"Patrick Byrne (pb)","Test Course","15/01/2025","20/01/2025","100","77","Completed","Yes"\n"Test Learner","Test Course","15/01/2025","","10","","In progress","No"\n';
  const form = new FormData(); form.append('source', 'talentlms'); form.append('mode', 'csv');
  form.append('files', new Blob([progress], { type: 'text/csv' }), 'course-progress.csv'); form.append('files', new Blob([users], { type: 'text/csv' }), 'users.csv');
  const preview = await admin.post('/api/import/preview', undefined, { form });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const s = preview.data.summary;
  assert.equal(s.users.total, 2); // Patrick from users export + "Test Learner" matched by name to the existing account
  assert.equal(s.enrollments.total, 2); assert.equal(s.unresolved, 0); assert.equal(s.certificates.total, 1);
  assert.deepEqual(s.headers['users.csv'], ['Login', 'First name', 'Last name', 'Email', 'User type', 'Status', 'Groups']);
  const run = await admin.post(`/api/import/jobs/${preview.data.jobId}/run`, { options: {} });
  assert.equal(run.data.result.users.created, 1); assert.equal(run.data.result.certificates.created, 1);
  const pb = (await admin.get('/api/users?q=patrick.b')).data.users[0];
  assert.equal(pb.external_id, 'pb'); assert.equal(pb.group_names, 'Cork'); assert.equal(pb.completions, 1);
  // xlsx with unusual headers: nothing detected until mapped
  const xlsx = makeXlsx([['Staff mail', 'Person', 'Programme', 'Outcome', 'Finished'], ['xl.user@example.com', 'Excel User', 'Test Course', 'Pass', new Date(Date.UTC(2025, 2, 3))]]);
  const f2 = new FormData(); f2.append('source', 'csv'); f2.append('mode', 'csv'); f2.append('files', new Blob([xlsx]), 'export.xlsx');
  const p2 = await admin.post('/api/import/preview', undefined, { form: f2 });
  assert.equal(p2.status, 200, JSON.stringify(p2.data)); assert.equal(p2.data.summary.users.total, 0); assert.match(p2.data.summary.warnings[0], /could not find an Email/);
  const f3 = new FormData(); f3.append('source', 'csv'); f3.append('mode', 'csv'); f3.append('files', new Blob([xlsx]), 'export.xlsx');
  f3.append('overrides', JSON.stringify({ 'export.xlsx': { email: 'Staff mail', full_name: 'Person', course: 'Programme', status: 'Outcome', completed_at: 'Finished' } }));
  const p3 = await admin.post('/api/import/preview', undefined, { form: f3 });
  assert.equal(p3.data.summary.users.total, 1); assert.equal(p3.data.summary.enrollments.completed, 1);
  const r3 = await admin.post(`/api/import/jobs/${p3.data.jobId}/run`, { options: {} });
  assert.equal(r3.data.result.users.created, 1); assert.equal(r3.data.result.enrollments.created, 1);
  const xl = await admin.get(`/api/users/${(await admin.get('/api/users?q=xl.user')).data.users[0].id}`);
  assert.equal(xl.data.enrollments[0].completed_at.slice(0, 10), '2025-03-03');
  const bad = new FormData(); bad.append('source', 'csv'); bad.append('mode', 'csv'); bad.append('files', new Blob(['x']), 'old.xls');
  assert.equal((await admin.post('/api/import/preview', undefined, { form: bad })).status, 400);
});

test('learning paths and live sessions (simulated provider) with attendance completing a live module', async () => {
  const c = await admin.post('/api/courses', { title: 'Blended Course', status: 'published' });
  const live = await admin.post(`/api/courses/${c.data.course.id}/modules`, { type: 'live', title: 'Classroom' });
  const p = await admin.post('/api/paths', { title: 'Onboarding', status: 'published', courseIds: [courseId, c.data.course.id] });
  const pe = await admin.post(`/api/paths/${p.data.path.id}/enrol`, { userIds: [learnerId] });
  assert.equal(pe.data.created, 1); // already enrolled in first course
  const s = await admin.post('/api/sessions', { title: 'Live class', provider: 'teams', course_id: c.data.course.id, module_id: live.data.module.id, starts_at: new Date(Date.now() + 3600000).toISOString(), ends_at: new Date(Date.now() + 7200000).toISOString(), registerEnrolled: true });
  assert.equal(s.status, 201); assert.equal(s.data.session.provider, 'simulated'); // Teams not configured -> built-in classroom
  assert.match(s.data.session.join_url, /\/live\//); assert.equal(s.data.registered, 1);
  const mine = await learner.get('/api/sessions?mine=1'); assert.equal(mine.data.sessions.length, 1); assert.equal(mine.data.sessions[0].my_registration, 'registered');
  const att = await admin.post(`/api/sessions/${s.data.session.id}/attendance`, { attendance: [{ userId: learnerId, status: 'attended', attendedMinutes: 55 }] });
  assert.equal(att.data.registrations[0].status, 'attended');
  const dash = await learner.get('/api/learn/dashboard');
  const enr = dash.data.enrollments.find((e) => e.course_id === c.data.course.id);
  assert.equal(enr.status, 'completed'); // attending the only (required) module completes the course
  const bad = await admin.post('/api/sessions', { title: 'x', starts_at: '2026-01-01T10:00:00Z', ends_at: '2026-01-01T09:00:00Z' }); assert.equal(bad.status, 400);
  const sessionsCsv = await (await admin.get('/api/reports/export.csv?type=sessions', { raw: true })).text(); assert.match(sessionsCsv, /attended/);
});
