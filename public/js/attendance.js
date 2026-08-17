/* ── Attendance Page Controller ──────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('attendance');
  await Promise.all([loadToday(), loadAttendance()]);
});

async function loadToday() {
  const data = await API.get('/api/attendance/today');
  if (!data?.success) return;
  const r   = data.record;
  const now = new Date();

  document.getElementById('todayDateLabel').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (r) {
    const statusLabels = { present: 'Present', late: 'Late', absent: 'Absent', leave: 'On Leave' };
    document.getElementById('todayIn').textContent  = r.in  || '—';
    document.getElementById('todayOut').textContent = r.out || 'Not yet';
    document.getElementById('todayStatusBadge').innerHTML = `<i class="bi bi-circle-fill" style="font-size:8px"></i> ${statusLabels[r.status] || r.status}`;
  } else {
    document.getElementById('todayIn').textContent   = '—';
    document.getElementById('todayOut').textContent  = '—';
    document.getElementById('todayStatusBadge').innerHTML = '<i class="bi bi-circle-fill" style="font-size:8px"></i> No Record';
  }
}

async function loadAttendance() {
  const data = await API.get('/api/attendance');
  if (!data?.success) return;

  const { records, summary } = data;

  // Stats
  document.getElementById('sumPresent').textContent = summary.present;
  document.getElementById('sumLate').textContent    = summary.late;
  document.getElementById('sumAbsent').textContent  = summary.absent;
  document.getElementById('sumLeave').textContent   = summary.leave;

  // Calendar
  renderCalendar(records);

  // Log table
  renderLog(records);
}

function renderCalendar(records) {
  const container = document.getElementById('attendanceCalendar');
  const year = 2026, month = 2; // March 2026 (0-indexed)
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const recMap = {};
  records.forEach(r => recMap[r.date] = r);

  // Weekends (Fri=5, Sat=6 for Saudi, or Sat=6, Sun=0 for international)
  const weekends = new Set([0, 6]); // Sun, Sat

  let html = '';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += `<div class="att-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow     = new Date(year, month, d).getDay();
    const isToday = dateStr === today;

    if (weekends.has(dow)) {
      html += `<div class="att-day weekend ${isToday ? 'today' : ''}"><div class="day-num">${d}</div></div>`;
      continue;
    }

    const rec = recMap[dateStr];
    const cls = rec ? rec.status : (dateStr < today ? 'absent' : '');

    html += `<div class="att-day ${cls} ${isToday ? 'today' : ''}" title="${dateStr}${rec ? ` · In: ${rec.in || '—'} Out: ${rec.out || '—'}` : ''}">
      <div class="day-num">${d}</div>
    </div>`;
  }

  container.innerHTML = html;
}

function renderLog(records) {
  const tbody = document.getElementById('attendanceLogBody');
  const sorted = [...records].sort((a,b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No attendance records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(r => {
    const date    = new Date(r.date);
    const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
    let   hours   = '—';

    if (r.in && r.out) {
      const [ih, im] = r.in.split(':').map(Number);
      const [oh, om] = r.out.split(':').map(Number);
      const totalMin = (oh * 60 + om) - (ih * 60 + im);
      if (totalMin > 0) hours = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
    }

    return `
      <tr>
        <td class="fs-sm fw-600">${UI.formatDate(r.date)}</td>
        <td class="fs-sm text-muted">${dayName}</td>
        <td class="fs-sm">${r.in  || '—'}</td>
        <td class="fs-sm">${r.out || r.status === 'absent' ? (r.out || '—') : 'Not yet'}</td>
        <td class="fs-sm">${hours}</td>
        <td>${UI.statusBadge(r.status)}</td>
      </tr>`;
  }).join('');
}
