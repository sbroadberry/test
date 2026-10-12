import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'scorm-api.js'), 'utf8');
const sandbox = { module: { exports: {} }, globalThis: {} };
vm.runInNewContext(src, sandbox);
export const ScormRuntime = sandbox.module.exports;

/** Merge a committed CMI snapshot into the module's stored SCORM data and compute roll-up status. */
export function applyCommit(existing, { item, cmi, sessionTimeSec = 0, final = false }, version, masteryScore) {
  const data = existing && typeof existing === 'object' ? { ...existing } : {};
  data.items = { ...(data.items || {}) };
  const prev = data.items[item] || {};
  const merged = { ...(prev.cmi || {}), ...cmi };
  if (!final) {
    // keep accumulated total time from the last terminate; session time is only folded in on terminate/final commit
    const totalKey = version === '2004' ? 'cmi.total_time' : 'cmi.core.total_time';
    if (prev.cmi && prev.cmi[totalKey]) merged[totalKey] = prev.cmi[totalKey];
  }
  const summary = ScormRuntime.summarise(version, merged);
  // SCORM 1.2 mastery score override at LMS level
  if (version !== '2004' && masteryScore != null && summary.score != null && (summary.status === 'completed' || summary.status === 'failed')) {
    summary.status = summary.score >= masteryScore ? 'completed' : 'failed';
  }
  data.items[item] = { cmi: merged, status: summary.status, score: summary.score, totalSec: summary.totalSec, updatedAt: new Date().toISOString(), commits: (prev.commits || 0) + 1 };
  return { data, summary };
}

/** Roll up all SCO items of a package into a single module status/score. */
export function rollup(data, scoItems) {
  const items = data?.items || {};
  const tracked = scoItems.length ? scoItems : Object.keys(items).map((identifier) => ({ identifier }));
  const statuses = tracked.map((i) => items[i.identifier]?.status || 'not_started');
  const scores = tracked.map((i) => items[i.identifier]?.score).filter((s) => s != null);
  let status = 'not_started';
  if (statuses.every((s) => s === 'completed')) status = 'completed';
  else if (statuses.some((s) => s === 'failed') && statuses.every((s) => s === 'failed' || s === 'completed')) status = 'failed';
  else if (statuses.some((s) => s !== 'not_started')) status = 'in_progress';
  const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return { status, score };
}
