import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, normaliseStatus, normaliseRole, mapHeaders, datasetFromCsvRows, parseCsv, toSeconds, splitName } from '../../server/services/importers/normalise.js';
import { gradeQuiz } from '../../server/services/progress.js';

test('parseDate understands the formats LMS exports use', () => {
  assert.equal(parseDate('2025-03-12'), '2025-03-12T00:00:00.000Z');
  assert.equal(parseDate('12/03/2025'), '2025-03-12T00:00:00.000Z');            // dmy default (Ireland)
  assert.equal(parseDate('03/12/2025', 'mdy'), '2025-03-12T00:00:00.000Z');     // US
  assert.equal(parseDate('25/12/2024'), '2024-12-25T00:00:00.000Z');            // unambiguous even in mdy
  assert.equal(parseDate('25/12/2024', 'mdy'), '2024-12-25T00:00:00.000Z');
  assert.equal(parseDate('12 Mar 2025'), '2025-03-12T00:00:00.000Z');
  assert.equal(parseDate('March 12, 2025'), '2025-03-12T00:00:00.000Z');
  assert.equal(parseDate('2025-03-12 14:30:00'), '2025-03-12T14:30:00.000Z');
  assert.equal(parseDate('12/03/2025 2:30 pm'), '2025-03-12T14:30:00.000Z');
  assert.equal(parseDate('1741737600'), '2025-03-12T00:00:00.000Z');
  assert.equal(parseDate(''), null); assert.equal(parseDate('N/A'), null); assert.equal(parseDate('never'), null);
});

test('status, role and name normalisation', () => {
  assert.equal(normaliseStatus('Completed'), 'completed'); assert.equal(normaliseStatus('passed'), 'completed'); assert.equal(normaliseStatus('In Progress'), 'in_progress');
  assert.equal(normaliseStatus('Not started'), 'enrolled'); assert.equal(normaliseStatus('Failed'), 'failed'); assert.equal(normaliseStatus('Not Completed'), 'enrolled');
  assert.equal(normaliseStatus('', { completedAt: '2024-01-01' }), 'completed'); assert.equal(normaliseStatus('', { progress: 40 }), 'in_progress');
  assert.equal(normaliseRole('Super-Admin'), 'admin'); assert.equal(normaliseRole('Trainer'), 'instructor'); assert.equal(normaliseRole('Learner-Type'), 'learner'); assert.equal(normaliseRole('Branch Manager'), 'manager');
  assert.deepEqual(splitName("Niamh O'Sullivan"), { first: 'Niamh', last: "O'Sullivan" }); assert.deepEqual(splitName('Doe, Jane'), { first: 'Jane', last: 'Doe' });
  assert.equal(toSeconds('1h 20m'), 4800); assert.equal(toSeconds('00:45:10'), 2710); assert.equal(toSeconds('4500'), 4500);
});

test('header mapping recognises TalentLMS / LearnUpon / Moodle style columns', () => {
  const tl = mapHeaders(['Login', 'First name', 'Last name', 'Email', 'User type', 'Registration date', 'Status']);
  assert.equal(tl.email, 'Email'); assert.equal(tl.role, 'User type'); assert.equal(tl.username, 'Login'); assert.equal(tl.created_at, 'Registration date');
  const lu = mapHeaders(['Email', 'Course Name', 'Enrollment Status', 'Date Enrolled', 'Date Completed', 'Percentage Score', 'Expiry Date', 'Certificate ID']);
  assert.equal(lu.course, 'Course Name'); assert.equal(lu.status, 'Enrollment Status'); assert.equal(lu.completed_at, 'Date Completed'); assert.equal(lu.expires_at, 'Expiry Date'); assert.equal(lu.certificate_code, 'Certificate ID');
  const moodle = mapHeaders(['username', 'firstname', 'lastname', 'email', 'course1', 'department']);
  assert.equal(moodle.first_name, 'firstname'); assert.equal(moodle.last_name, 'lastname'); assert.equal(moodle.department, 'department');
});

test('datasetFromCsvRows builds users, courses, enrolments and certificates', () => {
  const csv = 'Email;Name;Course;Status;Completed on;Expiry date;Certificate code;Group\njane@x.ie;Jane Doe;Manual Handling;Completed;10/01/2025;10/01/2027;MH-1;Dublin\njane@x.ie;Jane Doe;Fire Safety;In progress;;;;Dublin\n;Nobody;Fire Safety;;;;;\n';
  const ds = datasetFromCsvRows(parseCsv(csv), { fileName: 'export.csv' });
  assert.equal(ds.users.length, 2); assert.equal(ds.users[0].first_name, 'Jane'); assert.deepEqual(ds.users[0].groups, ['Dublin']);
  assert.equal(ds.enrollments.length, 2); assert.equal(ds.enrollments[0].status, 'completed'); assert.equal(ds.enrollments[0].expires_at, '2027-01-10T00:00:00.000Z'); assert.equal(ds.enrollments[1].status, 'in_progress');
  assert.equal(ds.certificates.length, 1); assert.equal(ds.certificates[0].code, 'MH-1');
  assert.equal(ds.warnings.length, 1); assert.match(ds.warnings[0], /missing email/);
});

test('gradeQuiz scores single, multi and true/false questions', () => {
  const quiz = { passMark: 70, questions: [
    { id: 'q1', type: 'single', options: [{ id: 'a', correct: true }, { id: 'b' }] },
    { id: 'q2', type: 'multi', options: [{ id: 'a', correct: true }, { id: 'b' }, { id: 'c', correct: true }] },
    { id: 'q3', type: 'truefalse', options: [{ id: 't', correct: true }, { id: 'f' }] },
  ] };
  assert.equal(gradeQuiz(quiz, { q1: ['a'], q2: ['a', 'c'], q3: ['t'] }).score, 100);
  const r = gradeQuiz(quiz, { q1: ['a'], q2: ['a'], q3: ['f'] });
  assert.equal(r.score, 33); assert.equal(r.passed, false); assert.equal(r.results[1].correct, false);
});
