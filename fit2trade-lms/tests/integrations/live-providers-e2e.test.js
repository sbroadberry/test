/** End-to-end: the LMS configured (via env) to use Microsoft Graph and Webex endpoints served by local mocks.
 *  Runs in its own process because provider configuration is read from the environment at start-up. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { calls, startGraphMock, startWebexMock } from '../helpers/live-mocks.js';
let graphServer, webexServer, graphUrl, webexUrl;
before(async () => { graphServer = await startGraphMock(); webexServer = await startWebexMock(); graphUrl = `http://127.0.0.1:${graphServer.address().port}`; webexUrl = `http://127.0.0.1:${webexServer.address().port}`; });
after(() => { graphServer.close(); webexServer.close(); });

test('End-to-end: LMS configured for Teams + Webex creates real meeting links and syncs attendance', async () => {
  const { startTestServer } = await import('../helpers/server.js');
  const srv = await startTestServer({ env: {
    MS_TENANT_ID: 'tenant-1', MS_CLIENT_ID: 'client-1', MS_CLIENT_SECRET: 'secret-123', MS_ORGANISER_USER_ID: 'organiser@fit2trade.com', MS_GRAPH_BASE_URL: `${graphUrl}/v1.0`, MS_LOGIN_BASE_URL: graphUrl,
    WEBEX_ACCESS_TOKEN: 'webex-token', WEBEX_BASE_URL: `${webexUrl}/v1`, LIVE_PROVIDER_SIMULATE: 'false',
  } });
  try {
    const admin = srv.client(); await admin.login('admin@fit2trade.com', 'Admin123!');
    const providers = await admin.get('/api/sessions/providers');
    assert.equal(providers.data.providers.find((p) => p.id === 'teams').configured, true);
    assert.equal(providers.data.providers.find((p) => p.id === 'webex').configured, true);
    const u = await admin.post('/api/users', { email: 'test.learner@example.com', password: 'Learner123!', first_name: 'Test', last_name: 'Learner' });
    const c = await admin.post('/api/courses', { title: 'Blended', status: 'published' });
    const live = await admin.post(`/api/courses/${c.data.course.id}/modules`, { type: 'live', title: 'Live class' });
    await admin.post('/api/enrollments', { userIds: [u.data.user.id], courseIds: [c.data.course.id] });
    const starts = new Date(Date.now() + 86400000).toISOString(), ends = new Date(Date.now() + 86400000 + 3600000).toISOString();
    const t = await admin.post('/api/sessions', { title: 'Teams class', provider: 'teams', course_id: c.data.course.id, module_id: live.data.module.id, starts_at: starts, ends_at: ends, registerEnrolled: true });
    assert.equal(t.status, 201, JSON.stringify(t.data)); assert.equal(t.data.session.provider, 'teams'); assert.equal(t.data.session.join_url, 'https://teams.microsoft.com/l/meetup-join/abc'); assert.equal(t.data.session.external.passcode, 'xyz');
    const w = await admin.post('/api/sessions', { title: 'Webex class', provider: 'webex', starts_at: starts, ends_at: ends });
    assert.equal(w.data.session.provider, 'webex'); assert.equal(w.data.session.join_url, 'https://fit2trade.webex.com/meet/abc'); assert.equal(w.data.session.external.meetingNumber, '2345 678 9012');
    // learner registers for the Webex session -> invitee added
    const learner = srv.client(); await learner.login('test.learner@example.com', 'Learner123!');
    const reg = await learner.post(`/api/sessions/${w.data.session.id}/register`); assert.equal(reg.status, 201);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(calls.webex.some((x) => x.path === '/v1/meetingInvitees' && x.body.email === 'test.learner@example.com'));
    // rename -> PATCH to Graph; cancel -> DELETE
    await admin.put(`/api/sessions/${t.data.session.id}`, { title: 'Teams class (moved)' });
    assert.ok(calls.graph.some((x) => x.body?.subject === 'Teams class (moved)'));
    // attendance sync from Teams marks the learner attended and completes the live module/course
    const sync = await admin.post(`/api/sessions/${t.data.session.id}/sync-attendance`, {});
    assert.equal(sync.status, 200, JSON.stringify(sync.data)); assert.equal(sync.data.provider, 'teams');
    assert.equal(sync.data.matched.length, 1); assert.equal(sync.data.matched[0].attended, true); assert.equal(sync.data.unmatched.length, 2);
    const detail = await admin.get(`/api/sessions/${t.data.session.id}`);
    assert.equal(detail.data.registrations[0].status, 'attended'); assert.equal(detail.data.registrations[0].attended_minutes, 55);
    const dash = await learner.get('/api/learn/dashboard');
    assert.equal(dash.data.enrollments[0].status, 'completed');
    const wsync = await admin.post(`/api/sessions/${w.data.session.id}/sync-attendance`, { minMinutes: 30 });
    assert.equal(wsync.data.matched[0].minutes, 56); assert.equal(wsync.data.matched[0].attended, true);
    const cancel = await admin.put(`/api/sessions/${w.data.session.id}`, { status: 'cancelled' });
    assert.equal(cancel.data.session.status, 'cancelled'); assert.ok(calls.webex.some((x) => x.method === 'DELETE' && x.path === '/v1/meetings/wbx-1'));
    const notes = await learner.get('/api/notifications'); assert.ok(notes.data.notifications.some((n) => n.type === 'session_updated' && /Cancelled/.test(n.title)));
    // Graph outage surfaces a clear error instead of a half-created session
    graphServer.close();
    const fail = await admin.post('/api/sessions', { title: 'Broken', provider: 'teams', starts_at: starts, ends_at: ends });
    assert.equal(fail.status, 502); assert.match(fail.data.error, /Could not create the online meeting/);
    graphServer = await startGraphMock(); graphUrl = `http://127.0.0.1:${graphServer.address().port}`;
  } finally { await srv.close(); }
});
