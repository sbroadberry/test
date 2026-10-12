import { Router } from 'express';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { all, get, run, now } from '../db.js';
import { authenticate, isStaff } from '../auth.js';
import { config } from '../config.js';
import { renderPlayerPage } from '../scorm/player.js';
import { applyCommit, rollup } from '../scorm/tracking.js';
import { updateModuleProgress, getOrCreateModuleProgress } from '../services/progress.js';

export const router = Router();

function loadContext(req, res) {
  const e = get('SELECT * FROM enrollments WHERE id = ?', req.params.enrollmentId);
  if (!e) { res.status(404).send('Enrolment not found'); return null; }
  if (e.user_id !== req.user.id && !isStaff(req.user)) { res.status(403).send('Not your enrolment'); return null; }
  const m = get('SELECT * FROM modules WHERE id = ? AND course_id = ?', req.params.moduleId, e.course_id);
  const pkg = m ? get('SELECT * FROM scorm_packages WHERE module_id = ?', m.id) : null;
  if (!m || !pkg) { res.status(404).send('SCORM package not found'); return null; }
  const manifest = JSON.parse(pkg.manifest_json);
  return { enrollment: e, module: m, pkg, manifest };
}

/** Player page: hosts the SCORM API and loads the SCO in an iframe. */
router.get('/player/:enrollmentId/:moduleId', authenticate, (req, res) => {
  const ctx = loadContext(req, res); if (!ctx) return;
  const { enrollment, module: m, pkg, manifest } = ctx;
  const launchable = manifest.items.filter((i) => i.href);
  const item = launchable.find((i) => i.identifier === req.query.item) || launchable[0];
  const mp = getOrCreateModuleProgress(enrollment.id, m.id);
  const stored = safe(mp.data_json);
  const cmi = stored.items?.[item.identifier]?.cmi || {};
  const user = get('SELECT * FROM users WHERE id = ?', enrollment.user_id);
  const contentUrl = `/scorm-content/${pkg.id}/${item.href}${item.parameters || ''}`;
  if (mp.status === 'not_started') updateModuleProgress(enrollment.id, m.id, { status: 'in_progress', attemptsInc: 1 });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPlayerPage({
    enrollmentId: enrollment.id, moduleId: m.id, item: item.identifier, version: pkg.version, contentUrl,
    learner: { id: user.id, name: `${user.last_name}, ${user.first_name}` }, cmi,
    launchData: item.dataFromLms || '', masteryScore: item.masteryScore ?? pkg.mastery_score ?? null, scaledPassingScore: item.scaledPassingScore ?? null, completionThreshold: item.completionThreshold ?? null,
    title: item.title || pkg.title || m.title, brand: config.brand,
  }));
});

/** Metadata used by the React player (list of SCOs + per-SCO status). */
router.get('/:enrollmentId/:moduleId/status', authenticate, (req, res) => {
  const ctx = loadContext(req, res); if (!ctx) return;
  const mp = getOrCreateModuleProgress(ctx.enrollment.id, ctx.module.id);
  const data = safe(mp.data_json);
  const items = ctx.manifest.items.filter((i) => i.href).map((i) => ({ identifier: i.identifier, title: i.title, status: data.items?.[i.identifier]?.status || 'not_started', score: data.items?.[i.identifier]?.score ?? null }));
  res.json({ version: ctx.pkg.version, title: ctx.pkg.title, items, module: { status: mp.status, score: mp.score, time_spent_sec: mp.time_spent_sec, attempts: mp.attempts } });
});

/** Commit endpoint called by the player (XHR or sendBeacon). */
router.post('/:enrollmentId/:moduleId/commit', authenticate, express.json({ limit: '2mb', type: () => true }), (req, res) => {
  const ctx = loadContext(req, res); if (!ctx) return;
  const { enrollment, module: m, pkg, manifest } = ctx;
  const body = req.body || {};
  if (!body.cmi || typeof body.cmi !== 'object') return res.status(400).json({ error: 'cmi snapshot is required' });
  const mp = getOrCreateModuleProgress(enrollment.id, m.id);
  const item = body.item || manifest.items.find((i) => i.href)?.identifier;
  const itemMeta = manifest.items.find((i) => i.identifier === item) || {};
  const { data, summary } = applyCommit(safe(mp.data_json), { item, cmi: body.cmi, sessionTimeSec: body.sessionTimeSec, final: body.final }, pkg.version, itemMeta.masteryScore ?? pkg.mastery_score ?? null);
  const scos = manifest.items.filter((i) => i.href && (i.scormType ? i.scormType.toLowerCase() === 'sco' : true));
  const roll = rollup(data, scos);
  let status = roll.status === 'not_started' ? 'in_progress' : roll.status;
  if (mp.status === 'completed') status = 'completed';
  const timeSpentSec = body.final ? Number(body.sessionTimeSec) || 0 : 0;
  const updated = updateModuleProgress(enrollment.id, m.id, { status, score: roll.score, data, timeSpentSec });
  res.json({ ok: true, moduleStatus: status, score: roll.score, item: summary, enrollment: { id: updated.id, status: updated.status, progress_pct: updated.progress_pct, score: updated.score } });
});

/** Static content for a package. Paths are validated against the package directory. */
export function scormContent(req, res, next) {
  const { pkgId } = req.params;
  const pkg = get('SELECT id FROM scorm_packages WHERE id = ?', pkgId);
  if (!pkg) return res.status(404).send('Package not found');
  const root = path.join(config.scormDir, pkgId);
  const rel = decodeURIComponent((req.params[0] || req.params.path || '').toString().split('?')[0]);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) && file !== root) return res.status(400).send('Invalid path');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.status(404).send('Not found');
  res.sendFile(file);
}

function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
