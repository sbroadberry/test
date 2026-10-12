import { config } from '../config.js';
import * as teams from './teams.js';
import * as webex from './webex.js';
import * as simulated from './simulated.js';

const registry = {
  teams: () => teams.createProvider(),
  webex: () => webex.createProvider(),
  simulated: () => simulated.createProvider(),
};

export function listProviders() {
  return [
    { id: 'teams', label: 'Microsoft Teams', configured: teams.isConfigured(), detail: teams.isConfigured() ? `Organiser ${config.teams.organiserUserId}` : 'Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_ORGANISER_USER_ID' },
    { id: 'webex', label: 'Cisco Webex', configured: webex.isConfigured(), detail: webex.isConfigured() ? 'Access token configured' : 'Set WEBEX_ACCESS_TOKEN' },
    { id: 'simulated', label: 'Built-in virtual classroom', configured: config.simulateLive, detail: 'No external account needed' },
    { id: 'none', label: 'In person / none', configured: true, detail: 'Classroom session with a physical location' },
  ];
}

export function getProvider(name) {
  if (name === 'none') return null;
  const factory = registry[name];
  if (!factory) throw new Error(`Unknown live session provider: ${name}`);
  const provider = factory();
  if (!provider.isConfigured()) {
    if (config.simulateLive) return simulated.createProvider();
    throw new Error(`${provider.label} is not configured. Add the credentials to .env or enable LIVE_PROVIDER_SIMULATE.`);
  }
  return provider;
}
