/** Cisco Webex Meetings REST API. Docs: https://developer.webex.com/docs/api/v1/meetings */
import { config } from '../config.js';

export function isConfigured(c = config.webex) { return Boolean(c.accessToken); }

async function webex(method, path, body, c = config.webex, fetchImpl = fetch) {
  const res = await fetchImpl(`${c.baseUrl}${path}`, {
    method, headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Webex ${method} ${path} failed (${res.status}): ${json.message || JSON.stringify(json)}`);
  return json;
}

export function createProvider(c = config.webex, fetchImpl = fetch) {
  return {
    name: 'webex',
    label: 'Cisco Webex',
    isConfigured: () => isConfigured(c),
    async createMeeting(session, { invitees = [] } = {}) {
      const m = await webex('POST', '/meetings', {
        title: session.title,
        agenda: session.description || undefined,
        start: new Date(session.starts_at).toISOString(),
        end: new Date(session.ends_at).toISOString(),
        timezone: session.timezone || 'Europe/Dublin',
        enabledAutoRecordMeeting: false,
        allowAnyUserToBeCoHost: false,
        enabledJoinBeforeHost: true,
        joinBeforeHostMinutes: 5,
        sendEmail: false,
        invitees: invitees.map((i) => ({ email: i.email, displayName: i.name, coHost: false })),
      }, c, fetchImpl);
      return { externalId: m.id, joinUrl: m.webLink, hostUrl: m.webLink, raw: { meetingNumber: m.meetingNumber, password: m.password, sipAddress: m.sipAddress, telephony: m.telephony || null } };
    },
    async updateMeeting(session) {
      const m = await webex('PUT', `/meetings/${session.external_id}`, {
        title: session.title,
        start: new Date(session.starts_at).toISOString(),
        end: new Date(session.ends_at).toISOString(),
        timezone: session.timezone || 'Europe/Dublin',
        sendEmail: false,
      }, c, fetchImpl);
      return { externalId: m?.id || session.external_id, joinUrl: m?.webLink || session.join_url, hostUrl: m?.webLink || session.host_url, raw: m || {} };
    },
    async deleteMeeting(session) {
      if (!session.external_id) return;
      await webex('DELETE', `/meetings/${session.external_id}?sendEmail=false`, null, c, fetchImpl);
    },
    async addInvitee(session, { email, name }) {
      return webex('POST', '/meetingInvitees', { meetingId: session.external_id, email, displayName: name, sendEmail: false }, c, fetchImpl);
    },
    async getAttendance(session) {
      const res = await webex('GET', `/meetingParticipants?meetingId=${encodeURIComponent(session.external_id)}`, null, c, fetchImpl);
      const out = new Map();
      for (const p of res?.items || []) {
        const email = (p.email || '').toLowerCase();
        const key = email || p.displayName;
        const prev = out.get(key) || { email, displayName: p.displayName || '', durationSec: 0, joinedAt: null, leftAt: null };
        const joined = p.joinedTime, left = p.leftTime;
        if (joined && left) prev.durationSec += Math.max(0, (new Date(left) - new Date(joined)) / 1000);
        if (joined && (!prev.joinedAt || joined < prev.joinedAt)) prev.joinedAt = joined;
        if (left && (!prev.leftAt || left > prev.leftAt)) prev.leftAt = left;
        out.set(key, prev);
      }
      return [...out.values()];
    },
  };
}
