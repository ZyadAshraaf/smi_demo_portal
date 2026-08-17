/* ============================================================
   UNIFIED WORKSPACE TEAMS — Shared API & Layout Utility

   Adapted from the main app's api.js for the Teams environment.
   Key differences:
   - Auth redirects go to the in-tab login panel, not /login
   - Layout is Teams-aware (compact sidebar, no web portal topbar)
   - API calls are proxied through the Teams server to the main backend
   ============================================================ */

const API = {
  /* ── HTTP Helpers ─────────────────────────────────────────
     All API calls go to /api/* which the Teams server proxies
     to the main Unified Workspace backend (localhost:3030).
     ───────────────────────────────────────────────────────── */
  async get(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 401) { this._onUnauthorized(); return null; }
    return res.json();
  },

  async post(url, body = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (res.status === 401) { this._onUnauthorized(); return null; }
    return res.json();
  },

  async put(url, body = {}) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (res.status === 401) { this._onUnauthorized(); return null; }
    return res.json();
  },

  async del(url) {
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (res.status === 401) { this._onUnauthorized(); return null; }
    return res.json();
  },

  /* ── Current User ────────────────────────────────────────── */
  async getMe() {
    const data = await this.get('/api/me');
    return data?.user || null;
  },

  /* ── Auth Failure Handler ──────────────────────────────────
     In the Teams tab, we can't redirect to /login (it would
     load inside the iframe). Instead, we trigger the in-tab
     login panel via the AppShell.
     ───────────────────────────────────────────────────────── */
  _onUnauthorized() {
    console.warn('[API] 401 Unauthorized — showing login panel');
    if (typeof AppShell !== 'undefined') {
      AppShell.showLogin();
    }
  }
};


/* ============================================================
   LAYOUT — Sidebar state, topbar, user info
   Adapted for the Teams tab shell.
   ============================================================ */
const Layout = {
  user: null,

  async init(activePage) {
    this.user = await API.getMe();
    if (!this.user) return false;

    this.setActiveNav(activePage);
    this.populateUser();
    this.bindSidebarToggle();

    return true;
  },

  setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  populateUser() {
    const u = this.user;
    if (!u) return;
    const initial = u.name.charAt(0).toUpperCase();

    // Sidebar
    const sName = document.getElementById('sidebarUserName');
    const sRole = document.getElementById('sidebarUserRole');
    const sAva  = document.getElementById('sidebarAvatar');
    if (sName) sName.textContent = u.name;
    if (sRole) sRole.textContent = u.role.charAt(0).toUpperCase() + u.role.slice(1);
    if (sAva)  sAva.textContent  = initial;

    // Topbar
    const tName = document.getElementById('topbarUserName');
    const tAva  = document.getElementById('topbarAvatar');
    if (tName) tName.textContent = u.name.split(' ')[0];
    if (tAva)  tAva.textContent  = initial;
  },

  bindSidebarToggle() {
    const toggle  = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (!toggle || !sidebar) return;

    const isMobile = () => window.innerWidth <= 768;

    // Restore desktop collapsed state
    if (!isMobile() && localStorage.getItem('teamsSidebarCollapsed') === '1') {
      document.body.classList.add('sidebar-collapsed');
    }

    const openMobile  = () => { sidebar.classList.add('show'); overlay?.classList.add('show'); };
    const closeMobile = () => { sidebar.classList.remove('show'); overlay?.classList.remove('show'); };

    toggle.addEventListener('click', () => {
      if (isMobile()) {
        sidebar.classList.contains('show') ? closeMobile() : openMobile();
      } else {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('teamsSidebarCollapsed', collapsed ? '1' : '0');
      }
    });

    overlay?.addEventListener('click', closeMobile);

    window.addEventListener('resize', () => {
      if (!isMobile()) closeMobile();
    });
  }
};


/* ============================================================
   UI HELPERS
   Identical to main app — shared formatting and badge utilities.
   ============================================================ */
const UI = {
  /* ── Toast ─────────────────────────────────────────────── */
  toast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.appendChild(container);
    }

    const icons = {
      success: 'bi-check-circle-fill',
      danger: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill'
    };
    const id = 'toast-' + Date.now();

    container.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="toast align-items-center text-bg-${type} border-0 show" role="alert">
        <div class="d-flex">
          <div class="toast-body d-flex align-items-center gap-2">
            <i class="bi ${icons[type] || icons.info}"></i> ${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    `);

    setTimeout(() => document.getElementById(id)?.remove(), 4000);
  },

  confirm(message) { return window.confirm(message); },

  /* ── Date formatting ───────────────────────────────────── */
  formatDate(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  },

  /* ── Badge helpers ─────────────────────────────────────── */
  statusBadge(status) {
    const label = status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<span class="badge-custom badge-status-${status}">${label}</span>`;
  },

  priorityBadge(priority) {
    const label = priority.charAt(0).toUpperCase() + priority.slice(1);
    return `<span class="badge-custom badge-priority-${priority}">${label}</span>`;
  },

  systemBadge(system) {
    return `<span class="badge-custom badge-sys-${system}" style="font-size:10px">${system}</span>`;
  }
};
