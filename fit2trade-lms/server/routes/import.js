/** Migration tool: import users, learning records and certificates from TalentLMS, LearnUpon, Moodle and generic CSV exports. */
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { all, get, run, uid, now, audit } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { config } from '../config.js';
import { SOURCES, buildDataset, summariseDataset, applyDataset } from '../services/importer.js';
import { TEMPLATES } from '../services/importers/generic.js';

export const router = Router();
const upload = multer({ dest: config.uploadsDir, limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/templates/:type.csv', (req, res) => {
  const t = TEMPLATES[req.params.type];
  if (!t) return res.status(404).send('Unknown template');
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="fit2trade-import-${req.params.type}.csv"`);
  res.send(t);
});

router.use(authenticate, requireRole('admin'));
router.get('/sources', (req, res) => res.json({ sources: SOURCES }));
router.get('/jobs', (req, res) => res.json({ jobs: all('SELECT j.id, j.source, j.status, j.options_json, j.summary_json, j.created_at, j.completed_at, u.email AS created_by_email FROM import_jobs j LEFT JOIN users u ON u.id = j.created_by ORDER BY j.created_at DESC LIMIT 50').map((j) => ({ ...j, options: safe(j.options_json), summary: safe(j.summary_json) })) }));

/** Step 1: upload files or API credentials -> parsed + summarised dataset stored as a preview job. */
router.post('/preview', upload.array('files', 10), async (req, res) => {
  const b = req.body || {};
  const files = (req.files || []).map((f) => ({ name: f.originalname, text: fs.readFileSync(f.path, 'utf8') }));
  for (const f of req.files || []) fs.rm(f.path, { force: true }, () => {});
  const mode = b.mode || (files.length ? 'csv' : 'api');
  let overrides = {}; try { overrides = b.overrides ? JSON.parse(b.overrides) : {}; } catch {}
  const api = { domain: b.domain, apiKey: b.apiKey, username: b.username, password: b.password, baseUrl: b.baseUrl || undefined };
  if (mode === 'csv' && !files.length) return res.status(400).json({ error: 'Upload at least one CSV export' });
  try {
    const dataset = await buildDataset({ source: b.source || 'csv', mode, files, api, dateFormat: b.dateFormat || 'dmy', overrides });
    const summary = summariseDataset(dataset);
    const id = uid();
    const options = { source: b.source || 'csv', mode, dateFormat: b.dateFormat || 'dmy', domain: b.domain || '', fileNames: files.map((f) => f.name) };
    run('INSERT INTO import_jobs(id, source, status, options_json, dataset_json, summary_json, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)', id, options.source, 'preview', JSON.stringify(options), JSON.stringify(dataset), JSON.stringify(summary), req.user.id, now());
    res.json({ jobId: id, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Step 2: apply a previewed job. */
router.post('/jobs/:id/run', (req, res) => {
  const job = get('SELECT * FROM import_jobs WHERE id = ?', req.params.id);
  if (!job) return res.status(404).json({ error: 'Import job not found' });
  if (job.status === 'completed') return res.status(400).json({ error: 'This import has already been applied' });
  const dataset = safe(job.dataset_json);
  const result = applyDataset(dataset, req.body?.options || {}, req.user.id);
  const summary = { ...safe(job.summary_json), result };
  run("UPDATE import_jobs SET status = 'completed', summary_json = ?, options_json = ?, completed_at = ?, dataset_json = '{}' WHERE id = ?", JSON.stringify(summary), JSON.stringify({ ...safe(job.options_json), ...(req.body?.options || {}) }), now(), job.id);
  audit(req.user.id, 'import.run', 'import', job.id, result);
  res.json({ jobId: job.id, result });
});
router.delete('/jobs/:id', (req, res) => { run('DELETE FROM import_jobs WHERE id = ?', req.params.id); res.json({ ok: true }); });

function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
