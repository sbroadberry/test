/** Spawns the production server (built client + API) on a free port with a fresh demo database. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
export { launch } from '../tools/browser.mjs';

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

export async function startDemoServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2t-e2e-'));
  const port = await freePort();
  const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, JWT_SECRET: 'e2e', PUBLIC_URL: `http://localhost:${port}`, SEED_DEMO: 'true', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const baseUrl = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(baseUrl + '/api/health'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  return { baseUrl, dataDir, stop: () => proc.kill(), log: () => log };
}

export async function login(page, baseUrl, email, password) {
  await page.goto(baseUrl + '/login');
  await page.fill('[data-testid=email]', email); await page.fill('[data-testid=password]', password);
  await page.click('[data-testid=login-submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function apiLogin(baseUrl, email, password) {
  const r = await fetch(baseUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  return (p, opts = {}) => fetch(baseUrl + p, { ...opts, headers: { Authorization: `Bearer ${d.token}`, ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } }).then((x) => x.json());
}

/** Wait for the SCO frame whose URL contains `urlPart` to be loaded and connected to the LMS API (#status[data-entry]). */
export async function scoFrame(page, urlPart, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const f = page.frames().find((x) => x.url().includes(urlPart));
    if (f) { try { await f.locator('#status[data-entry]').waitFor({ timeout: 2000 }); return f; } catch {} }
    await page.waitForTimeout(150);
  }
  throw new Error(`SCO frame ${urlPart} did not connect within ${timeout}ms`);
}
