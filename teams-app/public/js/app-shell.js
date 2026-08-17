/* ============================================================
   UNIFIED WORKSPACE TEAMS — App Shell Controller

   The central controller for the Teams tab. Handles:
   1. Login panel (username/password authentication)
   2. View routing (switching between Home, Tasks, Analytics, etc.)
   3. Navigation sidebar event binding
   4. Coordinating Teams SDK context with view loading

   This is the ONLY entry point — called from tab.html on DOMContentLoaded.
   ============================================================ */

const AppShell = {

  /* ── State ───────────────────────────────────────────────── */
  currentView: null,
  isAuthenticated: false,

  /* ── Boot ──────────────────────────────────────────────────
     Called once on page load. Orchestrates the full startup:
     1. Initialize Teams SDK (or detect standalone mode)
     2. Check if user is already authenticated (session cookie)
     3. Show login or load the requested view
     ──────────────────────────────────────────────────────── */
  async boot() {
    console.log('[AppShell] Booting...');

    // Step 1: Initialize Teams SDK
    const inTeams = await TeamsApp.init();
    console.log('[AppShell] Teams context:', inTeams);

    // Step 2: Check existing authentication
    const user = await API.getMe();

    if (user) {
      // Already authenticated — go straight to the app
      this.isAuthenticated = true;
      await this._enterApp();
    } else {
      // Not authenticated — show login panel
      this.showLogin();
    }
  },

  /* ── Show Login Panel ──────────────────────────────────────
     Hides the main app shell and shows the login form.
     Called on initial load (no session) or on 401 from API.
     ──────────────────────────────────────────────────────── */
  showLogin() {
    this.isAuthenticated = false;
    document.getElementById('loginPanel').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';

    // Clear any previous error
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.style.display = 'none';

    // Focus email field
    const emailInput = document.getElementById('loginEmail');
    if (emailInput) emailInput.focus();
  },

  /* ── Handle Login Submit ───────────────────────────────────
     Called from the login form. Posts credentials to the main
     backend via the API proxy.
     ──────────────────────────────────────────────────────── */
  async handleLogin(event) {
    event.preventDefault();

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');

    if (!email || !password) {
      errEl.textContent = 'Please enter email and password.';
      errEl.style.display = 'block';
      return;
    }

    // Disable button during request
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await API.post('/api/auth/login', { email, password });

      if (data?.success) {
        this.isAuthenticated = true;
        await this._enterApp();
      } else {
        errEl.textContent = data?.message || 'Invalid credentials.';
        errEl.style.display = 'block';
      }
    } catch (err) {
      errEl.textContent = 'Unable to connect to server. Is the main app running?';
      errEl.style.display = 'block';
      console.error('[AppShell] Login error:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  },

  /* ── Handle Logout ─────────────────────────────────────── */
  async handleLogout() {
    try {
      await API.post('/api/auth/logout');
    } catch (e) {
      // Ignore errors — we're logging out anyway
    }
    this.isAuthenticated = false;
    this.showLogin();
  },

  /* ── Enter App ─────────────────────────────────────────────
     Hides login, shows the app shell, initializes layout,
     and navigates to the correct view.
     ──────────────────────────────────────────────────────── */
  async _enterApp() {
    // Hide login, show app
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';

    // Determine which view to show
    const viewName = TeamsApp.getViewName();

    // Initialize Layout (populates user info, sidebar, topbar)
    await Layout.init(viewName);

    // Bind navigation events
    this._bindNavigation();

    // Bind logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    }

    // Navigate to the target view
    this.navigateTo(viewName);
  },

  /* ── Bind Navigation ───────────────────────────────────────
     Attaches click handlers to all sidebar nav items.
     Navigation is client-side (SPA-like) — we swap view panels.
     ──────────────────────────────────────────────────────── */
  _bindNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.dataset.page;
        if (page) this.navigateTo(page);
      });
    });
  },

  /* ── Navigate To View ──────────────────────────────────────
     Switches the active view panel and updates navigation state.

     Each view has a corresponding <div id="view-{name}"> in the
     HTML. Only the active one has class .active (display: block).

     FUTURE: This is where view-specific controllers will be
     called to load data. For now, views show placeholder content.
     ──────────────────────────────────────────────────────── */
  navigateTo(viewName) {
    console.log('[AppShell] Navigating to:', viewName);

    // Update active nav item
    Layout.setActiveNav(viewName);

    // Hide all view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    // Show the target view panel
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    } else {
      // Fallback: show a "coming soon" message in the default container
      const fallback = document.getElementById('view-placeholder');
      if (fallback) {
        fallback.querySelector('.placeholder-title').textContent =
          viewName.charAt(0).toUpperCase() + viewName.slice(1).replace(/-/g, ' ');
        fallback.classList.add('active');
      }
    }

    // Update topbar title
    const titleMap = {
      'home':       'Home',
      'tasks':      'My Tasks',
      'analytics':  'Analytics',
      'leaves':     'Leave Requests',
      'goals':      'Goals & OKR',
      'appraisal':  'Performance Appraisal',
      'attendance': 'Attendance',
      'helpdesk':   'Help Desk',
      'directory':  'Directory'
    };

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
      pageTitle.textContent = titleMap[viewName] || viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    this.currentView = viewName;

    /* ── FUTURE: View Controller Dispatch ────────────────────
       When feature pages are built, dispatch to their controllers:

       switch (viewName) {
         case 'home':      HomeController.init(); break;
         case 'tasks':     TasksController.init(); break;
         case 'analytics': AnalyticsController.init(); break;
         case 'leaves':    LeavesController.init(); break;
         case 'goals':     GoalsController.init(); break;
         case 'appraisal': AppraisalController.init(); break;
         case 'attendance':AttendanceController.init(); break;
         case 'helpdesk':  HelpdeskController.init(); break;
         case 'directory': DirectoryController.init(); break;
       }
       ─────────────────────────────────────────────────────── */
  }
};


/* ── DOM Ready ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  AppShell.boot();
});
