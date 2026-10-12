# Fit2Trade Learn

A modern learning management system in the style of LearnUpon, branded for [Fit2Trade](https://www.fit2trade.com) ("making workplaces better").
Colours and logo come from the official Fit2Trade logo: green `#275c4d` (the tick) and charcoal `#3b3a3a` (the wordmark).

## What it does

| Area | Features |
| --- | --- |
| Learner portal | Dashboard with due dates and progress, course catalogue with self-enrolment, course player, certificates (PDF), live-session booking, learning paths, in-app notifications, profile and email preferences |
| Course builder | Modules of type **SCORM** (1.2 and 2004, single or multi-SCO), **video**, **document/PDF**, **page**, **assessment/quiz** (single, multi, true/false, pass mark, attempts), **live session**, **web link**. Drag-free re-ordering, required/optional modules, duplicate course, publish/unpublish, course settings (pass mark, certificate validity) |
| SCORM run-time | Full SCORM 1.2 (`API`) and SCORM 2004 (`API_1484_11`) data models with error codes, bookmarks/suspend data, resume, session/total time, interactions and objectives, mastery score / scaled passing score, multi-SCO roll-up. Packages are unpacked server-side with zip-slip protection and served behind authentication |
| People | Users with roles (admin, manager, instructor, learner), groups with automatic enrolment (assign a course to a group with a due period), bulk enrolment, manual completion, reset, training records |
| Live sessions (ILT) | Scheduling with **Microsoft Teams** (Microsoft Graph online meetings) or **Cisco Webex** meetings created automatically, join/host links, capacity, registration, cancellation notifications, attendance synced back from Teams attendance reports / Webex participants, manual attendance, attendance completes the linked course module. A built-in virtual classroom is used when no credentials are configured |
| Compliance | Certificates with validity periods, PDF download, public verification endpoint, expiry report, **certificate-expiry reminders** (in-app and email at 60/30/14/7 days and on expiry, admin digest of expired certificates), due-date reminders, email outbox |
| Reporting | Admin overview (completion rate, monthly completions, department and course breakdowns), expiry report, CSV exports (enrolments, certificates, users, sessions), audit log |
| Migration | Import users, learning records and certificates from **TalentLMS** (REST API or CSV exports), **LearnUpon** (API or CSV), **Moodle** and any generic CSV. Automatic column detection, date-format handling, preview/dry run, idempotent re-runs, placeholder courses for historic completions, temporary passwords, welcome notifications |

## Quick start

```bash
cd fit2trade-lms
npm install
npm run build          # builds the React client into dist/client
npm start              # http://localhost:4000
```

Demo accounts are created on first start (set `SEED_DEMO=false` to create only the admin):

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@fit2trade.com | Admin123! |
| Manager | manager@fit2trade.com | Manager123! |
| Instructor | trainer@fit2trade.com | Trainer123! |
| Learner | aoife.murphy@example.com | Learner123! |

Development with hot reload: `npm run dev` (API on 4000, Vite on 5173 with proxy).

## Configuration

Copy `.env.example` to `.env`. All settings are optional for a demo.

| Variable | Purpose |
| --- | --- |
| `PORT`, `PUBLIC_URL`, `JWT_SECRET`, `DATA_DIR` | Server basics. `DATA_DIR` holds the SQLite database, uploads and unpacked SCORM packages |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_ORGANISER_USER_ID` | Microsoft Teams via Graph (client-credentials). The Entra app needs `OnlineMeetings.ReadWrite.All` and `OnlineMeetingArtifact.Read.All` application permissions plus an application access policy for the organiser |
| `MS_GRAPH_BASE_URL`, `MS_LOGIN_BASE_URL` | Override Graph endpoints (sovereign clouds, tests) |
| `WEBEX_ACCESS_TOKEN`, `WEBEX_BASE_URL` | Cisco Webex integration / service app token with `meeting:schedules_write`, `meeting:schedules_read`, `meeting:participants_read` |
| `LIVE_PROVIDER_SIMULATE` | `true` (default) falls back to the built-in classroom when a provider is not configured |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email delivery for reminders and session confirmations. Without SMTP, emails are recorded in the outbox (Settings → Notifications) but not sent |

## Project layout

```
server/            Express 5 API (ESM), SQLite via better-sqlite3
  scorm/           imsmanifest parser, SCORM 1.2/2004 run-time (scorm-api.js), player page, tracking roll-up
  integrations/    teams.js (Graph), webex.js, simulated.js
  services/        progress & certificates, mailer + outbox, reminders scheduler, importer + adapters
  routes/          auth, users/groups, courses/modules, learn (learner progress), scorm, sessions, misc, import
client/            React 19 + Vite, Fit2Trade design system in src/styles.css
tests/
  unit/            SCORM run-time, manifest parser, importer normalisation, quiz grading
  api/             End-to-end API flows (auth, courses, quizzes, SCORM commits, reports, reminders, import, sessions)
  integrations/    Teams/Webex providers against mock Graph & Webex servers; TalentLMS against a mock API
  e2e/             Playwright: real SCORM packages running in Chromium (launch, bookmark, resume, score, completion)
  fixtures/        build-scorm-packages.js generates the SCORM 1.2 / 2004 test packages
```

## Tests

```bash
npm run scorm:packages   # regenerate SCORM fixtures
npm test                 # unit + API + integration (mock Teams/Webex/TalentLMS)
npm run build && npm run test:e2e   # Playwright browser tests (needs Chromium; set CHROMIUM_PATH if Playwright's download is unavailable)
```

The Teams and Webex integrations are tested against local mock servers that implement the relevant Microsoft Graph and Webex REST endpoints (token, create/update/delete meeting, attendance). Connecting to the real services requires the credentials above.

## Migrating from TalentLMS / LearnUpon / Moodle

Admin → **Migrate / import**:

1. Choose the source. TalentLMS and LearnUpon can be read directly through their APIs (portal domain + API key or username/password) or from CSV/Excel exports; Moodle and other systems via CSV/Excel (.xlsx).
2. Upload the export(s) or enter credentials and click **Analyse & preview**. Columns such as *Email, Login, Name/User, Course, Status, Completed on, Expiry date, Certificate code, Group* are detected automatically and can be corrected in the column-mapping editor; dates default to day/month/year. Three layouts are understood: users exports, one-row-per-course learning records (learners by email, login or "Name (login)"), and training-matrix exports with one column per course. Upload the users export together with the course-progress export so learners named by login or name are matched to their email; learners already in the LMS are matched automatically.
3. Review the counts, warnings and samples, choose options (temporary password, welcome notification, skip inactive users, add to a group) and click **Import**.
4. Migrated users log in with the temporary password and are asked to change it. Their completed courses, scores, certificate numbers and expiry dates appear in their training record, and certificate-expiry reminders continue automatically.

Templates for the expected CSV layout are downloadable from the same page.
