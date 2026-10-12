/** Launch helper: uses Playwright's own download when present, otherwise falls back to a system/pre-installed Chromium. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
export async function launch(opts = {}) {
  try { return await chromium.launch(opts); } catch (err) {
    const exe = candidates.find((p) => fs.existsSync(p));
    if (!exe) throw err;
    return chromium.launch({ ...opts, executablePath: exe });
  }
}
