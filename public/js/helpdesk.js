/* ── Help Desk Controller ────────────────────────────────── */
let allTickets   = [];
let activeTicket = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('helpdesk');
  await loadTickets();
  bindActions();
});

async function loadTickets() {
  const data = await API.get('/api/helpdesk');
  if (!data?.success) return;
  allTickets = data.tickets;
  updateStats();
  renderTickets();
}

function updateStats() {
  const active = ['open', 'in_progress', 'reopened'];
  document.getElementById('statOpen').textContent     = allTickets.filter(t => active.includes(t.status)).length;
  document.getElementById('statResolved').textContent = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  document.getElementById('statCritical').textContent = allTickets.filter(t => t.priority === 'critical').length;
}

function getFiltered() {
  const status   = document.getElementById('filterTicketStatus')?.value   || '';
  const priority = document.getElementById('filterTicketPriority')?.value || '';
  return allTickets
    .filter(t => {
      if (status   && t.status   !== status)   return false;
      if (priority && t.priority !== priority) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderTickets() {
  const tickets = getFiltered();
  const el      = document.getElementById('ticketsList');

  if (!tickets.length) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-ticket-detailed"></i><h5>No tickets found</h5><p>No support tickets match your current filters.</p></div>`;
    return;
  }

  el.innerHTML = tickets.map(t => `
    <div class="ticket-card priority-${t.priority}" onclick="openTicketDetail('${t.id}')">
      <div class="d-flex align-items-start justify-content-between gap-3">
        <div style="flex:1;min-width:0">
          <div class="ticket-no">${t.ticketNo}</div>
          <div class="ticket-title">${t.title}</div>
          <div class="ticket-meta d-flex flex-wrap gap-2 mt-1">
            <span><i class="bi bi-tag me-1"></i>${t.category}</span>
            <span><i class="bi bi-person me-1"></i>${t.submittedByName || 'You'}</span>
            <span><i class="bi bi-clock me-1"></i>${UI.timeAgo(t.createdAt)}</span>
            ${t.comments.length ? `<span><i class="bi bi-chat me-1"></i>${t.comments.length} comment${t.comments.length > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <div class="d-flex flex-column align-items-end gap-2">
          ${UI.statusBadge(t.status)}
          ${UI.priorityBadge(t.priority)}
        </div>
      </div>
    </div>`).join('');
}

function openTicketDetail(id) {
  activeTicket = allTickets.find(t => t.id === id);
  if (!activeTicket) return;

  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('ticketDetailModal'));
  document.getElementById('ticketDetailNo').textContent = activeTicket.ticketNo;

  const commentsHtml = activeTicket.comments.length
    ? activeTicket.comments.filter(c => !c.isInternal).map(c => `
        <div class="comment-item">
          <div class="comment-header">
            <span class="comment-author">${c.name || c.by}</span>
            <span class="comment-time">${UI.formatDateTime(c.at)}</span>
          </div>
          <div class="comment-text">${c.text}</div>
        </div>`).join('')
    : '<div class="text-muted fs-sm py-2">No comments yet.</div>';

  const historyHtml = (activeTicket.history || []).map(h => `
    <div class="history-item">
      <span class="history-action">${h.action.replace(/_/g, ' ')}</span>
      · ${UI.formatDateTime(h.at)}
      ${h.note ? `<div class="text-muted" style="font-size:11px;margin-top:2px">${h.note}</div>` : ''}
    </div>`).join('') || '<div class="text-muted fs-sm py-2">No history yet.</div>';

  document.getElementById('ticketDetailBody').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><strong>Status:</strong> ${UI.statusBadge(activeTicket.status)}</div>
      <div class="col-sm-6"><strong>Priority:</strong> ${UI.priorityBadge(activeTicket.priority)}</div>
      <div class="col-sm-6"><strong>Category:</strong> <span class="fs-sm">${activeTicket.category}</span></div>
      <div class="col-sm-6"><strong>Submitted:</strong> <span class="fs-sm">${UI.formatDateTime(activeTicket.createdAt)}</span></div>
      ${activeTicket.assignedToName ? `<div class="col-sm-6"><strong>Assigned To:</strong> <span class="fs-sm">${activeTicket.assignedToName}</span></div>` : ''}
    </div>
    <div class="mb-4 p-3 rounded" style="background:var(--color-surface);border:1px solid var(--color-border)">
      <div class="fs-sm fw-600 mb-1">Description</div>
      <div class="fs-sm">${activeTicket.description}</div>
    </div>
    <div class="mb-3">
      <div class="fw-600 mb-2">Comments</div>
      <div id="ticketComments">${commentsHtml}</div>
    </div>
    <div class="input-group mb-4">
      <input type="text" class="form-control" id="ticketCommentInput" placeholder="Add a comment...">
      <button class="btn btn-primary" id="btnAddTicketComment"><i class="bi bi-send"></i></button>
    </div>
    <div class="mb-3">
      <div class="fw-600 mb-2">History</div>
      <div>${historyHtml}</div>
    </div>`;

  // Add comment handler
  const addComment = async () => {
    const text = document.getElementById('ticketCommentInput').value.trim();
    if (!text) return;
    const data = await API.put(`/api/helpdesk/${activeTicket.id}`, { comment: text });
    if (data?.success) {
      document.getElementById('ticketCommentInput').value = '';
      await loadTickets();
      openTicketDetail(activeTicket.id);
    }
  };
  document.getElementById('btnAddTicketComment')?.addEventListener('click', addComment);
  document.getElementById('ticketCommentInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addComment();
  });

  // Button visibility
  const isIT        = Layout.user?.role !== 'employee';
  const isSubmitter = activeTicket.submittedBy === Layout.user?.id;
  const status      = activeTicket.status;

  document.getElementById('btnStartWork')?.classList.toggle('d-none',
    !(isIT && (status === 'open' || status === 'reopened')));
  document.getElementById('btnResolveTicket')?.classList.toggle('d-none',
    !(isIT && status === 'in_progress'));
  document.getElementById('btnReopenTicket')?.classList.toggle('d-none',
    !(isSubmitter && status === 'resolved'));
  document.getElementById('btnCloseTicket')?.classList.toggle('d-none',
    !(isSubmitter && status === 'resolved'));

  modal.show();
}

function bindActions() {
  document.getElementById('filterTicketStatus')?.addEventListener('change', renderTickets);
  document.getElementById('filterTicketPriority')?.addEventListener('change', renderTickets);

  document.getElementById('btnNewTicket')?.addEventListener('click', () => {
    document.getElementById('ticketTitle').value = '';
    document.getElementById('ticketDesc').value  = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newTicketModal')).show();
  });

  document.getElementById('btnSubmitTicket')?.addEventListener('click', async () => {
    const title = document.getElementById('ticketTitle').value.trim();
    const desc  = document.getElementById('ticketDesc').value.trim();
    if (!title) return UI.toast('Title is required', 'warning');
    if (!desc)  return UI.toast('Description is required', 'warning');

    const data = await API.post('/api/helpdesk', {
      title,
      description: desc,
      category:    document.getElementById('ticketCategory').value,
      priority:    document.getElementById('ticketPriority').value
    });

    if (data?.success) {
      UI.toast('Ticket submitted successfully', 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newTicketModal')).hide();
      await loadTickets();
    } else {
      UI.toast(data?.message || 'Error submitting ticket', 'danger');
    }
  });

  // Unified workflow action helper
  async function doTicketAction(action, successMsg) {
    if (!activeTicket) return;
    const data = await API.put(`/api/helpdesk/${activeTicket.id}`, { action });
    if (data?.success) {
      UI.toast(successMsg, 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('ticketDetailModal')).hide();
      await loadTickets();
    } else {
      UI.toast(data?.message || 'Action failed', 'danger');
    }
  }

  document.getElementById('btnStartWork')?.addEventListener('click',    () => doTicketAction('start',   'Ticket is now In Progress'));
  document.getElementById('btnResolveTicket')?.addEventListener('click',() => doTicketAction('resolve', 'Ticket marked as Resolved'));
  document.getElementById('btnReopenTicket')?.addEventListener('click', () => doTicketAction('reopen',  'Ticket reopened'));
  document.getElementById('btnCloseTicket')?.addEventListener('click',  () => doTicketAction('close',   'Ticket closed'));
}
