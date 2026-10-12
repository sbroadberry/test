/** Server-rendered SCORM player page. Exposes the SCORM API in this frame and loads the SCO in a child iframe,
 *  so content calling the standard findAPI() discovers window.parent.API / API_1484_11. */
export function renderPlayerPage({ enrollmentId, moduleId, item, version, contentUrl, learner, cmi, launchData, masteryScore, scaledPassingScore, completionThreshold, title, brand }) {
  const payload = JSON.stringify({ enrollmentId, moduleId, item, version, contentUrl, learner, cmi, launchData, masteryScore, scaledPassingScore, completionThreshold, title })
    .replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} · ${escapeHtml(brand.name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;height:100%;background:#f4f6f5;font-family:Inter,system-ui,sans-serif;color:${brand.ink}}
  #bar{height:36px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#fff;border-bottom:1px solid #e3e7e5;font-size:12px}
  #bar .dot{width:8px;height:8px;border-radius:50%;background:#bbb}
  #bar .dot.ok{background:${brand.primary}}
  #bar .dot.err{background:#c0392b}
  #bar .spacer{flex:1}
  #bar button{border:1px solid #d9dedc;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px}
  #frame{position:absolute;top:36px;left:0;right:0;bottom:0}
  #sco{width:100%;height:100%;border:0;background:#fff}
</style>
<script src="/scorm-runtime.js"></script>
</head><body>
<div id="bar"><span class="dot" id="dot"></span><span id="status">Loading SCORM ${escapeHtml(version)} content…</span><span class="spacer"></span><span id="saved"></span><button id="save">Save progress</button></div>
<div id="frame"><iframe id="sco" title="Course content" allow="autoplay; fullscreen"></iframe></div>
<script>
(function(){
  var cfg = ${payload};
  var statusEl = document.getElementById('status'), dot = document.getElementById('dot'), savedEl = document.getElementById('saved');
  var runtime = ScormRuntime.createScormRuntime({
    version: cfg.version, initial: cfg.cmi, learner: cfg.learner, launchData: cfg.launchData,
    masteryScore: cfg.masteryScore, scaledPassingScore: cfg.scaledPassingScore, completionThreshold: cfg.completionThreshold,
    onLog: function(level, a, b){ if (level === 'error') console.warn('[SCORM]', a, b); },
    onInitialize: function(){ dot.className = 'dot ok'; statusEl.textContent = 'Connected to ' + cfg.title; post({ type: 'scorm:initialized' }); },
    onCommit: function(payload){ send(payload, false); },
    onTerminate: function(){ statusEl.textContent = 'Session finished'; post({ type: 'scorm:terminated' }); }
  });
  if (cfg.version === '2004') window.API_1484_11 = runtime.api; else window.API = runtime.api;
  // Expose both names defensively: some content probes the wrong one first.
  if (!window.API) window.API = runtime.api; if (!window.API_1484_11) window.API_1484_11 = runtime.api;

  function post(msg){ try { if (window.parent !== window) window.parent.postMessage(Object.assign({ source: 'f2t-scorm', enrollmentId: cfg.enrollmentId, moduleId: cfg.moduleId }, msg), '*'); } catch(e){} }
  function send(payload, useBeacon){
    var body = JSON.stringify({ item: cfg.item, cmi: payload.cmi, sessionTimeSec: payload.sessionTimeSec, final: payload.final });
    var url = '/api/scorm/' + cfg.enrollmentId + '/' + cfg.moduleId + '/commit';
    if (useBeacon && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })); return; }
    // keepalive lets a final commit complete even if the content window is torn down straight after Terminate/LMSFinish
    fetch(url, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (res) { return res.json().then(function (json) { return { ok: res.ok, status: res.status, json: json }; }); })
      .then(function (r) {
        if (!r.ok) { dot.className = 'dot err'; statusEl.textContent = 'Could not save progress (' + r.status + ')'; return; }
        savedEl.textContent = 'Saved ' + new Date().toLocaleTimeString();
        post({ type: 'scorm:progress', moduleStatus: r.json.moduleStatus, score: r.json.score, enrollment: r.json.enrollment, final: payload.final });
      })
      .catch(function () { dot.className = 'dot err'; statusEl.textContent = 'Could not save progress'; });
  }
  document.getElementById('save').onclick = function(){ runtime.forceCommit(false); };
  window.addEventListener('beforeunload', function(){ if (runtime.getState() === 'running') { var r = runtime.getData(); send({ cmi: r, sessionTimeSec: 0, final: false }, true); } });
  setInterval(function(){ if (runtime.getState() === 'running' && runtime.isDirty()) runtime.forceCommit(false); }, 30000);
  document.getElementById('sco').src = cfg.contentUrl;
})();
</script>
</body></html>`;
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
