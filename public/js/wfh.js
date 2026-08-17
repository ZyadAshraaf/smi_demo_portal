/* ── Work From Home Page Controller ──────────────────────── */
let allWfh      = [];
let activeWfh   = null;
let reviewAction = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('wfh');
  await loadWfh();
  bindActions();
});

async function loadWfh() {
  const data = await API.get('/api/wfh');
  if (!data?.success) return;
  allWfh = data.wfh;
  renderMyWfh();

  updateBalance();
}

function updateBalance() {
  const user    = Layout.user;
  const now     = new Date();
  const month   = now.getMonth();
  const year    = now.getFullYear();

  const myApproved = allWfh.filter(w => {
    if (w.userId !== user.id || w.status !== 'approved') return false;
    const d = new Date(w.startDate);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const usedDays = myApproved.reduce((s, w) => s + (w.days || 0), 0);
  const total    = 8;
  const remaining = Math.max(0, total - usedDays);
  const pct = Math.round((usedDays / total) * 100);

  document.getElementById('balWfhUsed').textContent      = usedDays;
  document.getElementById('balWfhRemaining').textContent = remaining;
  document.getElementById('balWfhBar').style.width       = `${Math.min(pct, 100)}%`;
}

function renderMyWfh() {
  const user  = Layout.user;
  const mine  = allWfh.filter(w => w.userId === user.id);
  const tbody = document.getElementById('myWfhBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-house-door"></i><h5>No WFH requests yet</h5><p>Submit your first work from home request above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(w => `
    <tr onclick="openWfhDrawer('${w.id}')" title="Click to view details">
      <td class="fs-sm">${UI.formatDate(w.startDate)}</td>
      <td class="fs-sm">${UI.formatDate(w.endDate)}</td>
      <td class="text-center fw-600">${w.days}</td>
      <td class="fs-sm text-muted" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.reason || '—'}</td>
      <td class="fs-sm">${UI.formatDate(w.submittedAt ? w.submittedAt.split('T')[0] : '')}</td>
      <td>${UI.statusBadge(w.status)}</td>
    </tr>`).join('');
}

/* ── WFH Detail Drawer ── */
function openWfhDrawer(id) {
  const w = allWfh.find(x => x.id === id);
  if (!w) return;

  const statusConfig = {
    approved: { icon: 'bi-check-circle-fill', sub: 'This request has been approved' },
    pending:  { icon: 'bi-clock-fill',        sub: 'Awaiting manager review' },
    rejected: { icon: 'bi-x-circle-fill',     sub: 'This request was not approved' }
  };
  const sc = statusConfig[w.status] || statusConfig.pending;

  // Header
  document.getElementById('wdTitle').textContent    = 'Work From Home';
  document.getElementById('wdSubtitle').textContent = `#${w.id}`;

  // Status banner
  const banner = document.getElementById('wdStatusBanner');
  banner.className = `ld-status-banner ${w.status}`;
  document.getElementById('wdStatusIcon').className = `ld-status-icon bi ${sc.icon} ${w.status}`;
  document.getElementById('wdStatusText').className = `ld-status-text ${w.status}`;
  document.getElementById('wdStatusText').textContent = w.status.charAt(0).toUpperCase() + w.status.slice(1);
  document.getElementById('wdStatusSub').textContent  = sc.sub;

  // Duration
  document.getElementById('wdDays').textContent      = w.days;
  document.getElementById('wdDateRange').textContent = `${UI.formatDate(w.startDate)} → ${UI.formatDate(w.endDate)}`;

  // Info grid
  document.getElementById('wdStart').textContent     = UI.formatDate(w.startDate);
  document.getElementById('wdEnd').textContent       = UI.formatDate(w.endDate);
  document.getElementById('wdSubmitted').textContent = w.submittedAt ? UI.formatDate(w.submittedAt.split('T')[0]) : '—';

  // Reason
  document.getElementById('wdReason').textContent = w.reason || 'No reason provided.';

  // Reviewer
  const reviewSection = document.getElementById('wdReviewSection');
  if (w.reviewerName) {
    reviewSection.style.display = '';
    document.getElementById('wdReviewerAvatar').textContent = w.reviewerName.charAt(0).toUpperCase();
    document.getElementById('wdReviewerName').textContent   = w.reviewerName;
    const noteEl = document.getElementById('wdReviewNote');
    if (w.reviewNote) {
      noteEl.textContent   = `"${w.reviewNote}"`;
      noteEl.style.display = '';
    } else {
      noteEl.style.display = 'none';
    }
  } else {
    reviewSection.style.display = 'none';
  }

  // Timeline
  const steps = [
    { label: 'Request Submitted',  sub: w.submittedAt ? UI.formatDate(w.submittedAt.split('T')[0]) : 'Submitted', done: true },
    { label: 'Under Review',       sub: 'Manager notified', done: w.status !== 'pending', active: w.status === 'pending' },
    { label: w.status === 'rejected' ? 'Request Rejected' : 'Request Approved',
      sub: w.reviewerName ? `By ${w.reviewerName}` : 'Pending',
      done: w.status === 'approved' || w.status === 'rejected',
      active: false,
      danger: w.status === 'rejected' }
  ];
  document.getElementById('wdTimeline').innerHTML = steps.map(s => `
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

  // Open drawer
  document.getElementById('wfhDrawer').classList.add('open');
  document.getElementById('wfhDrawerOverlay').classList.add('open');
}

function closeWfhDrawer() {
  document.getElementById('wfhDrawer').classList.remove('open');
  document.getElementById('wfhDrawerOverlay').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('wfhDrawerClose')?.addEventListener('click', closeWfhDrawer);
  document.getElementById('wfhDrawerOverlay')?.addEventListener('click', closeWfhDrawer);
});


function openReview(id, action) {
  activeWfh    = allWfh.find(w => w.id === id);
  reviewAction = action;

  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal'));
  document.getElementById('reviewModalTitle').textContent = action === 'approve' ? 'Approve WFH Request' : 'Reject WFH Request';
  document.getElementById('reviewWfhInfo').innerHTML = `
    <div class="fw-600">${activeWfh.userName}</div>
    <div class="fs-sm text-muted">Work From Home · ${activeWfh.days} day(s)</div>
    <div class="fs-sm">${UI.formatDate(activeWfh.startDate)} → ${UI.formatDate(activeWfh.endDate)}</div>`;
  document.getElementById('reviewNote').value = '';
  modal.show();
}

function bindActions() {
  // Open request modal
  document.getElementById('btnRequestWfh')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('wfhStart').value = '';
    document.getElementById('wfhEnd').value   = '';
    document.getElementById('wfhStart').min   = today;
    document.getElementById('wfhEnd').min     = today;
    document.getElementById('wfhDaysCalc').textContent = '—';
    document.getElementById('wfhReason').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('requestWfhModal')).show();
  });

  // Auto-calculate days
  ['wfhStart', 'wfhEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', calcDays);
  });

  // Submit request
  document.getElementById('btnSubmitWfh')?.addEventListener('click', async () => {
    const start  = document.getElementById('wfhStart').value;
    const end    = document.getElementById('wfhEnd').value;
    const reason = document.getElementById('wfhReason').value;

    if (!start || !end) return UI.toast('Please select start and end dates', 'warning');
    if (end < start)    return UI.toast('End date cannot be before start date', 'warning');

    const days = calcWorkingDays(new Date(start), new Date(end));
    if (days === 0)     return UI.toast('Selected dates contain no working days', 'warning');

    const data = await API.post('/api/wfh', { startDate: start, endDate: end, days, reason });

    if (data?.success) {
      UI.toast('WFH request submitted successfully', 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('requestWfhModal')).hide();
      await loadWfh();
    } else {
      UI.toast(data?.message || 'Error submitting request', 'danger');
    }
  });

  // Approve / Reject buttons in review modal
  document.getElementById('btnApprove')?.addEventListener('click', () => submitReview('approved'));
  document.getElementById('btnReject')?.addEventListener('click',  () => submitReview('rejected'));
}

async function submitReview(status) {
  if (!activeWfh) return;
  const note = document.getElementById('reviewNote').value;
  const data = await API.put(`/api/wfh/${activeWfh.id}`, { status, note });

  if (data?.success) {
    UI.toast(`WFH request ${status}`, status === 'approved' ? 'success' : 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal')).hide();
    await loadWfh();
  } else {
    UI.toast(data?.message || 'Error updating request', 'danger');
  }
}

function calcDays() {
  const start = document.getElementById('wfhStart').value;
  const end   = document.getElementById('wfhEnd').value;
  if (!start || !end || end < start) {
    document.getElementById('wfhDaysCalc').textContent = '—';
    return;
  }
  const days = calcWorkingDays(new Date(start), new Date(end));
  document.getElementById('wfhDaysCalc').textContent = days;
}

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
