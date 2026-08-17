# Plan: Mobile PWA (6 pages — Login, Home, Tasks, Services, Leave, WFH)

## Context

The current app is a desktop-first Express server serving HTML pages with sidebars that don't work well on phones. We want a **Progressive Web App** that can be installed on iOS and Android for demos, with a **purpose-built mobile UI/UX** — six pages total:

1. **Login**
2. **Home** — personalized dashboard: greeting, 4 stat cards, recent tasks strip, news feed, mini task-status chart
3. **My Tasks** — full task list with approve/reject for all approval types
4. **Service Catalog** — two creation cards (Leave, WFH)
5. **Create Leave Request** — full-page mobile form
6. **Create WFH Request** — full-page mobile form

The PWA reuses the existing backend entirely. No backend changes. New frontend under `/m/*` + `manifest.webmanifest` + `sw.js`.

---

## Scope

**In scope**
- Home page: greeting, 4 KPI stat cards, recent tasks strip (up to 3), news feed cards, donut chart (tasks by status)
- Tasks page: approve/reject for **all** approval task types (Leave, WFH, Travel, MRQ, PO, Appraisal objectives + appraisal-cycle)
- Tasks page: "Mark complete" for plain `type: 'task'` tasks
- Service Catalog: create Leave and WFH only
- PWA installability on iOS and Android
- Zero backend changes — all data from existing `/api/*` endpoints

**Out of scope**
- Push notifications, offline mutations, background sync
- "Tasks by source system" bar chart (chart #2 on desktop — too wide for mobile)
- Creating Travel / MRQ / PO from mobile
- Task delegation, reassignment, escalation from mobile
- Native wrappers (Capacitor / Cordova)

---

## File layout

Only `server.js` is modified (6 new route lines). Everything else is new:

```
views/mobile/
  login.html          # email + password, full-screen
  home.html           # dashboard — greeting, stats, recent tasks, news, chart
  tasks.html          # full task list + detail bottom sheet
  services.html       # 2 catalog cards → /m/leave, /m/wfh
  leave.html          # full-page Create Leave form
  wfh.html            # full-page Create WFH form
public/mobile/
  css/mobile.css      # mobile-first, safe-area, bottom tab bar, bottom sheet
  js/api.js           # fetch wrappers, UI.toast, fmtDate helpers — no Bootstrap
  js/login.js
  js/home.js          # loads summary, recent tasks, news, chart
  js/tasks.js         # full list + approval routing map
  js/services.js
  js/leave.js
  js/wfh.js
public/manifest.webmanifest
public/sw.js
```

> Icons: reuse `public/assets/logo.png` for all manifest entries and `apple-touch-icon`.

---

## Server wiring — `server.js`

Add six routes near the existing `pages` array (~line 140), before the catch-all:

```js
app.get('/m',          (_, res) => res.redirect('/m/login'));
app.get('/m/login',    (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/login.html')));
app.get('/m/home',     (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/home.html')));
app.get('/m/tasks',    (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/tasks.html')));
app.get('/m/services', (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/services.html')));
app.get('/m/leave',    (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/leave.html')));
app.get('/m/wfh',      (_, res) => res.sendFile(path.join(__dirname, 'views/mobile/wfh.html')));
```

Login success redirects to `/m/home` (not `/m/tasks`).

---

## Page-by-page design

### 1. `/m/login`

- Full-bleed layout, logo, email + password fields, "Sign in" button
- `POST /api/auth/login` → on success `location.replace('/m/home')`
- On load: `GET /api/me` → if authenticated go to `/m/home`
- Demo credentials shown at bottom

---

### 2. `/m/home` — `views/mobile/home.html` + `public/mobile/js/home.js`

Data sources (matching the desktop `landing.js`):
- `GET /api/analytics/summary` (`routes/analytics.js:14`) — drives stat cards
- `GET /api/tasks` (`routes/tasks.js:20`) — drives recent tasks strip
- `GET /api/news` — drives news feed
- `GET /api/analytics/tasks-by-status` (`routes/analytics.js`) — drives the donut chart

**Layout (top to bottom, single column):**

```
┌─────────────────────────────────┐
│  [avatar] Good morning, Sara 👋 │  ← greeting pulled from session name + time-of-day
│  [app name]                     │
├─────────────────────────────────┤
│  ┌──────┐  ┌──────┐             │
│  │  3   │  │  21  │             │  ← 2×2 stat card grid
│  │Tasks │  │Leave │             │     pendingTasks · leaveBalance.annual
│  └──────┘  └──────┘             │     presentDays  · openTickets
│  ┌──────┐  ┌──────┐             │
│  │  18  │  │  2   │             │
│  │Days  │  │Ticket│             │
│  └──────┘  └──────┘             │
├─────────────────────────────────┤
│  Recent Tasks          [→ All]  │  ← horizontal strip of up to 3 task cards
│  ┌────────────────────────────┐ │     each card: title, status chip, due date
│  │ Task title    [Pending] ↗  │ │     tap → go to /m/tasks?id=<taskId>
│  └────────────────────────────┘ │
├─────────────────────────────────┤
│  Task Status              [chart]│  ← small donut (Chart.js, 160px)
│  ● Pending 5  ● Done 12        │     rendered using --color-primary var
│  ● Escalated 1                 │
├─────────────────────────────────┤
│  Latest News                   │  ← 3 news cards stacked
│  ┌────────────────────────────┐ │     title, category chip, date, summary (2 lines)
│  │ [category] Title      date │ │
│  │ Summary snippet...         │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         [Home] [Tasks] [Services]   ← bottom tab bar (3 tabs now)
```

**Implementation notes for `home.js`:**
- All four API calls fire in parallel (`Promise.all`) to minimise load time
- Stat cards render immediately once `analytics/summary` resolves; no skeleton needed (cards show `—` placeholder)
- Recent tasks strip: filter `status !== 'completed'`, take first 3, link each to `/m/tasks?id=<id>`
- Chart: load Chart.js from CDN (same version as desktop: 4.4); read `--color-primary` via `getComputedStyle` for theming; draw a donut; no legend (use inline `key: count` text below instead, more readable on small screen)
- News: show 3 items; no pagination on mobile
- Pull-to-refresh: a simple `touchstart/touchmove/touchend` handler that re-fires `loadAll()` when the user pulls down ≥ 60px (cosmetic spinner at top)

---

### 3. `/m/tasks`

**List**
- Filter chips: All / Pending / Completed + "Needs Approval" badge chip
- List items: title, status chip, priority dot, due date, source badge
- Deep-link: `?id=<taskId>` auto-opens detail sheet

**Detail bottom sheet**
- Title, description, status, priority, due date, history timeline
- Comment input → `POST /api/tasks/:id/comment`

**Approval routing map in `tasks.js`** (all approval types):

| metadata key | Approve | Reject |
|---|---|---|
| `leaveId` | `PUT /api/leaves/:id` `{status:'approved',note}` | same `{status:'rejected',note}` |
| `wfhId` | `PUT /api/wfh/:id` `{status:'approved',note}` | same |
| `travelId` | `PUT /api/travel/:id` `{status:'approved',note}` | same `{status:'rejected',note}` |
| `mrqId` | `PUT /api/material-requisitions/:id/approve` `{note}` | `.../reject {note}` |
| `poId` | `PUT /api/purchase-orders/:id/approve` `{note}` | `.../reject {note}` |
| `planId` + `approvalType:'objectives'` | `PUT /api/appraisal/:id/objectives/approve` | `.../objectives/return` |
| `planId` + `approvalType:'appraisal'` | `PUT /api/appraisal/:id/appraisal/approve` | `.../appraisal/reject` |

After approve/reject: close sheet, toast, refresh task list.

**Plain tasks** (`type:'task'`): **Mark complete** → `PUT /api/tasks/:id {status:'completed'}`.

**Bottom tab bar**: Home | Tasks (active) | Services

---

### 4. `/m/services`

- Header: "Service Catalog"
- Two large cards → `/m/leave`, `/m/wfh`
- Bottom tab bar: Home | Tasks | Services (active)

---

### 5. `/m/leave`

- Back arrow → `/m/services`, title "Request Leave"
- Fields: `type` (select), `startDate`, `endDate`, `days` (auto-computed), `reason`
- `POST /api/leaves` → toast + `location.replace('/m/home')`

---

### 6. `/m/wfh`

- Back arrow → `/m/services`, title "Work From Home"
- Fields: `startDate`, `endDate`, `days` (auto-computed), `reason`
- `POST /api/wfh` → toast + `location.replace('/m/home')`

---

### Shared: `public/mobile/js/api.js`

- `API.get/post/put` with `credentials: 'include'`, 401 → `/m/login`
- `UI.toast` as CSS-animated div
- `fmtDate`, `diffDaysInclusive`, `statusBadge`, `priorityDot`, `Nav.setActive(tab)`

---

## PWA plumbing

### `public/manifest.webmanifest`

```json
{
  "name": "Unified Workspace",
  "short_name": "Workspace",
  "start_url": "/m/home",
  "scope": "/m/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#198D87",
  "icons": [
    { "src": "/assets/logo.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/logo.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/assets/logo.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`start_url` is now `/m/home` (logged-in users launch straight into the dashboard).

### `public/sw.js`

App-shell cache of the 6 HTML pages + CSS + JS + logo. No API caching. Network-first for navigation, cache-first for static assets.

### Per-page `<head>`

```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#198D87">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/assets/logo.png">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/mobile/css/mobile.css">
```

---

## Styling

- No Bootstrap. CSS variables from `/theme.css` apply Wind identity automatically.
- `env(safe-area-inset-bottom)` for iPhone home indicator
- **Bottom tab bar: 3 tabs** — Home / Tasks / Services. Hidden on `/m/leave`, `/m/wfh` (replaced by back arrow).
- 2×2 stat card grid: `display: grid; grid-template-columns: 1fr 1fr; gap: 12px`
- Stat cards: large number (28px bold), label below (12px muted), `var(--color-primary)` accent line at top
- Recent task strip: vertically stacked cards (not horizontal scroll — easier to tap)
- Bottom sheet: slide-up, drag handle, scrollable body, action buttons pinned at bottom
- Touch targets ≥ 44px, ≥ 16px font, single-column

---

## Critical files

| Purpose | Path |
|---|---|
| 6 new route handlers | `server.js` (~line 140) |
| Auth | `routes/auth.js:10–26, 29–31` |
| Analytics summary | `routes/analytics.js:14` → `/api/analytics/summary` |
| Tasks by status chart data | `routes/analytics.js` → `/api/analytics/tasks-by-status` |
| Tasks list / update / comment | `routes/tasks.js:20–41, 94–118, 121–139` |
| News feed | `routes/news.js` → `GET /api/news` |
| Leaves GET / POST / PUT | `routes/leaves.js:34–53, 56–129, 132–180` |
| WFH GET / POST / PUT | `routes/wfh.js:33–52, 55–112, 115–147` |
| Travel PUT | `routes/travel.js:374` |
| MRQ approve/reject | `routes/material-requisitions.js:142, 170` |
| PO approve/reject | `routes/purchase-orders.js:138, 166` |
| Appraisal approve/reject | `routes/appraisal.js:122, 135, 271, 287` |
| Theme | `server.js:113–123` → `data/settings.json` |
| Logo | `public/assets/logo.png` |

---

## Verification

1. `npm run dev` → Chrome mobile emulation (iPhone 14 Pro)
2. `/m/login` → log in as Sara → lands on `/m/home`
3. Stat cards show correct values (cross-check against desktop `/`)
4. Recent tasks strip shows Sara's pending tasks; tap one → `/m/tasks?id=<id>` opens sheet
5. Chart donut renders and is themed with primary color
6. News cards load
7. Pull-to-refresh triggers reload
8. Tap **Tasks** tab → full list; filter chips work
9. Sara submits a Leave → toast → lands on `/m/home`; home stat cards update on refresh
10. Log in as Khalid → Home shows his pending tasks count; Tasks shows Leave approval task → Approve → refreshes
11. Repeat for Travel, MRQ, PO approval (create on desktop first)
12. `.\start-tunnel.ps1` → iOS Safari → Add to Home Screen → standalone launch opens `/m/home`
13. Android Chrome → Install → repeat
14. Lighthouse PWA: installable
15. `npm test` — no desktop regressions

---

## Decisions locked in

- **6 pages** — Home is the post-login landing; Login redirects there on success
- **3-tab bottom nav** — Home / Tasks / Services
- **Home data**: greeting + 4 stat cards + recent tasks (3) + donut chart + news (3) — all from existing analytics and tasks endpoints
- **Tasks by source system** chart omitted from mobile (too wide; the donut is sufficient for demo)
- **All approval types** handled on `/m/tasks` via `APPROVAL_MAP` routing table
- **Service Catalog**: Leave + WFH creation only
- App name "Unified Workspace"; icons reuse existing logo; SW app-shell only
