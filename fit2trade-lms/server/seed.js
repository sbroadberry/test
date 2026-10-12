/** Creates the default admin + optional demo data. Safe to run repeatedly. */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { db, get, run, uid, now, all } from './db.js';
import { config } from './config.js';
import { parseManifest } from './scorm/manifest.js';
import { enrolUser, updateModuleProgress } from './services/progress.js';
import { ensureCompanies, getCompanyBySlug } from './services/companies.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function ensureSeed({ demo = true } = {}) {
  if (get("SELECT 1 FROM users WHERE role = 'admin'")) { ensureCompanies({ demo: false }); return false; }
  const defaultCompany = ensureCompanies({ demo });
  const ts = now();
  const pw = (p) => bcrypt.hashSync(p, 8);
  const mk = (email, first, last, role, extra = {}) => {
    const id = uid();
    run(`INSERT INTO users(id, email, password_hash, first_name, last_name, role, status, job_title, department, location, company_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, email, pw(extra.password || 'Password123!'), first, last, role, 'active', extra.job || '', extra.dept || '', extra.loc || '', extra.company || defaultCompany.id, ts);
    return id;
  };
  const admin = mk('admin@fit2trade.com', 'Fit2Trade', 'Admin', 'admin', { job: 'Platform administrator', dept: 'Fit2Trade', password: 'Admin123!' });
  console.log('[seed] Created admin@fit2trade.com / Admin123!');
  if (!demo) return true;

  const manager = mk('manager@fit2trade.com', 'Maeve', 'Byrne', 'manager', { job: 'Operations Manager', dept: 'Operations', loc: 'Dublin', password: 'Manager123!' });
  const instructor = mk('trainer@fit2trade.com', 'Shane', 'Kelly', 'instructor', { job: 'H&S Trainer', dept: 'Training', loc: 'Dublin', password: 'Trainer123!' });
  const learners = [
    mk('aoife.murphy@example.com', 'Aoife', 'Murphy', 'learner', { job: 'Barista', dept: 'Hospitality', loc: 'Dublin 2', password: 'Learner123!' }),
    mk('conor.walsh@example.com', 'Conor', 'Walsh', 'learner', { job: 'Shift Supervisor', dept: 'Hospitality', loc: 'Cork' }),
    mk('niamh.osullivan@example.com', 'Niamh', "O'Sullivan", 'learner', { job: 'Warehouse Operative', dept: 'Logistics', loc: 'Dublin 12' }),
    mk('liam.doyle@example.com', 'Liam', 'Doyle', 'learner', { job: 'Chef de Partie', dept: 'Hospitality', loc: 'Galway' }),
    mk('sarah.ryan@example.com', 'Sarah', 'Ryan', 'learner', { job: 'Room Leader', dept: 'Early Years', loc: 'Limerick' }),
    mk('eoin.brennan@example.com', 'Eoin', 'Brennan', 'learner', { job: 'Contractor', dept: 'Facilities', loc: 'Dublin' }),
  ];
  const eazysafe = getCompanyBySlug('eazysafe'), iact = getCompanyBySlug('iact');
  const esLearner = mk('learner@eazysafe.com', 'Dara', 'Fitzgerald', 'learner', { job: 'Site Supervisor', dept: 'Construction', loc: 'Dublin', company: eazysafe?.id, password: 'Learner123!' });
  mk('manager@eazysafe.com', 'Jason', 'Kearns', 'manager', { job: 'EHS Manager', dept: 'EHS', loc: 'Dublin', company: eazysafe?.id, password: 'Manager123!' });
  const iactLearner = mk('learner@iact.ie', 'Fiona', 'Coomey', 'learner', { job: 'Training Coordinator', dept: 'Training', loc: 'Dublin', company: iact?.id, password: 'Learner123!' });
  mk('manager@iact.ie', 'Katie', 'Byrne', 'manager', { job: 'Academy Manager', dept: 'Training', loc: 'Dublin', company: iact?.id, password: 'Manager123!' });
  const group = (name, desc, members) => { const id = uid(); run('INSERT INTO groups(id, name, description, created_at) VALUES (?,?,?,?)', id, name, desc, ts); members.forEach((m) => run('INSERT INTO group_members(group_id, user_id) VALUES (?,?)', id, m)); return id; };
  const gHosp = group('Hospitality team', 'Front and back of house staff', [learners[0], learners[1], learners[3]]);
  group('Logistics', 'Warehouse and drivers', [learners[2], learners[5]]);
  group('Early Years', 'Childcare settings', [learners[4]]);

  const course = (title, opts = {}) => {
    const id = uid();
    run(`INSERT INTO courses(id, title, description, category, thumbnail_url, status, self_enrol, duration_minutes, pass_mark, certificate_enabled, certificate_validity_months, level, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, title, opts.description || '', opts.category || 'Health & Safety', opts.thumb || '', 'published', opts.selfEnrol ? 1 : 0, opts.duration || 45, opts.passMark || 70, 1, opts.validity || null, opts.level || 'All levels', admin, ts, ts);
    return id;
  };
  const module = (courseId, title, type, content, position, required = 1) => { const id = uid(); run('INSERT INTO modules(id, course_id, title, type, position, required, content_json, created_at) VALUES (?,?,?,?,?,?,?,?)', id, courseId, title, type, position, required, JSON.stringify(content), ts); return id; };

  // Course 1: Manual handling (page + video + quiz), 2-year certificate
  const c1 = course('Manual Handling Theory', { description: 'Legal duties, spinal anatomy, risk assessment and safe lifting technique in line with the Safety, Health and Welfare at Work (General Application) Regulations 2007.', duration: 60, validity: 24, selfEnrol: true, thumb: 'manual-handling' });
  module(c1, 'Welcome and legal context', 'page', { html: '<h2>Why manual handling matters</h2><p>Manual handling injuries account for roughly a third of all workplace injuries reported to the Health and Safety Authority. This course covers your legal duties, how the spine works and the eight-step safe lifting technique.</p><h3>Learning outcomes</h3><ul><li>Explain the employer and employee duties under the 2007 Regulations</li><li>Identify manual handling hazards using the TILE assessment</li><li>Demonstrate the principles of safe lifting</li></ul>' }, 0);
  module(c1, 'Safe lifting technique (video)', 'video', { url: 'https://www.youtube.com/embed/3nPGsXNfbuE', description: 'Watch the demonstration of the eight-step lift, then mark the module complete.' }, 1);
  module(c1, 'Risk assessment guide (PDF)', 'document', { url: '/brand/sample-guide.pdf', description: 'Download and read the TILE risk assessment guide.' }, 2, 0);
  module(c1, 'Knowledge check', 'quiz', { passMark: 70, attemptsAllowed: 3, showAnswers: true, questions: [
    { id: 'q1', text: 'What does TILE stand for in manual handling risk assessment?', type: 'single', options: [{ id: 'a', text: 'Task, Individual, Load, Environment', correct: true }, { id: 'b', text: 'Time, Injury, Lift, Effort' }, { id: 'c', text: 'Training, Inspection, Lifting, Equipment' }] },
    { id: 'q2', text: 'Which of these are principles of a safe lift? (select all that apply)', type: 'multi', options: [{ id: 'a', text: 'Keep the load close to the body', correct: true }, { id: 'b', text: 'Twist at the waist while lifting' }, { id: 'c', text: 'Bend the knees, keep the back straight', correct: true }, { id: 'd', text: 'Lift with a jerking motion' }] },
    { id: 'q3', text: 'Employees must cooperate with their employer on manual handling training.', type: 'truefalse', options: [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False' }] },
    { id: 'q4', text: 'The 2007 General Application Regulations require employers to…', type: 'single', options: [{ id: 'a', text: 'Avoid manual handling where possible, then assess and reduce risk', correct: true }, { id: 'b', text: 'Ban all lifting over 10 kg' }, { id: 'c', text: 'Provide back belts to all staff' }] },
  ] }, 3);

  // Course 2: Fire safety with a SCORM package (built from the test fixtures when available)
  const c2 = course('Fire Safety Awareness', { description: 'Fire triangle, prevention, evacuation procedures and extinguisher types. Delivered as an interactive SCORM module.', duration: 30, validity: 12, selfEnrol: true, thumb: 'fire-safety' });
  const scormZip = path.resolve(here, '..', 'tests', 'fixtures', 'packages', 'scorm12-fire-safety.zip');
  if (fs.existsSync(scormZip)) installScorm(c2, 'Fire Safety Awareness (SCORM 1.2)', scormZip, 0);
  else module(c2, 'Fire Safety Awareness (SCORM placeholder)', 'page', { html: '<p>Upload a SCORM package to this module from the course builder.</p>' }, 0);
  const scorm2004 = path.resolve(here, '..', 'tests', 'fixtures', 'packages', 'scorm2004-food-hygiene.zip');

  // Course 3: Food hygiene (SCORM 2004 + quiz)
  const c3 = course('Food Hygiene Level 1', { description: 'Food safety hazards, personal hygiene, temperature control and HACCP basics for food handlers.', category: 'Food Safety', duration: 40, validity: 36, selfEnrol: false, thumb: 'food-hygiene' });
  if (fs.existsSync(scorm2004)) installScorm(c3, 'Food Hygiene Essentials (SCORM 2004)', scorm2004, 0);
  module(c3, 'Food hygiene assessment', 'quiz', { passMark: 80, attemptsAllowed: 2, showAnswers: true, questions: [
    { id: 'q1', text: 'The temperature danger zone for food is…', type: 'single', options: [{ id: 'a', text: '5°C to 63°C', correct: true }, { id: 'b', text: '0°C to 100°C' }, { id: 'c', text: '-18°C to 5°C' }] },
    { id: 'q2', text: 'HACCP stands for Hazard Analysis and Critical Control Points.', type: 'truefalse', options: [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False' }] },
  ] }, 1);

  // Course 4: Live instructor-led session (Teams/Webex)
  const c4 = course('Paediatric First Aid (Blended)', { description: 'Online theory followed by a live virtual classroom with a trainer. Attendance at the live session is required for certification.', category: 'First Aid', duration: 180, validity: 24, thumb: 'first-aid' });
  module(c4, 'Pre-reading: primary survey', 'page', { html: '<h2>DR ABC</h2><p>Danger, Response, Airway, Breathing, Circulation. Read the sequence and be ready to discuss scenarios in the live session.</p>' }, 0);
  const liveModule = module(c4, 'Live virtual classroom', 'live', { description: 'Join the trainer-led session. Attendance is recorded automatically when the session is linked to Teams or Webex.' }, 1);
  const sessionId = uid();
  const start = new Date(Date.now() + 3 * 86400000); start.setHours(10, 0, 0, 0);
  run(`INSERT INTO live_sessions(id, course_id, module_id, title, description, provider, starts_at, ends_at, timezone, capacity, instructor_id, location, join_url, host_url, external_id, external_json, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sessionId, c4, liveModule, 'Paediatric First Aid – live classroom', 'Trainer-led session covering CPR, choking and anaphylaxis.', 'simulated', start.toISOString(), new Date(start.getTime() + 2 * 3600000).toISOString(), 'Europe/Dublin', 20, instructor, '', `${config.publicUrl}/live/${sessionId}`, `${config.publicUrl}/live/${sessionId}?host=1`, `sim-${sessionId}`, '{"simulated":true}', 'scheduled', ts);

  // Course 5: Compliance
  const c5 = course('GDPR & Data Protection Essentials', { description: 'Principles of GDPR, lawful bases, data subject rights and breach reporting for all staff.', category: 'Compliance', duration: 35, validity: 12, selfEnrol: true, thumb: 'gdpr' });
  module(c5, 'The seven principles', 'page', { html: '<h2>Seven principles of GDPR</h2><ol><li>Lawfulness, fairness and transparency</li><li>Purpose limitation</li><li>Data minimisation</li><li>Accuracy</li><li>Storage limitation</li><li>Integrity and confidentiality</li><li>Accountability</li></ol>' }, 0);
  module(c5, 'Breach reporting (web resource)', 'link', { url: 'https://www.dataprotection.ie/en/organisations/know-your-obligations/breach-notification', description: 'Read the Data Protection Commission guidance on breach notification.' }, 1, 0);
  module(c5, 'GDPR check', 'quiz', { passMark: 70, questions: [
    { id: 'q1', text: 'Within how many hours must a notifiable breach be reported to the DPC?', type: 'single', options: [{ id: 'a', text: '72 hours', correct: true }, { id: 'b', text: '24 hours' }, { id: 'c', text: '7 days' }] },
    { id: 'q2', text: 'Data minimisation means collecting only what is necessary.', type: 'truefalse', options: [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False' }] },
  ] }, 2);

  // Learning path
  const pathId = uid();
  run('INSERT INTO learning_paths(id, title, description, status, created_at) VALUES (?,?,?,?,?)', pathId, 'Hospitality compliance onboarding', 'Everything a new hospitality hire must complete in their first 30 days.', 'published', ts);
  [c1, c2, c3, c5].forEach((c, i) => run('INSERT INTO learning_path_courses(path_id, course_id, position) VALUES (?,?,?)', pathId, c, i));
  run('INSERT INTO group_courses(group_id, course_id, due_days) VALUES (?,?,?)', gHosp, c1, 30);

  // Enrolments & progress
  const due = (d) => new Date(Date.now() + d * 86400000).toISOString();
  for (const l of learners) { enrolUser(l, c1, { source: 'group', dueAt: due(30) }); enrolUser(l, c5, { source: 'manual', dueAt: due(14) }); }
  for (const l of [learners[0], learners[1], learners[3]]) { enrolUser(l, c2, { source: 'path' }); enrolUser(l, c3, { source: 'path' }); run('INSERT INTO path_enrollments(id, path_id, user_id, enrolled_at) VALUES (?,?,?,?)', uid(), pathId, l, ts); }
  enrolUser(learners[4], c4); enrolUser(learners[0], c4);
  enrolUser(esLearner, c2); enrolUser(esLearner, c1); enrolUser(iactLearner, c5);
  run('INSERT INTO session_registrations(id, session_id, user_id, status, registered_at) VALUES (?,?,?,?,?)', uid(), sessionId, learners[4], 'registered', ts);
  // Completed histories with varied dates
  const complete = (userId, courseId, daysAgo, score) => {
    const e = get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', userId, courseId);
    for (const m of all('SELECT id FROM modules WHERE course_id = ?', courseId)) updateModuleProgress(e.id, m.id, { status: 'completed', score, timeSpentSec: 900 });
    const when = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const course = get('SELECT certificate_validity_months v FROM courses WHERE id = ?', courseId);
    const exp = course.v ? new Date(new Date(when).setMonth(new Date(when).getMonth() + course.v)).toISOString() : null;
    run('UPDATE enrollments SET completed_at = ?, started_at = ?, expires_at = ? WHERE id = ?', when, when, exp, e.id);
    run('UPDATE certificates SET issued_at = ?, expires_at = ? WHERE enrollment_id = ?', when, exp, e.id);
  };
  complete(learners[1], c1, 700, 88);  // expires in ~30 days -> triggers reminder demo
  complete(learners[3], c5, 350, 92);  // expires in ~15 days
  complete(learners[2], c1, 20, 95);
  complete(learners[1], c5, 400, 80);  // expired
  run("UPDATE enrollments SET status = 'in_progress', progress_pct = 50, started_at = ? WHERE user_id = ? AND course_id = ?", ts, learners[0], c1);
  run('INSERT INTO notifications(id, user_id, type, title, body, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)', uid(), admin, 'welcome', 'Welcome to Fit2Trade Learn', 'Demo data has been loaded. Try the course builder, the SCORM player, live sessions and the migration tool.', '/admin', ts);
  console.log('[seed] Demo data loaded (manager@fit2trade.com / Manager123!, trainer@fit2trade.com / Trainer123!, aoife.murphy@example.com / Learner123!; sample companies: /c/eazysafe/login learner@eazysafe.com, /c/iact/login learner@iact.ie)');
  return true;

  function installScorm(courseId, title, zipPath, position) {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const me = entries.find((e) => /(^|\/)imsmanifest\.xml$/i.test(e.entryName));
    const prefix = me.entryName.replace(/imsmanifest\.xml$/i, '');
    const manifest = parseManifest(me.getData().toString('utf8'));
    const mid = module(courseId, title, 'scorm', {}, position);
    const pkgId = uid();
    const dest = path.join(config.scormDir, pkgId);
    for (const e of entries) { if (e.isDirectory || !e.entryName.startsWith(prefix)) continue; const target = path.resolve(dest, e.entryName.slice(prefix.length)); if (!target.startsWith(dest)) continue; fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, e.getData()); }
    run('INSERT INTO scorm_packages(id, module_id, version, identifier, title, launch_path, mastery_score, manifest_json, original_filename, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', pkgId, mid, manifest.version, manifest.identifier, manifest.title, manifest.launchPath, manifest.masteryScore, JSON.stringify(manifest), path.basename(zipPath), ts);
    return mid;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const created = ensureSeed({ demo: true });
  console.log(created ? 'Seed complete.' : 'Database already seeded; nothing to do.');
  db.close();
}
