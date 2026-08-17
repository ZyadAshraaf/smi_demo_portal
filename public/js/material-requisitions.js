/* ── Material Requisitions Controller ───────────────────── */
let allMRQs      = [];
let allMaterials = [];
let selectedItems= {};   // { materialCode: { ...material, qtyRequested } }
let activeMRQ    = null;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('material-requisitions');
  await Promise.all([loadMRQs(), loadMaterials()]);
  bindActions();
  // Pre-fill department from user
  const dept = document.getElementById('mrqDepartment');
  if (dept && Layout.user) dept.value = Layout.user.department || '';
});

/* ── Data Loading ──────────────────────────────────────── */
async function loadMRQs() {
  const data = await API.get('/api/material-requisitions');
  if (!data?.success) return;
  allMRQs = data.mrqs;
  renderStats();
  renderMyMRQs();
}

async function loadMaterials() {
  const data = await API.get('/api/material-requisitions/materials');
  if (!data?.success) return;
  allMaterials = data.materials;
  renderCatalog(allMaterials);
}

/* ── Stats ─────────────────────────────────────────────── */
function renderStats() {
  const user     = Layout.user;
  const mine     = allMRQs.filter(m => m.userId === user.id);
  const pending  = mine.filter(m => m.status === 'pending').length;
  const approved = mine.filter(m => m.status === 'approved').length;
  const items    = mine.reduce((s, m) => s + m.lineItems.reduce((a, li) => a + (li.qtyRequested || 0), 0), 0);

  document.getElementById('statTotal').textContent   = mine.length;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statApproved').textContent= approved;
  document.getElementById('statItems').textContent   = items;
}

/* ── My MRQs Table ─────────────────────────────────────── */
function renderMyMRQs() {
  const user  = Layout.user;
  const mine  = allMRQs.filter(m => m.userId === user.id);
  const tbody = document.getElementById('myMRQsBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-boxes"></i><h5>No requisitions yet</h5><p>Create your first requisition using the button above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(m => `
    <tr onclick="openMRQDrawer('${m.id}')">
      <td><span class="fw-700" style="color:var(--color-primary)">${m.mrqNumber}</span></td>
      <td class="fs-sm">${m.department}</td>
      <td class="fs-sm">${UI.formatDate(m.requiredBy)}</td>
      <td><span class="priority-badge-${m.priority}">${m.priority.charAt(0).toUpperCase() + m.priority.slice(1)}</span></td>
      <td class="text-center">${m.lineItems.length} line(s)</td>
      <td class="fs-sm">${m.deliveryLocation}</td>
      <td>${UI.statusBadge(m.status)}</td>
      <td class="fs-sm">${m.reviewerName || '—'}</td>
    </tr>`).join('');
}


/* ── Material Catalog ──────────────────────────────────── */
function stockBadge(stock) {
  if (stock === 0)   return `<span class="stock-badge stock-out">Out of stock</span>`;
  if (stock <= 5)    return `<span class="stock-badge stock-low">Low: ${stock}</span>`;
  return               `<span class="stock-badge stock-ok">In stock: ${stock}</span>`;
}

function renderCatalog(mats) {
  const container = document.getElementById('catalogResults');
  if (!mats.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:13px">No materials found</div>`;
    return;
  }

  const byCat = {};
  mats.forEach(m => {
    if (!byCat[m.category]) byCat[m.category] = [];
    byCat[m.category].push(m);
  });

  container.innerHTML = Object.entries(byCat).map(([cat, items]) => `
    <div class="catalog-category">${cat}</div>
    ${items.map(m => `
      <div class="catalog-item" onclick="addToSelected('${m.code}')">
        <div class="catalog-item-info">
          <div class="catalog-item-name">${m.name}</div>
          <div class="catalog-item-meta">${m.code} · ${m.uom} · ${m.warehouseLocation}</div>
        </div>
        ${stockBadge(m.stockOnHand)}
      </div>`).join('')}
  `).join('');
}

function filterCatalog() {
  const search = document.getElementById('matSearch').value.toLowerCase();
  const cat    = document.getElementById('matCategory').value;
  let mats     = allMaterials;
  if (search) mats = mats.filter(m => m.name.toLowerCase().includes(search) || m.code.toLowerCase().includes(search));
  if (cat !== 'all') mats = mats.filter(m => m.category === cat);
  renderCatalog(mats);
}

/* ── Selected Items ────────────────────────────────────── */
function addToSelected(code) {
  const mat = allMaterials.find(m => m.code === code);
  if (!mat) return;
  if (selectedItems[code]) {
    UI.toast(`${mat.name} is already in your list — adjust the quantity below`, 'info');
    return;
  }
  selectedItems[code] = { ...mat, qtyRequested: 1 };
  renderSelectedItems();
}

function removeFromSelected(code) {
  delete selectedItems[code];
  renderSelectedItems();
}

function renderSelectedItems() {
  const wrap  = document.getElementById('selectedItemsWrap');
  const tbody = document.getElementById('selectedItemsBody');
  const codes = Object.keys(selectedItems);

  if (!codes.length) {
    wrap.classList.add('d-none');
    return;
  }
  wrap.classList.remove('d-none');

  tbody.innerHTML = codes.map(code => {
    const m = selectedItems[code];
    return `
      <tr>
        <td class="fs-xs text-muted">${m.code}</td>
        <td class="fw-600 fs-sm">${m.name}</td>
        <td class="fs-sm">${m.category}</td>
        <td class="fs-sm">${m.uom}</td>
        <td>
          <input type="number" class="form-control form-control-sm" min="1" value="${m.qtyRequested}"
            style="width:70px"
            onchange="updateQty('${code}', this.value)">
        </td>
        <td class="text-center">${stockBadge(m.stockOnHand)}</td>
        <td>
          <button type="button" class="btn btn-sm text-danger p-0" onclick="removeFromSelected('${code}')">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

function updateQty(code, val) {
  if (selectedItems[code]) selectedItems[code].qtyRequested = Math.max(1, parseInt(val) || 1);
}

/* ── Detail Drawer ─────────────────────────────────────── */
function openMRQDrawer(id) {
  const m = allMRQs.find(x => x.id === id);
  if (!m) return;

  const statusConfig = {
    approved: { icon: 'bi-check-circle-fill', sub: 'Approved for issue from warehouse' },
    pending:  { icon: 'bi-clock-fill',        sub: 'Awaiting manager approval' },
    rejected: { icon: 'bi-x-circle-fill',     sub: 'This requisition was not approved' }
  };
  const sc = statusConfig[m.status] || statusConfig.pending;

  document.getElementById('mdTitle').textContent    = m.mrqNumber;
  document.getElementById('mdSubtitle').textContent = `${m.department} · ${m.deliveryLocation}`;

  const banner = document.getElementById('mdStatusBanner');
  banner.className = `md-status-banner ${m.status}`;
  document.getElementById('mdStatusIcon').className = `md-status-icon bi ${sc.icon} ${m.status}`;
  document.getElementById('mdStatusText').className = `md-status-text ${m.status}`;
  document.getElementById('mdStatusText').textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1);
  document.getElementById('mdStatusSub').textContent  = sc.sub;

  const totalQty = m.lineItems.reduce((s, li) => s + (li.qtyRequested || 0), 0);
  document.getElementById('mdTotalItems').textContent = m.lineItems.length;
  document.getElementById('mdTotalQty').textContent   = `${totalQty} total unit(s) requested`;

  document.getElementById('mdInfoGrid').innerHTML = [
    { lbl: 'Department',        val: m.department },
    { lbl: 'Delivery Location', val: m.deliveryLocation },
    { lbl: 'Required By',       val: UI.formatDate(m.requiredBy) },
    { lbl: 'Priority',          val: m.priority.charAt(0).toUpperCase() + m.priority.slice(1) },
    { lbl: 'Project Code',      val: m.projectCode || '—' },
    { lbl: 'Submitted',         val: UI.formatDate(m.submittedAt) },
  ].map(i => `<div class="md-info-item"><div class="md-info-lbl">${i.lbl}</div><div class="md-info-val">${i.val}</div></div>`).join('');

  document.getElementById('mdLineBody').innerHTML = m.lineItems.map(li => `
    <tr>
      <td class="text-muted" style="font-size:11px">${li.materialCode}</td>
      <td class="fw-600">${li.materialName}</td>
      <td>${li.uom}</td>
      <td class="text-end fw-700">${li.qtyRequested}</td>
      <td class="text-end">${stockBadge(li.stockAvailable)}</td>
    </tr>`).join('');

  document.getElementById('mdJustification').textContent = m.justification || 'No justification provided.';

  const reviewSection = document.getElementById('mdReviewSection');
  if (m.reviewerName) {
    reviewSection.style.display = '';
    document.getElementById('mdReviewerAvatar').textContent = m.reviewerName.charAt(0).toUpperCase();
    document.getElementById('mdReviewerName').textContent   = m.reviewerName;
    const noteEl = document.getElementById('mdReviewNote');
    if (m.reviewNote) { noteEl.textContent = `"${m.reviewNote}"`; noteEl.style.display = ''; }
    else               { noteEl.style.display = 'none'; }
  } else {
    reviewSection.style.display = 'none';
  }

  const steps = [
    { label: 'Requisition Submitted', sub: UI.formatDate(m.submittedAt), done: true },
    { label: 'Under Review',          sub: 'Manager notified', done: m.status !== 'pending', active: m.status === 'pending' },
    { label: m.status === 'rejected' ? 'Requisition Rejected' : 'Approved for Issue',
      sub: m.reviewerName ? `By ${m.reviewerName}` : 'Pending',
      done: m.status === 'approved' || m.status === 'rejected',
      danger: m.status === 'rejected' }
  ];
  document.getElementById('mdTimeline').innerHTML = steps.map(s => `
    <div class="md-tl-item">
      <div class="md-tl-dot ${s.danger ? 'done' : s.done ? 'done' : s.active ? 'active' : 'grey'}"
           style="${s.danger ? 'background:#dc3545' : ''}">
        <i class="bi ${s.done ? (s.danger ? 'bi-x' : 'bi-check') : s.active ? 'bi-clock' : 'bi-circle'}"></i>
      </div>
      <div>
        <div class="md-tl-label">${s.label}</div>
        <div class="md-tl-sub">${s.sub}</div>
      </div>
    </div>`).join('');

  document.getElementById('mrDrawer').classList.add('open');
  document.getElementById('mrDrawerOverlay').classList.add('open');
}

function closeMRQDrawer() {
  document.getElementById('mrDrawer').classList.remove('open');
  document.getElementById('mrDrawerOverlay').classList.remove('open');
}

/* ── Review Modal ──────────────────────────────────────── */
function openReview(id, action) {
  activeMRQ = allMRQs.find(m => m.id === id);
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal'));
  document.getElementById('reviewModalTitle').textContent = action === 'approve' ? 'Approve Requisition' : 'Reject Requisition';
  document.getElementById('reviewModal').dataset.action   = action;
  const totalQty = activeMRQ.lineItems.reduce((s, li) => s + (li.qtyRequested || 0), 0);
  document.getElementById('reviewMRQInfo').innerHTML = `
    <div class="fw-700">${activeMRQ.mrqNumber} — ${activeMRQ.department}</div>
    <div class="fs-sm text-muted">${activeMRQ.lineItems.length} material line(s) · ${totalQty} total units</div>
    <div class="fs-sm">Requested by ${activeMRQ.userName} · Due ${UI.formatDate(activeMRQ.requiredBy)}</div>`;
  document.getElementById('reviewNote').value = '';
  modal.show();
}

async function submitReview() {
  if (!activeMRQ) return;
  const action = document.getElementById('reviewModal').dataset.action;
  const note   = document.getElementById('reviewNote').value;
  const url    = `/api/material-requisitions/${activeMRQ.id}/${action === 'approve' ? 'approve' : 'reject'}`;
  const data   = await API.put(url, { note });

  if (data?.success) {
    UI.toast(`Requisition ${action === 'approve' ? 'approved' : 'rejected'} successfully`, action === 'approve' ? 'success' : 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal')).hide();
    await loadMRQs();
  } else {
    UI.toast(data?.message || 'Error processing review', 'danger');
  }
}

/* ── Bind Events ────────────────────────────────────────── */
function bindActions() {
  // Open new MRQ modal
  document.getElementById('btnNewMRQ')?.addEventListener('click', () => {
    selectedItems = {};
    renderSelectedItems();
    const dept = document.getElementById('mrqDepartment');
    if (dept && Layout.user) dept.value = Layout.user.department || '';
    document.getElementById('mrqRequiredBy').min = new Date().toISOString().split('T')[0];
    document.getElementById('mrqJustification').value = '';
    document.getElementById('mrqPriority').value = 'normal';
    document.getElementById('matSearch').value  = '';
    document.getElementById('matCategory').value= 'all';
    renderCatalog(allMaterials);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newMRQModal')).show();
  });

  // Catalog search & filter
  document.getElementById('matSearch')?.addEventListener('input', filterCatalog);
  document.getElementById('matCategory')?.addEventListener('change', filterCatalog);

  // Submit new MRQ
  document.getElementById('btnSubmitMRQ')?.addEventListener('click', async () => {
    const dept   = document.getElementById('mrqDepartment').value.trim();
    const loc    = document.getElementById('mrqDelivery').value;
    const reqBy  = document.getElementById('mrqRequiredBy').value;
    const prio   = document.getElementById('mrqPriority').value;
    const proj   = document.getElementById('mrqProject').value.trim();
    const justif = document.getElementById('mrqJustification').value.trim();
    const codes  = Object.keys(selectedItems);

    if (!dept)   return UI.toast('Please enter your department', 'warning');
    if (!reqBy)  return UI.toast('Please set a required-by date', 'warning');
    if (!justif) return UI.toast('Please provide a justification', 'warning');
    if (!codes.length) return UI.toast('Add at least one material from the catalog', 'warning');

    const lineItems = codes.map(code => {
      const m = selectedItems[code];
      return {
        materialCode:   m.code,
        materialName:   m.name,
        category:       m.category,
        uom:            m.uom,
        qtyRequested:   m.qtyRequested,
        stockAvailable: m.stockOnHand
      };
    });

    const btn = document.getElementById('btnSubmitMRQ');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Submitting...';

    const data = await API.post('/api/material-requisitions', {
      department: dept, deliveryLocation: loc,
      requiredBy: reqBy, priority: prio,
      projectCode: proj, lineItems, justification: justif
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Submit for Approval';

    if (data?.success) {
      UI.toast(`${data.mrq.mrqNumber} submitted for approval`, 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newMRQModal')).hide();
      await loadMRQs();
    } else {
      UI.toast(data?.message || 'Error submitting requisition', 'danger');
    }
  });

  // Drawer close
  document.getElementById('mrDrawerClose')?.addEventListener('click', closeMRQDrawer);
  document.getElementById('mrDrawerOverlay')?.addEventListener('click', closeMRQDrawer);

  // Review approve / reject
  document.getElementById('btnApprove')?.addEventListener('click', submitReview);
  document.getElementById('btnReject')?.addEventListener('click',  submitReview);
}
