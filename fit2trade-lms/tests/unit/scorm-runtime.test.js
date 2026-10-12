import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ScormRuntime, applyCommit, rollup } from '../../server/scorm/tracking.js';
import { parseManifest } from '../../server/scorm/manifest.js';

const { createScormRuntime, summarise, parseTime12, formatTime12, parseIsoDuration, formatIsoDuration } = ScormRuntime;

test('SCORM 1.2 runtime: lifecycle, data model, errors and commit', () => {
  const commits = [];
  const rt = createScormRuntime({ version: '1.2', learner: { id: 'u1', name: 'Murphy, Aoife' }, masteryScore: 70, launchData: 'x=1', onCommit: (p) => commits.push(p) });
  const API = rt.api;
  assert.equal(API.LMSGetValue('cmi.core.student_name'), ''); // before init
  assert.equal(API.LMSGetLastError(), '301');
  assert.equal(API.LMSInitialize(''), 'true');
  assert.equal(API.LMSInitialize(''), 'false'); // already initialised
  assert.equal(API.LMSGetValue('cmi.core.student_name'), 'Murphy, Aoife');
  assert.equal(API.LMSGetValue('cmi.core.student_id'), 'u1');
  assert.equal(API.LMSGetValue('cmi.core.entry'), 'ab-initio');
  assert.equal(API.LMSGetValue('cmi.core.lesson_status'), 'incomplete'); // LMS flips not attempted -> incomplete on init
  assert.equal(API.LMSGetValue('cmi.launch_data'), 'x=1');
  assert.equal(API.LMSGetValue('cmi.student_data.mastery_score'), '70');
  assert.equal(API.LMSGetValue('cmi.core._children').includes('lesson_status'), true);
  assert.equal(API.LMSSetValue('cmi.core.student_id', 'hack'), 'false'); assert.equal(API.LMSGetLastError(), '403');
  assert.equal(API.LMSSetValue('cmi.core.lesson_status', 'bogus'), 'false'); assert.equal(API.LMSGetLastError(), '405');
  assert.equal(API.LMSSetValue('cmi.core.score.raw', '150'), 'false');
  assert.equal(API.LMSSetValue('cmi.core.score.raw', '85'), 'true');
  assert.equal(API.LMSSetValue('cmi.core.lesson_location', 'page3'), 'true');
  assert.equal(API.LMSSetValue('cmi.suspend_data', 'abc'), 'true');
  assert.equal(API.LMSSetValue('cmi.core.session_time', '00:05:00'), 'true');
  assert.equal(API.LMSGetValue('cmi.core.session_time'), ''); assert.equal(API.LMSGetLastError(), '404'); // write-only
  assert.equal(API.LMSSetValue('cmi.interactions.0.id', 'q1'), 'true');
  assert.equal(API.LMSSetValue('cmi.interactions.2.id', 'q3'), 'false'); // must be sequential
  assert.equal(API.LMSGetValue('cmi.interactions._count'), '1');
  assert.equal(API.LMSSetValue('cmi.objectives.0.id', 'obj1'), 'true');
  assert.equal(API.LMSSetValue('cmi.objectives.0.status', 'passed'), 'true');
  assert.equal(API.LMSGetValue('cmi.objectives._count'), '1');
  assert.equal(API.LMSGetValue('cmi.nonsense'), ''); assert.equal(API.LMSGetLastError(), '201');
  assert.equal(API.LMSCommit(''), 'true');
  assert.equal(commits.length, 1); assert.equal(commits[0].final, false); assert.equal(commits[0].cmi['cmi.core.score.raw'], '85');
  assert.equal(API.LMSSetValue('cmi.core.lesson_status', 'completed'), 'true');
  assert.equal(API.LMSFinish(''), 'true');
  const last = commits[commits.length - 1];
  assert.equal(last.final, true);
  assert.equal(last.cmi['cmi.core.lesson_status'], 'passed'); // mastery score 70, raw 85 -> passed
  assert.equal(last.cmi['cmi.core.total_time'], '0000:05:00.00');
  assert.equal(API.LMSGetValue('cmi.core.score.raw'), ''); assert.equal(API.LMSGetLastError(), '301'); // after finish
  assert.equal(API.LMSFinish(''), 'false');
  assert.equal(API.LMSGetErrorString('403'), 'Element is read only');
});

test('SCORM 1.2 runtime: resume restores bookmark and entry=resume', () => {
  const rt = createScormRuntime({ version: '1.2', initial: { 'cmi.core.lesson_location': 'page2', 'cmi.suspend_data': 's', 'cmi.core.exit': 'suspend', 'cmi.core.lesson_status': 'incomplete', 'cmi.core.total_time': '0000:01:00.00' }, learner: { id: 'u', name: 'n' }, onCommit() {} });
  rt.api.LMSInitialize('');
  assert.equal(rt.api.LMSGetValue('cmi.core.entry'), 'resume');
  assert.equal(rt.api.LMSGetValue('cmi.core.lesson_location'), 'page2');
  assert.equal(rt.api.LMSGetValue('cmi.suspend_data'), 's');
  assert.equal(rt.api.LMSGetValue('cmi.core.exit'), ''); // exit is write-only; cleared on launch
});

test('SCORM 2004 runtime: lifecycle, data model, errors, scaled passing score', () => {
  const commits = [];
  const rt = createScormRuntime({ version: '2004', learner: { id: 'u2', name: 'Walsh, Conor' }, scaledPassingScore: 0.8, onCommit: (p) => commits.push(p) });
  const API = rt.api;
  assert.equal(API.GetValue('cmi.learner_name'), ''); assert.equal(API.GetLastError(), '122');
  assert.equal(API.Terminate(''), 'false'); assert.equal(API.GetLastError(), '112');
  assert.equal(API.Initialize(''), 'true');
  assert.equal(API.Initialize(''), 'false'); assert.equal(API.GetLastError(), '103');
  assert.equal(API.GetValue('cmi._version'), '1.0');
  assert.equal(API.GetValue('cmi.learner_name'), 'Walsh, Conor');
  assert.equal(API.GetValue('cmi.entry'), 'ab-initio');
  assert.equal(API.GetValue('cmi.completion_status'), 'incomplete');
  assert.equal(API.GetValue('cmi.success_status'), 'unknown');
  assert.equal(API.GetValue('cmi.scaled_passing_score'), '0.8');
  assert.equal(API.SetValue('cmi.learner_id', 'x'), 'false'); assert.equal(API.GetLastError(), '404');
  assert.equal(API.SetValue('cmi.score.scaled', '1.5'), 'false'); assert.equal(API.GetLastError(), '407');
  assert.equal(API.SetValue('cmi.score.scaled', 'abc'), 'false'); assert.equal(API.GetLastError(), '406');
  assert.equal(API.SetValue('cmi.score.scaled', '0.9'), 'true');
  assert.equal(API.SetValue('cmi.session_time', 'PT1H2M3S'), 'true');
  assert.equal(API.SetValue('cmi.session_time', '00:01:00'), 'false'); // wrong format for 2004
  assert.equal(API.SetValue('cmi.interactions.0.type', 'choice'), 'false'); assert.equal(API.GetLastError(), '408'); // id must be set first
  assert.equal(API.SetValue('cmi.interactions.0.id', 'q1'), 'true');
  assert.equal(API.SetValue('cmi.interactions.0.type', 'choice'), 'true');
  assert.equal(API.SetValue('cmi.interactions.0.learner_response', 'a'), 'true');
  assert.equal(API.SetValue('cmi.interactions.0.result', 'correct'), 'true');
  assert.equal(API.SetValue('cmi.interactions.0.correct_responses.0.pattern', 'a'), 'true');
  assert.equal(API.GetValue('cmi.interactions._count'), '1');
  assert.equal(API.GetValue('cmi.interactions.0.correct_responses._count'), '1');
  assert.equal(API.GetValue('cmi.location'), ''); assert.equal(API.GetLastError(), '403'); // not initialised value
  assert.equal(API.SetValue('cmi.location', 'slide-4'), 'true');
  assert.equal(API.SetValue('adl.nav.request', 'continue'), 'true');
  assert.equal(API.SetValue('cmi.completion_status', 'completed'), 'true');
  assert.equal(API.SetValue('cmi.exit', 'normal'), 'true');
  assert.equal(API.Commit(''), 'true');
  assert.equal(API.Terminate(''), 'true');
  const last = commits[commits.length - 1];
  assert.equal(last.cmi['cmi.success_status'], 'passed');
  assert.equal(last.cmi['cmi.total_time'], 'PT1H2M3S');
  assert.equal(API.GetValue('cmi.location'), ''); assert.equal(API.GetLastError(), '123');
  assert.equal(API.Terminate(''), 'false'); assert.equal(API.GetLastError(), '113');
});

test('time helpers round-trip', () => {
  assert.equal(parseTime12('0001:30:15.50'), 5415.5);
  assert.equal(formatTime12(5415.5), '0001:30:15.50');
  assert.equal(parseIsoDuration('PT1H30M15.5S'), 5415.5);
  assert.equal(formatIsoDuration(5415.5), 'PT1H30M15.5S');
  assert.equal(parseIsoDuration('P1DT2H'), 93600);
});

test('summarise + applyCommit + rollup derive LMS status', () => {
  assert.deepEqual(summarise('1.2', { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '80', 'cmi.core.total_time': '0000:10:00.00' }).status, 'completed');
  assert.equal(summarise('1.2', { 'cmi.core.lesson_status': 'failed' }).status, 'failed');
  assert.equal(summarise('1.2', { 'cmi.core.lesson_status': 'incomplete' }).status, 'in_progress');
  assert.equal(summarise('2004', { 'cmi.completion_status': 'completed', 'cmi.success_status': 'failed' }).status, 'failed');
  assert.equal(summarise('2004', { 'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.75' }).score, 75);
  assert.equal(summarise('1.2', { 'cmi.core.score.raw': '7', 'cmi.core.score.max': '10', 'cmi.core.lesson_status': 'completed' }).score, 70);
  // 1.2 mastery override: raw 60 < mastery 70 -> failed even though content said completed
  const r = applyCommit({}, { item: 'A', cmi: { 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '60' }, final: true }, '1.2', 70);
  assert.equal(r.summary.status, 'failed');
  const data = applyCommit(r.data, { item: 'B', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90' }, final: true }, '1.2', 70).data;
  assert.deepEqual(rollup(data, [{ identifier: 'A' }, { identifier: 'B' }]), { status: 'failed', score: 75 });
  const data2 = applyCommit(data, { item: 'A', cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '100' }, final: true }, '1.2', 70).data;
  assert.equal(rollup(data2, [{ identifier: 'A' }, { identifier: 'B' }]).status, 'completed');
  assert.equal(rollup(data2, [{ identifier: 'A' }, { identifier: 'B' }, { identifier: 'C' }]).status, 'in_progress');
});

const fixtures = path.resolve('tests/fixtures/packages');
test('manifest parser: SCORM 1.2 and 2004 packages', async () => {
  const AdmZip = (await import('adm-zip')).default;
  const read = (name) => new AdmZip(path.join(fixtures, name)).getEntries().find((e) => /imsmanifest\.xml$/.test(e.entryName)).getData().toString();
  const m12 = parseManifest(read('scorm12-fire-safety.zip'));
  assert.equal(m12.version, '1.2'); assert.equal(m12.launchPath, 'index.html'); assert.equal(m12.masteryScore, 70); assert.equal(m12.title, 'Fire Safety Awareness'); assert.equal(m12.items[0].dataFromLms, 'fit2trade-demo');
  const m2004 = parseManifest(read('scorm2004-food-hygiene.zip'));
  assert.equal(m2004.version, '2004'); assert.equal(m2004.launchPath, 'lesson1.html'); assert.equal(m2004.items.filter((i) => i.href).length, 2); assert.equal(m2004.items[0].scaledPassingScore, 0.8); assert.equal(m2004.items[0].scormType, 'sco');
  assert.throws(() => parseManifest('<manifest></manifest>'), /organization/);
  assert.throws(() => parseManifest('nope'), /missing/);
});

test('manifest parser handles xml:base and parameters', () => {
  const xml = `<manifest identifier="M" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="O"><organization identifier="O"><title>T</title><item identifier="I" identifierref="R" parameters="?lang=en"><title>Item</title></item></organization></organizations>
  <resources xml:base="content/"><resource identifier="R" type="webcontent" adlcp:scormtype="sco" href="start.htm"/></resources></manifest>`;
  const m = parseManifest(xml);
  assert.equal(m.launchPath, 'content/start.htm?lang=en');
});
