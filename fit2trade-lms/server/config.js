import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const env = process.env;
const dataDir = path.resolve(env.DATA_DIR || './data');

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 4000),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  dataDir,
  dbPath: env.DB_PATH || path.join(dataDir, 'lms.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  scormDir: path.join(dataDir, 'scorm'),
  publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`,
  brand: {
    name: 'Fit2Trade Learn',
    company: 'Fit2Trade Ltd',
    tagline: 'making workplaces better',
    primary: '#275c4d',
    ink: '#3b3a3a',
    website: 'https://www.fit2trade.com',
  },
  teams: {
    tenantId: env.MS_TENANT_ID || '',
    clientId: env.MS_CLIENT_ID || '',
    clientSecret: env.MS_CLIENT_SECRET || '',
    organiserUserId: env.MS_ORGANISER_USER_ID || '',
    graphBaseUrl: (env.MS_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0').replace(/\/$/, ''),
    loginBaseUrl: (env.MS_LOGIN_BASE_URL || 'https://login.microsoftonline.com').replace(/\/$/, ''),
  },
  webex: {
    accessToken: env.WEBEX_ACCESS_TOKEN || '',
    baseUrl: (env.WEBEX_BASE_URL || 'https://webexapis.com/v1').replace(/\/$/, ''),
  },
  simulateLive: env.LIVE_PROVIDER_SIMULATE !== 'false',
};

for (const dir of [config.dataDir, config.uploadsDir, config.scormDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
