# Unified Workspace — Project Reference

## Overview

**Unified Workspace** is a centralized web portal that acts as a single integration layer and unified user interface across all enterprise systems (ERP, CRM, Warehouse, HR, Attendance, Accounting, etc.). Instead of users juggling multiple system logins and interfaces, they interact with one portal that aggregates data, tasks, and services from all underlying systems.

The app runs as a **single Node.js/Express server** and can be accessed from both a **browser** and **Microsoft Teams** simultaneously. There is only one codebase — the Teams app is a thin proxy server and manifest that tell Teams to load pages from this server inside an iframe.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Express Server (server.js)               │
│                               Port: 3030 (browser)              │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Auth     │  │ API      │  │ View      │  │ Theme Engine  │  │
│  │ Session  │  │ Routes   │  │ Routes    │  │ /theme.css    │  │
│  │ Cookies  │  │ /api/*   │  │ HTML pages│  │ dynamic CSS   │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────┘  │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │ data/*.json│  (file-based database)        │
│                    └───────────┘                                │
└───────────┬─────────────────────────────┬───────────────────────┘
            │                             │
     ┌──────┴──────┐              ┌───────┴────────┐
     │   Browser   │              │  Teams Proxy   │
     │ localhost   │              │  Server        │
     │  :3030      │              │  (port 3001)   │
     │             │              │ Proxies /api/* │
     │ Normal      │              │ to :3030       │
     │ HTTP cookie │              │ SameSite=None  │
     └─────────────┘              │ Secure cookie  │
                                  └────────────────┘
```

### Key Architecture Decisions

- **One codebase, two access points** — The Express server listens on port 3030. A separate lightweight proxy server (`teams-app/server.js`) runs on port 3001 and forwards all requests to port 3030, adding Teams-specific CSP headers.
- **No separate Teams code** — The `teams-app/` folder contains a manifest, icons, a URL-update script, and the stateless proxy server. All UI and logic lives in the main Express app.
- **Dynamic cookie security** — A middleware detects HTTPS (ngrok) vs HTTP (localhost) and upgrades cookie attributes accordingly, so login works in both contexts without code changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Frontend | HTML, CSS, Bootstrap 5.3, Vanilla JS |
| Icons | Bootstrap Icons 1.11 (CDN) |
| Charts | Chart.js 4.4 (CDN) |
| Database | JSON files (file-based, no external DB) |
| Auth | `express-session` (session-based, file store) |
| Styling | Dynamic CSS Variables via `/theme.css` endpoint |
| AI (chat/leave) | Groq llama-3.3-70b-versatile (raw fetch, no SDK) |
| AI (documents) | External DocEval service (proxied via `/api/doceval-proxy`) |
| Teams Integration | Teams manifest + ngrok tunnel + proxy server |

---

## Color & Theme System

Themes are **fully dynamic** — colors are stored in `data/settings.json` and served via a `/theme.css` Express endpoint. No server restart is needed when colors change.

### How It Works

1. `data/settings.json` stores the primary & secondary hex colors
2. `server.js` has color utility functions (`shade`, `mixWhite`, `hexToRgb`) that compute all shades automatically
3. `GET /theme.css` reads settings and returns computed CSS variables on every request (`Cache-Control: no-cache`)
4. Every HTML page includes `<link rel="stylesheet" href="/theme.css">` which overrides the defaults in `variables.css`

### Default CSS Variables

```css
:root {
  --color-primary:         #198D87;
  --color-primary-dark:    computed;
  --color-primary-darker:  computed;
  --color-primary-light:   computed;
  --color-primary-lighter: computed;
  --color-primary-faint:   computed;
  --color-primary-rgb:     computed;
  --color-secondary:       #2C3E50;
  --color-secondary-light: computed;
  --color-border:          computed;
  --color-surface:         computed;
  --sidebar-bg:            same as primary;
}
```

All components must use these variables — never hard-code hex values in component CSS.

---

## Application Structure

```
unified-workspace/
├── server.js                        # Express entry point + theme engine + Teams iframe support
├── package.json                     # Dependencies: express, express-session, uuid, multer, pdf-lib
├── routes/
│   ├── auth.js                      # Login/logout, session management
│   ├── tasks.js                     # Full CRUD + delegate, reassign, escalate, comment
│   ├── leaves.js                    # Submit leave, approve/reject (creates manager task)
│   ├── wfh.js                       # Work-from-home requests + approval workflow
│   ├── travel.js                    # Travel requests + booking (simulated airline/hotel data)
│   ├── leave-assistant.js           # AI leave/WFH/travel submission via conversational chat
│   ├── hr-chat.js                   # Groq-powered HR Q&A chatbot
│   ├── appraisal.js                 # Performance appraisal management
│   ├── goals.js                     # Goals & OKR CRUD
│   ├── analytics.js                 # Cross-module aggregation (tasks, leaves, helpdesk, attendance)
│   ├── attendance.js                # Attendance records (read-only)
│   ├── helpdesk.js                  # Support ticket CRUD
│   ├── policy.js                    # Keyword search across policies (not real AI)
│   ├── news.js                      # News/announcements (API-only, no view)
│   ├── finance.js                   # Finance data (API-only, no view)
│   ├── directory.js                 # Organization directory
│   ├── material-requisitions.js     # Material requisition requests + approval workflow
│   ├── purchase-orders.js           # Purchase order management + approval workflow
│   ├── doceval.js                   # Proxy to upstream DocEval service (doc-chat, proposal-eval, resume-eval)
│   ├── customize.js                 # Theme settings, logo upload, reset
│   └── ems/                         # Enterprise Document Management (sub-router)
│       └── index.js                 # Mounts: documents, folders, groups, signatures,
│                                    #   users, audit, doctypes, metadata sub-routers
├── data/                            # JSON file-based database
│   ├── users.json                   # 6 demo users (admin, manager, hr, employee×2, manager×2)
│   ├── tasks.json                   # Tasks from all source systems + approval tasks
│   ├── leaves.json                  # Leave records
│   ├── wfh.json                     # WFH records
│   ├── travel.json                  # Travel booking records
│   ├── appraisals.json              # Performance appraisal records
│   ├── goals.json                   # Goals & OKR records
│   ├── attendance.json              # Attendance punch records (seed data only)
│   ├── helpdesk.json                # Support tickets
│   ├── notifications.json           # User notifications (pre-seeded, static)
│   ├── news.json                    # Company news & announcements
│   ├── policies.json                # Company policies (searchable)
│   ├── material-requisitions.json   # Material requisition records
│   ├── materials.json               # Materials catalog (codes, stock levels, locations)
│   ├── purchase-orders.json         # Purchase order records
│   ├── vendors.json                 # Vendor catalog (10 vendors, contact, payment terms)
│   ├── settings.json                # Theme config (colors, appName, logoPath, teamsGraph)
│   └── ems-*.json                   # EMS: documents, folders, groups, signatures, doctypes, metadata
├── public/
│   ├── css/
│   │   ├── variables.css            # CSS variable defaults (overridden by /theme.css)
│   │   ├── global.css               # Full design system (sidebar, topbar, cards, tables)
│   │   ├── pages.css                # Page-specific styles
│   │   └── ems.css                  # EMS-only styles (split-pane, signature pad)
│   ├── js/
│   │   ├── api.js                   # Shared: API.get/post/put/del, Layout.init(), UI helpers
│   │   ├── landing.js               # Portal home
│   │   ├── tasks.js                 # Unified task list
│   │   ├── leaves.js                # Leave request self-service
│   │   ├── wfh.js                   # WFH request self-service
│   │   ├── travel.js                # Travel booking
│   │   ├── leave-assistant.js       # AI leave assistant chat UI
│   │   ├── analytics.js             # Charts & KPIs
│   │   ├── goals.js                 # Goals & OKR
│   │   ├── appraisal.js             # Performance appraisal
│   │   ├── attendance.js            # Attendance statistics
│   │   ├── policy.js                # Policy search chat UI
│   │   ├── helpdesk.js              # Help desk & tickets
│   │   ├── directory.js             # Organization directory
│   │   ├── doc-chat.js              # Document upload + AI chat
│   │   ├── proposal-eval.js         # AI proposal evaluation
│   │   ├── resume-eval.js           # AI resume evaluation
│   │   ├── material-requisitions.js # Material requisition management
│   │   ├── purchase-orders.js       # Purchase order management
│   │   ├── quick-services.js        # Quick service catalog
│   │   ├── customize.js             # Theme customization
│   │   └── ems/                     # EMS sub-controllers (index, documents, folder-tree,
│   │                                #   doc-viewer, signature-pad, groups, users, audit,
│   │                                #   doctypes-mgr, metadata-mgr, knowledge-chat)
│   └── assets/
│       ├── logo.png                 # Brand logo (used in sidebar + topbar)
│       └── login-bg.jpg             # Login page background photo
├── views/
│   ├── login.html                   # Login form
│   ├── landing.html                 # Portal home — metrics, charts, quick access
│   ├── tasks.html                   # Unified task list
│   ├── leaves.html                  # Leave request self-service
│   ├── wfh.html                     # WFH request self-service
│   ├── travel.html                  # Travel booking
│   ├── leave-assistant.html         # AI leave/WFH/travel assistant
│   ├── analytics.html               # Charts & KPIs
│   ├── goals.html                   # Goals & OKR
│   ├── appraisal.html               # Performance appraisal
│   ├── attendance.html              # Attendance statistics
│   ├── policy.html                  # Policy assistant (keyword-based)
│   ├── helpdesk.html                # Help desk & tickets
│   ├── directory.html               # Organization directory
│   ├── doc-chat.html                # PDF upload + AI chat
│   ├── proposal-eval.html           # AI proposal evaluation
│   ├── resume-eval.html             # AI resume evaluation
│   ├── material-requisitions.html   # Material requisition management
│   ├── purchase-orders.html         # Purchase order management
│   ├── services.html                # AI Use Cases catalog
│   ├── quick-services.html          # Quick service catalog
│   ├── customize.html               # Theme customization
│   ├── ems/index.html               # Enterprise Document Management (SPA)
│   ├── erp-dialogue.html            # WIP — no JS controller
│   └── voice-agent.html             # WIP — no JS controller
├── uploads/ems/                     # EMS uploaded files (served without auth guard)
├── utils/
│   └── teamsNotify.js               # Teams activity feed notifications via Microsoft Graph
└── teams-app/                       # Microsoft Teams integration
    ├── server.js                    # Stateless proxy server (port 3001) → main app :3030
    ├── public/pages/                # Teams-specific HTML (tab.html, config.html, remove.html)
    ├── manifest/
    │   ├── manifest.json            # Teams app manifest
    │   ├── color.png / outline.png  # Teams app icons
    │   └── Unified Workplace.zip    # Ready-to-upload Teams package
    └── update-url.js                # Updates ngrok URL in manifest + repackages zip
```

---

## Microsoft Teams Integration

### How It Works

The Teams app is **not a separate application** — `teams-app/server.js` is a stateless Express proxy that forwards all requests to the main app on port 3030, then serves the response with Teams-compatible CSP headers.

```
User clicks "Unified Workspace" in Teams
    → Teams reads manifest.json
    → manifest says: load https://<ngrok-url>/
    → ngrok forwards to localhost:3001
    → teams-app/server.js proxies request to localhost:3030
    → Main Express app responds with the same landing.html
    → User sees the exact same app inside Teams
```

### Technical Details

1. **Proxy server** — `teams-app/server.js` uses `http-proxy` to forward `/api/*` and all pages to `MAIN_APP_ORIGIN` (default `http://localhost:3030`). Exposes `/health` for diagnostics.
2. **Iframe headers** — Teams proxy sets `Content-Security-Policy: frame-ancestors` for `teams.microsoft.com`, `*.teams.microsoft.com`, `*.skype.com`, and `*.office.com`
3. **Proxy trust** — Main `server.js` sets `app.set('trust proxy', 1)` so Express correctly reads `X-Forwarded-Proto: https` from ngrok
4. **Dynamic cookie upgrade** — Middleware detects HTTPS requests (ngrok/Teams) and sets `SameSite=None; Secure` on the session cookie. HTTP requests (localhost) use normal cookies. Without this, the browser blocks cookies in the Teams iframe and login fails.
5. **Teams activity notifications** — `utils/teamsNotify.js` sends activity feed notifications via Microsoft Graph API when leaves are submitted or decided. Requires `teamsGraph: { tenantId, clientId, clientSecret }` in `data/settings.json`. Silently skipped if not configured.

### Setting Up Teams Integration

```bash
# 1. Start the tunnel (Cloudflare tunnel preferred)
.\start-tunnel.ps1

# Or use ngrok
ngrok http 3001

# 2. Copy the HTTPS URL and update the manifest
node teams-app/update-url.js https://xxxx.ngrok-free.app

# 3. Upload the zip to Teams
#    → Teams → Apps → Manage your apps → Upload an app
#    → Select: teams-app/manifest/Unified Workplace.zip
```

### When the Tunnel URL Changes

Every time you start a new tunnel session, the URL changes. Just re-run:

```bash
node teams-app/update-url.js https://NEW-URL.ngrok-free.app
```

Then re-upload the zip to Teams. No code changes needed.

---

## Pages & Features

### 1. Login Page
- Email + password authentication (uses email, not username)
- Role-based access: Employee, Manager, HR, Admin
- Session stored via `express-session` (8-hour TTL, file-based store in `.sessions/`)
- `?embed=1` query param triggers auto-login for Teams embedded mode
- **Full-screen background** — cityscape photo with two-layer blur/sharp system and film-grain texture overlay
- **Top info bar** — company logo, city, next prayer time, weather, live clock
- **Prayer times widget** — all 5 daily prayers with current/next highlighted

---

### 2. Landing Page (Portal Home)
Main hub after login. Glassmorphism cards, floating background orbs, gradient welcome banner.

| Section | Description |
|---|---|
| **Metric Cards** | Pending Tasks, Leave Balance, Days Present, Open Tickets — with trend indicators |
| **Analytics Row** | Task Overview (donut chart), Tasks by System (bar chart), Quick Access shortcuts |
| **Recent Tasks** | Latest non-completed tasks with status, system badge, priority, due date |
| **Announcements** | Company news feed |

---

### 3. Unified Task List
Aggregates tasks from all systems (HR, Accounting, CRM, Warehouse, IT) into one list, grouped by department/system.

| Action | Description |
|---|---|
| **Complete / Approve / Reject** | Context-aware action per task type |
| **Delegate** | Transfer task to another user temporarily |
| **Reassign** | Permanently move task to different user |
| **Escalate** | Escalate with reason, auto-notify manager |
| **Comment** | Internal notes on the task |
| **View History** | Full audit trail of all actions |

Task status flow: `New → In Progress → Pending Approval → Completed / Rejected / Escalated`

---

### 4. Leave Requests
- Submit leave (type, dates, reason)
- Auto-creates approval task assigned to manager
- Employee sees live status; manager approves/rejects from task list
- Leave balance tracked in JSON

---

### 5. Work From Home (WFH)
- Submit WFH request (dates, reason)
- Same approval workflow as leave requests
- Manager approval/rejection updates both WFH record and linked task

---

### 6. Travel Requests
- Submit travel booking (destination, dates, flight/hotel preferences)
- Simulated airline and hotel search results generated on the fly (data hardcoded in `routes/travel.js`)
- Approval workflow: creates manager task on submission

---

### 7. AI Leave Assistant
Conversational AI that handles leave, WFH, and travel requests through chat.
- Checks leave balances, collects required fields, shows a summary
- Emits a structured JSON block that the route intercepts to actually submit the request
- Also creates the approval task in `data/tasks.json`
- Powered by Groq llama-3.3-70b-versatile; requires `GROQ_API_KEY`

---

### 8. HR Chat
- Groq-powered conversational HR Q&A
- Requires `GROQ_API_KEY`
- Endpoint: `/api/hr-chat`

---

### 9. Document Chat
- Upload a PDF → AI chat over its contents
- Flow: `POST /api/general/ingest` (returns `session_id`) → `POST /api/general/query` with accumulated `chat_history`
- Proxied through `/api/doceval-proxy` to upstream service

---

### 10. Proposal Evaluation & Resume Evaluation
- AI-powered document analysis for proposals and CVs
- Same upstream proxy as Document Chat (`/api/doceval-proxy`)
- Sample test files in `AI Test Files/`

---

### 11. Material Requisitions
- Submit material requisition requests with line items (`qtyRequested`, `unit`, `projectCode`, `deliveryLocation`)
- Materials catalog from `data/materials.json` (codes, stock levels, warehouse locations)
- IDs: `MR` + 8 hex chars; sequential `mrqNumber` in `MR-YYYY-NNNN` format
- Approval workflow: creates manager task on submission

---

### 12. Purchase Orders
- Create purchase orders against vendors with line items (`qty`, `unitPrice`, `lineTotal`)
- Vendor catalog from `data/vendors.json` (10 vendors with contact, payment terms, category, country)
- IDs: `PO` + 8 hex chars; sequential `poNumber` in `PO-YYYY-NNNN` format
- Currency defaults to AED; supports `paymentTerms`, `taxPct`, `costCenter`
- Approval workflow: creates manager task on submission

---

### 13. Analytics
- Charts and KPIs aggregated across tasks, leaves, helpdesk, attendance
- Sections: tasks by system, tasks by status, tasks by priority, leave summary
- `GET /api/analytics/summary` aggregates cross-module data

---

### 14. Goals & OKR
- Set personal / team goals with progress tracking (%)
- Manager review and sign-off

---

### 15. Performance Appraisal
- Appraisal cycles (quarterly, annual)
- Self-assessment + manager assessment with rating scale
- Approval workflow: creates manager task on submission

---

### 16. Attendance Statistics
- Monthly attendance overview, late arrivals, absences, overtime
- **Read-only** — all data is seed data; no punch-in/punch-out

---

### 17. Internal Policy Assistant
- Chat-style interface with keyword search across `policies.json`
- **Not real AI** — uses word-frequency scoring (keywords weighted 3×). The chat UI is cosmetic.

---

### 18. Help Desk
- Submit support ticket (category, priority, description)
- Ticket IDs: `HD` + 8 hex chars; human-readable `ticketNo` in `TKT-YYYY-NNN` format
- Status tracking: Open, In Progress, Resolved, Closed
- Internal comments

---

### 19. Organization Directory
- Employee search by name, department, role
- Employee profile cards with department listing

---

### 20. Enterprise Document Management System (EMS)
Architecturally different from all other modules — a full SPA inside the app.

- **Tab-based SPA:** `views/ems/index.html` with multiple sub-controllers in `public/js/ems/`
- **Sub-routers:** `documents`, `folders`, `groups`, `signatures`, `users`, `audit`, `doctypes`, `metadata`
- **File uploads:** Stored under `uploads/ems/`, served without auth guard
- **Knowledge Chat:** Slide-in drawer for Q&A over selected EMS documents (same DocEval proxy)
- **Access control:** Via groups (`ems-groups.json`) and per-document permissions — not via `tasks.json`
- **Dedicated CSS:** `public/css/ems.css` — do not add EMS styles to `global.css` or `pages.css`

---

### 21. AI Use Cases Catalog (`services.html`)
Curated catalog of GenAI demos built on the WIND-IS platform. Each card links to its live demo URL.

| Demo | Description |
|---|---|
| Smart Document Chat | AI chat with uploaded documents |
| Health Assistant | Appointment companion and condition awareness |
| Intelligent ERP Dialogue | Chat with ERP data via AI-generated SQL |
| HR Policy Advisor | Employee policy Q&A |
| HR Self-Service Assistant | Submit requests through conversation |
| Banking Assistant | Customer support via uploaded documents |
| Insurance Assistant | Gathers location/images, submits reports |
| Global Quality Process | Identifies sensitive ingredients in packages |
| Sales Portal | Sales insights, promotion planning, risk assessment |
| Customer Portal | Customer enquiries and refund requests |
| Document Evaluator | Evaluates proposals against criteria |
| Speech to Text | Speech-to-text and summarization |
| Leave Request Voice Agent | Real-time voice agent for leave requests |
| Loan Calculator | EMI by DTI calculator with loan tips |

---

### 22. Customize Page
- Primary/secondary color pickers with shade palette preview
- Logo upload (base64, 50 MB JSON body limit)
- Live preview panel: mini sidebar, stat cards, buttons, badges
- Changes apply immediately — no restart needed

---

## Navigation Menu Structure

```
Sidebar:
├── Home (Landing Page)
├── My Tasks
├── Leave Requests
├── Work From Home
├── Travel
├── Leave Assistant (AI)
├── Material Requisitions
├── Purchase Orders
├── Analytics
├── Goals & OKR
├── Performance Appraisal
├── Attendance
├── Policy Assistant
├── Help Desk
├── Directory
├── Document Chat
├── Proposal Evaluation
├── Resume Evaluation
├── Document Management (EMS)
└── Service Catalog (AI Use Cases)

User Dropdown:
├── Customize
└── Sign Out
```

---

## Role-Based Access

| Role | Access |
|---|---|
| **Employee** | Landing, My Tasks, Self-Service (leave/WFH/travel/MRQ), Goals, Help Desk, Directory, AI features |
| **Manager** | All Employee access + team tasks, approve/reject, team analytics, appraisals, PO management |
| **HR** | All Manager access + all employee data, appraisal cycles, attendance admin |
| **Admin** | Full access + user management, system config, customize |

### Demo Credentials

> **Important:** Login uses **email address**, not username.

| Email | Role | Password |
|---|---|---|
| `ahmed@company.com` | admin | demo123 |
| `khalid@company.com` | manager | demo123 |
| `fatima@company.com` | hr | demo123 |
| `sara@company.com` | employee | demo123 |
| `omar@company.com` | employee | demo123 |
| `mariam@company.com` | manager | demo123 |

---

## Data Model (Key JSON Files)

### users.json
```json
{
  "id": "u001",
  "name": "Ahmed Al-Rashidi",
  "email": "ahmed@company.com",
  "password": "demo123",
  "role": "admin",
  "department": "IT",
  "managerId": null
}
```

### tasks.json
```json
{
  "id": "T2B5D6E1",
  "title": "Approve Leave Request - Sara",
  "sourceSystem": "HR",
  "type": "approval",
  "priority": "high",
  "status": "pending",
  "assignedTo": "u002",
  "createdBy": "u004",
  "createdAt": "2026-03-20T09:00:00Z",
  "dueDate": "2026-03-25T00:00:00Z",
  "metadata": { "leaveId": "L4A7F8C9" },
  "history": [],
  "comments": [],
  "escalated": false
}
```

### material-requisitions.json
```json
{
  "id": "MR1A2B3C4D",
  "mrqNumber": "MR-2026-0001",
  "status": "pending",
  "priority": "high",
  "projectCode": "PRJ-001",
  "deliveryLocation": "Warehouse A",
  "lineItems": [
    { "materialId": "MAT-001", "qtyRequested": 10, "uom": "PCS" }
  ],
  "taskId": "T..."
}
```

### purchase-orders.json
```json
{
  "id": "PO1A2B3C4D",
  "poNumber": "PO-2026-0001",
  "vendorId": "v001",
  "vendorName": "ACME Supplies",
  "currency": "AED",
  "paymentTerms": "Net 30",
  "taxPct": 5,
  "costCenter": "CC-IT",
  "lineItems": [
    { "item": "Laptop", "qty": 2, "unitPrice": 4500, "lineTotal": 9000 }
  ],
  "taskId": "T..."
}
```

### settings.json
```json
{
  "colors": {
    "primary": "#198D87",
    "secondary": "#2C3E50"
  },
  "appName": "Unified Workspace",
  "logoPath": "/assets/logo.png",
  "teamsGraph": {
    "tenantId": "...",
    "clientId": "...",
    "clientSecret": "..."
  }
}
```

---

## Setup & Running the Application

### Prerequisites

- **Node.js** v16 or higher — [download here](https://nodejs.org)
- **npm** (comes bundled with Node.js)
- **GROQ_API_KEY** — required for HR Chat and Leave Assistant AI features
- **ngrok or Cloudflare tunnel** — only if you need Teams integration

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd unified-workspace

# 2. Install all dependencies
npm install

# 3. Set required environment variable (for AI features)
export GROQ_API_KEY=your_key_here   # Linux/Mac
set GROQ_API_KEY=your_key_here      # Windows CMD

# 4. Start the application
npm start
```

The server starts on **http://localhost:3030** (browser). Teams proxy runs on **http://localhost:3001**.

### Login

Open **http://localhost:3030** in your browser. Login with email + password:

| Email | Password | Role |
|---|---|---|
| ahmed@company.com | demo123 | Admin |
| khalid@company.com | demo123 | Manager |
| fatima@company.com | demo123 | HR |
| sara@company.com | demo123 | Employee |

### Development Mode (Auto-Restart)

```bash
npm run dev
```

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | *(required)* | HR Chat + Leave Assistant AI |
| `PORT` | `3030` | Main app port |
| `TEAMS_PORT` | `3001` | Teams proxy server port |
| `MAIN_APP_ORIGIN` | `http://localhost:3030` | Teams proxy target |

### Quick Reference

| Command | What it does |
|---|---|
| `npm install` | Installs all dependencies |
| `npm start` | Starts server on ports 3030 + 3001 |
| `npm run dev` | Starts with nodemon (auto-restart) |
| `node teams-app/update-url.js <URL>` | Updates Teams manifest + repackages zip |

### Notes

- All data stored in JSON files under `data/` — no external database needed
- No build step — vanilla JS with CDN-hosted libraries
- JSON body limit is `50mb` (supports base64 logo upload)
- **Data reset:** Delete/truncate files in `data/`
- **Session reset:** Delete `.sessions/` directory to log out all users

---

## Key Design Principles

1. **Unified Experience** — One login, one interface, all systems.
2. **Task-Centric** — Everything actionable surfaces as a task in the unified task list.
3. **Role-Aware** — UI and data adapt to user role without separate portals.
4. **Lightweight** — No database engine; JSON files for simplicity and portability.
5. **Dynamic Theming** — Colors and logo changeable at runtime via Customize page.
6. **Mobile Responsive** — Bootstrap grid, collapsible sidebar.
7. **1-to-1 Convention** — Every `views/x.html` has exactly one `public/js/x.js` controller (except EMS SPA and two WIP pages).
8. **Single Codebase for Teams** — Teams proxy forwards to the same Express pages via iframe.

---

## Changelog

### v2.0.0 — Procurement, AI Expansion & EMS (2026)

**New Modules**
- **Material Requisitions** — line-item MRQ workflow with materials catalog, approval integration, `MR-YYYY-NNNN` numbering
- **Purchase Orders** — PO workflow with vendor catalog, line items, currency/tax/payment terms, `PO-YYYY-NNNN` numbering
- **Work From Home (WFH)** — WFH request submission and manager approval workflow
- **Travel** — Travel booking with simulated airline/hotel search results; approval workflow
- **AI Leave Assistant** — Conversational Groq-powered agent that collects fields via chat and submits leave/WFH/travel requests, including creating approval tasks
- **HR Chat** — Groq-powered HR Q&A chatbot
- **Document Chat** — PDF upload + AI chat via DocEval upstream proxy
- **Proposal Evaluation & Resume Evaluation** — AI-powered document analysis
- **Quick Services** — Service catalog with quick-action tiles
- **Enterprise Document Management (EMS)** — Full SPA with folder tree, document viewer, e-signatures, group-based permissions, audit log, knowledge chat

**Architecture Changes**
- `teams-app/server.js` is now a stateless proxy server (not just a manifest folder)
- Added `TEAMS_PORT` and `MAIN_APP_ORIGIN` environment variables
- JSON body limit raised from 10 MB to 50 MB
- `multer` added for EMS file uploads; `pdf-lib` available for PDF manipulation
- `utils/teamsNotify.js` — Teams activity feed notifications via Microsoft Graph (leave workflows)

---

### v1.3.0 — Teams Integration & Futuristic Home UI (Mar–Apr 2026)

**Microsoft Teams Integration**
- Teams app loads pages directly from Express via iframe — no separate Teams codebase
- Added `Content-Security-Policy: frame-ancestors` headers for Teams domains
- Dynamic cookie upgrade middleware (`SameSite=None; Secure` for HTTPS/Teams)
- Server listens on port 3001 for ngrok tunnel
- `teams-app/update-url.js` updates manifest URLs and repackages zip in one command

**Landing Page — Futuristic Redesign**
- Glassmorphism metric cards with colored gradients and trend indicators
- Color-tinted chart cards (teal, blue, violet, emerald, amber)
- Floating animated color orbs in background
- Welcome banner with gradient, greeting, and date badge

**Customize Page**
- Full theme customization: primary/secondary color pickers, shade palette preview
- Logo upload via base64, live preview panel
- Changes apply on save without server restart

---

### v1.2.0 — AI Use Cases & Polish (Mar 2026)

**AI Use Cases Page**
- 14 live GenAI demo cards with direct links to live services
- Accessible from sidebar under "Service Catalog"

**Bug Fixes**
- Fixed "In Progress" badge rendering as a thin bar (CSS collision with Bootstrap `.progress` — renamed to `.in-prog`)
- Login stats bar: replaced "Uptime 99.9%" with "Departments"

---

### v1.1.0 — UI Overhaul (Mar 2026)

**Login Page Redesign**
- Full-screen cityscape background with two-layer blur/sharp system and film-grain overlay
- Top info bar: logo, location, next prayer time, weather, live clock
- Prayer times card with current/next prayer highlighted

**Tasks Page Improvements**
- Tasks grouped by source system with section headings and task count badges
- Horizontal dividers between rows; action buttons in overflow `...` menu
- Removed redundant "Assigned To" column

---

## Known Gaps & Demo Limitations

These are intentional gaps — do not fix unless explicitly asked:

| Gap | Area | Detail |
|---|---|---|
| **Policy AI is keyword-based** | `routes/policy.js` | Word-frequency scoring; no LLM. The chat UI is cosmetic. |
| **Attendance is read-only** | `routes/attendance.js` | No punch-in/punch-out; all data is seed data. |
| **Notifications are static** | `data/notifications.json` | Pre-seeded only; workflows do not create new notification records at runtime. |
| **No real external system integration** | Task aggregation | `sourceSystem` is a label string; no live ERP/CRM connectors. |
| **Single-level approval only** | Leave/WFH/travel | Goes to direct manager only; no multi-level chains. |
| **Leave balances are hardcoded** | `routes/leave-assistant.js` | 21 annual days + 30 sick days; not configurable from settings. |
| **Helpdesk year is hardcoded** | `routes/helpdesk.js` | Generates `TKT-2026-NNN` with literal `'2026'` string. |
| **Passwords are plaintext** | `data/users.json` | Demo only — never deploy to production. |
| **No real-time updates** | All modules | No WebSocket; changes require manual page refresh. |

---

*This README is the living reference document for the Unified Workspace project.*
