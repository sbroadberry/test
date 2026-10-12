import { run, uid, now } from '../db.js';

export function notify(userId, type, title, body = '', link = '') {
  run('INSERT INTO notifications(id, user_id, type, title, body, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)',
    uid(), userId, type, title, body, link, now());
}
