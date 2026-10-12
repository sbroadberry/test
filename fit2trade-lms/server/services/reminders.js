/** Scheduled reminders: certificate expiry (in-app + email) and enrolment due dates. */
import { all, get, run, now, getSetting } from '../db.js';
import { config } from '../config.js';
import { notify } from './notifications.js';
import { sendMail, layout } from './mailer.js';

export const DEFAULT_WINDOWS = [60, 30, 14, 7, 0]; // days before expiry; 0 = expired

const dayMs = 86_400_000;
const fmt = (iso) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

function alreadySent(key) { return Boolean(get('SELECT 1 FROM reminders_sent WHERE key = ?', key)); }
function markSent(key, userId, kind, entityId, window) {
  run('INSERT OR IGNORE INTO reminders_sent(key, user_id, kind, entity_id, window_days, sent_at) VALUES (?,?,?,?,?,?)', key, userId, kind, entityId, window, now());
}

/** Find certificates expiring within the configured windows and notify the learner (and admins for expired ones). */
export async function runCertificateExpiryCheck({ at = new Date(), windows = getSetting('reminder_windows', DEFAULT_WINDOWS), send = sendMail } = {}) {
  const rows = all(`SELECT c.id AS cert_id, c.code, c.expires_at, c.enrollment_id, u.id AS user_id, u.email, u.first_name, u.last_name, u.email_notifications,
                           co.id AS course_id, co.title AS course_title
                    FROM certificates c JOIN users u ON u.id = c.user_id JOIN courses co ON co.id = c.course_id
                    WHERE c.expires_at IS NOT NULL AND u.status = 'active'`);
  const results = { checked: rows.length, notified: 0, emails: 0, expired: [] };
  const sortedWindows = [...windows].sort((a, b) => b - a);
  for (const r of rows) {
    const daysLeft = Math.ceil((new Date(r.expires_at) - at) / dayMs);
    // pick the tightest window that applies (e.g. 5 days left -> window 7)
    const window = sortedWindows.filter((w) => daysLeft <= w).sort((a, b) => a - b)[0];
    if (window === undefined) continue;
    if (daysLeft < -365) continue; // stop nagging after a year
    const key = `cert:${r.cert_id}:${window}`;
    if (alreadySent(key)) continue;

    const expired = daysLeft <= 0;
    const title = expired ? `Your ${r.course_title} certificate has expired` : `Your ${r.course_title} certificate expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    const body = expired
      ? `It expired on ${fmt(r.expires_at)}. Re-take the course to stay compliant.`
      : `It expires on ${fmt(r.expires_at)}. Re-take the course before then to stay compliant.`;
    const link = `/courses/${r.course_id}`;
    notify(r.user_id, expired ? 'certificate_expired' : 'certificate_expiring', title, body, link);
    results.notified += 1;
    if (r.email_notifications) {
      const res = await send({
        to: r.email, subject: `${title} · Fit2Trade Learn`, category: 'certificate_expiry',
        text: `${title}. ${body} Renew: ${config.publicUrl}${link}`,
        html: layout({ title, intro: `Hi ${r.first_name},`, body: `<p style="font-size:15px;line-height:1.5">${body}</p><p style="font-size:13px;color:#6b6b6b">Certificate ${r.code}</p>`, cta: 'Renew now', ctaUrl: `${config.publicUrl}${link}` }),
      });
      if (res.status !== 'skipped') results.emails += 1;
    }
    markSent(key, r.user_id, 'certificate', r.cert_id, window);
    if (expired) results.expired.push({ user: `${r.first_name} ${r.last_name}`, email: r.email, course: r.course_title, expiredOn: r.expires_at });
  }
  if (results.expired.length) {
    const admins = all("SELECT id, email, first_name, email_notifications FROM users WHERE role IN ('admin','manager') AND status = 'active'");
    const summary = results.expired.map((e) => `${e.user} · ${e.course} (expired ${fmt(e.expiredOn)})`);
    for (const a of admins) {
      notify(a.id, 'compliance_alert', `${results.expired.length} certificate${results.expired.length === 1 ? '' : 's'} expired`, summary.slice(0, 5).join('\n'), '/admin/reports?view=expiry');
      if (a.email_notifications) {
        await send({ to: a.email, subject: `Compliance alert: ${results.expired.length} expired certificate(s) · Fit2Trade Learn`, category: 'compliance_alert',
          text: summary.join('\n'),
          html: layout({ title: 'Expired certificates need action', intro: `Hi ${a.first_name}, the following learners now have expired certificates:`, body: `<ul style="font-size:14px;line-height:1.6">${summary.map((s) => `<li>${s}</li>`).join('')}</ul>`, cta: 'Open expiry report', ctaUrl: `${config.publicUrl}/admin/reports?view=expiry` }) });
      }
    }
  }
  return results;
}

/** Enrolment due-date reminders: 7 days before, 1 day before, overdue. */
export async function runDueDateCheck({ at = new Date(), send = sendMail } = {}) {
  const rows = all(`SELECT e.id, e.due_at, e.course_id, u.id AS user_id, u.email, u.first_name, u.email_notifications, co.title
                    FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses co ON co.id = e.course_id
                    WHERE e.due_at IS NOT NULL AND e.status NOT IN ('completed') AND u.status = 'active'`);
  const results = { checked: rows.length, notified: 0 };
  for (const r of rows) {
    const daysLeft = Math.ceil((new Date(r.due_at) - at) / dayMs);
    const window = [7, 1, 0].filter((w) => daysLeft <= w).sort((a, b) => a - b)[0];
    if (window === undefined || daysLeft < -90) continue;
    const key = `due:${r.id}:${window}`;
    if (alreadySent(key)) continue;
    const overdue = daysLeft <= 0;
    const title = overdue ? `${r.title} is overdue` : `${r.title} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    const body = `Due ${fmt(r.due_at)}. Open the course to continue where you left off.`;
    notify(r.user_id, overdue ? 'overdue' : 'due_soon', title, body, `/learn/${r.id}`);
    if (r.email_notifications) {
      await send({ to: r.email, subject: `${title} · Fit2Trade Learn`, category: 'due_date', text: `${title}. ${body}`,
        html: layout({ title, intro: `Hi ${r.first_name},`, body: `<p style="font-size:15px">${body}</p>`, cta: 'Continue course', ctaUrl: `${config.publicUrl}/learn/${r.id}` }) });
    }
    markSent(key, r.user_id, 'due', r.id, window);
    results.notified += 1;
  }
  return results;
}

export async function runAllReminderJobs(opts = {}) {
  const certificates = await runCertificateExpiryCheck(opts);
  const dueDates = await runDueDateCheck(opts);
  return { ranAt: now(), certificates, dueDates };
}

let timer = null;
export function startScheduler(intervalMs = 6 * 60 * 60 * 1000) {
  if (timer) return;
  const tick = () => runAllReminderJobs().then((r) => console.log(`[reminders] ${r.ranAt} certificates notified=${r.certificates.notified} due notified=${r.dueDates.notified}`)).catch((e) => console.error('[reminders] failed', e));
  setTimeout(tick, 5_000).unref();
  timer = setInterval(tick, intervalMs);
  timer.unref();
}
