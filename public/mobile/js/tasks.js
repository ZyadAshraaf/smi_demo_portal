// Approval endpoint routing map keyed on metadata field
const APPROVAL_MAP = {
  leaveId:  {
    approve: id => API.put(`/api/leaves/${id}`,  { status: 'approved' }),
    reject:  id => API.put(`/api/leaves/${id}`,  { status: 'rejected' })
  },
  wfhId: {
    approve: id => API.put(`/api/wfh/${id}`,     { status: 'approved' }),
    reject:  id => API.put(`/api/wfh/${id}`,     { status: 'rejected' })
  },
  travelId: {
    approve: id => API.put(`/api/travel/${id}`,  { status: 'approved' }),
    reject:  id => API.put(`/api/travel/${id}`,  { status: 'rejected' })
  },
  mrqId: {
    approve: id => API.put(`/api/material-requisitions/${id}/approve`, {}),
    reject:  id => API.put(`/api/material-requisitions/${id}/reject`,  {})
  },
  poId: {
    approve: id => API.put(`/api/purchase-orders/${id}/approve`, {}),
    reject:  id => API.put(`/api/purchase-orders/${id}/reject`,  {})
  },
  planId: null  // handled specially below (needs approvalType)
};

let allTasks    = [];
let activeFilter = 'all';
let activeTask   = null;
let _tasksInited = false;
let _userRole    = null;
let _userId      = null;

const HD_STATUS_MAP = {
  open: 'pending', reopened: 'pending',
  in_progress: 'in_progress',
  resolved: 'completed', closed: 'completed'
};

function normalizeHdTicket(t) {
  return {
    ...t,
    _isHelpdesk:  true,
    type:         'helpdesk',
    sourceSystem: 'IT',
    status:       HD_STATUS_MAP[t.status] || 'pending',
    _ticketStatus: t.status,
    dueDate:      null
  };
}

const Tasks = {
  async init() {
    if (!_tasksInited) {
      const me = await API.get('/api/me');
      _userRole = me?.user?.role || 'employee';
      _userId   = me?.user?.id   || null;
      bindFilterChips();
      bindSheet();
      _tasksInited = true;
    }
    await loadTasks();
  }
};

async function loadTasks() {
  const isEmployee = _userRole === 'employee';
  const [taskData, hdData] = await Promise.all([
    API.get('/api/tasks'),
    isEmployee ? Promise.resolve(null) : API.get('/api/helpdesk')
  ]);
  if (!taskData || !taskData.success) return;

  const hdTickets = (hdData?.tickets || []).map(normalizeHdTicket);
  allTasks = [...(taskData.tasks || []), ...hdTickets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  updateBadges();
  renderList();
}

function updateBadges() {
  const pending  = allTasks.filter(t => t.status === 'pending').length;
  const approval = allTasks.filter(t => t.type === 'approval' && t.status === 'pending').length;

  const pb = document.getElementById('pendingBadge');
  const ab = document.getElementById('approvalBadge');
  pb.textContent = pending;  pb.style.display = pending  ? '' : 'none';
  ab.textContent = approval; ab.style.display = approval ? '' : 'none';
}

function filterTasks() {
  if (activeFilter === 'all')       return allTasks;
  if (activeFilter === 'pending')   return allTasks.filter(t => t.status === 'pending');
  if (activeFilter === 'completed') return allTasks.filter(t => t.status === 'completed' || t.status === 'approved' || t.status === 'rejected');
  if (activeFilter === 'approval')  return allTasks.filter(t => t.type === 'approval' && t.status === 'pending');
  return allTasks;
}

function renderList() {
  const list = filterTasks();
  const el   = document.getElementById('taskList');
  if (!list.length) { el.innerHTML = '<div class="empty-state">No tasks found</div>'; return; }
  el.innerHTML = list.map(t => `
    <div class="task-card" data-id="${t.id}">
      <div class="task-card__title">${t.title}</div>
      ${t._isHelpdesk ? `<div style="font-size:11px;font-family:monospace;font-weight:700;color:var(--color-primary);margin-bottom:2px">${t.ticketNo}</div>` : ''}
      <div class="task-card__meta">
        ${hdStatusBadge(t)}
        ${priorityDot(t.priority)}
        <span>${t.sourceSystem || ''}</span>
        <span>${t._isHelpdesk ? fmtDate(t.createdAt) : (t.dueDate ? fmtDate(t.dueDate) : '')}</span>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => openSheet(card.dataset.id));
  });
}

function hdStatusBadge(t) {
  if (!t._isHelpdesk) return statusBadge(t.status);
  const map = {
    open:        ['Open',        '#e0f2fe', '#0369a1'],
    in_progress: ['In Progress', '#d1fae5', '#065f46'],
    resolved:    ['Resolved',    '#dcfce7', '#166534'],
    reopened:    ['Reopened',    '#fff3e0', '#b45309'],
    closed:      ['Closed',      '#f1f5f9', '#475569']
  };
  const [label, bg, color] = map[t._ticketStatus] || ['Open', '#e0f2fe', '#0369a1'];
  return `<span class="m-badge" style="background:${bg};color:${color}">${label}</span>`;
}

function bindFilterChips() {
  document.getElementById('filterChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');
    renderList();
  });
}

// ── Bottom sheet ───────────────────────────────────────────────────────────────
function bindSheet() {
  document.getElementById('sheetOverlay').addEventListener('click', closeSheet);
}

function openSheet(id) {
  activeTask = allTasks.find(t => t.id === id);
  if (!activeTask) return;
  renderSheet(activeTask);
  document.getElementById('sheetOverlay').classList.add('sheet-overlay--visible');
  document.getElementById('taskSheet').classList.add('bottom-sheet--open');
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('sheet-overlay--visible');
  document.getElementById('taskSheet').classList.remove('bottom-sheet--open');
  activeTask = null;
}

function renderSheet(task) {
  if (task._isHelpdesk) { renderHdSheet(task); return; }

  const meta       = task.metadata || {};
  const isApproval = task.type === 'approval' && task.status === 'pending';

  document.getElementById('sheetBody').innerHTML = `
    <div class="sheet-title">${task.title}</div>
    <div class="detail-row"><span class="detail-row__label">Status</span><span class="detail-row__value">${statusBadge(task.status)}</span></div>
    <div class="detail-row"><span class="detail-row__label">Priority</span><span class="detail-row__value">${task.priority || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Source</span><span class="detail-row__value">${task.sourceSystem || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Due Date</span><span class="detail-row__value">${fmtDate(task.dueDate)}</span></div>
    ${task.description ? `<div class="detail-row"><span class="detail-row__label">Description</span><span class="detail-row__value">${task.description}</span></div>` : ''}
    ${renderHistory(task.history || [])}
    ${isApproval ? `
      <div style="margin-top:14px">
        <div class="form-group">
          <label>Note (optional)</label>
          <textarea id="approvalNote" class="comment-input" rows="3" placeholder="Add a note…"></textarea>
        </div>
      </div>` : ''}
    ${(!isApproval && task.status !== 'completed') ? `
      <div style="margin-top:14px">
        <div class="form-group">
          <label>Comment</label>
          <textarea id="commentText" class="comment-input" rows="3" placeholder="Add a comment…"></textarea>
          <button class="btn btn--ghost" style="margin-top:8px" onclick="submitComment('${task.id}')">Post Comment</button>
        </div>
      </div>` : ''}
  `;

  const actions = document.getElementById('sheetActions');
  if (isApproval) {
    actions.innerHTML = `
      <button class="btn btn--danger"  onclick="doApproval('${task.id}','reject')">Reject</button>
      <button class="btn btn--primary" onclick="doApproval('${task.id}','approve')">Approve</button>
    `;
  } else if (task.type === 'task' && task.status !== 'completed') {
    actions.innerHTML = `
      <button class="btn btn--ghost"   onclick="closeSheet()">Close</button>
      <button class="btn btn--primary" onclick="markComplete('${task.id}')">Mark Complete</button>
    `;
  } else {
    actions.innerHTML = `<button class="btn btn--ghost btn--full" onclick="closeSheet()">Close</button>`;
  }
}

function renderHdSheet(ticket) {
  const comments    = (ticket.comments || []).filter(c => !c.isInternal);
  const isIT        = _userRole !== 'employee';
  const isSubmitter = ticket.submittedBy === _userId;
  const st          = ticket._ticketStatus;

  document.getElementById('sheetBody').innerHTML = `
    <div class="sheet-title">${ticket.title}</div>
    <div style="font-size:11px;font-family:monospace;font-weight:700;color:var(--color-primary);margin-bottom:10px">${ticket.ticketNo}</div>
    <div class="detail-row"><span class="detail-row__label">Status</span><span class="detail-row__value">${hdStatusBadge(ticket)}</span></div>
    <div class="detail-row"><span class="detail-row__label">Priority</span><span class="detail-row__value">${ticket.priority || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Category</span><span class="detail-row__value">${ticket.category || '—'}</span></div>
    <div class="detail-row"><span class="detail-row__label">Submitted</span><span class="detail-row__value">${fmtDate(ticket.createdAt)}</span></div>
    ${ticket.assignedToName ? `<div class="detail-row"><span class="detail-row__label">Assigned To</span><span class="detail-row__value">${ticket.assignedToName}</span></div>` : ''}
    ${ticket.description ? `<div class="detail-row"><span class="detail-row__label">Description</span><span class="detail-row__value">${ticket.description}</span></div>` : ''}
    ${comments.length ? `<div style="margin-top:12px"><strong style="font-size:13px;color:#475569">Comments</strong>${comments.map(c => `<div class="history-item"><strong>${c.name||c.by}</strong> · ${fmtDate(c.at)}<br>${c.text}</div>`).join('')}</div>` : ''}
  `;

  const actionBtns = [];
  if (isIT && (st === 'open' || st === 'reopened'))
    actionBtns.push(`<button class="btn btn--primary" onclick="doHdAction('${ticket.id}','start','Ticket is now In Progress')">Start Working</button>`);
  if (isIT && st === 'in_progress')
    actionBtns.push(`<button class="btn btn--primary" onclick="doHdAction('${ticket.id}','resolve','Ticket marked as Resolved')">Mark Resolved</button>`);
  if (isSubmitter && st === 'resolved')
    actionBtns.push(`<button class="btn btn--ghost" onclick="doHdAction('${ticket.id}','reopen','Ticket reopened')">Reopen</button>`);
  if (isSubmitter && st === 'resolved')
    actionBtns.push(`<button class="btn btn--danger" onclick="doHdAction('${ticket.id}','close','Ticket closed')">Close Ticket</button>`);

  document.getElementById('sheetActions').innerHTML = actionBtns.length
    ? `<button class="btn btn--ghost" onclick="closeSheet()">Dismiss</button>${actionBtns.join('')}`
    : `<button class="btn btn--ghost btn--full" onclick="closeSheet()">Close</button>`;
}

async function doHdAction(ticketId, action, successMsg) {
  const res = await API.put(`/api/helpdesk/${ticketId}`, { action });
  if (res?.success) {
    UI.toast(successMsg);
    closeSheet();
    await loadTasks();
  } else {
    UI.toast(res?.message || 'Action failed', 'error');
  }
}

function renderHistory(history) {
  if (!history.length) return '';
  return `<div style="margin-top:12px"><strong style="font-size:13px;color:#475569">History</strong>
    ${history.map(h => `<div class="history-item">${fmtDate(h.timestamp)} — ${h.action}${h.by ? ' by ' + h.by : ''}${h.note ? ': ' + h.note : ''}</div>`).join('')}
  </div>`;
}

async function doApproval(taskId, action) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const note = document.getElementById('approvalNote')?.value || '';
  const meta = task.metadata || {};

  let res;
  if (meta.planId) {
    const type     = meta.approvalType === 'objectives' ? 'objectives' : 'appraisal';
    const endpoint = action === 'approve'
      ? `/api/appraisal/${meta.planId}/${type}/approve`
      : `/api/appraisal/${meta.planId}/${type}/${type === 'objectives' ? 'return' : 'reject'}`;
    res = await API.put(endpoint, { note });
  } else {
    const key = Object.keys(APPROVAL_MAP).find(k => k !== 'planId' && meta[k]);
    if (!key) { UI.toast('Unknown approval type', 'error'); return; }
    res = await APPROVAL_MAP[key][action](meta[key], note);
  }

  if (res && res.success) {
    UI.toast(action === 'approve' ? 'Approved' : 'Rejected');
    closeSheet();
    await loadTasks();
  } else {
    UI.toast(res?.message || 'Action failed', 'error');
  }
}

async function markComplete(taskId) {
  const res = await API.put(`/api/tasks/${taskId}`, { status: 'completed' });
  if (res && res.success) {
    UI.toast('Task completed');
    closeSheet();
    await loadTasks();
  } else {
    UI.toast(res?.message || 'Failed', 'error');
  }
}

async function submitComment(taskId) {
  const text = document.getElementById('commentText')?.value?.trim();
  if (!text) return;
  const res = await API.post(`/api/tasks/${taskId}/comment`, { text });
  if (res && res.success) {
    UI.toast('Comment added');
    document.getElementById('commentText').value = '';
  } else {
    UI.toast('Failed to add comment', 'error');
  }
}
