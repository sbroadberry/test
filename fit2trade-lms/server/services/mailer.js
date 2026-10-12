import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { run, uid, now, get, all } from '../db.js';

const smtp = {
  host: process.env.SMTP_HOST || '', port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || `Fit2Trade Learn <no-reply@fit2trade.com>`,
};
export const isMailConfigured = () => Boolean(smtp.host);
let transporter = null;
function getTransporter() {
  if (!transporter) transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined });
  return transporter;
}

export function layout({ title, intro, body, cta, ctaUrl }) {
  const b = config.brand;
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:${b.ink}">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3e7e5">
    <tr><td style="background:${b.primary};padding:20px 28px;color:#fff;font-size:20px;font-weight:700">fit2trade <span style="font-weight:400;opacity:.85;font-size:13px">· ${b.name}</span></td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:${b.ink}">${title}</h1>
      ${intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${intro}</p>` : ''}
      ${body || ''}
      ${cta ? `<p style="margin:24px 0 8px"><a href="${ctaUrl}" style="background:${b.primary};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${cta}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f4f6f5;font-size:12px;color:#6b6b6b">${b.company} · ${b.tagline} · <a href="${b.website}" style="color:${b.primary}">${b.website.replace('https://', '')}</a><br>You receive these emails because you have an account on ${b.name}. Manage preferences in your profile.</td></tr>
  </table></td></tr></table></body></html>`;
}

/** Queue + attempt to send an email. Always records to the outbox so the admin UI (and tests) can inspect delivery. */
export async function sendMail({ to, subject, html, text = '', category = '' }) {
  const id = uid();
  run('INSERT INTO email_outbox(id, to_email, subject, html, text, status, category, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, to, subject, html, text, 'queued', category, now());
  if (!isMailConfigured()) {
    run("UPDATE email_outbox SET status = 'skipped', error = 'SMTP not configured' WHERE id = ?", id);
    return { id, status: 'skipped' };
  }
  try {
    await getTransporter().sendMail({ from: smtp.from, to, subject, html, text });
    run("UPDATE email_outbox SET status = 'sent', sent_at = ? WHERE id = ?", now(), id);
    return { id, status: 'sent' };
  } catch (err) {
    run("UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ?", String(err.message || err), id);
    return { id, status: 'failed', error: String(err.message || err) };
  }
}

export const outbox = (limit = 100) => all('SELECT id, to_email, subject, status, error, category, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT ?', limit);
export const outboxItem = (id) => get('SELECT * FROM email_outbox WHERE id = ?', id);
