# Unified Workspace — Microsoft Teams Tab App

## Overview

This is the **Microsoft Teams extension** for the Unified Workspace portal. It runs as a Teams Tab App (both Personal and Configurable/Channel tabs) that provides quick access to the portal's key features directly within Microsoft Teams.

**This is the foundation shell only.** Feature pages (Tasks, Analytics, etc.) contain placeholder content and will be implemented in future phases.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                  Microsoft Teams Client                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Teams Tab (iframe)                    │  │
│  │  ┌──────────────────────────────────────────────┐│  │
│  │  │  tab.html (App Shell)                        ││  │
│  │  │  - Login Panel                               ││  │
│  │  │  - Sidebar Navigation                        ││  │
│  │  │  - View Panels (Home, Tasks, Analytics...)   ││  │
│  │  └──────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│                     HTTPS (tunnel)                      │
└────────────────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Teams Tab   │  Port 3001
                    │ Server      │  (Express)
                    │             │
                    │ - Static    │
                    │   files     │
                    │ - CSP       │
                    │   headers   │
                    │ - API proxy │───────────┐
                    └─────────────┘           │
                                              │ HTTP proxy
                                              │ /api/*
                                              ▼
                                    ┌─────────────────┐
                                    │ Main Unified     │  Port 3000
                                    │ Workspace Server │  (Express)
                                    │                  │
                                    │ - Auth (session)  │
                                    │ - Tasks API       │
                                    │ - Leaves API      │
                                    │ - Analytics API   │
                                    │ - All other APIs  │
                                    │ - JSON data store │
                                    └─────────────────┘
```

**Key design decisions:**
- The Teams server is a **thin proxy** — it serves static pages and forwards all `/api/*` requests to the main backend
- **No duplicated business logic** — both the web portal and Teams app share the same backend
- **Session-based auth** via the proxied Express session — no Azure AD/SSO required for now
- **SPA-like navigation** — all views are in a single `tab.html` page, switched client-side

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| UI Framework | Bootstrap 5.3 (CDN) |
| Charts | Chart.js 4.4 (CDN, loaded for future use) |
| Icons | Bootstrap Icons 1.11 (CDN) |
| Teams SDK | @microsoft/teams-js 2.x (CDN) |
| Server | Node.js + Express (static + proxy) |
| Manifest | Teams App Manifest v1.17 |

---

## Project Structure

```
teams-app/
├── server.js                    # Express server: static files + CSP + API proxy
├── package.json
├── manifest/
│   ├── manifest.json            # Teams app manifest (v1.17)
│   ├── color.png                # App icon 192x192 (PLACEHOLDER — replace before publishing)
│   └── outline.png              # App icon 32x32 (PLACEHOLDER — replace before publishing)
├── public/
│   ├── css/
│   │   ├── variables.css        # CSS design tokens (mirrors main app)
│   │   └── global.css           # Layout styles adapted for Teams iframe
│   ├── js/
│   │   ├── teams-init.js        # TeamsJS SDK init, context, theme handling
│   │   ├── api.js               # API helpers, Layout, UI utilities
│   │   └── app-shell.js         # Login, navigation, view routing controller
│   ├── pages/
│   │   ├── tab.html             # Main app (personal + channel tab content)
│   │   ├── config.html          # Channel tab configuration page
│   │   └── remove.html          # Tab removal confirmation page
│   └── assets/
│       └── logo.png             # WIND-IS logo
```

---

## Running Locally

### Prerequisites

- Node.js v16+
- The main Unified Workspace server running on port 3000

### Start Both Servers

```bash
# Terminal 1: Start main backend
cd "Unified Workplace Demo"
npm start
# → http://localhost:3000

# Terminal 2: Start Teams tab server
cd "Unified Workplace Demo/teams-app"
npm install
npm start
# → http://localhost:3001
```

### Test in Browser (Standalone Mode)

Open http://localhost:3001/pages/tab.html in your browser. The app works standalone (outside Teams) for development — the TeamsJS SDK initialization will gracefully skip.

### Test in Microsoft Teams

To load the tab inside Teams, you need a **public HTTPS URL** pointing to localhost:3001:

1. **Install a tunneling tool** (one of):
   - Microsoft Dev Tunnels (built into VS Code / Agents Toolkit)
   - ngrok: `ngrok http 3001`

2. **Update the manifest** — replace all `{{TEAMS_APP_HOSTNAME}}` in `manifest/manifest.json` with your tunnel hostname (e.g., `abc123.ngrok.io`)

3. **Generate a unique App ID** — replace `{{TEAMS_APP_ID}}` with a UUID (generate one at https://www.uuidgenerator.net/)

4. **Create the app package** — zip the 3 manifest files:
   ```bash
   cd manifest
   zip ../unified-workspace-teams.zip manifest.json color.png outline.png
   ```

5. **Sideload in Teams**:
   - Open Teams → Apps → Manage your apps → Upload a custom app
   - Select the .zip file
   - Add as Personal App or to a Channel

---

## Manifest Placeholders

Before deploying, replace these placeholders in `manifest/manifest.json`:

| Placeholder | Replace With |
|---|---|
| `{{TEAMS_APP_ID}}` | A unique UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) |
| `{{TEAMS_APP_HOSTNAME}}` | Your HTTPS hostname (e.g., `abc123.ngrok.io` or `your-app.devtunnels.ms`) |

---

## Adding Feature Pages (Future Phases)

Each view panel in `tab.html` has a corresponding `<div id="view-{name}">` with placeholder content. To implement a feature:

1. Create a new controller file: `public/js/{feature}.js`
2. Add a `<script>` tag for it in `tab.html`
3. Create a controller object (e.g., `TasksController`) with an `init()` method
4. Wire it into the switch statement in `AppShell.navigateTo()`
5. Replace the placeholder HTML in the view panel with actual markup

The controllers should use `API.get()` / `API.post()` — all requests are automatically proxied to the main backend.
