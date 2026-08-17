/* ── Analytics Page Controller ── Modern redesign ── */

/* Read theme color from CSS variables at runtime */
function _primary()    { return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()    || '#001E57'; }
function _primaryRGB() { return getComputedStyle(document.documentElement).getPropertyValue('--color-primary-rgb').trim() || '0,30,87'; }
function _primaryFaint(){ return getComputedStyle(document.documentElement).getPropertyValue('--color-primary-faint').trim() || '#E0E4EB'; }

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('analytics');
  await Promise.all([loadSummary(), loadCharts(), loadFinance()]);
});

async function loadSummary() {
  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const s = data.summary;

  const total = s.totalTasks || 0;

  document.getElementById('kpiTotal').textContent     = total;
  document.getElementById('kpiCompleted').textContent = s.completedTasks;
  document.getElementById('kpiPending').textContent   = s.pendingTasks;
  document.getElementById('kpiEscalated').textContent = s.escalatedTasks;

  // hero
  const heroTotal = document.getElementById('heroTotal');
  if (heroTotal) heroTotal.textContent = total || '—';

  // attendance
  const attNum = document.getElementById('attNum');
  const attSub = document.getElementById('attSub');
  if (attNum) attNum.textContent = s.attendance?.presentDays ?? '—';
  if (attSub) attSub.textContent = `Present out of ~22 working days this month`;
}

async function loadCharts() {
  const [byStatus, bySystem, byPriority, leaveSum] = await Promise.all([
    API.get('/api/analytics/tasks-by-status'),
    API.get('/api/analytics/tasks-by-system'),
    API.get('/api/analytics/tasks-by-priority'),
    API.get('/api/analytics/leave-summary')
  ]);

  buildAreaChart(bySystem);
  buildStatusDonut(byStatus);
  buildSystemBar(bySystem);
  buildPriorityList(byPriority);
  buildLeaveChart(leaveSum);
  buildAttendanceChart();
}

/* ── Gradient helper ── */
function makeGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  return g;
}

/* ── Area chart (tasks by system) ── */
function buildAreaChart(bySystem) {
  const canvas = document.getElementById('chartArea');
  if (!canvas || !bySystem?.success) return;
  const ctx = canvas.getContext('2d');

  const labels = Object.keys(bySystem.data);
  const values = Object.values(bySystem.data);

  const total = values.reduce((a,b)=>a+b,0);
  const badge = document.getElementById('systemBadge');
  if (badge) badge.textContent = `${total} tasks`;

  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, `rgba(${_primaryRGB()},0.15)`);
  grad.addColorStop(1, `rgba(${_primaryRGB()},0.0)`);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        fill: true,
        backgroundColor: grad,
        borderColor: _primary(),
        borderWidth: 2.5,
        pointBackgroundColor: _primary(),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#94a3b8', font: { size: 11 } },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Donut: tasks by status ── */
function buildStatusDonut(byStatus) {
  const canvas = document.getElementById('chartStatus');
  if (!canvas || !byStatus?.success) return;
  const d = byStatus.data;

  const labels = Object.keys(d).map(k => k.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
  const values = Object.values(d);
  const total  = values.reduce((a, b) => a + b, 0);

  const palette = [_primary(), '#0dd4c8', '#5eead4', '#0e7490'];

  const donutTotalEl = document.getElementById('donutTotal');
  if (donutTotalEl) donutTotalEl.textContent = total;

  // Status legend rows
  const legendEl = document.getElementById('statusLegend');
  if (legendEl) {
    legendEl.innerHTML = labels.map((lbl, i) => {
      const pct = total > 0 ? Math.round(values[i] / total * 100) : 0;
      return `
        <div class="sl-row">
          <div class="sl-dot" style="background:${palette[i % palette.length]}"></div>
          <div class="sl-label">${lbl}</div>
          <div class="sl-val">${values[i]}<span class="sl-pct">${pct}%</span></div>
        </div>
      `;
    }).join('');
  }

  // Glow plugin — draws a blurred shadow ring behind each arc
  const glowPlugin = {
    id: 'arcGlow',
    beforeDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowBlur   = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetsDraw(chart) {
      chart.ctx.restore();
    }
  };

  new Chart(canvas, {
    type: 'doughnut',
    plugins: [glowPlugin],
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette,
        hoverBackgroundColor: palette.map(c => c + 'dd'),
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 10,
        borderRadius: 6,
        spacing: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '74%',
      animation: {
        animateRotate: true,
        duration: 900,
        easing: 'easeInOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,30,35,0.85)',
          titleColor: '#0dd4c8',
          bodyColor: 'rgba(255,255,255,0.9)',
          borderColor: 'rgba(13,212,200,0.3)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => ` ${ctx.parsed} tasks  (${Math.round(ctx.parsed/total*100)}%)`
          }
        }
      }
    }
  });
}

/* ── Bar: tasks by system ── */
function buildSystemBar(bySystem) {
  const canvas = document.getElementById('chartSystem');
  if (!canvas || !bySystem?.success) return;
  const ctx = canvas.getContext('2d');
  const d = bySystem.data;

  const total = Object.values(d).reduce((a,b)=>a+b,0);
  const badgeEl = document.getElementById('systemBadge');
  if (badgeEl) badgeEl.textContent = `${total} total`;

  const sysColors = [_primary(),'#0D7BB5','#6f42c1','#e6a817','#1A9E6A','#fd7e14'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(d),
      datasets: [{
        label: 'Tasks',
        data: Object.values(d),
        backgroundColor: sysColors,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#aab4be', font: { size: 11 } },
          grid: { color: '#f0f4f8', drawBorder: false },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#5a7270', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Priority list (progress bars, no chart) ── */
function buildPriorityList(byPriority) {
  const el = document.getElementById('priorityList');
  if (!el || !byPriority?.success) return;
  const d = byPriority.data;

  const items = [
    { key: 'critical', label: 'Critical', color: '#DC3545', bg: '#fde8ea' },
    { key: 'high',     label: 'High',     color: '#fd7e14', bg: '#fff3e0' },
    { key: 'medium',   label: 'Medium',   color: '#e6a817', bg: '#fffbeb' },
    { key: 'low',      label: 'Low',      color: '#1A9E6A', bg: '#e6f9f0' }
  ];

  const max = Math.max(...items.map(i => d[i.key] || 0)) || 1;

  el.innerHTML = items.map(item => {
    const val = d[item.key] || 0;
    const pct = Math.round((val / max) * 100);
    return `
      <div class="priority-row">
        <div class="priority-dot" style="background:${item.color}"></div>
        <div class="priority-name">${item.label}</div>
        <div class="priority-bar-wrap">
          <div class="priority-bar-fill" style="width:${pct}%;background:${item.color};"></div>
        </div>
        <div class="priority-count">${val}</div>
      </div>
    `;
  }).join('');

  // Animate bars after paint
  requestAnimationFrame(() => {
    const fills = el.querySelectorAll('.priority-bar-fill');
    fills.forEach(f => {
      const w = f.style.width;
      f.style.width = '0';
      setTimeout(() => { f.style.width = w; }, 50);
    });
  });
}

/* ── Leave summary ── */
function buildLeaveChart(leaveSum) {
  const canvas = document.getElementById('chartLeave');
  if (!canvas || !leaveSum?.success) return;
  const bt = leaveSum.byType;

  const palette = [_primary(),'#0D7BB5','#6f42c1','#e6a817'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(bt).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
      datasets: [{
        label: 'Days',
        data: Object.values(bt),
        backgroundColor: palette,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#aab4be', font: { size: 11 } },
          grid: { color: '#f0f4f8' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#5a7270', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ════════════════════════════════════════════════════
   FINANCE & ACCOUNTING
   ════════════════════════════════════════════════════ */

function formatSAR(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

async function loadFinance() {
  const [summary, quarters, cashflow, apAging, expenses] = await Promise.all([
    API.get('/api/finance/summary'),
    API.get('/api/finance/revenue-quarters'),
    API.get('/api/finance/cashflow'),
    API.get('/api/finance/ap-aging'),
    API.get('/api/finance/expenses')
  ]);

  // KPI cards
  if (summary?.success) {
    const s = summary;
    document.getElementById('finPOs').textContent       = s.openPurchaseOrders;
    document.getElementById('finOverduePOs').textContent = s.overduePOs;
    document.getElementById('finInvoices').textContent  = s.openInvoices;
    document.getElementById('finOverdueInv').textContent = s.overdueInvoices;
    document.getElementById('finTurnover').textContent  = formatSAR(s.ytdTurnover);
    document.getElementById('finBudget').textContent    = s.budgetUtilization + '%';
    document.getElementById('finDSO').textContent       = s.dso;
    document.getElementById('finCollected').textContent = 'SAR ' + formatSAR(s.collectedThisMonth);

    // DSO progress bar (0–60 scale)
    const prog = document.getElementById('dsoProg');
    if (prog) prog.style.width = Math.min((s.dso / 60) * 100, 100) + '%';
  }

  buildRevenueChart(quarters);
  buildCashflowChart(cashflow);
  buildAPAgingChart(apAging);
  buildExpensesDonut(expenses);
}

/* ── Revenue vs Quarters ── */
function buildRevenueChart(data) {
  const canvas = document.getElementById('chartRevenue');
  if (!canvas || !data?.success) return;

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Actual',
          data: data.revenue,
          backgroundColor: _primary(),
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.45
        },
        {
          label: 'Target',
          data: data.target,
          backgroundColor: '#e0f2fe',
          borderColor: '#0D7BB5',
          borderWidth: 1.5,
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.45
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: '#64748b' }
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: ctx => ` SAR ${formatSAR(ctx.parsed.y)}` }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => 'SAR ' + formatSAR(v) },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Cash Flow ── */
function buildCashflowChart(data) {
  const canvas = document.getElementById('chartCashflow');
  if (!canvas || !data?.success) return;
  const ctx = canvas.getContext('2d');

  const inGrad = ctx.createLinearGradient(0, 0, 0, 200);
  inGrad.addColorStop(0, `rgba(${_primaryRGB()},0.18)`);
  inGrad.addColorStop(1, `rgba(${_primaryRGB()},0.01)`);

  const outGrad = ctx.createLinearGradient(0, 0, 0, 200);
  outGrad.addColorStop(0, 'rgba(220,53,69,0.12)');
  outGrad.addColorStop(1, 'rgba(220,53,69,0.01)');

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Inflows',
          data: data.inflows,
          borderColor: _primary(),
          backgroundColor: inGrad,
          fill: true,
          borderWidth: 2.5,
          pointBackgroundColor: _primary(),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          tension: 0.4
        },
        {
          label: 'Outflows',
          data: data.outflows,
          borderColor: '#dc3545',
          backgroundColor: outGrad,
          fill: true,
          borderWidth: 2.5,
          pointBackgroundColor: '#dc3545',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: '#64748b' }
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: SAR ${formatSAR(ctx.parsed.y)}` }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => 'SAR ' + formatSAR(v) },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── AP Aging ── */
function buildAPAgingChart(data) {
  const canvas = document.getElementById('chartAPAging');
  if (!canvas || !data?.success) return;

  const colors = [_primary(), '#d97706', '#dc3545', '#7c3aed'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Amount (SAR)',
        data: data.amounts,
        backgroundColor: colors,
        borderRadius: 10,
        borderSkipped: false,
        barThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: ctx => ` SAR ${formatSAR(ctx.parsed.y)}` }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => 'SAR ' + formatSAR(v) },
          grid: { color: '#f1f5f9' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#5a7270', font: { size: 11, weight: '600' } },
          border: { display: false }
        }
      }
    }
  });
}

/* ── Expense Categories Donut ── */
function buildExpensesDonut(data) {
  const canvas = document.getElementById('chartExpenses');
  if (!canvas || !data?.success) return;

  const colors = [_primary(),'#2563eb','#7c3aed','#d97706','#dc3545','#64748b'];
  const total  = data.amounts.reduce((a, b) => a + b, 0);

  // Legend
  const legend = document.getElementById('expenseLegend');
  if (legend) {
    legend.innerHTML = data.labels.map((lbl, i) => {
      const pct = Math.round(data.amounts[i] / total * 100);
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--color-text)">
        <span style="width:9px;height:9px;border-radius:50%;background:${colors[i]};flex-shrink:0;display:inline-block"></span>
        ${lbl} <span style="color:var(--color-text-muted)">${pct}%</span>
      </div>`;
    }).join('');
  }

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.amounts,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: '#fff',
        borderRadius: 5,
        spacing: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: ctx => ` SAR ${formatSAR(ctx.parsed)} (${Math.round(ctx.parsed/total*100)}%)` }
        }
      }
    }
  });
}

/* ── Attendance gauge (donut) ── */
async function buildAttendanceChart() {
  const canvas = document.getElementById('chartAttendance');
  if (!canvas) return;

  const data = await API.get('/api/analytics/summary');
  if (!data?.success) return;
  const present  = data.summary.attendance?.presentDays || 0;
  const working  = 22;
  const absent   = Math.max(working - present, 0);

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent'],
      datasets: [{
        data: [present, absent],
        backgroundColor: [_primary(), '#f0f4f8'],
        borderWidth: 0,
        borderRadius: 6,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '78%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.85)',
          padding: 10,
          cornerRadius: 8
        }
      }
    }
  });
}
