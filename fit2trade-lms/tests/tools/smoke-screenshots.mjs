/** Captures screenshots of every main screen (used for visual smoke checks and the user guide). Usage: node tests/tools/smoke-screenshots.mjs [outDir] [baseUrl] */
import { launch } from './browser.mjs';
import fs from 'node:fs';
const out = process.argv[2] || 'test-results/screens';
const base = process.argv[3] || 'http://localhost:4000';
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (name, full = true) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
await page.goto(base + '/login'); await shot('01-login', false);
await page.fill('[data-testid=email]', 'admin@fit2trade.com'); await page.fill('[data-testid=password]', 'Admin123!'); await page.click('[data-testid=login-submit]');
await page.waitForURL('**/admin'); await page.waitForTimeout(800);
const pages = [['02-admin-overview', '/admin'], ['03-admin-courses', '/admin/courses'], ['04-admin-users', '/admin/users'], ['05-admin-enrollments', '/admin/enrollments'], ['06-admin-sessions', '/admin/sessions'], ['07-admin-reports-expiry', '/admin/reports?view=expiry'], ['08-admin-import', '/admin/import'], ['09-admin-settings', '/admin/settings'], ['10-admin-paths', '/admin/paths']];
for (const [name, url] of pages) { await page.goto(base + url); await page.waitForTimeout(900); await shot(name); }
await page.goto(base + '/admin/courses'); await page.waitForTimeout(600); await page.click('table tbody tr:nth-child(1)'); await page.waitForTimeout(800); await shot('11-course-builder');
await ctx.clearCookies();
await page.goto(base + '/login'); await page.fill('[data-testid=email]', 'aoife.murphy@example.com'); await page.fill('[data-testid=password]', 'Learner123!'); await page.click('[data-testid=login-submit]');
await page.waitForURL(base + '/'); await page.waitForTimeout(900); await shot('12-learner-dashboard');
await page.goto(base + '/catalog'); await page.waitForTimeout(800); await shot('13-catalog');
await page.click('text=Fire Safety Awareness'); await page.waitForTimeout(800); await shot('14-course-detail');
await page.click('text=Review content'); await page.waitForTimeout(2500); await shot('15-scorm-player', false);
await page.goto(base + '/certificates'); await page.waitForTimeout(800); await shot('16-certificates', false);
await page.goto(base + '/sessions'); await page.waitForTimeout(800); await shot('17-sessions', false);
console.log('screenshots in', out); console.log('errors:', errors);
await browser.close();
