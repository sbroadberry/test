/** Real-world export layouts: TalentLMS users + course-progress (learners by "Name (login)"), training matrix, LearnUpon, Excel. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { datasetFromFiles, parseUserRef, analyseFiles, parseCsv } from '../../server/services/importers/normalise.js';
import { rowsFromXlsx } from '../../server/services/importers/xlsx.js';

const users = '"Login","First name","Last name","Email","User type","Status","Registration date","Last login","Groups","Branches"\n"aoife.m","Aoife","Murphy","aoife.m@example.com","Learner-Type","Active","12/01/2024 10:15","01/10/2026 09:02","Hospitality",""\n"conor.w","Conor","Walsh","conor.w@example.com","Learner-Type","Inactive","03/02/2024 11:00","","Hospitality;Cork","Cork"\n';
const progress = '"User","Course","Course code","Enrolled on","Completed on","Progress (%)","Score","Time in course","Status","Certificate"\n"Aoife Murphy (aoife.m)","Manual Handling","MH-01","15/01/2024","20/01/2024","100","92","1h 10m","Completed","Yes"\n"Conor Walsh (conor.w)","Manual Handling","MH-01","05/02/2024","","40","","25m","In progress","No"\n"Nobody Known (nobody)","Manual Handling","MH-01","05/02/2024","","0","","","Not started","No"\n';
const matrix = '"User","Email","Manual Handling","Fire Safety","GDPR Essentials"\n"Aoife Murphy","aoife.m@example.com","Completed (20/01/2024)","Not started","In progress (40%)"\n"Conor Walsh","conor.w@example.com","In progress (40%)","Completed (02/03/2024)","Not started"\n';

test('parseUserRef understands the ways exports name a learner', () => {
  assert.deepEqual(parseUserRef('Aoife Murphy (aoife.m)'), { name: 'Aoife Murphy', login: 'aoife.m' });
  assert.deepEqual(parseUserRef('aoife.m - Aoife Murphy'), { name: 'Aoife Murphy', login: 'aoife.m' });
  assert.deepEqual(parseUserRef('aoife@example.com'), { name: '', login: 'aoife@example.com' });
  assert.deepEqual(parseUserRef('Aoife Murphy'), { name: 'Aoife Murphy', login: '' });
});

test('TalentLMS users export + course-progress export are joined by login/name, regardless of upload order', () => {
  const ds = datasetFromFiles([{ name: 'progress.csv', text: progress }, { name: 'users.csv', text: users }], { source: 'talentlms' });
  assert.equal(ds.users.length, 2);
  assert.equal(ds.users.find((u) => u.email === 'conor.w@example.com').status, 'inactive');
  assert.deepEqual(ds.users.find((u) => u.email === 'conor.w@example.com').groups, ['Hospitality', 'Cork']);
  assert.equal(ds.enrollments.length, 2);
  const aoife = ds.enrollments.find((e) => e.email === 'aoife.m@example.com');
  assert.equal(aoife.status, 'completed'); assert.equal(aoife.score, 92); assert.equal(aoife.time_spent_sec, 4200); assert.equal(aoife.completed_at.slice(0, 10), '2024-01-20'); assert.equal(aoife.course_code, 'MH-01');
  assert.equal(ds.certificates.length, 1); assert.equal(ds.certificates[0].code, ''); // "Certificate: Yes" -> code generated at import time
  assert.equal(ds.unresolved.length, 1); assert.match(ds.warnings[0], /Nobody Known/);
});

test('records export alone resolves learners through lookupUser (existing LMS accounts)', () => {
  const ds = datasetFromFiles([{ name: 'progress.csv', text: progress }], { lookupUser: ({ login, name }) => (login === 'aoife.m' ? 'AOIFE.M@example.com' : name === 'Conor Walsh' ? 'conor.w@example.com' : null) });
  assert.deepEqual(ds.enrollments.map((e) => e.email), ['aoife.m@example.com', 'conor.w@example.com']);
  assert.equal(ds.unresolved.length, 1);
});

test('training-matrix layout (one column per course) is detected', () => {
  const info = analyseFiles([{ name: 'matrix.csv', rows: parseCsv(matrix) }])[0];
  assert.equal(info.isMatrix, true); assert.deepEqual(info.courseColumns, ['Manual Handling', 'Fire Safety', 'GDPR Essentials']);
  const ds = datasetFromFiles([{ name: 'matrix.csv', text: matrix }]);
  assert.equal(ds.enrollments.length, 6);
  const fs = ds.enrollments.find((e) => e.email === 'conor.w@example.com' && e.course === 'Fire Safety');
  assert.equal(fs.status, 'completed'); assert.equal(fs.completed_at.slice(0, 10), '2024-03-02');
  const gdpr = ds.enrollments.find((e) => e.email === 'aoife.m@example.com' && e.course === 'GDPR Essentials');
  assert.equal(gdpr.status, 'in_progress'); assert.equal(gdpr.progress_pct, 40);
  assert.equal(ds.courses.length, 3); assert.equal(ds.mappings['matrix.csv'].course_columns, 'Manual Handling | Fire Safety | GDPR Essentials');
});

test('a users export with a Status column is not mistaken for a matrix', () => {
  const info = analyseFiles([{ name: 'users.csv', rows: parseCsv(users) }])[0];
  assert.equal(info.isMatrix, false); assert.equal(info.hasCourse, false);
});

test('manual column overrides per file take precedence', () => {
  const odd = 'Staff mail,Person,Programme,Outcome,Finished\njane@x.ie,Jane Doe,Manual Handling,Pass,05/06/2025\n';
  const none = datasetFromFiles([{ name: 'odd.csv', text: odd }]);
  assert.equal(none.users.length, 0); assert.match(none.warnings[0], /could not find an Email/);
  const ds = datasetFromFiles([{ name: 'odd.csv', text: odd }], { overrides: { 'odd.csv': { email: 'Staff mail', full_name: 'Person', course: 'Programme', status: 'Outcome', completed_at: 'Finished' } } });
  assert.equal(ds.users.length, 1); assert.equal(ds.users[0].first_name, 'Jane');
  assert.equal(ds.enrollments[0].status, 'completed'); assert.equal(ds.enrollments[0].completed_at.slice(0, 10), '2025-06-05');
  assert.deepEqual(ds.headers['odd.csv'], ['Staff mail', 'Person', 'Programme', 'Outcome', 'Finished']);
});

/** Build a tiny .xlsx by hand (shared strings + a date-styled numeric cell). */
export function makeXlsx(rows) {
  const strings = []; const sidx = (s) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const colName = (i) => String.fromCharCode(65 + i);
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
    if (v instanceof Date) return `<c r="${colName(ci)}${ri + 1}" s="1"><v>${(v.getTime() / 86400000) + 25569}</v></c>`;
    if (typeof v === 'number') return `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>`;
    return `<c r="${colName(ci)}${ri + 1}" t="s"><v>${sidx(String(v))}</v></c>`;
  }).join('') + '</row>').join('');
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'));
  zip.addFile('xl/workbook.xml', Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>'));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'));
  zip.addFile('xl/styles.xml', Buffer.from('<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'));
  zip.addFile('xl/sharedStrings.xml', Buffer.from(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`));
  return zip.toBuffer();
}

test('Excel (.xlsx) exports are read, including date cells', () => {
  const buf = makeXlsx([['Email', 'First name', 'Last name', 'Course', 'Status', 'Completed on', 'Score'], ['jane@x.ie', 'Jane', 'Doe', 'Manual Handling', 'Completed', new Date(Date.UTC(2025, 5, 5)), 88]]);
  const rows = rowsFromXlsx(buf);
  assert.equal(rows.length, 1); assert.equal(rows[0]['Completed on'], '2025-06-05'); assert.equal(rows[0].Score, '88');
  const ds = datasetFromFiles([{ name: 'export.xlsx', buffer: buf }]);
  assert.equal(ds.enrollments[0].status, 'completed'); assert.equal(ds.enrollments[0].completed_at.slice(0, 10), '2025-06-05'); assert.equal(ds.enrollments[0].score, 88);
});
