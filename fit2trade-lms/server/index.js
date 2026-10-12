import { createApp } from './app.js';
import { config } from './config.js';
import { ensureSeed } from './seed.js';
import { startScheduler } from './services/reminders.js';

ensureSeed({ demo: process.env.SEED_DEMO !== 'false' });
const app = createApp();
app.listen(config.port, () => {
  console.log(`Fit2Trade Learn API listening on http://localhost:${config.port} (${config.env})`);
  startScheduler();
});
