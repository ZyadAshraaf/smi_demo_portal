/* ── Quick Services Page Controller ──────────────────────── */
let allLeaves = [];
let allWfh    = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('quick-services');
  await Promise.all([loadLeaves(), loadWfh()]);
  bindTabs();
  bindLeaveForm();
  bindWfhForm();
  bindDrawer();
});

/* ── Tab Switching ── */
function bindTabs() {
  document.querySelectorAll('.qs-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.qs-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.qs-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`qsPanel${btn.dataset.tab === 'leave' ? 'Leave' : 'Wfh'}`).classList.add('active');
    });
  });
}

/* ── Load Data ── */
async function loadLeaves() {
  const data = await API.get('/api/leaves');
  if (!data?.success) return;
  allLeaves = data.leaves;
  renderLeaves();
}

async function loadWfh() {
  const data = await API.get('/api/wfh');
  if (!data?.success) return;
  allWfh = data.wfh;
  renderWfh();
}

/* ── Render Leave Table ── */
function renderLeaves() {
  const user  = Layout.user;
  const mine  = allLeaves.filter(l => l.userId === user.id);
  const tbody = document.getElementById('qsLeavesBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-calendar-x"></i><h5>No leave requests yet</h5><p>Submit your first leave request above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(l => `
    <tr onclick="openDrawer('leave','${l.id}')" title="Click to view details">
      <td><span class="badge-custom" style="background:var(--color-primary-faint);color:var(--color-primary);text-transform:capitalize">${l.type}</span></td>
      <td class="fs-sm">${UI.formatDate(l.startDate)}</td>
      <td class="fs-sm">${UI.formatDate(l.endDate)}</td>
      <td class="text-center fw-600">${l.days}</td>
      <td class="fs-sm text-muted" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.reason || '—'}</td>
      <td>${UI.statusBadge(l.status)}</td>
      <td class="fs-sm">${l.reviewerName || '—'}</td>
    </tr>`).join('');
}

/* ── Render WFH Table ── */
function renderWfh() {
  const user  = Layout.user;
  const mine  = allWfh.filter(w => w.userId === user.id);
  const tbody = document.getElementById('qsWfhBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-house-door"></i><h5>No WFH requests yet</h5><p>Submit your first work from home request above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(w => `
    <tr onclick="openDrawer('wfh','${w.id}')" title="Click to view details">
      <td class="fs-sm">${UI.formatDate(w.startDate)}</td>
      <td class="fs-sm">${UI.formatDate(w.endDate)}</td>
      <td class="text-center fw-600">${w.days}</td>
      <td class="fs-sm text-muted" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.reason || '—'}</td>
      <td class="fs-sm">${UI.formatDate(w.submittedAt ? w.submittedAt.split('T')[0] : '')}</td>
      <td>${UI.statusBadge(w.status)}</td>
    </tr>`).join('');
}

/* ── Leave Form ── */
function bindLeaveForm() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('qsLeaveStart').min = today;
  document.getElementById('qsLeaveEnd').min   = today;

  ['qsLeaveStart', 'qsLeaveEnd'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const s = document.getElementById('qsLeaveStart').value;
      const e = document.getElementById('qsLeaveEnd').value;
      document.getElementById('qsLeaveDays').textContent = (s && e && e >= s) ? calcWorkingDays(new Date(s), new Date(e)) : '—';
    });
  });

  document.getElementById('qsBtnSubmitLeave').addEventListener('click', async () => {
    const start  = document.getElementById('qsLeaveStart').value;
    const end    = document.getElementById('qsLeaveEnd').value;
    const type   = document.getElementById('qsLeaveType').value;
    const reason = document.getElementById('qsLeaveReason').value;

    if (!start || !end) return UI.toast('Please select start and end dates', 'warning');
    if (end < start)    return UI.toast('End date cannot be before start date', 'warning');

    const days = calcWorkingDays(new Date(start), new Date(end));
    const data = await API.post('/api/leaves', { type, startDate: start, endDate: end, days, reason });

    if (data?.success) {
      UI.toast('Leave request submitted successfully', 'success');
      document.getElementById('qsLeaveStart').value  = '';
      document.getElementById('qsLeaveEnd').value    = '';
      document.getElementById('qsLeaveReason').value = '';
      document.getElementById('qsLeaveDays').textContent = '—';
      await loadLeaves();
    } else {
      UI.toast(data?.message || 'Error submitting request', 'danger');
    }
  });
}

/* ── WFH Form ── */
function bindWfhForm() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('qsWfhStart').min = today;
  document.getElementById('qsWfhEnd').min   = today;

  ['qsWfhStart', 'qsWfhEnd'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const s = document.getElementById('qsWfhStart').value;
      const e = document.getElementById('qsWfhEnd').value;
      document.getElementById('qsWfhDays').textContent = (s && e && e >= s) ? calcWorkingDays(new Date(s), new Date(e)) : '—';
    });
  });

  document.getElementById('qsBtnSubmitWfh').addEventListener('click', async () => {
    const start  = document.getElementById('qsWfhStart').value;
    const end    = document.getElementById('qsWfhEnd').value;
    const reason = document.getElementById('qsWfhReason').value;

    if (!start || !end) return UI.toast('Please select start and end dates', 'warning');
    if (end < start)    return UI.toast('End date cannot be before start date', 'warning');

    const days = calcWorkingDays(new Date(start), new Date(end));
    if (days === 0) return UI.toast('Selected dates contain no working days', 'warning');

    const data = await API.post('/api/wfh', { startDate: start, endDate: end, days, reason });

    if (data?.success) {
      UI.toast('WFH request submitted successfully', 'success');
      document.getElementById('qsWfhStart').value  = '';
      document.getElementById('qsWfhEnd').value    = '';
      document.getElementById('qsWfhReason').value = '';
      document.getElementById('qsWfhDays').textContent = '—';
      await loadWfh();
    } else {
      UI.toast(data?.message || 'Error submitting request', 'danger');
    }
  });
}

/* ── Detail Drawer ── */
function bindDrawer() {
  document.getElementById('qsDrawerClose').addEventListener('click', closeDrawer);
  document.getElementById('qsDrawerOverlay').addEventListener('click', closeDrawer);
}

function openDrawer(type, id) {
  const statusConfig = {
    approved: { icon: 'bi-check-circle-fill', sub: 'This request has been approved' },
    pending:  { icon: 'bi-clock-fill',        sub: 'Awaiting manager review' },
    rejected: { icon: 'bi-x-circle-fill',     sub: 'This request was not approved' }
  };

  let record, title, typeIcon;
  if (type === 'leave') {
    record = allLeaves.find(x => x.id === id);
    if (!record) return;
    const icons = { annual: 'bi-sun', sick: 'bi-heart-pulse', emergency: 'bi-lightning', unpaid: 'bi-wallet2' };
    typeIcon = icons[record.type] || 'bi-calendar-check';
    title = `${record.type.charAt(0).toUpperCase() + record.type.slice(1)} Leave`;
  } else {
    record = allWfh.find(x => x.id === id);
    if (!record) return;
    typeIcon = 'bi-house-door';
    title = 'Work From Home';
  }

  const sc = statusConfig[record.status] || statusConfig.pending;

  // Header
  document.getElementById('qdTypeIcon').innerHTML = `<i class="bi ${typeIcon}"></i>`;
  document.getElementById('qdTitle').textContent    = title;
  document.getElementById('qdSubtitle').textContent = `#${record.id.slice(0, 8).toUpperCase()}`;

  // Status banner
  document.getElementById('qdStatusBanner').className = `ld-status-banner ${record.status}`;
  document.getElementById('qdStatusIcon').className   = `ld-status-icon bi ${sc.icon} ${record.status}`;
  document.getElementById('qdStatusText').className   = `ld-status-text ${record.status}`;
  document.getElementById('qdStatusText').textContent  = record.status.charAt(0).toUpperCase() + record.status.slice(1);
  document.getElementById('qdStatusSub').textContent   = sc.sub;

  // Duration
  document.getElementById('qdDays').textContent      = record.days;
  document.getElementById('qdDateRange').textContent = `${UI.formatDate(record.startDate)} → ${UI.formatDate(record.endDate)}`;

  // Info grid
  const submitted = record.createdAt || record.submittedAt;
  let gridHTML = '';
  if (type === 'leave') {
    gridHTML = `
      <div class="ld-info-item"><div class="ld-info-lbl">Type</div><div class="ld-info-val">${record.type.charAt(0).toUpperCase() + record.type.slice(1)}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">Start Date</div><div class="ld-info-val">${UI.formatDate(record.startDate)}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">End Date</div><div class="ld-info-val">${UI.formatDate(record.endDate)}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">Submitted</div><div class="ld-info-val">${submitted ? UI.formatDate(submitted.split('T')[0]) : '—'}</div></div>`;
  } else {
    gridHTML = `
      <div class="ld-info-item"><div class="ld-info-lbl">Start Date</div><div class="ld-info-val">${UI.formatDate(record.startDate)}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">End Date</div><div class="ld-info-val">${UI.formatDate(record.endDate)}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">Days</div><div class="ld-info-val">${record.days}</div></div>
      <div class="ld-info-item"><div class="ld-info-lbl">Submitted</div><div class="ld-info-val">${submitted ? UI.formatDate(submitted.split('T')[0]) : '—'}</div></div>`;
  }
  document.getElementById('qdInfoGrid').innerHTML = gridHTML;

  // Reason
  document.getElementById('qdReason').textContent = record.reason || 'No reason provided.';

  // Reviewer
  const reviewSection = document.getElementById('qdReviewSection');
  if (record.reviewerName) {
    reviewSection.style.display = '';
    document.getElementById('qdReviewerAvatar').textContent = record.reviewerName.charAt(0).toUpperCase();
    document.getElementById('qdReviewerName').textContent   = record.reviewerName;
    const noteEl = document.getElementById('qdReviewNote');
    if (record.reviewNote) {
      noteEl.textContent   = `"${record.reviewNote}"`;
      noteEl.style.display = '';
    } else {
      noteEl.style.display = 'none';
    }
  } else {
    reviewSection.style.display = 'none';
  }

  // Timeline
  const submittedDate = submitted ? UI.formatDate(submitted.split('T')[0]) : 'Submitted';
  const steps = [
    { label: 'Request Submitted', sub: submittedDate, done: true },
    { label: 'Under Review', sub: 'Manager notified', done: record.status !== 'pending', active: record.status === 'pending' },
    { label: record.status === 'rejected' ? 'Request Rejected' : 'Request Approved',
      sub: record.reviewerName ? `By ${record.reviewerName}` : 'Pending',
      done: record.status === 'approved' || record.status === 'rejected',
      active: false,
      danger: record.status === 'rejected' }
  ];
  document.getElementById('qdTimeline').innerHTML = steps.map(s => `
    <div class="ld-tl-item">
      <div class="ld-tl-dot ${s.danger ? 'done' : s.done ? 'done' : s.active ? 'active' : 'grey'}"
           style="${s.danger ? 'background:#dc3545' : ''}">
        <i class="bi ${s.done ? (s.danger ? 'bi-x' : 'bi-check') : s.active ? 'bi-clock' : 'bi-circle'}"></i>
      </div>
      <div class="ld-tl-content">
        <div class="ld-tl-label">${s.label}</div>
        <div class="ld-tl-sub">${s.sub}</div>
      </div>
    </div>
  `).join('');

  // Open
  document.getElementById('qsDrawer').classList.add('open');
  document.getElementById('qsDrawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('qsDrawer').classList.remove('open');
  document.getElementById('qsDrawerOverlay').classList.remove('open');
}

/* ── Shared Helper ── */
function calcWorkingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
