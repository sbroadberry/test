/** Real-browser SCORM tests: the SCO (content) discovers the LMS API via window.parent, bookmarks, resumes, scores and completes. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { startDemoServer, launch, login, apiLogin, scoFrame } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startDemoServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.stop(); });

const shots = 'test-results/e2e'; fs.mkdirSync(shots, { recursive: true });

test('SCORM 1.2: launch, bookmark + suspend, resume, score, completion and certificate', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = []; page.on('pageerror', (e) => consoleErrors.push(e.message));
  await login(page, srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  await page.goto(srv.baseUrl + '/catalog');
  await page.click('text=Fire Safety Awareness');
  await page.click('a.btn:has-text("Start course")');
  await page.waitForSelector('[data-testid=scorm-frame]');
  const frame = page.frameLocator('[data-testid=scorm-frame]').frameLocator('#sco');
  await frame.locator('#status[data-entry]').waitFor();
  assert.equal(await frame.locator('#status').getAttribute('data-entry'), 'ab-initio');
  assert.match(await frame.locator('#status').textContent(), /Learner: Murphy, Aoife/);
  // go to page 2 -> SCO sets lesson_location + suspend_data and commits
  await frame.locator('[data-testid=next1]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/scorm12-page2.png` });
  // leave the course: beforeunload sets exit=suspend and finishes -> resume on relaunch
  await page.goto(srv.baseUrl + '/');
  await page.waitForTimeout(500);
  const row = page.locator('[data-testid=enrollment-row]', { hasText: 'Fire Safety Awareness' });
  assert.match(await row.textContent(), /In progress/);
  await row.locator('a.btn').click();
  await page.waitForSelector('[data-testid=scorm-frame]');
  const frame2 = page.frameLocator('[data-testid=scorm-frame]').frameLocator('#sco');
  await frame2.locator('#status[data-entry]').waitFor();
  assert.equal(await frame2.locator('#status').getAttribute('data-entry'), 'resume');
  assert.equal(await frame2.locator('#status').getAttribute('data-location'), 'page2');
  assert.ok(await frame2.locator('#p2').isVisible(), 'resumed on page 2');
  await frame2.locator('[data-testid=next2]').click();
  await frame2.locator('[data-testid=opt-co2]').check();
  await frame2.locator('[data-testid=finish]').click();
  await frame2.locator('#status[data-finished=true]').waitFor();
  await page.waitForSelector('[data-testid=course-complete]', { timeout: 10000 });
  await page.screenshot({ path: `${shots}/scorm12-complete.png` });
  assert.match(await page.locator('[data-testid=scorm-status]').textContent(), /completed/);
  const api = await apiLogin(srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  const certs = await api('/api/certificates');
  assert.ok(certs.certificates.some((c) => c.course_title === 'Fire Safety Awareness'));
  const dash = await api('/api/learn/dashboard');
  const e = dash.enrollments.find((x) => x.title === 'Fire Safety Awareness');
  assert.equal(e.status, 'completed'); assert.equal(e.score, 100);
  assert.deepEqual(consoleErrors, []);
  await ctx.close();
});

test('SCORM 1.2: failing the mastery score records a failed attempt (no certificate)', async () => {
  const api = await apiLogin(srv.baseUrl, 'conor.walsh@example.com', 'Password123!');
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, srv.baseUrl, 'conor.walsh@example.com', 'Password123!');
  const dash = await api('/api/learn/dashboard');
  const e = dash.enrollments.find((x) => x.title === 'Fire Safety Awareness');
  await page.goto(`${srv.baseUrl}/learn/${e.id}`);
  const frame = page.frameLocator('[data-testid=scorm-frame]').frameLocator('#sco');
  await frame.locator('#status[data-entry]').waitFor();
  await frame.locator('[data-testid=next1]').click(); await frame.locator('[data-testid=next2]').click();
  await frame.locator('[data-testid=opt-water]').check(); await frame.locator('[data-testid=finish]').click();
  await frame.locator('#status[data-finished=true]').waitFor();
  await page.waitForTimeout(800);
  const after = await api('/api/learn/dashboard');
  assert.equal(after.enrollments.find((x) => x.title === 'Fire Safety Awareness').status, 'failed');
  assert.equal((await api('/api/certificates')).certificates.some((c) => c.course_title === 'Fire Safety Awareness'), false);
  await ctx.close();
});

test('SCORM 2004 multi-SCO: both lessons must complete; scaled score recorded', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
  await login(page, srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  const api = await apiLogin(srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  const dash = await api('/api/learn/dashboard');
  const e = dash.enrollments.find((x) => x.title === 'Food Hygiene Level 1');
  await page.goto(`${srv.baseUrl}/learn/${e.id}`);
  let frame = await scoFrame(page, 'lesson1.html');
  assert.match(await frame.locator('#status').textContent(), /Connected as Murphy, Aoife/);
  await frame.locator('[data-testid=l1-true]').check(); await frame.locator('[data-testid=l1-finish]').click();
  await frame.locator('#status[data-finished=true]').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/scorm2004-lesson1.png` });
  assert.match(await page.locator('[data-testid=scorm-status]').textContent(), /in_progress/);
  await page.click('[data-testid=sco-LESSON2]');
  frame = await scoFrame(page, 'lesson2.html');
  await frame.locator('[data-testid=l2-true]').check(); await frame.locator('[data-testid=l2-finish]').click();
  await frame.locator('#status[data-finished=true]').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/scorm2004-complete.png` });
  assert.match(await page.locator('[data-testid=scorm-status]').textContent(), /completed/);
  const st = await api(`/api/scorm/${e.id}/${(await api(`/api/learn/enrollments/${e.id}`)).course.modules[0].id}/status`);
  assert.deepEqual(st.items.map((i) => [i.status, i.score]), [['completed', 90], ['completed', 100]]);
  assert.equal(st.module.score, 95);
  await ctx.close();
});

test('Admin uploads a SCORM package through the course builder UI and learner completes a quiz', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
  await login(page, srv.baseUrl, 'admin@fit2trade.com', 'Admin123!');
  await page.goto(srv.baseUrl + '/admin/courses');
  await page.click('[data-testid=new-course]');
  await page.fill('[data-testid=course-title]', 'E2E SCORM Course');
  await page.click('[data-testid=create-course]');
  await page.waitForURL('**/admin/courses/*');
  await page.click('[data-testid=add-scorm]');
  await page.setInputFiles('[data-testid=scorm-file]', path.resolve('tests/fixtures/packages/scorm2004-food-hygiene.zip'));
  await page.click('[data-testid=scorm-upload-submit]');
  await page.waitForSelector('[data-testid=module-row]:has-text("SCORM 2004")');
  await page.screenshot({ path: `${shots}/builder-scorm-uploaded.png` });
  // add a quiz
  await page.click('[data-testid=add-quiz]');
  await page.click('[data-testid=add-question]');
  await page.fill('[data-testid=q-text-0]', 'Is 2 + 2 = 4?');
  await page.fill('[data-testid=q-opt-0-0]', 'Yes'); await page.fill('[data-testid=q-opt-0-1]', 'No');
  await page.click('[data-testid=module-save]');
  await page.click('[data-testid=publish]');
  await page.waitForTimeout(400);
  // enrol learner via API, then complete the quiz in the browser
  const admin = await apiLogin(srv.baseUrl, 'admin@fit2trade.com', 'Admin123!');
  const courses = await admin('/api/courses?q=E2E');
  const course = courses.courses[0];
  const users = await admin('/api/users?q=aoife');
  await admin('/api/enrollments', { method: 'POST', body: JSON.stringify({ userIds: [users.users[0].id], courseIds: [course.id] }) });
  await ctx.clearCookies();
  await login(page, srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  const learner = await apiLogin(srv.baseUrl, 'aoife.murphy@example.com', 'Learner123!');
  const e = (await learner('/api/learn/dashboard')).enrollments.find((x) => x.title === 'E2E SCORM Course');
  await page.goto(`${srv.baseUrl}/learn/${e.id}`);
  await page.click('[data-testid=outline-quiz]');
  await page.locator('[data-testid^=opt-]').first().check();
  await page.click('[data-testid=quiz-submit]');
  await page.waitForSelector('[data-testid=quiz-result]:has-text("Passed")');
  await page.screenshot({ path: `${shots}/quiz-passed.png` });
  await ctx.close();
});
