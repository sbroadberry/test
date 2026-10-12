/** Microsoft Teams online meetings via Microsoft Graph (client-credentials / application permissions).
 *  Docs: https://learn.microsoft.com/graph/api/application-post-onlinemeetings */
import { config } from '../config.js';

let tokenCache = { value: null, expiresAt: 0 };

export function isConfigured(c = config.teams) {
  return Boolean(c.tenantId && c.clientId && c.clientSecret && c.organiserUserId);
}

export async function getAccessToken(c = config.teams, fetchImpl = fetch) {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const url = `${c.loginBaseUrl}/${c.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Teams token request failed (${res.status}): ${json.error_description || json.error || 'unknown error'}`);
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return json.access_token;
}

export function resetTokenCache() { tokenCache = { value: null, expiresAt: 0 }; }

async function graph(method, path, body, c = config.teams, fetchImpl = fetch) {
  const token = await getAccessToken(c, fetchImpl);
  const res = await fetchImpl(`${c.graphBaseUrl}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft Graph ${method} ${path} failed (${res.status}): ${json.error?.message || JSON.stringify(json)}`);
  return json;
}

export function createProvider(c = config.teams, fetchImpl = fetch) {
  return {
    name: 'teams',
    label: 'Microsoft Teams',
    isConfigured: () => isConfigured(c),
    async createMeeting(session) {
      const meeting = await graph('POST', `/users/${encodeURIComponent(c.organiserUserId)}/onlineMeetings`, {
        subject: session.title,
        startDateTime: new Date(session.starts_at).toISOString(),
        endDateTime: new Date(session.ends_at).toISOString(),
        lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: false },
        allowedPresenters: 'organizer',
        recordAutomatically: false,
      }, c, fetchImpl);
      return {
        externalId: meeting.id,
        joinUrl: meeting.joinWebUrl || meeting.joinUrl,
        hostUrl: meeting.joinWebUrl || meeting.joinUrl,
        raw: { joinMeetingId: meeting.joinMeetingIdSettings?.joinMeetingId, passcode: meeting.joinMeetingIdSettings?.passcode, audio: meeting.audioConferencing || null },
      };
    },
    async updateMeeting(session) {
      const meeting = await graph('PATCH', `/users/${encodeURIComponent(c.organiserUserId)}/onlineMeetings/${session.external_id}`, {
        subject: session.title,
        startDateTime: new Date(session.starts_at).toISOString(),
        endDateTime: new Date(session.ends_at).toISOString(),
      }, c, fetchImpl);
      return { externalId: meeting?.id || session.external_id, joinUrl: meeting?.joinWebUrl || session.join_url, hostUrl: meeting?.joinWebUrl || session.host_url, raw: meeting || {} };
    },
    async deleteMeeting(session) {
      if (!session.external_id) return;
      await graph('DELETE', `/users/${encodeURIComponent(c.organiserUserId)}/onlineMeetings/${session.external_id}`, null, c, fetchImpl);
    },
    /** Returns [{ email, displayName, durationSec, joinedAt, leftAt }] using Graph attendance reports. */
    async getAttendance(session) {
      const reports = await graph('GET', `/users/${encodeURIComponent(c.organiserUserId)}/onlineMeetings/${session.external_id}/attendanceReports`, null, c, fetchImpl);
      const out = new Map();
      for (const r of reports?.value || []) {
        const recs = await graph('GET', `/users/${encodeURIComponent(c.organiserUserId)}/onlineMeetings/${session.external_id}/attendanceReports/${r.id}/attendanceRecords`, null, c, fetchImpl);
        for (const rec of recs?.value || []) {
          const email = (rec.emailAddress || rec.identity?.user?.email || '').toLowerCase();
          const key = email || rec.identity?.displayName || rec.id;
          const prev = out.get(key) || { email, displayName: rec.identity?.displayName || '', durationSec: 0, joinedAt: null, leftAt: null };
          prev.durationSec += rec.totalAttendanceInSeconds || 0;
          for (const iv of rec.attendanceIntervals || []) {
            if (!prev.joinedAt || iv.joinDateTime < prev.joinedAt) prev.joinedAt = iv.joinDateTime;
            if (!prev.leftAt || iv.leaveDateTime > prev.leftAt) prev.leftAt = iv.leaveDateTime;
          }
          out.set(key, prev);
        }
      }
      return [...out.values()];
    },
  };
}
