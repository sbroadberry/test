import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authenticate } from './auth.js';
import { router as authRouter } from './routes/auth.js';
import { router as usersRouter, groupsRouter } from './routes/users.js';
import { router as coursesRouter } from './routes/courses.js';
import { router as learnRouter, enrollmentsRouter } from './routes/learn.js';
import { router as scormRouter, scormContent } from './routes/scorm.js';
import { router as sessionsRouter } from './routes/sessions.js';
import { pathsRouter, reportsRouter, certificatesRouter, notificationsRouter, settingsRouter } from './routes/misc.js';
import { router as importRouter } from './routes/import.js';
import { router as companiesRouter, publicBranding, brandAsset } from './routes/companies.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (req, res) => res.json({ ok: true, name: config.brand.name, time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/learn', learnRouter);
  app.use('/api/enrollments', enrollmentsRouter);
  app.use('/api/scorm', scormRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/paths', pathsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/certificates', certificatesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/import', importRouter);
  app.use('/api/companies', companiesRouter);
  app.get('/api/branding', publicBranding);
  app.get('/brand-assets/:file', brandAsset);

  app.get('/scorm-runtime.js', (req, res) => res.sendFile(path.join(here, 'scorm', 'scorm-api.js')));
  app.get('/scorm-content/:pkgId/*path', authenticate, (req, res, next) => { req.params[0] = [].concat(req.params.path).join('/'); scormContent(req, res, next); });
  app.use('/uploads', authenticate, express.static(config.uploadsDir));

  app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

  const dist = path.resolve(here, '..', 'dist', 'client');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*path', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('*path', (req, res) => res.status(200).send('<h1>Fit2Trade Learn API</h1><p>Client build not found. Run <code>npm run build</code> (production) or <code>npm run dev</code> (development, served by Vite on port 5173).</p>'));
  }

  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });
  return app;
}
