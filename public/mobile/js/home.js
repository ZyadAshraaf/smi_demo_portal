let donutChart    = null;
let _homeLoaded   = false;
let _homeInited   = false;

const Home = {
  async init() {
    if (!_homeInited) {
      setupPullToRefresh();
      _homeInited = true;
    }
    await loadAll();
  }
};

async function loadAll() {
  const [me, summary, tasks, byStatus, news] = await Promise.all([
    API.get('/api/me'),
    API.get('/api/analytics/summary'),
    API.get('/api/tasks'),
    API.get('/api/analytics/tasks-by-status'),
    API.get('/api/news')
  ]);

  if (!me || !me.success) { location.replace('/unifiedsmi/m/login'); return; }

  renderGreeting(me.user);
  if (summary  && summary.success)  renderStats(summary.summary);
  if (tasks    && tasks.success)    renderRecentTasks(tasks.tasks);
  if (byStatus && byStatus.success) renderChart(byStatus.data);
  if (news     && news.success)     renderNews(news.news || news.items || []);
}

function renderGreeting(user) {
  const hour = new Date().getHours();
  const tod  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  document.getElementById('greetingName').textContent = `Good ${tod}, ${user.name.split(' ')[0]} 👋`;
  document.getElementById('greetingSub').textContent  = user.role.charAt(0).toUpperCase() + user.role.slice(1);
}

function renderStats(s) {
  document.getElementById('statTasks').textContent   = s.pendingTasks;
  document.getElementById('statLeave').textContent   = s.leaveBalance?.annual ?? '—';
  document.getElementById('statPresent').textContent = s.attendance?.presentDays ?? '—';
  document.getElementById('statTickets').textContent = s.openTickets;
}

function renderRecentTasks(tasks) {
  const pending = (tasks || []).filter(t => t.status !== 'completed').slice(0, 3);
  const el = document.getElementById('recentTasks');
  if (!pending.length) { el.innerHTML = '<div class="empty-state">No pending tasks</div>'; return; }
  el.innerHTML = pending.map(t => `
    <div class="task-card" onclick="Router.go('tasks')">
      <div class="task-card__title">${t.title}</div>
      <div class="task-card__meta">
        ${statusBadge(t.status)}
        ${priorityDot(t.priority)}
        <span>${t.dueDate ? fmtDate(t.dueDate) : 'No due date'}</span>
      </div>
    </div>
  `).join('');
}

function renderChart(data) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = [
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#001E57',
    '#f97316', '#eab308', '#64748b', '#ef4444', '#8b5cf6'
  ];

  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
    options: {
      responsive: false,
      cutout: '65%',
      plugins: { legend: { display: false } },
      animation: { duration: 600 }
    }
  });

  document.getElementById('chartLegend').innerHTML = labels.map((l, i) =>
    `<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[i]};margin-right:5px"></span>${l}: <strong>${values[i]}</strong></div>`
  ).join('');
}

function renderNews(items) {
  const el    = document.getElementById('newsFeed');
  const slice = items.slice(0, 3);
  if (!slice.length) { el.innerHTML = '<div class="empty-state">No news</div>'; return; }
  el.innerHTML = slice.map(n => `
    <div class="news-card">
      <span class="news-card__cat">${n.category || 'General'}</span>
      <div class="news-card__title">${n.title}</div>
      <div class="news-card__date">${fmtDate(n.date || n.createdAt)}</div>
      <div class="news-card__body">${n.summary || n.content || ''}</div>
    </div>
  `).join('');
}

// ── Pull-to-refresh ────────────────────────────────────────────────────────────
function setupPullToRefresh() {
  let startY = 0, pulling = false;
  const indicator = document.getElementById('ptrIndicator');
  const content   = document.getElementById('page');

  content.addEventListener('touchstart', e => {
    if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });

  content.addEventListener('touchmove', e => {
    if (!pulling) return;
    if (e.touches[0].clientY - startY > 60) indicator.classList.add('ptr-indicator--visible');
  }, { passive: true });

  content.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (indicator.classList.contains('ptr-indicator--visible')) {
      await loadAll();
      indicator.classList.remove('ptr-indicator--visible');
    }
  });
}

// ── Boot (SPA shell entry point) ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/unifiedsmi/sw.js').catch(() => {});
  }
  // Start router immediately — auth is enforced inside each view's data fetch
  Router.start();
});
