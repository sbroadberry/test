/** Generic CSV / Moodle / Docebo / Cornerstone-style exports: any CSV with an email column (+ optional course columns). */
import { datasetFromFiles } from './normalise.js';

export const meta = { id: 'csv', label: 'Generic CSV (Moodle, Docebo, Excel export, …)', csv: 'Any CSV with an Email column. Add Course, Status, Completed date, Expiry date and Certificate code columns to migrate learning records and certificates.' };

export function fromCsvFiles(files, opts = {}) {
  return datasetFromFiles(files, { ...opts, source: opts.source || 'csv' });
}

export const TEMPLATES = {
  users: 'Email,First name,Last name,Role,Department,Job title,Group,Status\njane.doe@example.com,Jane,Doe,learner,Operations,Shift Manager,Dublin Stores,active\n',
  records: 'Email,First name,Last name,Course,Course code,Status,Progress,Score,Enrolled on,Completed on,Expiry date,Certificate code\njane.doe@example.com,Jane,Doe,Manual Handling,MH-01,Completed,100,92,03/01/2025,10/01/2025,10/01/2027,MH-2025-0001\n',
};
