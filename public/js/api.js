/* ============================================================
   UNIFIED WORKSPACE — Shared API & Layout Utility
   Every page controller imports this file first.
   ============================================================ */

const BASE = '/unifiedsmi';

const API = {
  /* ── HTTP Helpers ─────────────────────────────────────── */
  async get(url) {
    const res = await fetch(BASE + url, { credentials: 'include' });
    if (res.status === 401) { window.location.href = BASE + '/login'; return; }
    return res.json();
  },

  async post(url, body = {}) {
    const res = await fetch(BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (res.status === 401) { window.location.href = BASE + '/login'; return; }
    return res.json();
  },

  async put(url, body = {}) {
    const res = await fetch(BASE + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (res.status === 401) { window.location.href = BASE + '/login'; return; }
    return res.json();
  },

  async del(url) {
    const res = await fetch(BASE + url, { method: 'DELETE', credentials: 'include' });
    if (res.status === 401) { window.location.href = BASE + '/login'; return; }
    return res.json();
  },

  /* ── Current User ─────────────────────────────────────── */
  async getMe() {
    const data = await this.get('/api/me');
    return data?.user || null;
  }
};

/* ============================================================
   LAYOUT — Sidebar state, topbar, notifications
   ============================================================ */
const Layout = {
  user: null,

  async init(activePage) {
    // Detect embed mode (Teams tabs without sidebar)
    if (new URLSearchParams(window.location.search).has('embed')) {
      document.body.classList.add('embed-mode');
    }

    this.user = await API.getMe();
    if (!this.user) return;

    this.setActiveNav(activePage);
    this.populateUser();
    this.bindSidebarToggle();
    await this.loadNotifications();
    Heartbeat.start();
  },

  setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  populateUser() {
    const u = this.user;
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

    const isMobile = () => window.innerWidth <= 991;

    // Restore desktop collapsed state
    if (!isMobile() && localStorage.getItem('sidebarCollapsed') === '1') {
      document.body.classList.add('sidebar-collapsed');
    }

    const openMobile  = () => { sidebar.classList.add('show'); overlay?.classList.add('show'); };
    const closeMobile = () => { sidebar.classList.remove('show'); overlay?.classList.remove('show'); };

    toggle.addEventListener('click', () => {
      if (isMobile()) {
        sidebar.classList.contains('show') ? closeMobile() : openMobile();
      } else {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
      }
    });

    overlay?.addEventListener('click', closeMobile);

    // Close mobile sidebar on resize to desktop
    window.addEventListener('resize', () => {
      if (!isMobile()) closeMobile();
    });
  },

  async loadNotifications() {
    const data = await API.get('/api/news/notifications');
    if (!data?.success) return;

    const dot   = document.getElementById('notifDot');
    const count = data.unreadCount || 0;
    if (dot) {
      dot.style.display = count > 0 ? 'flex' : 'none';
      dot.textContent = count > 9 ? '9+' : count;
      dot.classList.toggle('d-none', count === 0);
    }

    const bellBtn = dot?.parentElement;
    if (!bellBtn) return;

    // Build dropdown panel
    let panel = document.getElementById('notifPanel');
    if (!panel) {
      // Wrap bell button in a positioned container
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      bellBtn.parentNode.insertBefore(wrapper, bellBtn);
      wrapper.appendChild(bellBtn);

      panel = document.createElement('div');
      panel.id = 'notifPanel';
      panel.className = 'notif-panel';
      wrapper.appendChild(panel);

      // Toggle on bell click
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
      });

      // Close on outside click
      document.addEventListener('click', () => panel.classList.remove('show'));
      panel.addEventListener('click', (e) => e.stopPropagation());
    }

    const notifs = data.notifications || [];
    const typeIcons = { task: 'bi-list-task', leave: 'bi-calendar-check', news: 'bi-megaphone', escalation: 'bi-exclamation-triangle', appraisal: 'bi-star' };

    if (notifs.length === 0) {
      panel.innerHTML = `<div class="notif-header">Notifications</div><div class="notif-empty">No notifications</div>`;
      return;
    }

    panel.innerHTML = `
      <div class="notif-header">Notifications <span class="notif-badge">${count}</span></div>
      <div class="notif-list">
        ${notifs.map(n => `
          <a href="${BASE + n.link}" class="notif-item ${n.read ? 'read' : ''}" data-id="${n.id}">
            <i class="bi ${typeIcons[n.type] || 'bi-bell'} notif-icon"></i>
            <div class="notif-content">
              <div class="notif-title">${n.title}</div>
              <div class="notif-msg">${n.message}</div>
              <div class="notif-time">${UI.formatDate(n.createdAt)}</div>
            </div>
            ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
          </a>
        `).join('')}
      </div>
    `;

    // Mark as read on click
    panel.querySelectorAll('.notif-item:not(.read)').forEach(item => {
      item.addEventListener('click', () => {
        API.put(`/api/news/notifications/${item.dataset.id}/read`);
      });
    });
  }
};

/* ============================================================
   HEARTBEAT — Keep session & tunnel alive (fixes Teams idle timeout)
   - Pings /api/heartbeat every 30s to keep session + tunnel warm
   - If ping fails, auto-reloads to recover before Teams shows error
   - On visibility change (tab refocus), pings immediately
   ============================================================ */
const Heartbeat = {
  _timer: null,
  _interval: 30 * 1000,        // 30 seconds — aggressive to prevent Teams disconnect
  _failCount: 0,
  _maxFails: 2,                 // reload after 2 consecutive failures

  start() {
    if (this._timer) return;
    this._ping();
    this._timer = setInterval(() => this._ping(), this._interval);

    // Ping + recover when tab/iframe regains focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this._ping();
        // Reset interval so it doesn't fire right after
        clearInterval(this._timer);
        this._timer = setInterval(() => this._ping(), this._interval);
      }
    });

    // Teams SDK: notify Teams the app loaded successfully
    if (window.microsoftTeams) {
      try { microsoftTeams.app.initialize().then(() => microsoftTeams.app.notifySuccess()); } catch {}
    }
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  async _ping() {
    try {
      const res = await fetch(BASE + '/api/heartbeat', {
        credentials: 'include',
        signal: AbortSignal.timeout(8000)    // 8s timeout
      });
      if (res.ok) {
        this._failCount = 0;
      } else if (res.status === 401 || res.redirected) {
        // Session expired — reload immediately to trigger login
        window.location.reload();
      } else {
        this._onFail();
      }
    } catch {
      this._onFail();
    }
  },

  _onFail() {
    this._failCount++;
    if (this._failCount >= this._maxFails) {
      // Connection lost — reload before Teams shows "problem reaching" error
      this._failCount = 0;
      window.location.reload();
    }
  }
};

/* ============================================================
   UI HELPERS
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

    const icons = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const id    = 'toast-' + Date.now();

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

  /* ── Confirm dialog ─────────────────────────────────────── */
  confirm(message) {
    return window.confirm(message);
  },

  /* ── Date formatting ────────────────────────────────────── */
  formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(iso) {
    if (!iso) return '—';
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

  /* ── Badge helpers ──────────────────────────────────────── */
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
