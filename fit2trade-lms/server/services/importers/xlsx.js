/** Minimal .xlsx reader (first worksheet -> array of row objects keyed by header). Covers shared strings, inline strings,
 *  numbers, booleans and date-formatted cells; enough for LMS/HR exports without pulling in a spreadsheet library. */
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, isArray: (n) => ['si', 'row', 'c', 'xf', 'numFmt', 'sheet', 'Relationship'].includes(n) });
const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function text(node) { if (node == null) return ''; if (typeof node !== 'object') return String(node); if (node['#text'] != null) return String(node['#text']); if (node.t) return [].concat(node.t).map(text).join(''); if (node.r) return [].concat(node.r).map((r) => text(r.t)).join(''); return ''; }
function colIndex(ref) { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
function serialToIso(v) { const ms = Math.round((v - 25569) * 86400000); return new Date(ms).toISOString(); }

export function rowsFromXlsx(buffer) {
  const zip = new AdmZip(buffer);
  const read = (name) => { const e = zip.getEntry(name); return e ? e.getData().toString('utf8') : null; };
  const wb = parser.parse(read('xl/workbook.xml') || '<workbook/>');
  const rels = parser.parse(read('xl/_rels/workbook.xml.rels') || '<Relationships/>');
  const firstSheet = [].concat(wb.workbook?.sheets?.sheet || [])[0];
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (firstSheet) { const rel = [].concat(rels.Relationships?.Relationship || []).find((r) => r['@Id'] === firstSheet['@id']); if (rel) sheetPath = 'xl/' + rel['@Target'].replace(/^\/?xl\//, '').replace(/^\//, ''); }
  const shared = [].concat(parser.parse(read('xl/sharedStrings.xml') || '<sst/>').sst?.si || []).map(text);
  const styles = parser.parse(read('xl/styles.xml') || '<styleSheet/>');
  const customDate = new Set([].concat(styles.styleSheet?.numFmts?.numFmt || []).filter((f) => /[dmy]/i.test(String(f['@formatCode'] || '').replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/#|0\.0/.test(String(f['@formatCode']))).map((f) => Number(f['@numFmtId'])));
  const xfs = [].concat(styles.styleSheet?.cellXfs?.xf || []).map((x) => Number(x['@numFmtId'] || 0));
  const isDateStyle = (s) => { const id = xfs[Number(s)]; return id != null && (DATE_FMT_IDS.has(id) || customDate.has(id)); };
  const sheet = parser.parse(read(sheetPath) || '<worksheet/>');
  const rows = [].concat(sheet.worksheet?.sheetData?.row || []);
  const grid = rows.map((r) => { const cells = []; for (const c of [].concat(r.c || [])) {
    const idx = colIndex(String(c['@r'] || '')); let v = '';
    const t = c['@t'];
    if (t === 's') v = shared[Number(text(c.v))] ?? '';
    else if (t === 'inlineStr') v = text(c.is);
    else if (t === 'b') v = text(c.v) === '1' ? 'TRUE' : 'FALSE';
    else if (t === 'str' || t === 'e') v = text(c.v);
    else { const raw = text(c.v); if (raw !== '' && c['@s'] != null && isDateStyle(c['@s']) && !isNaN(Number(raw))) v = serialToIso(Number(raw)).slice(0, 10); else v = raw; }
    cells[idx] = v; } return cells; });
  const nonEmpty = grid.filter((r) => r.some((v) => v != null && String(v).trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? '' : String(r[i]).trim()])));
}
