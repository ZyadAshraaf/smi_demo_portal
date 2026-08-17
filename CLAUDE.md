# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Start server on port 4046 |
| `npm run dev` | Start with nodemon (auto-restart on file changes) |
| `npm test` | Run all workflow integration suites via `tests/run.js` (server must be running first) |
| `node teams-app/update-url.js <URL>` | Update Teams manifest with tunnel URL + repackage zip |

No build step, no TypeScript. The server runs directly with `node server.js`.

**Tests** live in `tests/workflows/` — integration tests that hit a live server via HTTP. Run a single suite directly:
```bash
node tests/workflows/leave.test.js        # or wfh, travel, purchase-orders, material-requisitions, ems-versions
```
Set `TEST_BASE_URL` to target a non-default server. **The default is `http://localhost:4046/unifiedsmi`** (not bare `http://localhost:4046`) because all API paths in the helpers are relative to the base path (e.g. `/api/leaves`). Tests clean up all created records automatically.

**Environment variables** (copy `.env.example` → `.env` to get started):
- `GROQ_API_KEY` — required for `/unifiedsmi/api/hr-chat` and `/unifiedsmi/api/leave-assistant/chat` (both use Groq llama-3.3-70b-versatile via raw `fetch` to `api.groq.com` — no groq npm package)
- `PORT` — overrides default port 4046
- `TEAMS_PORT` — overrides Teams proxy server port (default 3001); used by `teams-app/server.js`
- `MAIN_APP_ORIGIN` — overrides proxy target in `teams-app/server.js` (default `http://localhost:4046`)
- `SESSION_SECRET` — session signing secret (default `unified-workspace-secret-2026`)
- `DOCEVAL_URL` — upstream document-AI hostname (default `doceval-8362469192e8.herokuapp.com`); used by the AI warmup endpoint and `routes/doceval.js`

## Project Structure

```
server.js              # Main Express server (port 4046)
routes/                # Express route handlers (one per feature); ems/ is a sub-router
views/                 # HTML pages — structure only, no server-side templating
public/
  css/                 # variables.css (defaults), global.css, pages.css, ems.css
  js/                  # Client-side controllers (1-to-1 with views); ems/ sub-controllers
  assets/
data/                  # JSON "database" files (users, tasks, leaves, settings, ems-*, etc.)
uploads/ems/           # Uploaded document files (served at /unifiedsmi/uploads/ems/*)
utils/teamsNotify.js   # Teams activity feed notification helper
teams-app/             # Teams tab manifest + standalone server (port 3001)
teams-app-tasks/       # Separate Teams manifest for tasks-only view
AI Test Files/         # Sample PDFs/docs for testing doc-chat, proposal-eval, resume-eval
```

Key non-obvious files:
- `public/js/api.js` — shared client utilities (API, Layout, Heartbeat, UI namespaces)
- `public/css/variables.css` — CSS variable defaults (overridden by the dynamic `/theme.css` endpoint)
- `data/settings.json` — theme colors, app name, logo path, optional Teams Graph config

## Architecture

Single **Node.js/Express** server (`server.js`) serving the browser app on port 4046. One codebase — Teams is just a manifest pointing at the same Express routes.

**Base path: `/unifiedsmi`** — every route, static asset, and API call is prefixed with `/unifiedsmi`. Examples: `http://localhost:4046/unifiedsmi/`, `/unifiedsmi/api/leaves`, `/unifiedsmi/theme.css`, `/unifiedsmi/m/home`. When adding new routes or writing client-side `fetch` calls, always include this prefix.

- **Backend:** Express routes in `routes/` — each route reads/writes JSON files in `data/` directly via `fs.readFileSync`/`fs.writeFileSync`
- **Frontend:** Vanilla HTML/CSS/JS — no React/Vue/Angular, no bundler. Bootstrap 5.3 + Chart.js 4.4 loaded from CDN
- **Database:** JSON files in `data/` — no external DB
- **Auth:** `express-session` with file-based store in `.sessions/`, 8-hour TTL
- **Theme engine:** `GET /unifiedsmi/theme.css` is a **dynamic Express endpoint** (not a static file) that computes CSS variables from `data/settings.json` on every request
- **Single port:** `server.js` binds the Express app to PORT (4046) only. `teams-app/server.js` is a separate optional proxy for Teams tunnel deployments; it is **not** started by `npm start` and runs on its own `TEAMS_PORT` (default 3001).

**1-to-1 view/controller pairing:** Every `views/X.html` has exactly one `public/js/X.js` controller. HTML has structure only; JS handles all API calls, DOM updates, and events. The only exception is `views/ems/index.html`, which orchestrates multiple sub-controllers from `public/js/ems/`.

## Deployment to Teams

1. **Local tunnel:** Run `.\start-tunnel.ps1` to launch Cloudflare tunnel and obtain a public URL
2. **Update Teams manifest:** Run `node teams-app/update-url.js <tunnel-url>` — updates manifest and repackages zip
3. **Upload to Teams:** Generated zip is ready to upload to Microsoft Teams Admin Center
4. **Tasks-only variant:** Use `teams-app-tasks/update-url.js` for that separate manifest

## Design Patterns

### MVC-like Separation (without a framework)

| Layer | Location | Responsibility |
|---|---|---|
| **Model** | `data/*.json` + read/write helpers in each route | Each route file defines its own `readX()` / `writeX()` closures. No shared ORM. |
| **View** | `views/*.html` | Structure-only HTML. All dynamic content injected by client-side controller. |
| **Controller** | `public/js/*.js` (client) + `routes/*.js` (server) | Server routes handle data logic and role-based filtering; client controllers handle DOM and API calls. |

### Route File Template

```javascript
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const dataPath  = path.join(__dirname, '../data/feature.json');
const readData  = () => JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const writeData = d  => fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

module.exports = router;
```

### Frontend Controller Template

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('pageName');   // Sidebar, user info, heartbeat
  await loadData();                // Fetch from API, store in module-level array
  bindEvents();                    // Attach click/submit handlers
});
```

- **Module-level arrays** (`let allLeaves = []`) hold fetched data for re-rendering without re-fetching
- **Render functions** rebuild DOM from the module-level array
- **After mutations**, call the load function again to refresh all views
- **Bootstrap modals** via `bootstrap.Modal.getOrCreateInstance()`
- **`UI.toast()`** for all user feedback — no `alert()` calls
- **CSS variables only** — never hard-code hex colors; use `--color-primary`, `--color-secondary`, and their computed shades

### Shared Utility Layer (`public/js/api.js`)

All client-side code depends on this single module:
- **`API`** — fetch wrappers (`get`, `post`, `put`, `del`) with auto 401 redirect
- **`Layout`** — sidebar init, user info, notification badge, embed mode detection
- **`Heartbeat`** — 30s keep-alive ping with auto-reload on failure
- **`UI`** — toast notifications, date formatting, status/priority badge generators

### Request → Approval Workflow

Leave and WFH modules follow an identical workflow pattern:

1. **User submits** → POST route creates record with `status: 'pending'`
2. **Auto-task creation** → Same POST handler creates an approval task in `data/tasks.json` with `type: 'approval'` and `metadata: { leaveId }` (or `wfhId`), linked to the user's `managerId`
3. **Manager approves/rejects** → PUT route updates both the request status and the linked task status to `'completed'`

Tasks also support comments (`/:id/comment`), delegation (`/:id/delegate`), reassignment (`/:id/reassign`), and escalation (`/:id/escalate`) — tracked via `history[]`, `comments[]`, `delegatedFrom`, and `escalated` fields.

The **Appraisal**, **Travel**, **Material Requisitions**, **Purchase Orders**, and **EMS document versions** modules also follow this same approval workflow — submissions create tasks in `data/tasks.json` linked to the manager, and approval/rejection updates both the record and the linked task.

**Approval endpoint patterns differ by module** — do not assume uniformity:
- Leave / WFH / Travel: `PUT /api/{module}/:id` with `{ status: 'approved'|'rejected' }` in the body
- Purchase Orders: `PUT /api/purchase-orders/:id/approve` and `PUT /api/purchase-orders/:id/reject` (dedicated sub-routes, no body needed)
- Material Requisitions: `PUT /api/material-requisitions/:id/approve` and `PUT /api/material-requisitions/:id/reject` (same pattern as PO)
- EMS versions: `POST /api/ems/documents/:id/versions/:version/approve` and `/reject`
- Appraisal: two separate approval stages — `PUT /api/appraisal/:id/objectives/approve` (objectives phase) and `PUT /api/appraisal/:id/appraisal/approve` (final appraisal phase); `reject` variants exist for both. Tasks carry `metadata: { planId, approvalType: 'objectives'|'appraisal' }`

See `APPROVAL_WORKFLOWS.md` for a detailed per-module flow reference including which demo user maps to which approver.

**Task priority rules on submission:**
- Travel: `priority: 'high'` if total trip cost > SAR 10,000, otherwise `'medium'`
- MRQ: `priority: 'high'` if requisition `priority === 'urgent'`, otherwise `'medium'`

**EMS document version approval** (`POST /unifiedsmi/api/ems/documents/:id/versions` → approve/reject): uploading a new version sets it to `pending`, locks the document (no further uploads), and creates a manager task. On approval the `currentVersion` is bumped; on rejection the version entry and physical file are deleted. The "View Document" button is hidden for rejected EMS tasks.

- **Material Requisitions** (`routes/material-requisitions.js`) — `data/material-requisitions.json` + `data/materials.json` (catalog). MRQ IDs: `MR` + 8 hex chars from UUID; human-readable `mrqNumber` in `MR-YYYY-NNNN` format. Supports `lineItems[]`, `priority`, `projectCode`, `deliveryLocation`.
- **Purchase Orders** (`routes/purchase-orders.js`) — `data/purchase-orders.json` + `data/vendors.json` (10 vendors). PO IDs: `PO` + 8 hex chars; `poNumber` in `PO-YYYY-NNNN` format. Supports `lineItems[]`, `currency` (default AED), `paymentTerms`, `taxPct`, `costCenter`.

### Role-Based Data Filtering

Filtering is done inside each route handler (not middleware):
```javascript
if (user.role === 'employee') {
  records = records.filter(r => r.userId === user.id);
}
// admin, hr, manager → see all records
```

### AI Features

- **HR Chat** (`/unifiedsmi/api/hr-chat`) — Groq llama-3.3-70b-versatile; requires `GROQ_API_KEY`
- **Leave Assistant** (`/unifiedsmi/api/leave-assistant/chat`) — Conversational AI that checks leave balances AND submits leave, WFH, and travel requests on behalf of the user. The AI collects all required fields via chat, shows a summary, then emits a structured JSON block that `routes/leave-assistant.js` intercepts to call `submitLeave()`, `submitWfh()`, or `submitTravel()` — each of which also creates the approval task in `data/tasks.json`.
- **Document Chat** (`doc-chat.html`) — Upload PDF → POST `/unifiedsmi/api/doceval-proxy/ingest` (returns `session_id`) → POST `/unifiedsmi/api/doceval-proxy/query` with accumulated `chat_history`
- **Proposal Evaluation** and **Resume Evaluation** — AI-powered document analysis

The document AI features (doc-chat, proposal-eval, resume-eval) all proxy through `routes/doceval.js` at `/unifiedsmi/api/doceval-proxy` to avoid CORS with the upstream service at `doceval-8362469192e8.herokuapp.com`. No auth guard on this proxy route. Sample test files live in `AI Test Files/`.

`GET /unifiedsmi/api/ai-warmup` — fires an HTTP ping to the Heroku dyno on page load so the AI service is warm before the user needs it. No auth required.

### Dynamic Theming

1. Admin updates colors via `/unifiedsmi/customize` → saved to `data/settings.json`
2. Every page loads `<link href="/unifiedsmi/theme.css">` — dynamic Express endpoint, not a static file
3. `server.js` computes CSS variables (shades, tints, RGB values) on each request
4. `data/settings.json` structure: `colors.primary` (default `#198D87`), `colors.secondary` (default `#2C3E50`), `appName`, `logoPath`, optionally `teamsGraph: { tenantId, clientId, clientSecret }`

## Key Data Schemas

Minimal shapes for the most-referenced JSON files — enough to write route code without opening `data/`.

**`data/users.json`** — referenced by almost every route for role checks and `managerId` lookups:
```json
{ "id": "u001", "name": "Ahmed Al-Rashidi", "email": "ahmed@company.com", "password": "demo123",
  "role": "admin|manager|hr|employee", "department": "IT", "jobTitle": "CEO", "managerId": null }
```
`managerId` is `null` for the CEO (self-approver). `mariam@company.com` is a second manager — employees can report to either `khalid` or `mariam`, both report to Ahmed.

**`data/tasks.json`** — the central approval/task hub:
```json
{ "id": "T2B5D6E1", "title": "...", "description": "...", "sourceSystem": "HR",
  "type": "approval|task", "priority": "high|medium|low",
  "status": "pending|in_progress|completed|approved|rejected|escalated|new",
  "assignedTo": "u002", "createdBy": "u004", "dueDate": "2026-04-01T00:00:00Z",
  "metadata": { "leaveId": "L..." },
  "history": [], "comments": [], "delegatedFrom": null, "escalated": false }
```
`metadata` keys by module: `leaveId`, `wfhId`, `travelId`, `mrqId`, `poId`, `planId` (appraisal).

**`data/leaves.json`**:
```json
{ "id": "L4A7F8C9", "userId": "u004", "type": "annual|sick|emergency|unpaid",
  "startDate": "2026-04-01", "endDate": "2026-04-03", "days": 3,
  "reason": "...", "status": "pending|approved|rejected", "taskId": "T..." }
```

**`data/appraisals.json`** — two-phase approval (`objectives` then `appraisal`):
```json
{ "id": "AP...", "userId": "u004", "reviewedBy": "u002", "cycle": "Q1 2026",
  "period": { "start": "2026-01-01", "end": "2026-03-31" },
  "objectives": [ { "title": "...", "weight": 30, "score": null } ],
  "objectivesStatus": "pending|approved|rejected",
  "selfAssessment": "...", "managerAssessment": "...",
  "rating": null, "status": "pending|approved|rejected",
  "objectivesTaskId": "T...", "appraisalTaskId": "T..." }
```

**`data/material-requisitions.json`**:
```json
{ "id": "MR1A2B3C4D", "mrqNumber": "MR-2026-0001", "userId": "u004",
  "status": "pending|approved|rejected", "priority": "urgent|high|medium|low",
  "projectCode": "PRJ-001", "deliveryLocation": "Warehouse A",
  "lineItems": [ { "materialId": "MAT-001", "description": "...", "qtyRequested": 10, "uom": "PCS" } ],
  "taskId": "T..." }
```

**`data/purchase-orders.json`**:
```json
{ "id": "PO1A2B3C4D", "poNumber": "PO-2026-0001", "userId": "u004",
  "vendorId": "v001", "vendorName": "ACME Supplies", "currency": "AED",
  "paymentTerms": "Net 30", "taxPct": 5, "costCenter": "CC-IT",
  "lineItems": [ { "item": "Laptop", "qty": 2, "unitPrice": 4500, "lineTotal": 9000 } ],
  "status": "pending|approved|rejected", "taskId": "T..." }
```

**`data/settings.json`**:
```json
{ "colors": { "primary": "#198D87", "secondary": "#2C3E50" },
  "appName": "Unified Workspace", "logoPath": "/assets/logo.png",
  "teamsGraph": { "tenantId": "...", "clientId": "...", "clientSecret": "..." } }
```

## Cross-Cutting Concerns

**Dynamic cookie security:** Middleware in `server.js` detects HTTPS (tunnel) vs HTTP (localhost) and upgrades session cookies to `SameSite=None; Secure` for Teams iframe compatibility.

**Teams activity notifications:** `utils/teamsNotify.js` sends Teams activity feed notifications via Microsoft Graph API when leaves are submitted or decided. Requires `teamsGraph` in `data/settings.json`. If not configured, notifications are silently skipped. Exposes two functions: `notifyLeaveRequest()` and `notifyLeaveDecision()`. Caches the Graph API access token in memory. Uses a hardcoded `TEAMS_APP_ID` (`a7e3c1d9-4f82-4b6a-9e15-3d8f0c2b1a47`) for activity feed deep links.

**Teams proxy server:** `teams-app/server.js` is a stateless Express proxy (port 3001) — it proxies `/api/*` and `/theme.css` to `MAIN_APP_ORIGIN` (default `http://localhost:4046`) and serves Teams-specific static pages (`pages/tab.html`, `pages/config.html`, `pages/remove.html`) with their own CSP headers. Exposes `/health` for diagnostics.

**Teams iframe support:** `Content-Security-Policy` frame-ancestors header allows Teams/Outlook domains. `X-Frame-Options` is removed. `app.set('trust proxy', 1)` is required for ngrok HTTPS detection.

### Enterprise Document Management System (EMS)

The EMS module (`/ems`) is architecturally different from all other modules:

- **SPA inside the app:** `views/ems/index.html` has a tab bar and loads multiple sub-controllers from `public/js/ems/` — does not follow the 1-to-1 view/controller pattern
- **Sub-router:** All API calls go to `/unifiedsmi/api/ems/*`, handled by `routes/ems/index.js` which mounts eight sub-routers: `documents`, `folders`, `groups`, `signatures`, `users`, `audit`, `doctypes`, `metadata`
- **EMS sub-controllers** (`public/js/ems/`): `index.js` (orchestrator), `documents.js`, `folder-tree.js`, `doc-viewer.js`, `signature-pad.js`, `groups.js`, `users.js`, `audit.js`, `doctypes-mgr.js`, `metadata-mgr.js`, `knowledge-chat.js`
- **Knowledge Chat** (`public/js/ems/knowledge-chat.js`) — slide-in drawer for conversational Q&A over selected EMS documents; proxies through `/unifiedsmi/api/doceval-proxy` (same upstream as doc-chat)
- **File uploads:** Stored under `uploads/ems/`, served at `/unifiedsmi/uploads/ems/*` without an auth guard (static middleware runs first). Metadata in `data/ems-documents.json`
- **Dedicated CSS:** `public/css/ems.css` for EMS-specific layout (split-pane, resizable folder panel, signature pad). Do not add EMS styles to `global.css` or `pages.css`
- **No approval workflow integration:** EMS manages access via groups (`ems-groups.json`) and per-document permissions, not `data/tasks.json`

## Gotchas

- `/unifiedsmi/theme.css` is dynamic — color changes reflect immediately without restart
- JSON body limit is `50mb` (supports base64 logo upload)
- Sidebar collapse state persisted in `localStorage` key `sidebarCollapsed`
- Heartbeat (`/unifiedsmi/api/heartbeat` every 30s) is critical for Teams — without it the iframe disconnects
- **Login uses email, not username** — `POST /unifiedsmi/api/auth/login` body is `{ "email": "...", "password": "..." }`. Demo credentials:
  | Email | Role | Password |
  |---|---|---|
  | `ahmed@company.com` | admin (CEO) | demo123 |
  | `khalid@company.com` | manager | demo123 |
  | `fatima@company.com` | hr | demo123 |
  | `sara@company.com` | employee | demo123 |
  | `omar@company.com` | employee | demo123 |
  | `mariam@company.com` | manager | demo123 |
  Approval chain: employee → their manager; manager → CEO (Ahmed); CEO → self-approval.
- `?embed=1` query param triggers auto-login for Teams embedded mode — defaults to `ahmed@company.com` (admin/CEO)
- **Data reset:** Delete/truncate files in `data/` — no migration system
- **Session reset:** Delete `.sessions/` directory to log out all users
- Entity IDs: type prefix + first 8 chars of UUID (e.g. `L4A7F8C9` for leaves, `T2B5D6E1` for tasks, `HD9B1C3D` for helpdesk). Helpdesk tickets also get a `ticketNo` in `TKT-YYYY-NNN` format
- **Pages with no JS controller:** `erp-dialogue.html`, `voice-agent.html`, and `services.html`. Every other view has a matching controller — including `leave-assistant`, `wfh`, `travel`, `doc-chat`, `proposal-eval`, `resume-eval`, and `quick-services`
- **Pages with no backing route file:** `erp-dialogue`, `voice-agent`, `quick-services`, `services`, `proposal-eval`, `resume-eval`, `doc-chat` — these are served by a generic static-page loop in `server.js` (see the `pages` array at line ~198). They either have no server state or rely exclusively on proxied/external APIs (e.g. `/api/doceval-proxy`). The `pages` array is the authoritative list of valid static routes — add new static pages there.
- `views/landing.html` is the home dashboard (entry point after login); `views/services.html` and `views/quick-services.html` are service catalog views. The empty-string `''` entry in the static `pages` array maps `/unifiedsmi/` to `landing.html` — `/unifiedsmi/landing` is **not** a valid route.
- **Adding a new module:** (1) create `routes/newmodule.js` and add `app.use('/unifiedsmi/api/newmodule', require('./routes/newmodule'))` in `server.js`; (2) create `views/newmodule.html` + `public/js/newmodule.js`; (3) add `'newmodule'` to the `pages` array at line ~198 of `server.js`.
- **EMS is labeled "CMS" in the sidebar** — every view's nav renders `<span>CMS</span>` linking to `/unifiedsmi/ems`. Commit messages and UI text saying "CMS" always refer to the EMS module.
- **Notifications endpoint lives in `routes/news.js`** — `GET /api/news/notifications` and `PUT /api/news/notifications/:id/read` are served by the news route, not a separate notifications route. The notification data is in `data/notifications.json`.
- `routes/finance.js` and `routes/news.js` are **API-only** — they have no corresponding view pages. All other routes have matching `views/*.html` + `public/js/*.js` pairs, including `material-requisitions` and `purchase-orders`.
- `routes/analytics.js`, `routes/goals.js`, and `routes/directory.js` follow the standard route pattern (JSON-backed, role-filtered). `analytics.js` aggregates cross-module data (tasks, leaves, helpdesk, attendance) for dashboard widgets at `GET /unifiedsmi/api/analytics/summary`.
- `GET /unifiedsmi/api/me` — returns `{ success: true, user: req.session.user }` for the currently authenticated session; used by client controllers to get the logged-in user.
- `multer` and `pdf-lib` are available as dependencies (multer used for EMS uploads; pdf-lib available for PDF manipulation)
- `claude-cli` is in `package.json` as a runtime dependency (unused in server code — ignore it)
- `uuid` (`v4`) is the standard ID generator — used everywhere; import with `const { v4: uuidv4 } = require('uuid')`
- **Travel module** (`routes/travel.js`) has simulated airline/hotel provider data hardcoded in the route file itself (not in `data/`) — it generates realistic mock search results on the fly
- **`views/login.html` is self-contained** — it has its own inline `<style>` and `<script>` blocks (including the clock, prayer times display, and login form logic). It does **not** follow the 1-to-1 controller pattern and does not load `api.js` or `Layout`. Edit it as a standalone file.

## Mobile PWA (`/unifiedsmi/m/*`)

A purpose-built mobile Progressive Web App lives under `/unifiedsmi/m/` — six pages served by six route handlers in `server.js`:

| Route | View |
|---|---|
| `/unifiedsmi/m/login` | `views/mobile/login.html` |
| `/unifiedsmi/m/home` | `views/mobile/home.html` — greeting, 4 stat cards, recent tasks strip, donut chart, news feed |
| `/unifiedsmi/m/tasks` | `views/mobile/tasks.html` — task list + detail bottom sheet + all approval types |
| `/unifiedsmi/m/services` | `views/mobile/services.html` — 2 catalog cards |
| `/unifiedsmi/m/leave` | `views/mobile/leave.html` — Create Leave form |
| `/unifiedsmi/m/wfh` | `views/mobile/wfh.html` — Create WFH form |

**Zero backend changes** — all data from existing `/unifiedsmi/api/*` endpoints. New frontend only:
- `public/mobile/css/mobile.css` — No Bootstrap; uses `/unifiedsmi/theme.css` CSS variables; bottom tab bar (Home / Tasks / Services); safe-area insets; bottom sheets
- `public/mobile/js/api.js` — lightweight fetch wrappers, `UI.toast`, `fmtDate`, `Nav.setActive`; 401 redirects to `/unifiedsmi/m/login`
- `public/manifest.webmanifest` + `public/sw.js` — app-shell cache of 6 HTML pages + static assets; no API caching; `start_url: /unifiedsmi/m/home`

**Approval routing** in `tasks.js` uses an `APPROVAL_MAP` keyed on task `metadata` fields (`leaveId`, `wfhId`, `travelId`, `mrqId`, `poId`, `planId`) to call the correct approve/reject endpoint for each approval type. `planId` maps to appraisal plan/cycle approval tasks (`routes/appraisal.js`).

See `MOBILE_PWA_PLAN.md` for the full design spec.

## Known Demo Limitations

These are intentional gaps — do not "fix" them unless explicitly asked:

- **Policy AI is keyword-based, not AI** — `routes/policy.js` uses word-frequency scoring. The chat UI is cosmetic.
- **Attendance is read-only** — no punch-in/punch-out endpoints; all attendance data is seed data.
- **Notifications are static** — `data/notifications.json` is pre-seeded; workflows do not create new notification records at runtime.
- **No real external system integration** — `sourceSystem` on tasks is just a label string.
- **Single-level approval only** — leave/WFH approval goes to direct manager only; no multi-level chains.
- **Leave balances are hardcoded** — `routes/leave-assistant.js` uses fixed caps of 21 annual days and 30 sick days per year; not configurable from settings.
- **Helpdesk ticketNo year is hardcoded** — `routes/helpdesk.js` generates `TKT-2026-NNN` with a literal `'2026'` string instead of `new Date().getFullYear()`.
- **Passwords are plaintext** — `data/users.json` stores passwords as plain strings. Demo only.
- **No real-time updates** — no WebSocket; all modules require a manual page refresh to see changes made by other users.
