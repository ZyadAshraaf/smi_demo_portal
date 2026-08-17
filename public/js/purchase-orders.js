/* ── Purchase Orders Controller ─────────────────────────── */
let allPOs      = [];
let activePO    = null;
let allVendors  = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('purchase-orders');
  await Promise.all([loadPOs(), loadVendors()]);
  bindActions();
});

/* ── Data Loading ──────────────────────────────────────── */
async function loadPOs() {
  const data = await API.get('/api/purchase-orders');
  if (!data?.success) return;
  allPOs = data.pos;
  renderStats();
  renderMyPOs();
}

async function loadVendors() {
  const data = await API.get('/api/purchase-orders/vendors');
  if (!data?.success) return;
  allVendors = data.vendors;
  const sel = document.getElementById('poVendor');
  allVendors.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.country})`;
    opt.dataset.name = v.name;
    opt.dataset.terms = v.paymentTerms;
    sel.appendChild(opt);
  });
}

/* ── Stats ─────────────────────────────────────────────── */
function renderStats() {
  const user    = Layout.user;
  const mine    = allPOs.filter(p => p.userId === user.id);
  const pending = mine.filter(p => p.status === 'pending').length;
  const approved= mine.filter(p => p.status === 'approved').length;
  const spend   = mine.filter(p => p.status === 'approved').reduce((s, p) => s + (p.grandTotal || 0), 0);

  document.getElementById('statTotal').textContent   = mine.length;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statApproved').textContent= approved;
  document.getElementById('statSpend').textContent   = spend.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── My POs Table ─────────────────────────────────────── */
function renderMyPOs() {
  const user  = Layout.user;
  const mine  = allPOs.filter(p => p.userId === user.id);
  const tbody = document.getElementById('myPOsBody');

  if (!mine.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-file-earmark-text"></i><h5>No purchase orders yet</h5><p>Create your first PO using the button above.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = mine.map(p => `
    <tr onclick="openPODrawer('${p.id}')">
      <td><span class="fw-700" style="color:var(--color-primary)">${p.poNumber}</span></td>
      <td class="fs-sm fw-600">${p.vendorName}</td>
      <td class="fs-sm">${p.costCenter}</td>
      <td class="fs-sm">${UI.formatDate(p.requiredBy)}</td>
      <td class="text-center">${p.lineItems.length}</td>
      <td class="text-end fw-700">${(p.grandTotal || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${UI.statusBadge(p.status)}</td>
      <td class="fs-sm">${p.reviewerName || '—'}</td>
    </tr>`).join('');
}


/* ── Detail Drawer ──────────────────────────────────────── */
function openPODrawer(id) {
  const p = allPOs.find(x => x.id === id);
  if (!p) return;

  const statusConfig = {
    approved: { icon: 'bi-check-circle-fill', sub: 'This PO has been approved and issued' },
    pending:  { icon: 'bi-clock-fill',        sub: 'Awaiting manager approval' },
    rejected: { icon: 'bi-x-circle-fill',     sub: 'This PO was not approved' }
  };
  const sc = statusConfig[p.status] || statusConfig.pending;

  document.getElementById('pdTitle').textContent    = p.poNumber;
  document.getElementById('pdSubtitle').textContent = p.vendorName;

  const banner = document.getElementById('pdStatusBanner');
  banner.className = `pd-status-banner ${p.status}`;
  document.getElementById('pdStatusIcon').className = `pd-status-icon bi ${sc.icon} ${p.status}`;
  document.getElementById('pdStatusText').className = `pd-status-text ${p.status}`;
  document.getElementById('pdStatusText').textContent = p.status.charAt(0).toUpperCase() + p.status.slice(1);
  document.getElementById('pdStatusSub').textContent  = sc.sub;

  const total = (p.grandTotal || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('pdGrandTotal').textContent = total;
  document.getElementById('pdCurrency').textContent   = `Grand Total (${p.currency || 'AED'})`;
  document.getElementById('pdTaxLine').textContent    = `Subtotal ${(p.subtotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})} + Tax ${p.taxPct||15}% = ${total}`;

  document.getElementById('pdInfoGrid').innerHTML = [
    { lbl: 'Vendor',           val: p.vendorName },
    { lbl: 'Payment Terms',    val: p.paymentTerms },
    { lbl: 'Delivery Location',val: p.deliveryLocation },
    { lbl: 'Required By',      val: UI.formatDate(p.requiredBy) },
    { lbl: 'Cost Center',      val: p.costCenter },
    { lbl: 'Submitted',        val: UI.formatDate(p.submittedAt) },
  ].map(i => `<div class="pd-info-item"><div class="pd-info-lbl">${i.lbl}</div><div class="pd-info-val">${i.val || '—'}</div></div>`).join('');

  document.getElementById('pdLineBody').innerHTML = (p.lineItems || []).map(li => `
    <tr>
      <td>${li.item}</td>
      <td class="text-center">${li.qty} ${li.unit}</td>
      <td class="text-center">${(li.unitPrice||0).toLocaleString('en-AE',{minimumFractionDigits:2})}</td>
      <td class="text-end fw-600">${(li.lineTotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})}</td>
    </tr>`).join('');

  document.getElementById('pdJustification').textContent = p.justification || 'No justification provided.';

  const reviewSection = document.getElementById('pdReviewSection');
  if (p.reviewerName) {
    reviewSection.style.display = '';
    document.getElementById('pdReviewerAvatar').textContent = p.reviewerName.charAt(0).toUpperCase();
    document.getElementById('pdReviewerName').textContent   = p.reviewerName;
    const noteEl = document.getElementById('pdReviewNote');
    if (p.reviewNote) { noteEl.textContent = `"${p.reviewNote}"`; noteEl.style.display = ''; }
    else               { noteEl.style.display = 'none'; }
  } else {
    reviewSection.style.display = 'none';
  }

  const steps = [
    { label: 'PO Submitted',      sub: UI.formatDate(p.submittedAt), done: true },
    { label: 'Under Review',      sub: 'Manager notified', done: p.status !== 'pending', active: p.status === 'pending' },
    { label: p.status === 'rejected' ? 'PO Rejected' : 'PO Approved & Issued',
      sub: p.reviewerName ? `By ${p.reviewerName}` : 'Pending',
      done: p.status === 'approved' || p.status === 'rejected',
      danger: p.status === 'rejected' }
  ];
  document.getElementById('pdTimeline').innerHTML = steps.map(s => `
    <div class="pd-tl-item">
      <div class="pd-tl-dot ${s.danger ? 'done' : s.done ? 'done' : s.active ? 'active' : 'grey'}"
           style="${s.danger ? 'background:#dc3545' : ''}">
        <i class="bi ${s.done ? (s.danger ? 'bi-x' : 'bi-check') : s.active ? 'bi-clock' : 'bi-circle'}"></i>
      </div>
      <div>
        <div class="pd-tl-label">${s.label}</div>
        <div class="pd-tl-sub">${s.sub}</div>
      </div>
    </div>`).join('');

  document.getElementById('poDrawer').classList.add('open');
  document.getElementById('poDrawerOverlay').classList.add('open');
}

function closePODrawer() {
  document.getElementById('poDrawer').classList.remove('open');
  document.getElementById('poDrawerOverlay').classList.remove('open');
}

/* ── Line Item Management ───────────────────────────────── */
function addLineItem() {
  const tbody = document.getElementById('lineItemsBody');
  const hint  = document.getElementById('lineItemsHint');
  if (hint) hint.style.display = 'none';

  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input class="form-control form-control-sm" type="text" placeholder="Item name" required></td>
    <td><input class="form-control form-control-sm" type="text" placeholder="Description"></td>
    <td><input class="form-control form-control-sm li-qty" type="number" min="1" value="1" style="width:65px" required></td>
    <td>
      <select class="form-select form-select-sm" style="width:75px">
        <option>pcs</option><option>box</option><option>kg</option><option>liter</option><option>set</option><option>m</option>
      </select>
    </td>
    <td><input class="form-control form-control-sm li-price" type="number" min="0" step="0.01" placeholder="0.00" style="width:110px" required></td>
    <td class="li-total text-end fw-600" style="color:var(--color-primary)">0.00</td>
    <td><button type="button" class="btn btn-sm text-danger p-0" onclick="removeLineItem(this)"><i class="bi bi-trash3"></i></button></td>
  `;
  row.querySelector('.li-qty').addEventListener('input', () => { recalcRow(row); recalcTotals(); });
  row.querySelector('.li-price').addEventListener('input', () => { recalcRow(row); recalcTotals(); });
  tbody.appendChild(row);
}

function removeLineItem(btn) {
  btn.closest('tr').remove();
  recalcTotals();
  if (!document.getElementById('lineItemsBody').children.length) {
    const hint = document.getElementById('lineItemsHint');
    if (hint) hint.style.display = '';
  }
}

function recalcRow(row) {
  const qty   = parseFloat(row.querySelector('.li-qty').value)   || 0;
  const price = parseFloat(row.querySelector('.li-price').value) || 0;
  const total = qty * price;
  row.querySelector('.li-total').textContent = total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  row.dataset.lineTotal = total;
}

function recalcTotals() {
  const rows     = document.getElementById('lineItemsBody').querySelectorAll('tr');
  let subtotal   = 0;
  rows.forEach(r => {
    const qty   = parseFloat(r.querySelector('.li-qty')?.value)   || 0;
    const price = parseFloat(r.querySelector('.li-price')?.value) || 0;
    subtotal   += qty * price;
  });
  const taxPct  = parseFloat(document.getElementById('poTaxPct').value) || 0;
  const taxAmt  = subtotal * taxPct / 100;
  const grand   = subtotal + taxAmt;

  const fmt = n => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('poSubtotal').textContent   = fmt(subtotal);
  document.getElementById('poTaxAmt').textContent     = fmt(taxAmt);
  document.getElementById('poGrandTotal').textContent = fmt(grand);
  document.getElementById('poTaxLabel').textContent   = `Tax (${taxPct}%)`;
}

function collectLineItems() {
  return Array.from(document.getElementById('lineItemsBody').querySelectorAll('tr')).map(row => {
    const inputs  = row.querySelectorAll('input');
    const qty     = parseFloat(row.querySelector('.li-qty').value)   || 0;
    const price   = parseFloat(row.querySelector('.li-price').value) || 0;
    return {
      item:        inputs[0].value.trim(),
      description: inputs[1].value.trim(),
      qty,
      unit:        row.querySelector('select').value,
      unitPrice:   price,
      lineTotal:   qty * price
    };
  });
}

/* ── Review Modal ───────────────────────────────────────── */
function openReview(id, action) {
  activePO = allPOs.find(p => p.id === id);
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal'));
  document.getElementById('reviewModalTitle').textContent = action === 'approve' ? 'Approve Purchase Order' : 'Reject Purchase Order';
  document.getElementById('reviewModal').dataset.action   = action;
  document.getElementById('reviewPOInfo').innerHTML = `
    <div class="fw-700">${activePO.poNumber} — ${activePO.vendorName}</div>
    <div class="fs-sm text-muted">${activePO.lineItems.length} item(s) · ${activePO.currency} ${(activePO.grandTotal||0).toLocaleString('en-AE',{minimumFractionDigits:2})}</div>
    <div class="fs-sm">Requested by ${activePO.userName} · Due ${UI.formatDate(activePO.requiredBy)}</div>`;
  document.getElementById('reviewNote').value = '';
  modal.show();
}

async function submitReview() {
  if (!activePO) return;
  const action = document.getElementById('reviewModal').dataset.action;
  const note   = document.getElementById('reviewNote').value;
  const url    = `/api/purchase-orders/${activePO.id}/${action === 'approve' ? 'approve' : 'reject'}`;
  const data   = await API.put(url, { note });

  if (data?.success) {
    UI.toast(`Purchase Order ${action === 'approve' ? 'approved' : 'rejected'} successfully`, action === 'approve' ? 'success' : 'warning');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal')).hide();
    await loadPOs();
  } else {
    UI.toast(data?.message || 'Error processing review', 'danger');
  }
}

/* ── Bind Events ────────────────────────────────────────── */
function bindActions() {
  // Open new PO modal
  document.getElementById('btnNewPO')?.addEventListener('click', () => {
    document.getElementById('lineItemsBody').innerHTML = '';
    document.getElementById('poVendor').value         = '';
    document.getElementById('poJustification').value  = '';
    document.getElementById('poRequiredBy').min       = new Date().toISOString().split('T')[0];
    document.getElementById('poTaxPct').value         = '15';
    recalcTotals();
    const hint = document.getElementById('lineItemsHint');
    if (hint) hint.style.display = '';
    addLineItem();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newPOModal')).show();
  });

  // Add line item
  document.getElementById('btnAddLine')?.addEventListener('click', addLineItem);

  // Tax % change
  document.getElementById('poTaxPct')?.addEventListener('input', recalcTotals);

  // Vendor selection — auto-fill payment terms
  document.getElementById('poVendor')?.addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    if (opt.dataset.terms) {
      document.getElementById('poPaymentTerms').value = opt.dataset.terms;
    }
  });

  // Submit new PO
  document.getElementById('btnSubmitPO')?.addEventListener('click', async () => {
    const vendorSel = document.getElementById('poVendor');
    const vendor    = allVendors.find(v => v.id === vendorSel.value);
    const delivery  = document.getElementById('poDelivery').value;
    const reqBy     = document.getElementById('poRequiredBy').value;
    const costCenter= document.getElementById('poCostCenter').value;
    const currency  = document.getElementById('poCurrency').value;
    const payTerms  = document.getElementById('poPaymentTerms').value;
    const taxPct    = parseFloat(document.getElementById('poTaxPct').value) || 0;
    const justif    = document.getElementById('poJustification').value.trim();
    const lineItems = collectLineItems();

    if (!vendor)     return UI.toast('Please select a vendor', 'warning');
    if (!delivery)   return UI.toast('Please select a delivery location', 'warning');
    if (!reqBy)      return UI.toast('Please set a required-by date', 'warning');
    if (!costCenter) return UI.toast('Please select a cost center', 'warning');
    if (!justif)     return UI.toast('Please provide a justification', 'warning');
    if (!lineItems.length) return UI.toast('Add at least one line item', 'warning');
    if (lineItems.some(li => !li.item || li.qty <= 0 || li.unitPrice <= 0)) {
      return UI.toast('All line items must have a name, quantity, and unit price', 'warning');
    }

    const subtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
    const taxAmount= subtotal * taxPct / 100;
    const grandTotal = subtotal + taxAmount;

    const btn = document.getElementById('btnSubmitPO');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Submitting...';

    const data = await API.post('/api/purchase-orders', {
      vendorId: vendor.id, vendorName: vendor.name,
      deliveryLocation: delivery, requiredBy: reqBy,
      costCenter, currency, paymentTerms: payTerms,
      lineItems, subtotal, taxPct, taxAmount, grandTotal, justification: justif
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Submit for Approval';

    if (data?.success) {
      UI.toast(`${data.po.poNumber} submitted for approval`, 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newPOModal')).hide();
      await loadPOs();
    } else {
      UI.toast(data?.message || 'Error submitting PO', 'danger');
    }
  });

  // Drawer close
  document.getElementById('poDrawerClose')?.addEventListener('click', closePODrawer);
  document.getElementById('poDrawerOverlay')?.addEventListener('click', closePODrawer);

  // Review approve / reject
  document.getElementById('btnApprove')?.addEventListener('click', submitReview);
  document.getElementById('btnReject')?.addEventListener('click',  submitReview);
}
