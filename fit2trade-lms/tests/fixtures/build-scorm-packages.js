/** Builds the SCORM test packages used by the automated tests and the demo seed.
 *  - scorm12-fire-safety.zip      SCORM 1.2, single SCO, 3 pages, score + mastery score, suspend/resume
 *  - scorm2004-food-hygiene.zip   SCORM 2004 3rd Edition, two SCOs, scaled score, interactions
 *  - scorm12-broken.zip           missing imsmanifest.xml (negative test) */
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'packages');
fs.mkdirSync(out, { recursive: true });

const style = `body{font-family:Inter,system-ui,sans-serif;margin:0;padding:28px;color:#3b3a3a;background:#fff}h1{color:#275c4d;margin-top:0}.card{max-width:720px;margin:0 auto}button{background:#275c4d;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer;margin-right:8px}button.secondary{background:#e6ebe9;color:#3b3a3a}.status{margin-top:18px;font-size:13px;color:#6b6b6b}.q label{display:block;margin:6px 0}.page{display:none}.page.active{display:block}`;

/** Shared JS: SCORM API discovery for both versions (the standard ADL findAPI algorithm). */
const findApi = `
function findAPI(win, name) { var tries = 0; while (win && !win[name] && tries < 10) { if (win.parent && win.parent !== win) win = win.parent; else if (win.opener) win = win.opener; else break; tries++; } return win ? win[name] || null : null; }
function getAPI(name) { var api = findAPI(window, name); if (!api && window.opener) api = findAPI(window.opener, name); return api; }`;

const scorm12Html = `<!doctype html><html><head><meta charset="utf-8"><title>Fire Safety Awareness</title><style>${style}</style></head><body><div class="card">
<h1>Fire Safety Awareness</h1>
<div id="p1" class="page active"><h2>1. The fire triangle</h2><p>Fire needs heat, fuel and oxygen. Remove any one and the fire goes out.</p><button data-testid="next1" onclick="go(2)">Next</button></div>
<div id="p2" class="page"><h2>2. Extinguisher types</h2><p>Water (red), foam (cream), CO₂ (black), dry powder (blue), wet chemical (yellow).</p><button data-testid="next2" onclick="go(3)">Next</button></div>
<div id="p3" class="page"><h2>3. Quick check</h2><div class="q"><p>Which extinguisher is safe on electrical fires?</p>
<label><input type="radio" name="q" value="co2" data-testid="opt-co2"> CO₂</label><label><input type="radio" name="q" value="water" data-testid="opt-water"> Water</label></div>
<button data-testid="finish" onclick="finish()">Submit and finish</button></div>
<div class="status" id="status">Connecting to LMS…</div></div>
<script>${findApi}
var API = getAPI('API'); var page = 1;
function set(k, v) { var ok = API.LMSSetValue(k, v); if (ok !== 'true') console.warn('LMSSetValue failed', k, v, API.LMSGetLastError(), API.LMSGetErrorString(API.LMSGetLastError())); return ok; }
function show(p) { document.querySelectorAll('.page').forEach(function (el) { el.classList.remove('active'); }); document.getElementById('p' + p).classList.add('active'); page = p; }
function go(p) { show(p); set('cmi.core.lesson_location', 'page' + p); set('cmi.suspend_data', JSON.stringify({ page: p, visited: Date.now() })); API.LMSCommit(''); document.getElementById('status').textContent = 'Progress saved at page ' + p; }
function finish() {
  var choice = (document.querySelector('input[name=q]:checked') || {}).value;
  var score = choice === 'co2' ? 100 : 0;
  set('cmi.core.score.min', '0'); set('cmi.core.score.max', '100'); set('cmi.core.score.raw', String(score));
  set('cmi.interactions.0.id', 'extinguisher'); set('cmi.interactions.0.type', 'choice'); set('cmi.interactions.0.student_response', choice || ''); set('cmi.interactions.0.result', score ? 'correct' : 'wrong');
  set('cmi.core.lesson_status', score >= 70 ? 'passed' : 'failed');
  set('cmi.core.session_time', '00:01:30'); set('cmi.core.exit', '');
  API.LMSCommit(''); API.LMSFinish('');
  document.getElementById('status').textContent = 'Finished with score ' + score;
  document.getElementById('status').setAttribute('data-finished', 'true');
}
if (!API) { document.getElementById('status').textContent = 'SCORM API not found'; }
else {
  API.LMSInitialize('');
  var entry = API.LMSGetValue('cmi.core.entry'); var name = API.LMSGetValue('cmi.core.student_name'); var loc = API.LMSGetValue('cmi.core.lesson_location');
  var status = API.LMSGetValue('cmi.core.lesson_status');
  document.getElementById('status').textContent = 'Connected. Learner: ' + name + ' · entry: ' + entry + ' · status: ' + status + (loc ? ' · resumed at ' + loc : '');
  document.getElementById('status').setAttribute('data-entry', entry); document.getElementById('status').setAttribute('data-location', loc || '');
  if (entry === 'resume' && /^page(\\d)$/.test(loc)) show(Number(loc.replace('page', '')));
  if (status === 'not attempted') set('cmi.core.lesson_status', 'incomplete');
  window.addEventListener('beforeunload', function () { if (API && !document.getElementById('status').getAttribute('data-finished')) { set('cmi.core.exit', 'suspend'); API.LMSFinish(''); } });
}
</script></body></html>`;

const manifest12 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="F2T_FIRE_SAFETY_12" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1"><title>Fire Safety Awareness</title>
      <item identifier="ITEM1" identifierref="RES1" isvisible="true"><title>Fire Safety Awareness</title><adlcp:masteryscore>70</adlcp:masteryscore><adlcp:datafromlms>fit2trade-demo</adlcp:datafromlms></item>
    </organization>
  </organizations>
  <resources><resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`;

function sco2004(title, nextLabel, testIdPrefix, finalScore) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head><body><div class="card">
<h1>${title}</h1><p>SCORM 2004 3rd Edition content. Answer the question and submit.</p>
<div class="q"><p>Food should be kept out of the 5–63°C danger zone.</p><label><input type="radio" name="q" value="true" data-testid="${testIdPrefix}-true"> True</label><label><input type="radio" name="q" value="false" data-testid="${testIdPrefix}-false"> False</label></div>
<button data-testid="${testIdPrefix}-finish" onclick="finish()">${nextLabel}</button><div class="status" id="status">Connecting…</div></div>
<script>${findApi}
var API = getAPI('API_1484_11');
function set(k, v) { var ok = API.SetValue(k, v); if (ok !== 'true') console.warn('SetValue failed', k, v, API.GetLastError(), API.GetErrorString(API.GetLastError())); return ok; }
function finish() {
  var choice = (document.querySelector('input[name=q]:checked') || {}).value; var correct = choice === 'true';
  var scaled = correct ? ${finalScore} : 0.2;
  set('cmi.interactions.0.id', 'danger-zone'); set('cmi.interactions.0.type', 'true-false'); set('cmi.interactions.0.learner_response', String(choice)); set('cmi.interactions.0.result', correct ? 'correct' : 'incorrect');
  set('cmi.score.scaled', String(scaled)); set('cmi.score.raw', String(Math.round(scaled * 100))); set('cmi.score.min', '0'); set('cmi.score.max', '100');
  set('cmi.success_status', scaled >= 0.8 ? 'passed' : 'failed'); set('cmi.completion_status', 'completed'); set('cmi.progress_measure', '1');
  set('cmi.session_time', 'PT2M10S'); set('cmi.exit', 'normal');
  API.Commit(''); API.Terminate('');
  document.getElementById('status').textContent = 'Done. Scaled score ' + scaled; document.getElementById('status').setAttribute('data-finished', 'true');
}
if (!API) document.getElementById('status').textContent = 'SCORM 2004 API not found';
else { API.Initialize(''); var entry = API.GetValue('cmi.entry'); document.getElementById('status').textContent = 'Connected as ' + API.GetValue('cmi.learner_name') + ' · entry ' + entry + ' · completion ' + API.GetValue('cmi.completion_status'); document.getElementById('status').setAttribute('data-entry', entry);
  if (API.GetValue('cmi.completion_status') === 'unknown') set('cmi.completion_status', 'incomplete');
  window.addEventListener('beforeunload', function () { if (!document.getElementById('status').getAttribute('data-finished')) { set('cmi.exit', 'suspend'); API.Terminate(''); } }); }
</script></body></html>`;
}

const manifest2004 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="F2T_FOOD_HYGIENE_2004" version="1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3" xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3" xmlns:imsss="http://www.imsglobal.org/xsd/imsss" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 3rd Edition</schemaversion></metadata>
  <organizations default="ORG"><organization identifier="ORG" adlseq:objectivesGlobalToSystem="false"><title>Food Hygiene Essentials</title>
    <item identifier="LESSON1" identifierref="RES_L1"><title>Lesson 1 · Hazards and hygiene</title>
      <imsss:sequencing><imsss:objectives><imsss:primaryObjective objectiveID="PRIMARY1" satisfiedByMeasure="true"><imsss:minNormalizedMeasure>0.8</imsss:minNormalizedMeasure></imsss:primaryObjective></imsss:objectives></imsss:sequencing></item>
    <item identifier="LESSON2" identifierref="RES_L2"><title>Lesson 2 · Temperature control</title></item>
  </organization></organizations>
  <resources>
    <resource identifier="RES_L1" type="webcontent" adlcp:scormType="sco" href="lesson1.html"><file href="lesson1.html"/></resource>
    <resource identifier="RES_L2" type="webcontent" adlcp:scormType="sco" href="lesson2.html"><file href="lesson2.html"/></resource>
  </resources>
</manifest>`;

function build(name, files) {
  const zip = new AdmZip();
  for (const [p, content] of Object.entries(files)) zip.addFile(p, Buffer.from(content, 'utf8'));
  zip.writeZip(path.join(out, name));
  console.log('built', name);
}
build('scorm12-fire-safety.zip', { 'imsmanifest.xml': manifest12, 'index.html': scorm12Html });
build('scorm2004-food-hygiene.zip', { 'imsmanifest.xml': manifest2004, 'lesson1.html': sco2004('Lesson 1 · Hazards and hygiene', 'Submit lesson 1', 'l1', 0.9), 'lesson2.html': sco2004('Lesson 2 · Temperature control', 'Submit lesson 2', 'l2', 1) });
// a package where the content lives in a sub-folder (common with Articulate/iSpring exports)
build('scorm12-nested.zip', { 'course/imsmanifest.xml': manifest12, 'course/index.html': scorm12Html });
build('scorm12-broken.zip', { 'index.html': '<html><body>no manifest</body></html>' });
