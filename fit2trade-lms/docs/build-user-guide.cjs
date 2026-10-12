/** Builds docs/Fit2Trade-Learn-User-Guide.docx from the screenshots in docs/screenshots. Run: node docs/build-user-guide.cjs */
const fs = require('fs');
const path = require('path');
const sizeOf = (buf) => { // minimal PNG dimension reader
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType, TableOfContents, PageBreak, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, LevelFormat, Header, Footer, PageNumber } = require('docx');

const shots = path.join(__dirname, 'screenshots');
const GREEN = '275c4d', INK = '3b3a3a', GREY = '6b6b6b';
const PAGE_W = 11906 - 2 * 1134; // A4 width minus margins, in DXA
const MAX_IMG_W = 6.4 * 72; // points available for an image (page width in pt ≈ 6.4in)
const MAX_IMG_H = 7.6 * 72;

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts.para, children: [new TextRun({ text, color: INK, size: 22, ...opts })] });
const note = (text) => new Paragraph({ spacing: { before: 60, after: 160 }, shading: { type: ShadingType.CLEAR, fill: 'EEF4F1', color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: GREEN, space: 8 } }, indent: { left: 200 }, children: [new TextRun({ text: 'Tip: ', bold: true, color: GREEN, size: 21 }), new TextRun({ text, color: INK, size: 21 })] });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: t })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t })] });
let stepInstance = 0;
const steps = (items, cont = false) => { if (!cont) stepInstance += 1; return items.map((t) => new Paragraph({ numbering: { reference: 'steps', level: 0, instance: stepInstance }, spacing: { after: 80 }, children: runs(t) })); };
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: runs(t) }));
function runs(t) { // **bold** support
  const parts = String(t).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((x) => x.startsWith('**') ? new TextRun({ text: x.slice(2, -2), bold: true, color: INK, size: 22 }) : new TextRun({ text: x, color: INK, size: 22 }));
}
let figNo = 0;
function figure(name, caption) {
  const file = path.join(shots, name + '.png');
  if (!fs.existsSync(file)) { console.warn('missing screenshot', name); return [p(`[screenshot ${name} missing]`)]; }
  const buf = fs.readFileSync(file);
  const { width, height } = sizeOf(buf);
  let w = MAX_IMG_W, h = (height / width) * w;
  if (h > MAX_IMG_H) { h = MAX_IMG_H; w = (width / height) * h; }
  figNo += 1;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true, children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w), height: Math.round(h) }, altText: { title: caption, description: caption, name } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `Figure ${figNo}. ${caption}`, italics: true, color: GREY, size: 19 })] }),
  ];
}
function table(rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const dxa = widths.map((w) => Math.round((w / total) * PAGE_W));
  return new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: dxa, rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: r.map((c, j) => new TableCell({ width: { size: dxa[j], type: WidthType.DXA }, shading: i === 0 ? { type: ShadingType.CLEAR, fill: GREEN, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: i === 0, color: i === 0 ? 'FFFFFF' : INK, size: 20 })] })] })) })) });
}

const logo = fs.readFileSync(path.join(__dirname, '..', 'client', 'public', 'brand', 'fit2trade-logo.png'));
const children = [];
// ---------- Cover ----------
children.push(new Paragraph({ spacing: { before: 2400, after: 400 }, alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 300, height: 101 }, altText: { title: 'Fit2Trade', description: 'Fit2Trade logo', name: 'logo' } })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Fit2Trade Learn', bold: true, size: 64, color: GREEN })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Learning Management System', size: 36, color: INK })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200 }, children: [new TextRun({ text: 'Administrator & Learner Guide — including migrating users from TalentLMS and other platforms', size: 26, color: GREY })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Version 1.0 · ${new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 22, color: GREY })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Fit2Trade Ltd · 32 Fitzwilliam Street Upper, Dublin 2 · www.fit2trade.com', size: 20, color: GREY })] }));
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Contents' })] }));
const contents = ['1. Introduction', '2. Administrator overview', '3. Users and groups', '4. Building courses', '5. Enrolments and learning paths', '6. Live sessions (Teams and Webex)', '7. Reports', '8. Certificate expiry reminders and email', '9. Settings and integrations', '9A. Companies, branding and single sign-on', '10. Migrating users from TalentLMS and other platforms', '11. Learner guide', 'Appendix A. Installation and configuration summary', 'Appendix B. Demo accounts'];
for (const c of contents) children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: c, size: 24, color: INK })] }));

// ---------- 1. Introduction ----------
children.push(h1('1. Introduction'));
children.push(p('Fit2Trade Learn is Fit2Trade\'s learning management system (LMS). It delivers self-paced e-learning (including SCORM courses exported from tools such as Articulate, iSpring or Captivate), assessments, documents and videos, and trainer-led live sessions over Microsoft Teams or Cisco Webex. It records every completion, issues certificates, reminds learners and managers before certificates expire, and reports on compliance across the organisation.'));
children.push(h2('1.1 Who this guide is for'));
children.push(table([['Role', 'What they can do'], ['Admin', 'Everything: users, groups, courses, enrolments, live sessions, reports, settings, migration/import'], ['Manager', 'Users and groups, courses, enrolments, live sessions, reports (no settings or migration)'], ['Instructor', 'Build courses, schedule live sessions and record attendance, enrol learners, view reports'], ['Learner', 'Take assigned courses, self-enrol from the catalogue, book live sessions, download certificates']], [1, 4]));
children.push(h2('1.2 Signing in'));
children.push(...steps(['Open the portal address in a browser (for example https://learn.fit2trade.com, or http://localhost:4000 on a demo installation).', 'Enter your work email address and password and click **Sign in**.', 'If your account was migrated from another LMS, sign in with the temporary password your administrator gave you; you will be asked to set a new password on your profile page.']));
children.push(...figure('01-login', 'The sign-in page'));
children.push(h2('1.3 Finding your way around'));
children.push(p('The left-hand menu has two sections. "My learning" is visible to everyone and contains the Dashboard, Course catalogue, Live sessions and Certificates. "Manage" appears for admins, managers and instructors and contains Overview, Courses, Learning paths, Enrolments, Live sessions, Users & groups, Reports, Migrate / import and Settings.'));
children.push(p('The bell icon in the top bar shows unread notifications (enrolments, due dates, completions, certificate expiry, live-session changes). Click a notification to open the related page. Your name opens your profile; the door icon signs you out.'));
children.push(...figure('03-notifications', 'In-app notifications'));

// ---------- 2. Admin overview ----------
children.push(h1('2. Administrator overview'));
children.push(p('The Overview page summarises the whole portal: active learners, published courses, completion rate, overdue enrolments, certificates issued, certificates expiring in the next 60 days, expired certificates and upcoming live sessions. Below the tiles you can see completions by month, course performance, completion by department and the latest completions.'));
children.push(...figure('02-admin-overview', 'Admin overview dashboard'));

// ---------- 3. Users & groups ----------
children.push(h1('3. Users and groups'));
children.push(h2('3.1 Viewing and searching users'));
children.push(p('Open **Users & groups**. Search by name, email or department, and filter by role or status. Each row shows the number of enrolments and completions, the learner\'s groups and last login. Click a row to edit the account or **Record** to open the learner\'s full training record.'));
children.push(...figure('16-users-list', 'The user list'));
children.push(h2('3.2 Adding a user'));
children.push(...steps(['Click **Add user**.', 'Enter first name, last name and email address.', 'Choose a role (Learner, Instructor, Manager or Admin) and status.', 'Optionally add job title and department and tick the groups the person belongs to. Group membership automatically enrols the user in the group\'s courses.', 'Leave the password blank to generate a temporary password (shown once after saving) or type one yourself.', 'Click **Save**.']));
children.push(...figure('17-add-user-modal', 'Adding a user'));
children.push(h2('3.3 Groups and automatic enrolment'));
children.push(p('Groups are the quickest way to keep compliance training assigned. When you assign a course to a group with a "due in X days" period, every current member is enrolled immediately and every future member is enrolled when they join the group.'));
children.push(...steps(['Open the **Groups** tab, type a name and click **+** to create a group.', 'Select the group. Use **+ Add member…** to add people and the **×** to remove them.', 'Under Assigned courses choose a course, set the number of days until it is due and click **Assign**. The number of learners enrolled is confirmed.']));
children.push(...figure('18-groups', 'Managing a group, its members and assigned courses'));
children.push(h2('3.4 The training record'));
children.push(p('A learner\'s record lists every enrolment with status, progress, score, completion and expiry dates, the certificates they hold (with PDF download), group membership and live-session attendance. From here an administrator can **Mark complete** (for example after classroom training) or **Reset** an enrolment so the learner starts again.'));
children.push(...figure('19-user-training-record', 'A learner\'s training record'));

// ---------- 4. Courses ----------
children.push(h1('4. Building courses'));
children.push(h2('4.1 Creating a course'));
children.push(...steps(['Open **Courses** and click **New course**.', 'Enter the title, category and description.', 'Set the certificate validity in months (leave blank for certificates that never expire). Validity drives the expiry reminders described in section 8.', 'Tick "Allow learners to self-enrol" if the course should be open in the catalogue; otherwise learners must be enrolled by an admin, a group or a learning path.', 'Click **Create course**. The course opens in the builder as a draft.']));
children.push(...figure('05-new-course-modal', 'Creating a course'));
children.push(...figure('06-course-builder-empty', 'The course builder before content is added'));
children.push(h2('4.2 Adding a SCORM package'));
children.push(p('Fit2Trade Learn supports SCORM 1.2 and SCORM 2004 packages (single or multi-SCO, including exports where the content sits in a sub-folder). Progress, bookmarks, scores, time spent and completion are tracked automatically by the built-in SCORM run-time.'));
children.push(...steps(['In the builder click **SCORM package (1.2 / 2004)**.', 'Drag the .zip file exported from your authoring tool into the box or choose it with the file picker. Optionally give the module a title.', 'Click **Upload & install**. The manifest is read, the content is unpacked and the module appears in the list showing the SCORM version and file name.']));
children.push(...figure('07-scorm-upload', 'Uploading a SCORM package'));
children.push(...figure('08-course-builder-scorm', 'The installed SCORM module'));
children.push(note('A package must contain imsmanifest.xml. If the upload is rejected, re-export the course from the authoring tool choosing "SCORM 1.2" or "SCORM 2004 3rd/4th Edition" and upload the resulting zip without unzipping it.'));
children.push(h2('4.3 Pages, videos, documents and web links'));
children.push(p('Use **Page** for written content (simple HTML is supported), **Video** for a YouTube/Vimeo embed URL or an uploaded MP4, **Document (PDF)** for files learners must read, and **Web link** for external resources. Learners mark these modules complete themselves; untick "Required to complete the course" to make a module optional.'));
children.push(...figure('09-page-editor', 'Editing a page module'));
children.push(h2('4.4 Assessments (quizzes)'));
children.push(...steps(['Click **Assessment**, give it a title and set the pass mark and number of attempts allowed (blank = unlimited).', 'Click **Add question**, type the question and choose Single choice, Multiple choice or True / false.', 'Type the options and mark the correct answer(s) with the radio button / checkbox beside each option.', 'Tick "Show correct answers after submission" if learners should see feedback, then click **Save module**.']));
children.push(...figure('10-quiz-editor', 'The assessment editor'));
children.push(h2('4.5 Live session modules'));
children.push(p('A **Live session** module is completed by attending a scheduled session (see section 6). Add the module here, then schedule sessions for it from Live sessions.'));
children.push(...figure('11-live-module-editor', 'A live-session module'));
children.push(h2('4.6 Ordering, settings and publishing'));
children.push(p('Use the up/down arrows to reorder modules; learners work through them in the order shown. The **Settings** tab holds the description, duration, pass mark, thumbnail theme, self-enrolment, certificate and validity options. Click **Publish** to make the course available; **Unpublish** returns it to draft without losing enrolments.'));
children.push(...figure('12-course-builder-full', 'A complete course in the builder'));
children.push(...figure('13-course-settings', 'Course settings'));
children.push(h2('4.7 Enrolling learners from the course'));
children.push(p('The **Learners** tab shows everyone enrolled with their progress. Choose a group and/or select individuals, optionally set a due date and click **Enrol**. You can also mark an enrolment complete or remove it here.'));
children.push(...figure('14-course-learners-enrol', 'Enrolling a group from the course'));
children.push(...figure('15-course-learners-list', 'Enrolled learners'));

// ---------- 5. Enrolments & paths ----------
children.push(h1('5. Enrolments and learning paths'));
children.push(h2('5.1 Enrolments page'));
children.push(p('The **Enrolments** page lists every enrolment across the portal. Filter by course or status, search by learner, export to CSV, mark complete or remove. Overdue due dates are highlighted in red.'));
children.push(...figure('20-enrolments', 'All enrolments'));
children.push(h2('5.2 Bulk enrolment'));
children.push(...steps(['Click **Enrol learners**.', 'Select one or more courses (Ctrl/Cmd-click for several).', 'Select groups and/or individuals and an optional due date.', 'Click **Enrol**. Learners receive an in-app notification and, if email is configured and enabled on their profile, an email.']));
children.push(...figure('21-bulk-enrol-modal', 'Bulk enrolment'));
children.push(h2('5.3 Learning paths'));
children.push(p('A learning path bundles several courses into a programme (for example a 30-day onboarding plan). Enrolling a learner in a path enrols them in every course in it; progress is shown on their dashboard.'));
children.push(...figure('22-learning-paths', 'Learning paths'));

// ---------- 6. Live sessions ----------
children.push(h1('6. Live sessions (Teams and Webex)'));
children.push(p('Live sessions are instructor-led classes. When Microsoft Teams or Cisco Webex is connected (Settings → Integrations), the online meeting is created automatically with join and host links; attendance can be pulled back from the meeting afterwards. Without credentials the portal uses its built-in virtual classroom so you can still schedule and test sessions.'));
children.push(h2('6.1 Scheduling a session'));
children.push(...steps(['Open **Live sessions** (Manage) and click **Schedule session**.', 'Enter a title, start and end time.', 'Choose the delivery: Microsoft Teams, Cisco Webex, the built-in classroom, or in person (enter a location).', 'Optionally link the session to a course and its live-session module so attendance completes the module.', 'Set the capacity, add a description and, if you wish, tick "Register everyone currently enrolled in the course".', 'Click **Save**. The meeting is created and the join link, meeting number or passcode appear on the session.']));
children.push(...figure('24-schedule-session-modal', 'Scheduling a live session'));
children.push(...figure('25-session-created', 'Session details with join link and registrations'));
children.push(h2('6.2 Registrations and attendance'));
children.push(p('Select a session to see who is registered. Use **+ Register learner…** to add people. After the session either click **Sync attendance from Teams/Webex** (learners who joined for at least half the session are marked attended) or mark each learner **Attended** / **Absent** manually. Attendance on a linked module completes that module for the learner. Changing the time or cancelling a session notifies everyone registered.'));
children.push(...figure('23-live-sessions', 'Live sessions list and detail'));

// ---------- 7. Reports ----------
children.push(h1('7. Reports'));
children.push(p('The **Reports** page has four tabs: course completion (enrolled, completed, in progress, failed and average score per course), certificate expiry (everything expiring in the next 120 days or already expired, plus the reminders that have been sent), departments, and the audit log of administrative actions. Every report can be exported as CSV for auditors using the buttons at the top.'));
children.push(...figure('26-reports-courses', 'Course completion report'));
children.push(...figure('27-reports-expiry', 'Certificate expiry report'));
children.push(...figure('28-reports-audit', 'Audit log'));

// ---------- 8. Notifications & expiry ----------
children.push(h1('8. Certificate expiry reminders and email'));
children.push(p('Courses with a certificate validity period produce certificates that expire. Fit2Trade Learn checks every six hours (and on start-up) and sends:'));
children.push(...bullets(['An in-app notification and an email to the learner 60, 30, 14 and 7 days before expiry and on the day the certificate expires, each with a "Renew now" link to the course.', 'An in-app notification and email digest to admins and managers listing certificates that have expired.', 'Due-date reminders for enrolments 7 days and 1 day before the due date and when overdue.']));
children.push(p('Each reminder window is sent once per certificate, so learners are never nagged twice for the same milestone. Learners can turn email off on their profile (in-app notifications always remain). Admins can change the reminder windows and send a test email in **Settings → Notifications & email**, and can run the reminder job on demand from the expiry report.'));
children.push(...figure('38-reminders-run', 'Running the reminder job from the expiry report'));
children.push(...figure('30-settings-notifications', 'Reminder settings and the email outbox'));
children.push(note('Until SMTP details are entered in the .env file, emails are recorded in the outbox with the status "Skipped (no SMTP)" so you can see exactly what would have been sent.'));

// ---------- 9. Settings ----------
children.push(h1('9. Settings and integrations'));
children.push(p('**Integrations** shows whether Microsoft Teams, Cisco Webex and email are connected and what is needed to connect them. **Branding** shows the logo and the Fit2Trade colours (green #275c4d and charcoal #3b3a3a taken from the logo).'));
children.push(table([['Integration', 'What to configure'], ['Microsoft Teams', 'Entra ID app registration with OnlineMeetings.ReadWrite.All and OnlineMeetingArtifact.Read.All application permissions, an application access policy for the organiser account, then MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_ORGANISER_USER_ID'], ['Cisco Webex', 'Integration/service-app token with meeting:schedules_write, meeting:schedules_read and meeting:participants_read, set as WEBEX_ACCESS_TOKEN'], ['Email (SMTP)', 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM']], [1.2, 3.8]));
children.push(...figure('29-settings-integrations', 'Integration status'));
children.push(...figure('31-settings-branding', 'Branding'));

// ---------- 9b. Companies, branding and SSO ----------
children.push(h1('9A. Companies, branding and single sign-on'));
children.push(p('Fit2Trade Learn can host several companies on one installation. Each company has its own name, logo, colours, login page copy, hostnames, email domains and single sign-on rules, so EazySAFE learners see an EazySAFE portal while IACT learners see IACT Academy. Users belong to a company; courses are shared across companies unless a course is restricted to one.'));
children.push(h2('9A.1 Creating a company and choosing a theme'));
children.push(...steps(['Open **Companies & branding** (admins) and click **New company**.', 'On the **Details** tab enter the company name, the portal slug (its login page becomes /c/<slug>/login), the website, optional portal hostnames (visitors arriving on learn.example.com see this company\'s login page automatically) and the email domains that belong to the company.', 'On the **Theme & branding** tab click one of the sample themes – Fit2Trade, EazySAFE or IACT – to start, then adjust the portal name, tagline, logo and favicon (paste a URL or upload an image), the primary, accent, text and background colours, the sidebar style and font, and the login page headline, sub-text and background. The live preview on the right updates as you type.', 'On the **Single sign-on** tab choose whether Google and Microsoft sign-in are allowed, whether accounts are created automatically for people in the company\'s email domains, the role they receive and an optional group they join (which assigns the group\'s courses).', 'Click **Save company**. Use **Preview here** on the company card to see the theme applied to your own session, or open the company\'s login link.']));
children.push(...figure('56-companies', 'Companies & branding with the Fit2Trade, EazySAFE and IACT sample themes'));
children.push(...figure('57-company-theme-editor', 'The theme editor with live preview'));
children.push(...figure('58-company-sso', 'Single sign-on rules for a company'));
children.push(h2('9A.2 What the learner sees'));
children.push(p('The login page and the whole learning environment take the company\'s logo, colours, portal name and footer. Certificates and emails use the same branding. Learners reach their portal through /c/<slug>/login, through the company hostname, or simply by signing in: the portal remembers the company on that browser.'));
children.push(...figure('52-login-eazysafe', 'EazySAFE sample theme – login page'));
children.push(...figure('53-login-iact', 'IACT sample theme – login page'));
children.push(...figure('54-learner-eazysafe-theme', 'EazySAFE theme applied to the learner dashboard (dark sidebar style)'));
children.push(h2('9A.3 Setting up Google and Microsoft sign-in'));
children.push(table([['Provider', 'Steps'], ['Google', 'In Google Cloud Console create an OAuth client of type Web application, add <portal URL>/api/auth/sso/google/callback as an authorised redirect URI, and set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env file.'], ['Microsoft', 'In Microsoft Entra ID register an application (Web platform) with redirect URI <portal URL>/api/auth/sso/microsoft/callback, create a client secret, and set MS_SSO_CLIENT_ID, MS_SSO_CLIENT_SECRET and MS_SSO_TENANT (common, organizations or your tenant ID).']], [1, 4]));
children.push(p('Settings → Integrations shows whether each provider is configured and the exact redirect URI to register. Once configured, "Continue with Google" and "Continue with Microsoft" buttons appear on the login page of every company that allows them. Existing users are matched by email address; new users are created in the company whose email domains match, provided automatic provisioning is on.'));
children.push(note('SSO users never need a portal password. People who sign in with a password can still use SSO later – the accounts are matched by email.'));

// ---------- 10. Migration ----------
children.push(h1('10. Migrating users from TalentLMS and other platforms'));
children.push(p('The migration tool (Manage → **Migrate / import**, admins only) brings users, their learning history and their certificates across from your previous LMS so nothing is lost and expiry reminders carry on seamlessly. It supports:'));
children.push(table([['Source', 'Methods', 'Notes'], ['TalentLMS', 'REST API (portal domain + API key) or CSV exports', 'Reads every user, their course history, scores, completion dates and certifications'], ['LearnUpon', 'REST API (portal domain + API username/password) or CSV exports', 'Users, enrolments, completion dates, expiry dates and certificate IDs'], ['Moodle', 'CSV export', 'Users and completion reports'], ['Generic CSV', 'Any CSV with an Email column', 'Excel exports, HR system extracts, spreadsheets kept by trainers']], [1.2, 2, 2.3]));
children.push(h2('10.1 What is migrated'));
children.push(...bullets(['**Users** – name, email, role, department, job title and group membership. New users get a temporary password and must change it at first login.', '**Courses** – matched by title or code; courses that do not exist yet are created as placeholders in the "Migrated" category so history is preserved. You can add content to them later.', '**Learning records** – enrolment, progress, score, completion date and expiry date.', '**Certificates** – certificate number, issue date and expiry date, so the expiry report and reminders include migrated certificates immediately.']));
children.push(h2('10.2 Preparing a CSV export'));
children.push(p('Exports can be CSV, TSV or Excel (.xlsx). Column names are detected automatically; common headings such as Email, Login, First name / Last name (or Name / User), User type / Role, Department, Group, Course, Course code, Status, Progress, Score, Enrolled on, Completed on, Expiry date and Certificate code are all recognised, including the headings used by TalentLMS, LearnUpon and Moodle exports. Dates are read as day/month/year unless you choose US format. Download the **Users template** or **Records template** from the page to see the simplest layout.'));
children.push(p('Three layouts are understood:'));
children.push(...bullets(['**Users export** - one row per person with an Email column (TalentLMS Users > Export, LearnUpon Users report, Moodle user list).', '**Learning-record export** - one row per person and course (TalentLMS course progress / timeline, LearnUpon Enrollments report). Learners may be identified by email, by login, or by name such as "Aoife Murphy (aoife.m)".', '**Training matrix** - one row per person and one column per course whose cells contain the status, for example "Completed (20/01/2024)" or "In progress (40%)".']));
children.push(note('TalentLMS course-progress exports usually name learners by name or login rather than email. Upload the Users export in the same import so each name can be matched to an email address; learners who already exist in Fit2Trade Learn are matched automatically. Rows that cannot be matched are listed in the preview rather than imported.'));
children.push(h2('10.3 Running an import step by step'));
children.push(...steps(['Open **Migrate / import** and choose the source platform (step 1). For TalentLMS and LearnUpon choose whether to upload CSV exports or connect to the API, then click **Continue**.']));
children.push(...figure('32-import-step1-source', 'Step 1 – choosing the source'));
children.push(...steps(['Upload one or more CSV files (you can combine a users export and a course-progress export), check the date format and click **Analyse & preview**. For API mode enter the portal domain and credentials instead.'], true));
children.push(...figure('33-import-step2-upload', 'Step 2 – uploading the export'));
children.push(...figure('37-import-api-mode', 'Step 2 (API mode) – connecting directly to TalentLMS'));
children.push(...steps(['Review the preview: how many users are new or existing, which courses will be created, how many learning records and certificates were found, and sample rows. Warnings list rows that will be skipped (for example learners that could not be matched to an email).', 'Check the **Column mapping** card. Every column of every file is shown with the field it feeds; change a dropdown (for example map "Staff mail" to email) and click **Re-analyse with this mapping** if anything was missed. Matrix exports show the course columns that were detected.', 'Choose the import options: update existing users, create placeholder courses, send a welcome notification, skip inactive users, the temporary password and an optional group to add everyone to.', 'Click **Import …**. Nothing is written until this point.'], true));
children.push(...figure('34-import-step3-preview', 'Step 3 – preview and options'));
children.push(...steps(['Read the result summary. It shows how many users, groups, courses, learning records and certificates were created, updated or skipped, and lists any records that could not be matched. The import also appears in the import history at the bottom of the page.'], true));
children.push(...figure('35-import-step4-result', 'Step 4 – result'));
children.push(h2('10.4 After the import'));
children.push(p('Open **Users & groups** and search for a migrated user: their record shows "migrated from talentlms", the completed courses with their original completion and expiry dates, and the original certificate numbers. Check **Reports → Certificate expiry** to confirm that upcoming renewals are listed.'));
children.push(...figure('36-migrated-user-record', 'A migrated learner\'s training record'));
children.push(note('Imports are safe to repeat. Users are matched by email and courses by title/code, so running the same export twice does not create duplicates — it only adds what is new.'));
children.push(h2('10.5 Tell your learners'));
children.push(...bullets(['Send learners the portal address and the temporary password you chose in the import options.', 'They sign in, go to their profile and set a new password (the portal prompts them).', 'Their dashboard shows migrated completions and certificates straight away.']));

// ---------- 11. Learner guide ----------
children.push(h1('11. Learner guide'));
children.push(h2('11.1 Dashboard'));
children.push(p('The dashboard shows courses to complete (with due dates and progress), completed courses, learning paths, upcoming live sessions and notifications. Click **Start** or **Continue** to open a course.'));
children.push(...figure('40-learner-dashboard', 'Learner dashboard'));
children.push(h2('11.2 Catalogue and enrolling'));
children.push(p('Browse or search the catalogue. Courses marked "Open enrolment" can be joined with the **Enrol** button on the course page; others are assigned by an administrator.'));
children.push(...figure('41-catalogue', 'Course catalogue'));
children.push(...figure('42-course-detail', 'Course overview page'));
children.push(h2('11.3 Taking a course'));
children.push(p('The course player lists modules on the left; the current module is shown on the right. Pages, videos and documents are marked complete with the green button. Assessments are submitted with **Submit answers** and show the score and (if enabled) the correct answers. SCORM courses save progress automatically — you can leave and return later and the course resumes where you left off.'));
children.push(...figure('43-player-page-module', 'A page module'));
children.push(...figure('44-player-quiz', 'An assessment'));
children.push(...figure('45-player-quiz-result', 'Assessment feedback'));
children.push(...figure('46-player-scorm', 'A SCORM 1.2 course running in the player'));
children.push(...figure('47-player-scorm-2004', 'A multi-lesson SCORM 2004 course'));
children.push(h2('11.4 Live sessions'));
children.push(p('Open **Live sessions** to see upcoming classes, register, and use the **Join** link (Teams, Webex or the built-in classroom) when the session starts. Registration confirmations and any changes arrive as notifications.'));
children.push(...figure('48-learner-sessions', 'Live sessions available to a learner'));
children.push(h2('11.5 Certificates'));
children.push(p('Completed courses issue a certificate with a unique ID. Download the PDF from **Certificates**; certificates nearing expiry are flagged with a **Renew** button that re-opens the course.'));
children.push(...figure('50-certificates', 'My certificates'));
children.push(h2('11.6 Profile and email preferences'));
children.push(p('Update your details, change your password and choose whether to receive email notifications on the **Profile** page.'));
children.push(...figure('51-profile', 'Profile page'));

// ---------- Appendix ----------
children.push(h1('Appendix A. Installation and configuration summary'));
children.push(p('Fit2Trade Learn is a Node.js application (Node 22 or later). Install with "npm install", build the interface with "npm run build" and start with "npm start". Data (SQLite database, uploads and unpacked SCORM packages) lives in the folder set by DATA_DIR. All settings are environment variables documented in .env.example and the README. Automated tests cover the SCORM run-time (SCORM 1.2 and 2004 packages running in a real browser), the Teams and Webex integrations (against mock Microsoft Graph and Webex services), the TalentLMS importer and the reminder engine.'));
children.push(h1('Appendix B. Demo accounts'));
children.push(table([['Role', 'Email', 'Password'], ['Admin', 'admin@fit2trade.com', 'Admin123!'], ['Manager', 'manager@fit2trade.com', 'Manager123!'], ['Instructor', 'trainer@fit2trade.com', 'Trainer123!'], ['Learner', 'aoife.murphy@example.com', 'Learner123!'], ['EazySAFE learner (/c/eazysafe/login)', 'learner@eazysafe.com', 'Learner123!'], ['IACT learner (/c/iact/login)', 'learner@iact.ie', 'Learner123!']], [1.4, 2.3, 1.3]));

const doc = new Document({
  creator: 'Fit2Trade Learn', title: 'Fit2Trade Learn – User Guide', description: 'How to operate the Fit2Trade Learn LMS and migrate users from other platforms',
  styles: { default: { document: { run: { font: 'Calibri', size: 22, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true, color: GREEN, font: 'Calibri' }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: INK, font: 'Calibri' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: GREEN, font: 'Calibri' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ] },
  numbering: { config: [
    { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 4 } }, children: [new TextRun({ text: 'Fit2Trade Learn · User Guide', color: GREY, size: 18 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Fit2Trade Ltd · making workplaces better · Page ', color: GREY, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 18 })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((buf) => { const outFile = path.join(__dirname, 'Fit2Trade-Learn-User-Guide.docx'); fs.writeFileSync(outFile, buf); console.log('wrote', outFile, Math.round(buf.length / 1024), 'KB', 'figures:', figNo); });
