import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { get } from '../db.js';
import { resolveTheme } from './themes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../client/public');
const assetPath = (url) => { if (!url) return null; const p = url.startsWith('/brand-assets/') ? path.join(config.dataDir, 'brand', path.basename(url)) : path.join(publicDir, url.replace(/^\//, '')); return fs.existsSync(p) && /\.(png|jpe?g)$/i.test(p) ? p : null; };

export function renderCertificate(res, { certificate, user, course }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate-${certificate.code}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height;
  const theme = resolveTheme(user.company_id ? get('SELECT * FROM companies WHERE id = ?', user.company_id) : get('SELECT * FROM companies WHERE is_default = 1'));
  const green = theme.primary, ink = theme.ink;
  const logoPath = assetPath(theme.logoUrl) || path.join(publicDir, 'brand/fit2trade-logo.png');
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.rect(0, 0, 22, H).fill(green);
  doc.rect(W - 22, 0, 22, H).fill(green);
  doc.lineWidth(2).strokeColor(green).rect(50, 40, W - 100, H - 80).stroke();

  if (fs.existsSync(logoPath)) doc.image(logoPath, W / 2 - 110, 70, { fit: [220, 80], align: 'center' });

  doc.fillColor(ink).font('Helvetica').fontSize(14).text('CERTIFICATE OF COMPLETION', 0, 170, { align: 'center', characterSpacing: 4 });
  doc.fontSize(12).fillColor('#6b6b6b').text('This is to certify that', 0, 215, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(32).fillColor(green).text(`${user.first_name} ${user.last_name}`, 0, 240, { align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor('#6b6b6b').text('has successfully completed', 0, 290, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(ink).text(course.title, 80, 315, { align: 'center', width: W - 160 });

  const issued = new Date(certificate.issued_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  const expires = certificate.expires_at ? new Date(certificate.expires_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  doc.font('Helvetica').fontSize(11).fillColor('#6b6b6b')
    .text(`Issued ${issued}${expires ? `  ·  Valid until ${expires}` : ''}`, 0, 400, { align: 'center' });
  doc.fontSize(10).text(`Certificate ID: ${certificate.code}`, 0, 420, { align: 'center' });
  doc.fontSize(10).fillColor(green).text(`${theme.companyName}  ·  ${theme.tagline}  ·  ${theme.website}`, 0, H - 75, { align: 'center' });
  doc.end();
}
