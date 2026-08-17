const BASE = '/unifiedsmi';

const API = {
  async get(url) {
    const r = await fetch(BASE + url, { credentials: 'include' });
    if (r.status === 401) { location.replace(BASE + '/m/login'); return null; }
    try { return await r.json(); } catch { return null; }
  },
  async post(url, body) {
    const r = await fetch(BASE + url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { location.replace(BASE + '/m/login'); return null; }
    try { return await r.json(); } catch { return null; }
  },
  async put(url, body) {
    const r = await fetch(BASE + url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) { location.replace(BASE + '/m/login'); return null; }
    try { return await r.json(); } catch { return null; }
  }
};

const UI = {
  toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `m-toast m-toast--${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('m-toast--visible'));
    setTimeout(() => {
      el.classList.remove('m-toast--visible');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function diffDaysInclusive(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function statusBadge(status) {
  const map = {
    pending:      ['Pending',     'badge--pending'],
    approved:     ['Approved',    'badge--approved'],
    rejected:     ['Rejected',    'badge--rejected'],
    completed:    ['Completed',   'badge--approved'],
    'in-progress':['In Progress', 'badge--inprog'],
    escalated:    ['Escalated',   'badge--escalated'],
    new:          ['New',         'badge--new']
  };
  const [label, cls] = map[status] || [status, 'badge--new'];
  return `<span class="m-badge ${cls}">${label}</span>`;
}

function priorityDot(priority) {
  const map = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  const color = map[priority] || '#94a3b8';
  return `<span class="priority-dot" style="background:${color}" title="${priority}"></span>`;
}

const Nav = {
  setActive(tab) {
    document.querySelectorAll('.tab-bar__item').forEach(el => {
      el.classList.toggle('tab-bar__item--active', el.dataset.tab === tab);
    });
  }
};

// ── SPA Router ────────────────────────────────────────────────────────────────
const HEADERS = {
  home:     { title: '',               sub: '',                  show: false },
  tasks:    { title: 'My Tasks',       sub: '',                  show: true  },
  services: { title: 'Service Catalog',sub: 'Submit a request',  show: true  }
};

const Router = {
  current: null,

  async go(tab, push = true) {
    if (!(tab in HEADERS)) tab = 'home';
    if (tab === this.current) return;

    // Swap visible view instantly
    document.querySelectorAll('.m-content').forEach(v => v.style.display = 'none');
    document.getElementById(`view-${tab}`).style.display = '';

    // Update header
    const h = HEADERS[tab];
    const header = document.getElementById('mainHeader');
    header.style.display = h.show ? '' : 'none';
    document.getElementById('headerTitle').textContent = h.title;
    document.getElementById('headerSub').textContent   = h.sub;

    Nav.setActive(tab);
    if (push) history.pushState({ tab }, '', `${BASE}/m/${tab}`);
    this.current = tab;

    // Load data for this view (each view guards against double-fetching)
    if (tab === 'home')     await Home.init();
    if (tab === 'tasks')    await Tasks.init();
    if (tab === 'services') Services.init();
  },

  start() {
    // Determine initial tab from pathname or ?tab= redirect param
    const seg    = location.pathname.split('/').pop();
    const tabParam = new URLSearchParams(location.search).get('tab');
    const initial  = (tabParam in HEADERS) ? tabParam : (seg in HEADERS ? seg : 'home');

    // Clean ?tab redirect param from the URL without a history entry
    if (tabParam) history.replaceState({ tab: initial }, '', `${BASE}/m/${initial}`);

    this.go(initial, false);

    window.addEventListener('popstate', e => {
      const t = e.state?.tab || 'home';
      this.go(t, false);
    });
  }
};

// Sync theme-color meta with the dynamic CSS primary color from theme.css
document.addEventListener('DOMContentLoaded', () => {
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  if (primary) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = primary;
  }
});

// Intercept tab-bar clicks — no page reload, use Router instead
document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="/unifiedsmi/m/"]');
  if (!link) return;
  const tab = link.dataset.tab;
  if (tab && tab in HEADERS) {
    e.preventDefault();
    Router.go(tab);
  }
}, true);
