/** Drives a fresh demo portal and captures the screenshots used in docs/Fit2Trade-Learn-User-Guide.docx.
 *  Usage: node tests/tools/guide-screenshots.mjs [outDir] */
import path from 'node:path';
import fs from 'node:fs';
import { startDemoServer, launch, login, apiLogin } from '../e2e/helpers.mjs';

const out = process.argv[2] || 'docs/screenshots';
fs.mkdirSync(out, { recursive: true });
const srv = await startDemoServer();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const B = srv.baseUrl;
const shot = async (name, opts = {}) => { await page.waitForTimeout(opts.wait ?? 700); await page.screenshot({ path: `${out}/${name}.png`, fullPage: opts.full ?? false }); console.log('✓', name); };
const pick = async (sel, text) => { const v = await sel.locator('option').evaluateAll((os, t) => (os.find((o) => o.textContent.includes(t)) || {}).value, text); await sel.selectOption(v); };
const go = async (p, wait) => { await page.goto(B + p); await page.waitForTimeout(wait ?? 800); };

// ---------- Login ----------
await go('/login');
await page.fill('[data-testid=email]', 'admin@fit2trade.com'); await page.fill('[data-testid=password]', 'Admin123!');
await shot('01-login');
await page.click('[data-testid=login-submit]'); await page.waitForURL('**/admin');

// ---------- Admin ----------
await shot('02-admin-overview', { full: true });
await page.click('[data-testid=notif-bell]'); await shot('03-notifications'); await page.keyboard.press('Escape'); await page.click('h1');
await go('/admin/courses'); await shot('04-admin-courses');
await page.click('[data-testid=new-course]'); await page.fill('[data-testid=course-title]', 'Allergen Awareness'); await page.fill('textarea', 'The 14 EU allergens, cross-contamination and how to answer customer questions confidently.');
await page.locator('.modal input[type=number]').fill('12'); await page.locator('.modal input[type=checkbox]').check(); await shot('05-new-course-modal');
await page.click('[data-testid=create-course]'); await page.waitForURL('**/admin/courses/*'); await shot('06-course-builder-empty');
await page.click('[data-testid=add-scorm]'); await page.setInputFiles('[data-testid=scorm-file]', path.resolve('tests/fixtures/packages/scorm12-fire-safety.zip')); await shot('07-scorm-upload');
await page.click('[data-testid=scorm-upload-submit]'); await page.waitForSelector('[data-testid=module-row]'); await shot('08-course-builder-scorm');
await page.click('.card button:has-text("Page")'); await page.waitForSelector('.modal'); await page.fill('[data-testid=module-title]', 'Welcome and objectives'); await shot('09-page-editor'); await page.click('[data-testid=module-save]');
await page.click('[data-testid=add-quiz]'); await page.waitForSelector('.modal'); await page.fill('[data-testid=module-title]', 'Allergen knowledge check'); await page.click('[data-testid=add-question]');
await page.fill('[data-testid=q-text-0]', 'How many allergens must be declared under EU Regulation 1169/2011?'); await page.fill('[data-testid=q-opt-0-0]', '14'); await page.fill('[data-testid=q-opt-0-1]', '8');
await page.click('[data-testid=add-question]'); await page.fill('[data-testid=q-text-1]', 'Cross-contamination can occur through shared utensils.'); await page.fill('[data-testid=q-opt-1-0]', 'True'); await page.fill('[data-testid=q-opt-1-1]', 'False');
await shot('10-quiz-editor', { full: true }); await page.click('[data-testid=module-save]');
await page.click('text=Live session (Teams / Webex)'); await page.waitForSelector('.modal'); await page.fill('[data-testid=module-title]', 'Live Q&A with a food safety trainer'); await shot('11-live-module-editor'); await page.click('[data-testid=module-save]');
await page.waitForTimeout(300); await shot('12-course-builder-full', { full: true });
await page.click('.tabs button:has-text("Settings")'); await shot('13-course-settings', { full: true });
await page.click('[data-testid=publish]'); await page.waitForTimeout(400);
await page.click('.tabs button:has-text("Learners")'); await page.waitForTimeout(500); await pick(page.locator('.card select.select').first(), 'Hospitality team'); await shot('14-course-learners-enrol', { full: true });
await page.click('[data-testid=enrol-submit]'); await page.waitForTimeout(600); await shot('15-course-learners-list', { full: true });

// Users & groups
await go('/admin/users'); await shot('16-users-list', { full: true });
await page.click('[data-testid=add-user]'); await page.fill('[data-testid=first-name]', 'Ciara'); await page.fill('[data-testid=last-name]', 'Nolan'); await page.fill('[data-testid=user-email]', 'ciara.nolan@example.com');
await page.locator('.modal input').nth(3).fill('Duty Manager'); await page.locator('.modal input').nth(4).fill('Hospitality'); await page.locator('.modal .chip input').first().check(); await shot('17-add-user-modal'); await page.click('[data-testid=save-user]'); await page.waitForTimeout(600);
await page.click('.tabs button:has-text("Groups")'); await page.waitForTimeout(500); await page.click('text=Hospitality team'); await page.waitForTimeout(600); await shot('18-groups', { full: true });
await page.locator('table tbody tr', { hasText: 'Conor Walsh' }).first().click().catch(() => {});
await go('/admin/users'); await page.locator('tr', { hasText: 'Conor Walsh' }).locator('a:has-text("Record")').click(); await page.waitForTimeout(700); await shot('19-user-training-record', { full: true });

// Enrolments
await go('/admin/enrollments'); await shot('20-enrolments', { full: true });
await page.click('[data-testid=bulk-enrol]'); await page.waitForTimeout(500); await pick(page.locator('.modal select').first(), 'GDPR'); await pick(page.locator('.modal select').nth(1), 'Logistics'); await shot('21-bulk-enrol-modal');
await page.keyboard.press('Escape');

// Learning paths
await go('/admin/paths'); await page.click('text=Hospitality compliance onboarding'); await shot('22-learning-paths', { full: true });

// Live sessions
await go('/admin/sessions'); await page.click('[data-testid=admin-session-row]'); await shot('23-live-sessions', { full: true });
await page.click('[data-testid=new-session]'); await page.fill('[data-testid=session-title]', 'Allergen Awareness – live Q&A'); await pick(page.locator('.modal select').nth(1), 'Allergen Awareness'); await page.waitForTimeout(500);
await page.locator('.modal select').nth(2).selectOption({ index: 1 }).catch(() => {}); await page.locator('.modal textarea').fill('Bring your allergen matrix. We will walk through real customer scenarios.'); await shot('24-schedule-session-modal');
await page.click('[data-testid=session-save]'); await page.waitForTimeout(900); await shot('25-session-created', { full: true });

// Reports
await go('/admin/reports'); await shot('26-reports-courses', { full: true });
await page.click('text=Certificate expiry'); await shot('27-reports-expiry', { full: true });
await page.click('text=Audit log'); await shot('28-reports-audit');

// Settings
await go('/admin/settings'); await shot('29-settings-integrations', { full: true });
await page.click('text=Notifications & email'); await shot('30-settings-notifications', { full: true });
await page.click('text=Branding'); await shot('31-settings-branding');

// ---------- Migration ----------
const usersCsv = '"Login","First name","Last name","Email","User type","Status","Registration date","Groups"\n"patrick.b","Patrick","Byrne","patrick.byrne@example.com","Learner-Type","Active","12/01/2024 10:15","Cork Stores"\n"grainne.m","Grainne","McCarthy","grainne.mc@example.com","Learner-Type","Active","03/02/2024 11:00","Cork Stores"\n"tom.a","Tom","Ahern","tom.ahern@example.com","Trainer-Type","Active","05/02/2024 09:00","Training"\n';
const progressCsv = '"User","Course","Course code","Enrolled on","Completed on","Progress (%)","Score","Time in course","Status","Certificate","Expiry date"\n"Patrick Byrne (patrick.b)","Manual Handling Theory","MH-01","10/02/2025","14/02/2025","100","91","1h 05m","Completed","TL-2025-0141","14/02/2027"\n"Patrick Byrne (patrick.b)","Fire Safety Awareness","FS-01","15/03/2025","20/03/2025","100","88","40m","Completed","TL-2025-0202","20/03/2026"\n"Grainne McCarthy (grainne.m)","Manual Handling Theory","MH-01","01/04/2025","","40","","25m","In progress","",""\n"Grainne McCarthy (grainne.m)","HACCP Level 2","HACCP-2","20/04/2025","02/05/2025","100","95","2h 10m","Completed","TL-2025-0310","02/05/2028"\n"Tom Ahern (tom.a)","Fire Safety Awareness","FS-01","05/01/2025","11/01/2025","100","100","35m","Completed","TL-2025-0019","11/01/2026"\n';
const usersPath = path.join(out, 'talentlms-users.csv'); fs.writeFileSync(usersPath, usersCsv);
const csvPath = path.join(out, 'talentlms-course-progress.csv'); fs.writeFileSync(csvPath, progressCsv);
await go('/admin/import'); await shot('32-import-step1-source', { full: true });
await page.click('[data-testid=import-next]'); await page.waitForTimeout(400); await page.setInputFiles('[data-testid=import-files]', [usersPath, csvPath]); await shot('33-import-step2-upload', { full: true });
await page.click('[data-testid=import-preview]'); await page.waitForSelector('[data-testid=import-run]'); await shot('34-import-step3-preview', { full: true });
await page.click('[data-testid=import-run]'); await page.waitForSelector('[data-testid=import-result]'); await shot('35-import-step4-result', { full: true });
await go('/admin/users?'); await page.fill('[data-testid=user-search]', 'patrick'); await page.waitForTimeout(700); await page.locator('tr', { hasText: 'Patrick Byrne' }).locator('a:has-text("Record")').click(); await page.waitForTimeout(700); await shot('36-migrated-user-record', { full: true });
// API mode screenshot
await go('/admin/import'); await page.click('[data-testid=source-talentlms]'); await page.locator('label.check', { hasText: 'Connect to TalentLMS API' }).click(); await page.click('[data-testid=import-next]'); await page.waitForTimeout(400);
await page.locator('.card input').first().fill('fit2trade.talentlms.com'); await page.locator('.card input').nth(1).fill('••••••••••••••••'); await shot('37-import-api-mode', { full: true });
// run reminder job for expiry demo
await go('/admin/reports?view=expiry'); await page.click('[data-testid=run-reminders]'); await page.waitForTimeout(1200); await shot('38-reminders-run', { full: true });
await go('/admin/settings'); await page.click('text=Notifications & email'); await page.waitForTimeout(600); await shot('39-email-outbox', { full: true });

// ---------- Learner ----------
await ctx.clearCookies();
await login(page, B, 'aoife.murphy@example.com', 'Learner123!'); await page.waitForTimeout(800); await shot('40-learner-dashboard', { full: true });
await go('/catalog'); await shot('41-catalogue', { full: true });
await page.click('text=GDPR & Data Protection Essentials'); await shot('42-course-detail', { full: true });
await page.click('a.btn:has-text("Start course")'); await page.waitForTimeout(900); await shot('43-player-page-module');
await page.click('[data-testid=mark-complete]'); await page.waitForTimeout(600); await page.click('[data-testid=outline-quiz]'); await page.waitForTimeout(500); await shot('44-player-quiz');
await page.locator('[data-testid=opt-q1-a]').check(); await page.locator('[data-testid=opt-q2-t]').check(); await page.click('[data-testid=quiz-submit]'); await page.waitForTimeout(900); await shot('45-player-quiz-result', { full: true });
const api = await apiLogin(B, 'aoife.murphy@example.com', 'Learner123!');
const dash = await api('/api/learn/dashboard'); const fire = dash.enrollments.find((e) => e.title === 'Fire Safety Awareness');
await go(`/learn/${fire.id}`, 2500); await shot('46-player-scorm');
const food = dash.enrollments.find((e) => e.title === 'Food Hygiene Level 1'); await go(`/learn/${food.id}`, 2500); await shot('47-player-scorm-2004');
await go('/sessions'); await shot('48-learner-sessions', { full: true });
await page.locator('[data-testid=session-card]').first().locator('button:has-text("Register")').click().catch(() => {}); await page.waitForTimeout(600); await shot('49-learner-session-registered', { full: true });
await go('/certificates'); await shot('50-certificates');
await go('/profile'); await shot('51-profile', { full: true });
const certs = await api('/api/certificates');
const first = certs.certificates[0];
if (first) { const r = await fetch(`${B}/api/certificates/${first.id}/pdf`, { headers: { Authorization: 'Bearer ' + (await (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aoife.murphy@example.com', password: 'Learner123!' }) })).json()).token } }); fs.writeFileSync(`${out}/certificate.pdf`, Buffer.from(await r.arrayBuffer())); console.log('✓ certificate.pdf'); }
await browser.close(); srv.stop();
console.log('done');
