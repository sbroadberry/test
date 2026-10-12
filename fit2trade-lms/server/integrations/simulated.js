/** Built-in provider used when no Teams/Webex credentials are configured (demo + automated tests). */
import { config } from '../config.js';

export function createProvider() {
  return {
    name: 'simulated',
    label: 'Built-in virtual classroom (demo)',
    isConfigured: () => true,
    async createMeeting(session) {
      const id = `sim-${session.id}`;
      return { externalId: id, joinUrl: `${config.publicUrl}/live/${session.id}`, hostUrl: `${config.publicUrl}/live/${session.id}?host=1`, raw: { simulated: true } };
    },
    async updateMeeting(session) { return { externalId: session.external_id, joinUrl: session.join_url, hostUrl: session.host_url, raw: { simulated: true } }; },
    async deleteMeeting() {},
    async getAttendance() { return []; },
  };
}
