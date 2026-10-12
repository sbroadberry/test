import express from 'express';
export const calls = { graph: [], webex: [] };

export function startGraphMock() {
  const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.post('/:tenant/oauth2/v2.0/token', (req, res) => { calls.graph.push({ path: req.path, body: req.body }); if (req.body.client_secret !== 'secret-123') return res.status(401).json({ error: 'invalid_client', error_description: 'bad secret' }); res.json({ access_token: 'tok-abc', expires_in: 3600, token_type: 'Bearer' }); });
  const auth = (req, res, next) => (req.headers.authorization === 'Bearer tok-abc' ? next() : res.status(401).json({ error: { message: 'unauthorised' } }));
  app.post('/v1.0/users/:user/onlineMeetings', auth, (req, res) => { calls.graph.push({ path: req.path, body: req.body }); res.status(201).json({ id: 'MSo123', joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/abc', subject: req.body.subject, joinMeetingIdSettings: { joinMeetingId: '123 456 789', passcode: 'xyz' } }); });
  app.patch('/v1.0/users/:user/onlineMeetings/:id', auth, (req, res) => { calls.graph.push({ path: req.path, body: req.body }); res.json({ id: req.params.id, joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/abc', subject: req.body.subject }); });
  app.delete('/v1.0/users/:user/onlineMeetings/:id', auth, (req, res) => { calls.graph.push({ path: req.path, method: 'DELETE' }); res.status(204).end(); });
  app.get('/v1.0/users/:user/onlineMeetings/:id/attendanceReports', auth, (req, res) => res.json({ value: [{ id: 'rep1' }] }));
  app.get('/v1.0/users/:user/onlineMeetings/:id/attendanceReports/:rep/attendanceRecords', auth, (req, res) => res.json({ value: [
    { id: 'r1', emailAddress: 'test.learner@example.com', totalAttendanceInSeconds: 3300, identity: { displayName: 'Test Learner' }, attendanceIntervals: [{ joinDateTime: '2026-01-01T10:00:00Z', leaveDateTime: '2026-01-01T10:55:00Z' }] },
    { id: 'r2', emailAddress: 'latecomer@example.com', totalAttendanceInSeconds: 600, identity: { displayName: 'Late Comer' }, attendanceIntervals: [] },
    { id: 'r3', emailAddress: '', totalAttendanceInSeconds: 100, identity: { displayName: 'Guest' }, attendanceIntervals: [] },
  ] }));
  return new Promise((r) => { const s = app.listen(0, () => r(s)); });
}
export function startWebexMock() {
  const app = express(); app.use(express.json());
  const auth = (req, res, next) => (req.headers.authorization === 'Bearer webex-token' ? next() : res.status(401).json({ message: 'The request requires a valid access token' }));
  app.post('/v1/meetings', auth, (req, res) => { calls.webex.push({ path: req.path, body: req.body }); res.json({ id: 'wbx-1', meetingNumber: '2345 678 9012', webLink: 'https://fit2trade.webex.com/meet/abc', password: 'pw', sipAddress: '123@webex.com', title: req.body.title }); });
  app.put('/v1/meetings/:id', auth, (req, res) => { calls.webex.push({ path: req.path, body: req.body }); res.json({ id: req.params.id, webLink: 'https://fit2trade.webex.com/meet/abc', title: req.body.title }); });
  app.delete('/v1/meetings/:id', auth, (req, res) => { calls.webex.push({ path: req.path, method: 'DELETE' }); res.status(204).end(); });
  app.post('/v1/meetingInvitees', auth, (req, res) => { calls.webex.push({ path: req.path, body: req.body }); res.json({ id: 'inv1', email: req.body.email }); });
  app.get('/v1/meetingParticipants', auth, (req, res) => res.json({ items: [{ email: 'test.learner@example.com', displayName: 'Test Learner', joinedTime: '2026-01-01T10:02:00Z', leftTime: '2026-01-01T10:58:00Z' }, { email: 'nobody@example.com', displayName: 'Nobody', joinedTime: '2026-01-01T10:00:00Z', leftTime: '2026-01-01T10:05:00Z' }] }));
  return new Promise((r) => { const s = app.listen(0, () => r(s)); });
}

