/** Contract tests for the Microsoft Teams (Graph) and Cisco Webex providers against local mock servers,
 *  plus an end-to-end API run where the LMS is configured to use the mocks. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { calls, startGraphMock, startWebexMock } from '../helpers/live-mocks.js';
let graphServer, webexServer, graphUrl, webexUrl;
before(async () => {
  graphServer = await startGraphMock(); webexServer = await startWebexMock();
  graphUrl = `http://127.0.0.1:${graphServer.address().port}`; webexUrl = `http://127.0.0.1:${webexServer.address().port}`;
});
after(() => { graphServer.close(); webexServer.close(); });

test('Teams provider: token, create, update, delete, attendance', async () => {
  const teams = await import('../../server/integrations/teams.js');
  teams.resetTokenCache();
  const cfg = { tenantId: 'tenant-1', clientId: 'client-1', clientSecret: 'secret-123', organiserUserId: 'organiser@fit2trade.com', graphBaseUrl: `${graphUrl}/v1.0`, loginBaseUrl: graphUrl };
  assert.equal(teams.isConfigured(cfg), true); assert.equal(teams.isConfigured({ ...cfg, clientSecret: '' }), false);
  const p = teams.createProvider(cfg);
  const session = { id: 's1', title: 'Teams class', starts_at: '2026-11-01T10:00:00.000Z', ends_at: '2026-11-01T11:00:00.000Z' };
  const m = await p.createMeeting(session);
  assert.equal(m.externalId, 'MSo123'); assert.equal(m.joinUrl, 'https://teams.microsoft.com/l/meetup-join/abc'); assert.equal(m.raw.passcode, 'xyz');
  const create = calls.graph.find((c) => c.path.endsWith('/onlineMeetings'));
  assert.equal(create.body.subject, 'Teams class'); assert.equal(create.body.startDateTime, '2026-11-01T10:00:00.000Z');
  assert.equal(calls.graph.filter((c) => c.path.includes('/oauth2/')).length, 1);
  await p.updateMeeting({ ...session, external_id: 'MSo123', title: 'Renamed' });
  assert.equal(calls.graph.filter((c) => c.path.includes('/oauth2/')).length, 1); // token cached
  assert.equal(calls.graph.find((c) => c.path.endsWith('/onlineMeetings/MSo123') && c.body)?.body.subject, 'Renamed');
  const att = await p.getAttendance({ external_id: 'MSo123' });
  assert.equal(att.length, 3); assert.equal(att[0].email, 'test.learner@example.com'); assert.equal(att[0].durationSec, 3300); assert.equal(att[0].joinedAt, '2026-01-01T10:00:00Z');
  await p.deleteMeeting({ external_id: 'MSo123' });
  assert.ok(calls.graph.some((c) => c.method === 'DELETE'));
  teams.resetTokenCache();
  await assert.rejects(() => teams.createProvider({ ...cfg, clientSecret: 'wrong' }).createMeeting(session), /Teams token request failed \(401\)/);
});

test('Webex provider: create, update, invitee, delete, attendance', async () => {
  const webex = await import('../../server/integrations/webex.js');
  const cfg = { accessToken: 'webex-token', baseUrl: `${webexUrl}/v1` };
  const p = webex.createProvider(cfg);
  const session = { id: 's2', title: 'Webex class', description: 'Agenda', starts_at: '2026-11-02T10:00:00.000Z', ends_at: '2026-11-02T11:30:00.000Z', timezone: 'Europe/Dublin' };
  const m = await p.createMeeting(session, { invitees: [{ email: 'a@b.ie', name: 'A B' }] });
  assert.equal(m.externalId, 'wbx-1'); assert.equal(m.joinUrl, 'https://fit2trade.webex.com/meet/abc'); assert.equal(m.raw.meetingNumber, '2345 678 9012');
  const create = calls.webex.find((c) => c.path === '/v1/meetings');
  assert.equal(create.body.timezone, 'Europe/Dublin'); assert.equal(create.body.invitees[0].email, 'a@b.ie'); assert.equal(create.body.sendEmail, false);
  await p.addInvitee({ external_id: 'wbx-1' }, { email: 'c@d.ie', name: 'C D' });
  assert.equal(calls.webex.find((c) => c.path === '/v1/meetingInvitees').body.meetingId, 'wbx-1');
  await p.updateMeeting({ ...session, external_id: 'wbx-1', title: 'Renamed' });
  const att = await p.getAttendance({ external_id: 'wbx-1' });
  assert.equal(att[0].durationSec, 56 * 60); assert.equal(att[1].durationSec, 300);
  await p.deleteMeeting({ external_id: 'wbx-1' });
  assert.ok(calls.webex.some((c) => c.method === 'DELETE'));
  await assert.rejects(() => webex.createProvider({ accessToken: 'bad', baseUrl: `${webexUrl}/v1` }).createMeeting(session), /Webex POST \/meetings failed \(401\)/);
});

