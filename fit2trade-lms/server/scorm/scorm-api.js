/* Fit2Trade Learn SCORM runtime: implements the SCORM 1.2 (API) and SCORM 2004 (API_1484_11)
   run-time data models in the browser. Plain script (no modules) so it can run inside the player
   page and in Node tests via vm. */
(function (root) {
  'use strict';

  const ERR12 = {
    0: 'No error', 101: 'General exception', 201: 'Invalid argument error', 202: 'Element cannot have children',
    203: 'Element not an array - cannot have count', 301: 'Not initialized', 401: 'Not implemented error',
    402: 'Invalid set value, element is a keyword', 403: 'Element is read only', 404: 'Element is write only', 405: 'Incorrect data type',
  };
  const ERR2004 = {
    0: 'No Error', 101: 'General Exception', 102: 'General Initialization Failure', 103: 'Already Initialized',
    104: 'Content Instance Terminated', 111: 'General Termination Failure', 112: 'Termination Before Initialization',
    113: 'Termination After Termination', 122: 'Retrieve Data Before Initialization', 123: 'Retrieve Data After Termination',
    132: 'Store Data Before Initialization', 133: 'Store Data After Termination', 142: 'Commit Before Initialization',
    143: 'Commit After Termination', 201: 'General Argument Error', 301: 'General Get Failure', 351: 'General Set Failure',
    391: 'General Commit Failure', 401: 'Undefined Data Model Element', 402: 'Unimplemented Data Model Element',
    403: 'Data Model Element Value Not Initialized', 404: 'Data Model Element Is Read Only', 405: 'Data Model Element Is Write Only',
    406: 'Data Model Element Type Mismatch', 407: 'Data Model Element Value Out Of Range', 408: 'Data Model Dependency Not Established',
  };

  const RO = 'ro', WO = 'wo', RW = 'rw';
  const vocab = (list) => (v) => list.includes(v);
  const isDecimal = (v) => /^-?\d+(\.\d+)?$/.test(v);
  const inRange = (min, max) => (v) => isDecimal(v) && Number(v) >= min && Number(v) <= max;
  const isTime12 = (v) => /^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/.test(v);
  const isIsoDuration = (v) => /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(v);
  const isTimestamp = (v) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v);
  const any = () => true;

  // ---- Data model definitions -------------------------------------------------------------
  const MODEL12 = {
    'cmi.core._children': [RO, 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time'],
    'cmi.core.student_id': [RO], 'cmi.core.student_name': [RO],
    'cmi.core.lesson_location': [RW, any, 255], 'cmi.core.credit': [RO],
    'cmi.core.lesson_status': [RW, vocab(['passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'])],
    'cmi.core.entry': [RO], 'cmi.core.score._children': [RO, 'raw,min,max'],
    'cmi.core.score.raw': [RW, inRange(0, 100)], 'cmi.core.score.min': [RW, inRange(0, 100)], 'cmi.core.score.max': [RW, inRange(0, 100)],
    'cmi.core.total_time': [RO], 'cmi.core.lesson_mode': [RO],
    'cmi.core.exit': [WO, vocab(['time-out', 'suspend', 'logout', ''])], 'cmi.core.session_time': [WO, isTime12],
    'cmi.suspend_data': [RW, any, 4096], 'cmi.launch_data': [RO], 'cmi.comments': [RW, any, 4096], 'cmi.comments_from_lms': [RO],
    'cmi.objectives._children': [RO, 'id,score,status'], 'cmi.objectives._count': [RO],
    'cmi.student_data._children': [RO, 'mastery_score,max_time_allowed,time_limit_action'],
    'cmi.student_data.mastery_score': [RO], 'cmi.student_data.max_time_allowed': [RO], 'cmi.student_data.time_limit_action': [RO],
    'cmi.student_preference._children': [RO, 'audio,language,speed,text'],
    'cmi.student_preference.audio': [RW, inRange(-1, 100)], 'cmi.student_preference.language': [RW, any, 255],
    'cmi.student_preference.speed': [RW, inRange(-100, 100)], 'cmi.student_preference.text': [RW, inRange(-1, 1)],
    'cmi.interactions._children': [RO, 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency'],
    'cmi.interactions._count': [RO],
  };
  const COLLECTIONS12 = {
    'cmi.objectives': { id: [RW, any, 255], 'score.raw': [RW, inRange(0, 100)], 'score.min': [RW, inRange(0, 100)], 'score.max': [RW, inRange(0, 100)],
      'score._children': [RO, 'raw,min,max'], status: [RW, vocab(['passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'])] },
    'cmi.interactions': { id: [WO, any, 255], time: [WO, isTime12], type: [WO, vocab(['true-false', 'choice', 'fill-in', 'matching', 'performance', 'sequencing', 'likert', 'numeric'])],
      weighting: [WO, isDecimal], student_response: [WO, any], result: [WO, (v) => ['correct', 'wrong', 'unanticipated', 'neutral'].includes(v) || isDecimal(v)],
      latency: [WO, isTime12], 'objectives._count': [RO], 'correct_responses._count': [RO], 'objectives.*.id': [WO, any], 'correct_responses.*.pattern': [WO, any] },
  };

  const MODEL2004 = {
    'cmi._version': [RO, '1.0'],
    'cmi.comments_from_learner._children': [RO, 'comment,location,timestamp'], 'cmi.comments_from_learner._count': [RO],
    'cmi.comments_from_lms._children': [RO, 'comment,location,timestamp'], 'cmi.comments_from_lms._count': [RO],
    'cmi.completion_status': [RW, vocab(['completed', 'incomplete', 'not attempted', 'unknown'])],
    'cmi.completion_threshold': [RO], 'cmi.credit': [RO], 'cmi.entry': [RO],
    'cmi.exit': [WO, vocab(['time-out', 'suspend', 'logout', 'normal', ''])],
    'cmi.interactions._children': [RO, 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description'],
    'cmi.interactions._count': [RO],
    'cmi.launch_data': [RO], 'cmi.learner_id': [RO], 'cmi.learner_name': [RO],
    'cmi.learner_preference._children': [RO, 'audio_level,language,delivery_speed,audio_captioning'],
    'cmi.learner_preference.audio_level': [RW, inRange(0, 100)], 'cmi.learner_preference.language': [RW, any, 250],
    'cmi.learner_preference.delivery_speed': [RW, inRange(0, 100)], 'cmi.learner_preference.audio_captioning': [RW, vocab(['-1', '0', '1'])],
    'cmi.location': [RW, any, 1000], 'cmi.max_time_allowed': [RO], 'cmi.mode': [RO],
    'cmi.objectives._children': [RO, 'id,score,success_status,completion_status,progress_measure,description'], 'cmi.objectives._count': [RO],
    'cmi.progress_measure': [RW, inRange(0, 1)],
    'cmi.scaled_passing_score': [RO],
    'cmi.score._children': [RO, 'scaled,raw,min,max'],
    'cmi.score.scaled': [RW, inRange(-1, 1)], 'cmi.score.raw': [RW, isDecimal], 'cmi.score.min': [RW, isDecimal], 'cmi.score.max': [RW, isDecimal],
    'cmi.session_time': [WO, isIsoDuration],
    'cmi.success_status': [RW, vocab(['passed', 'failed', 'unknown'])],
    'cmi.suspend_data': [RW, any, 64000], 'cmi.time_limit_action': [RO], 'cmi.total_time': [RO],
    'adl.nav.request': [RW, (v) => /^(continue|previous|choice|jump|exit|exitAll|abandon|abandonAll|suspendAll|_none_)$/.test(v) || /^\{target=.+\}(choice|jump)$/.test(v)],
    'adl.nav.request_valid.continue': [RO], 'adl.nav.request_valid.previous': [RO],
  };
  const COLLECTIONS2004 = {
    'cmi.comments_from_learner': { comment: [RW, any, 4000], location: [RW, any, 250], timestamp: [RW, isTimestamp] },
    'cmi.comments_from_lms': { comment: [RO], location: [RO], timestamp: [RO] },
    'cmi.objectives': { id: [RW, any, 4000], 'score._children': [RO, 'scaled,raw,min,max'], 'score.scaled': [RW, inRange(-1, 1)], 'score.raw': [RW, isDecimal],
      'score.min': [RW, isDecimal], 'score.max': [RW, isDecimal], success_status: [RW, vocab(['passed', 'failed', 'unknown'])],
      completion_status: [RW, vocab(['completed', 'incomplete', 'not attempted', 'unknown'])], progress_measure: [RW, inRange(0, 1)], description: [RW, any, 250] },
    'cmi.interactions': { id: [RW, any, 4000], type: [RW, vocab(['true-false', 'choice', 'fill-in', 'long-fill-in', 'matching', 'performance', 'sequencing', 'likert', 'numeric', 'other'])],
      'objectives._count': [RO], 'objectives.*.id': [RW, any], timestamp: [RW, isTimestamp], 'correct_responses._count': [RO], 'correct_responses.*.pattern': [RW, any],
      weighting: [RW, isDecimal], learner_response: [RW, any], result: [RW, (v) => ['correct', 'incorrect', 'unanticipated', 'neutral'].includes(v) || isDecimal(v)],
      latency: [RW, isIsoDuration], description: [RW, any, 250] },
  };

  // ---- Time helpers ------------------------------------------------------------------------
  function parseTime12(v) { // HHHH:MM:SS.SS -> seconds
    const m = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(v || '');
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number('0.' + m[4]) : 0);
  }
  function formatTime12(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return String(h).padStart(4, '0') + ':' + String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  }
  function parseIsoDuration(v) {
    const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v || '');
    if (!m) return 0;
    return (Number(m[1] || 0) * 31536000) + (Number(m[2] || 0) * 2592000) + (Number(m[3] || 0) * 86400) + (Number(m[4] || 0) * 3600) + (Number(m[5] || 0) * 60) + Number(m[6] || 0);
  }
  function formatIsoDuration(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round((sec % 60) * 100) / 100;
    return 'PT' + h + 'H' + m + 'M' + s + 'S';
  }

  // ---- Runtime -----------------------------------------------------------------------------
  function createScormRuntime(opts) {
    const version = opts.version === '2004' ? '2004' : '1.2';
    const is12 = version === '1.2';
    const MODEL = is12 ? MODEL12 : MODEL2004;
    const COLL = is12 ? COLLECTIONS12 : COLLECTIONS2004;
    const ERR = is12 ? ERR12 : ERR2004;
    const data = Object.assign({}, opts.initial || {});
    const log = opts.onLog || function () {};
    let state = 'not_initialized'; // not_initialized | running | terminated
    let lastError = 0;
    let dirty = false;
    const startedAt = Date.now();

    // LMS-provided values
    const learnerId = opts.learner && opts.learner.id || 'learner';
    const learnerName = opts.learner && opts.learner.name || 'Learner';
    const hasPrior = Object.keys(data).length > 0;
    const prevExit = is12 ? data['cmi.core.exit'] : data['cmi.exit'];
    const resume = hasPrior && (prevExit === 'suspend' || (is12 ? data['cmi.suspend_data'] : data['cmi.suspend_data'] || data['cmi.location']));
    if (is12) {
      data['cmi.core.student_id'] = learnerId; data['cmi.core.student_name'] = learnerName;
      data['cmi.core.credit'] = 'credit'; data['cmi.core.lesson_mode'] = opts.mode || 'normal';
      data['cmi.core.entry'] = resume ? 'resume' : (hasPrior && data['cmi.core.lesson_status'] && data['cmi.core.lesson_status'] !== 'not attempted' ? '' : 'ab-initio');
      if (!data['cmi.core.lesson_status']) data['cmi.core.lesson_status'] = 'not attempted';
      if (!data['cmi.core.total_time']) data['cmi.core.total_time'] = '0000:00:00.00';
      data['cmi.launch_data'] = opts.launchData || ''; data['cmi.comments_from_lms'] = opts.commentsFromLms || '';
      data['cmi.student_data.mastery_score'] = opts.masteryScore != null ? String(opts.masteryScore) : '';
      data['cmi.student_data.max_time_allowed'] = opts.maxTimeAllowed || ''; data['cmi.student_data.time_limit_action'] = opts.timeLimitAction || '';
      delete data['cmi.core.session_time']; delete data['cmi.core.exit'];
    } else {
      data['cmi._version'] = '1.0'; data['cmi.learner_id'] = learnerId; data['cmi.learner_name'] = learnerName;
      data['cmi.credit'] = 'credit'; data['cmi.mode'] = opts.mode || 'normal';
      data['cmi.entry'] = resume ? 'resume' : (hasPrior && data['cmi.completion_status'] && data['cmi.completion_status'] !== 'not attempted' ? '' : 'ab-initio');
      if (!data['cmi.completion_status']) data['cmi.completion_status'] = 'unknown';
      if (!data['cmi.success_status']) data['cmi.success_status'] = 'unknown';
      if (!data['cmi.total_time']) data['cmi.total_time'] = 'PT0H0M0S';
      data['cmi.launch_data'] = opts.launchData || '';
      data['cmi.scaled_passing_score'] = opts.scaledPassingScore != null ? String(opts.scaledPassingScore) : (opts.masteryScore != null ? String(opts.masteryScore / 100) : '');
      data['cmi.completion_threshold'] = opts.completionThreshold != null ? String(opts.completionThreshold) : '';
      data['cmi.max_time_allowed'] = opts.maxTimeAllowed || ''; data['cmi.time_limit_action'] = opts.timeLimitAction || '';
      data['adl.nav.request_valid.continue'] = 'unknown'; data['adl.nav.request_valid.previous'] = 'unknown';
      delete data['cmi.session_time']; delete data['cmi.exit'];
    }

    function setError(code) { lastError = code; if (code) log('error', code, ERR[code]); return code === 0; }

    function resolve(el) { // returns { def, key } or null
      if (MODEL[el]) return { def: MODEL[el], key: el };
      for (const base in COLL) {
        if (el.indexOf(base + '.') !== 0) continue;
        const rest = el.slice(base.length + 1);
        if (rest === '_count' || rest === '_children') return { def: MODEL[el] || [RO], key: el };
        const m = /^(\d+)\.(.+)$/.exec(rest);
        if (!m) return null;
        const field = m[2];
        const spec = COLL[base];
        if (spec[field]) return { def: spec[field], key: el, base, index: Number(m[1]), field };
        const sub = /^(objectives|correct_responses)\.(\d+)\.(\w+)$/.exec(field);
        if (sub && spec[sub[1] + '.*.' + sub[3]]) return { def: spec[sub[1] + '.*.' + sub[3]], key: el, base, index: Number(m[1]), field };
        if (/^(objectives|correct_responses)\._count$/.test(field)) return { def: [RO], key: el, base, index: Number(m[1]), field };
        return null;
      }
      return null;
    }

    function count(prefix) {
      let max = -1;
      const re = new RegExp('^' + prefix.replace(/\./g, '\\.') + '\\.(\\d+)\\.');
      for (const k in data) { const m = re.exec(k); if (m) max = Math.max(max, Number(m[1])); }
      return max + 1;
    }

    function getValue(el) {
      if (state !== 'running') { setError(is12 ? 301 : (state === 'terminated' ? 123 : 122)); return ''; }
      if (typeof el !== 'string' || !el) { setError(201); return ''; }
      const r = resolve(el);
      if (!r) { setError(is12 ? 201 : 401); return ''; }
      if (/\._count$/.test(el)) { setError(0); return String(count(el.replace(/\._count$/, ''))); }
      if (/\._children$/.test(el)) { setError(0); return r.def[1] || ''; }
      if (r.def[0] === WO) { setError(is12 ? 404 : 405); return ''; }
      if (!(el in data)) {
        if (is12) { setError(0); return ''; }
        setError(403); return '';
      }
      setError(0);
      return String(data[el]);
    }

    function setValue(el, value) {
      if (state !== 'running') { setError(is12 ? 301 : (state === 'terminated' ? 133 : 132)); return 'false'; }
      if (typeof el !== 'string' || !el) { setError(201); return 'false'; }
      const v = value == null ? '' : String(value);
      const r = resolve(el);
      if (!r) { setError(is12 ? 201 : 401); return 'false'; }
      if (/\._(count|children)$/.test(el)) { setError(is12 ? 402 : 404); return 'false'; }
      if (r.def[0] === RO) { setError(is12 ? 403 : 404); return 'false'; }
      const validator = r.def[1];
      if (typeof validator === 'function' && !validator(v)) { setError(is12 ? 405 : (v.length && /^-?\d/.test(v) ? 407 : 406)); return 'false'; }
      if (r.def[2] && v.length > r.def[2]) { setError(is12 ? 405 : 407); return 'false'; }
      if (r.base && r.index > count(r.base)) { setError(is12 ? 201 : 351); return 'false'; } // must be sequential
      if (!is12 && r.base && r.field !== 'id' && !(r.base + '.' + r.index + '.id' in data) && r.base !== 'cmi.comments_from_learner') { setError(408); return 'false'; }
      data[el] = v;
      dirty = true;
      setError(0);
      return 'true';
    }

    function snapshot() {
      const out = {};
      for (const k in data) out[k] = data[k];
      return out;
    }

    function sessionSeconds() {
      const raw = is12 ? data['cmi.core.session_time'] : data['cmi.session_time'];
      if (raw) return is12 ? parseTime12(raw) : parseIsoDuration(raw);
      return Math.round((Date.now() - startedAt) / 1000);
    }

    function applyLmsRules() {
      // SCORM 1.2: when a mastery score exists and a raw score was set, the LMS decides passed/failed
      if (is12 && opts.masteryScore != null && data['cmi.core.score.raw'] !== undefined && data['cmi.core.score.raw'] !== '') {
        const s = Number(data['cmi.core.score.raw']);
        if (['passed', 'failed', 'completed'].indexOf(data['cmi.core.lesson_status']) >= 0 || data['cmi.core.lesson_status'] === 'incomplete') {
          data['cmi.core.lesson_status'] = s >= Number(opts.masteryScore) ? 'passed' : 'failed';
        }
      }
      if (is12 && data['cmi.core.lesson_status'] === 'not attempted') data['cmi.core.lesson_status'] = 'incomplete';
      if (!is12) {
        if (data['cmi.completion_status'] === 'unknown' || data['cmi.completion_status'] === 'not attempted') data['cmi.completion_status'] = 'incomplete';
        const sps = data['cmi.scaled_passing_score'];
        if (sps && data['cmi.score.scaled'] !== undefined && data['cmi.score.scaled'] !== '') {
          data['cmi.success_status'] = Number(data['cmi.score.scaled']) >= Number(sps) ? 'passed' : 'failed';
        }
      }
    }

    function commit(final) {
      if (state !== 'running') { setError(is12 ? 301 : (state === 'terminated' ? 143 : 142)); return 'false'; }
      const secs = sessionSeconds();
      const snap = snapshot();
      if (final) {
        const totalKey = is12 ? 'cmi.core.total_time' : 'cmi.total_time';
        const prev = is12 ? parseTime12(data[totalKey]) : parseIsoDuration(data[totalKey]);
        data[totalKey] = is12 ? formatTime12(prev + secs) : formatIsoDuration(prev + secs);
        snap[totalKey] = data[totalKey];
      }
      try {
        if (opts.onCommit) opts.onCommit({ cmi: snap, sessionTimeSec: secs, final: !!final, version });
      } catch (e) { log('error', 'commit failed', e); setError(is12 ? 101 : 391); return 'false'; }
      dirty = false;
      setError(0);
      return 'true';
    }

    function initialize(arg) {
      if (arg !== '' && arg !== undefined) { setError(201); return 'false'; }
      if (state === 'running') { setError(is12 ? 101 : 103); return 'false'; }
      if (state === 'terminated') { setError(is12 ? 101 : 104); return 'false'; }
      state = 'running';
      applyLmsRules();
      log('info', 'Initialize', version);
      if (opts.onInitialize) opts.onInitialize();
      setError(0);
      return 'true';
    }

    function terminate(arg) {
      if (arg !== '' && arg !== undefined) { setError(201); return 'false'; }
      if (state === 'not_initialized') { setError(is12 ? 301 : 112); return 'false'; }
      if (state === 'terminated') { setError(is12 ? 301 : 113); return 'false'; }
      // SCORM 2004: if exit is not set, default behaviour is "normal". 1.2 leaves lesson_status to content.
      applyLmsRules();
      commit(true);
      state = 'terminated';
      log('info', 'Terminate');
      if (opts.onTerminate) opts.onTerminate(snapshot());
      setError(0);
      return 'true';
    }

    const api = is12 ? {
      LMSInitialize: initialize, LMSFinish: terminate, LMSGetValue: getValue, LMSSetValue: setValue,
      LMSCommit: function (a) { if (a !== '' && a !== undefined) { setError(201); return 'false'; } return commit(false); },
      LMSGetLastError: function () { return String(lastError); },
      LMSGetErrorString: function (c) { return ERR[Number(c)] || ''; },
      LMSGetDiagnostic: function (c) { return ERR[Number(c)] || String(c || lastError); },
    } : {
      Initialize: initialize, Terminate: terminate, GetValue: getValue, SetValue: setValue,
      Commit: function (a) { if (a !== '' && a !== undefined) { setError(201); return 'false'; } return commit(false); },
      GetLastError: function () { return String(lastError); },
      GetErrorString: function (c) { return ERR[Number(c)] || ''; },
      GetDiagnostic: function (c) { return ERR[Number(c)] || String(c || lastError); },
    };

    return {
      api, version,
      getData: snapshot,
      getState: function () { return state; },
      isDirty: function () { return dirty; },
      forceCommit: function (final) { if (state === 'running') { if (final) applyLmsRules(); return commit(!!final); } return 'false'; },
      helpers: { parseTime12, formatTime12, parseIsoDuration, formatIsoDuration },
    };
  }

  /** Derive LMS-level status/score from a CMI snapshot. Shared by the server (via vm) and tests. */
  function summarise(version, cmi) {
    const is12 = version !== '2004';
    let status = 'in_progress', score = null;
    if (is12) {
      const ls = cmi['cmi.core.lesson_status'];
      if (ls === 'passed' || ls === 'completed') status = 'completed';
      else if (ls === 'failed') status = 'failed';
      else if (!ls || ls === 'not attempted') status = 'not_started';
      if (cmi['cmi.core.score.raw'] !== undefined && cmi['cmi.core.score.raw'] !== '') {
        const raw = Number(cmi['cmi.core.score.raw']);
        const max = Number(cmi['cmi.core.score.max'] || 100) || 100, min = Number(cmi['cmi.core.score.min'] || 0) || 0;
        score = Math.round(((raw - min) / (max - min || 100)) * 100);
      }
    } else {
      const cs = cmi['cmi.completion_status'], ss = cmi['cmi.success_status'];
      if (ss === 'failed') status = 'failed';
      else if (cs === 'completed' || ss === 'passed') status = 'completed';
      else if (!cs || cs === 'not attempted' || cs === 'unknown') status = 'not_started';
      if (cmi['cmi.score.scaled'] !== undefined && cmi['cmi.score.scaled'] !== '') score = Math.round(Number(cmi['cmi.score.scaled']) * 100);
      else if (cmi['cmi.score.raw'] !== undefined && cmi['cmi.score.raw'] !== '') {
        const raw = Number(cmi['cmi.score.raw']);
        const max = Number(cmi['cmi.score.max'] || 100) || 100, min = Number(cmi['cmi.score.min'] || 0) || 0;
        score = Math.round(((raw - min) / (max - min || 100)) * 100);
      }
    }
    const totalKey = is12 ? 'cmi.core.total_time' : 'cmi.total_time';
    const totalSec = is12 ? parseTime12(cmi[totalKey]) : parseIsoDuration(cmi[totalKey]);
    return { status, score, totalSec, location: is12 ? cmi['cmi.core.lesson_location'] : cmi['cmi.location'], suspended: (is12 ? cmi['cmi.core.exit'] : cmi['cmi.exit']) === 'suspend' };
  }

  const exported = { createScormRuntime, summarise, parseTime12, formatTime12, parseIsoDuration, formatIsoDuration };
  root.ScormRuntime = exported;
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
