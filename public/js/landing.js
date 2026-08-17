/* ── Landing Page Controller ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('landing');
  setWelcome();
  await Promise.all([loadSummary(), loadRecentTasks(), loadNews(), loadCharts()]);
  // Wake the AI service dyno in the background so it's ready when the user navigates to it
  fetch('/api/ai-warmup').catch(() => {});
});

function setWelcome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = Layout.user?.name?.split(' ')[0] || '';
  document.getElementById('welcomeGreeting').textContent = `${greeting}, ${name}! 👋`;
  document.getElementById('welcomeDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

async function loadSummary() {
  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const s = data.summary;
  document.getElementById('statPendingTasks').textContent = s.pendingTasks;
  document.getElementById('statLeaveBalance').textContent = s.leaveBalance.annual;
  document.getElementById('statPresentDays').textContent  = s.attendance.presentDays;
  document.getElementById('statOpenTickets').textContent  = s.openTickets;
}

async function loadRecentTasks() {
  const data = await API.get('/api/tasks');
  if (!data?.success) return;

  const tasks  = data.tasks.filter(t => t.status !== 'completed').slice(0, 6);
  const el     = document.getElementById('recentTasksList');

  if (!tasks.length) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-check2-all"></i><h5>All caught up!</h5><p>No pending tasks right now.</p></div>`;
    return;
  }

  el.innerHTML = tasks.map(t => {
    const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed';
    return `
      <div class="task-row-mini">
        <div class="task-dot ${t.status}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
          <div style="font-size:11px;color:var(--color-text-muted)">${UI.systemBadge(t.sourceSystem)} ${isOverdue ? '<span style="color:var(--color-danger);font-weight:600">Overdue</span>' : `Due ${UI.formatDate(t.dueDate)}`}</div>
        </div>
        ${UI.priorityBadge(t.priority)}
      </div>`;
  }).join('');
}

async function loadNews() {
  const data = await API.get('/api/news');
  if (!data?.success) return;

  const el   = document.getElementById('newsList');
  const news = data.news.slice(0, 4);

  if (!news.length) { el.innerHTML = '<div class="p-3 text-muted fs-sm">No announcements.</div>'; return; }

  el.innerHTML = news.map(n => `
    <div class="news-item">
      <div class="d-flex gap-10 align-items-start" style="gap:10px">
        <div class="news-icon"><i class="bi ${n.icon || 'bi-megaphone'}"></i></div>
        <div style="flex:1;min-width:0">
          <div class="news-title">${n.title}</div>
          <div class="news-summary">${n.summary}</div>
          <div class="news-time mt-1">${UI.timeAgo(n.postedAt)}</div>
        </div>
      </div>
    </div>`).join('');
}

async function loadCharts() {
  // Read primary color from CSS variable for chart theming
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#001E57';

  const [statusRes, systemRes] = await Promise.all([
    API.get('/api/analytics/tasks-by-status'),
    API.get('/api/analytics/tasks-by-system')
  ]);

  // ── Task Status Donut ────────────────────────────────────────────────────
  if (statusRes?.success) {
    const d = statusRes.data;
    const labels = Object.keys(d).map(k => k.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()));
    const values = Object.values(d);
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

    new Chart(document.getElementById('chartTaskStatus'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }]
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
        }
      }
    });

    document.getElementById('chartTaskStatusLegend').innerHTML = labels.map((l, i) =>
      `<span style="display:flex;align-items:center;gap:4px">
        <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
        <span>${l} (${values[i]})</span>
      </span>`
    ).join('');
  }

  // ── Tasks by System Bar ──────────────────────────────────────────────────
  if (systemRes?.success) {
    const d       = systemRes.data;
    const labels  = Object.keys(d);
    const values  = Object.values(d);
    const max     = Math.max(...values);
    const alphas  = values.map(v => 0.4 + 0.6 * (v / max));
    const bgColors = alphas.map(a => hexToRgba(primary, a));

    new Chart(document.getElementById('chartTaskSystem'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tasks',
          data: values,
          backgroundColor: bgColors,
          borderColor: primary,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1, font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
