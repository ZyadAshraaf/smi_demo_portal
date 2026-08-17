/* ============================================================
   UNIFIED WORKSPACE — Teams Tab App Server

   Lightweight Express server that:
   1. Serves static Teams tab pages (HTML/CSS/JS)
   2. Sets required Content-Security-Policy headers for Teams iframe embedding
   3. Proxies API calls to the main Unified Workspace backend (port 3030)

   This server does NOT contain business logic — it is a shell that
   hosts the Teams tab UI and forwards API requests to the main app.
   ============================================================ */

const express = require('express');
const path    = require('path');
const http    = require('http');

const app  = express();
const PORT = process.env.TEAMS_PORT || 3001;

/* ── Configuration ─────────────────────────────────────────────
   MAIN_APP_ORIGIN: The origin of the existing Unified Workspace
   Express server. All /api/* requests are proxied here.
   ───────────────────────────────────────────────────────────── */
const MAIN_APP_ORIGIN = process.env.MAIN_APP_ORIGIN || 'http://localhost:3030';

/* ── Content-Security-Policy for Teams ─────────────────────────
   Teams loads tab apps inside an iframe. The server MUST allow
   Teams domains in frame-ancestors or the page will be blocked.

   Required domains (as of 2026):
   - teams.microsoft.com          — Teams web client
   - *.teams.microsoft.com        — Teams subdomains
   - *.cloud.microsoft             — New Microsoft cloud domain (requires TeamsJS 2.19+)
   - *.microsoft365.com            — M365 portal
   - *.office.com                  — Office portal
   - outlook.office.com            — Outlook integration
   - outlook.office365.com         — Outlook O365
   - *.teams.cloud.microsoft       — New Teams cloud domain
   - *.devtunnels.ms               — Dev tunnels (development only — remove in production)
   ───────────────────────────────────────────────────────────── */
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' " +
    'teams.microsoft.com *.teams.microsoft.com ' +
    '*.cloud.microsoft *.microsoft365.com ' +
    '*.office.com outlook.office.com outlook.office365.com ' +
    '*.teams.cloud.microsoft ' +
    '*.devtunnels.ms'  // TODO: Remove in production
  );
  next();
});

/* ── Static Files ──────────────────────────────────────────────
   Serve the Teams tab UI from /public
   ───────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── API Proxy ─────────────────────────────────────────────────
   Forward all /api/* requests to the main Unified Workspace
   backend. This keeps the Teams tab server stateless and allows
   both the web portal and Teams app to share the same backend.

   We use Node's built-in http module (no extra dependency) to
   pipe requests/responses transparently.
   ───────────────────────────────────────────────────────────── */
app.use('/api', (req, res) => {
  const url = new URL(`${MAIN_APP_ORIGIN}/api${req.url}`);

  const options = {
    hostname: url.hostname,
    port:     url.port,
    path:     url.pathname + url.search,
    method:   req.method,
    headers:  {
      ...req.headers,
      host: url.host  // Override host header for the backend
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    res.status(502).json({
      success: false,
      message: 'Backend unavailable. Ensure the main Unified Workspace server is running on ' + MAIN_APP_ORIGIN
    });
  });

  req.pipe(proxyReq, { end: true });
});

/* ── Theme CSS Proxy ───────────────────────────────────────────
   The main app serves /theme.css dynamically. Proxy it so the
   Teams tab pages can use the same dynamic theming.
   ───────────────────────────────────────────────────────────── */
app.get('/theme.css', (req, res) => {
  const url = new URL(`${MAIN_APP_ORIGIN}/theme.css`);

  http.get(url.href, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  }).on('error', () => {
    res.setHeader('Content-Type', 'text/css');
    res.send('/* theme unavailable — using defaults from variables.css */');
  });
});

/* ── Health Check ──────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'unified-workspace-teams', port: PORT });
});

/* ── 404 ───────────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

/* ── Start ─────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n  Teams Tab Server running at http://localhost:${PORT}`);
  console.log(`  Proxying API requests to ${MAIN_APP_ORIGIN}`);
  console.log(`\n  Ensure the main Unified Workspace server is also running.\n`);
});
