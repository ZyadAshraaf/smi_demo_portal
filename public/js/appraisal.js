/* ═══════════════════════════════════════════════════════════
   Performance Management Controller — Premium Enterprise
   ═══════════════════════════════════════════════════════════ */

let allPlans      = [];
let currentPlan   = null;
let currentUser   = null;
let editingObjId  = null;
let trackingObjId = null;
let isMgrMode     = false;

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('appraisal');
  currentUser = Layout.user;
  await loadPlans();
});

async function loadPlans() {
  const data = await API.get('/api/appraisal');
  if (!data?.success) return;
  allPlans = data.plans;
  renderMain();
}

/* ── Screen switching ──────────────────────────────────── */
function showScreen(name) {
  document.querySelectorAll('.pm-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleAccord(hdr) {
  hdr.classList.toggle('open');
  const body = hdr.nextElementSibling;
  body.classList.toggle('open');
  hdr.querySelector('.chev').style.transform = hdr.classList.contains('open') ? 'rotate(90deg)' : '';
}

/* ═══════════════════════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════════════════════ */
function switchMainTab(tab) {
  document.getElementById('tab-current').classList.toggle('active', tab === 'current');
  document.getElementById('tab-history').classList.toggle('active', tab === 'history');
  document.getElementById('pane-current').classList.toggle('d-none', tab !== 'current');
  document.getElementById('pane-history').classList.toggle('d-none', tab !== 'history');
}

function renderMain() {
  const uid = currentUser?.id;

  const myActive  = allPlans.filter(p => p.userId === uid && p.appraisalStatus !== 'completed');
  const myHistory = allPlans.filter(p => p.userId === uid && p.appraisalStatus === 'completed');
  const pending   = allPlans.filter(p => p.userId !== uid && (
    p.objectivesStatus === 'pending-line-manager' || p.appraisalStatus === 'pending-line-manager'
  ));

  renderPlansTable(myActive);
  renderHistory(myHistory);
  renderPending(pending);
}

function renderPlansTable(plans) {
  const tbody = document.getElementById('plans-tbody');
  if (!plans.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4" style="font-size:13px">No active performance plans.</td></tr>';
    return;
  }
  tbody.innerHTML = plans.map(p => {
    const os = p.objectivesStatus || 'draft';
    const as = p.appraisalStatus || 'draft';
    // Determine which steps are enabled
    const canTrack = (os === 'approved');
    const canAppraisal = (os === 'approved');
    return `
      <tr>
        <td style="font-weight:600;color:var(--color-primary)">${p.planName}</td>
        <td>${fmtDate(p.startDate)}</td>
        <td>${fmtDate(p.endDate)}</td>
        <td style="text-align:center">
          <button class="step-btn step-btn-set" onclick="openSetObjectives('${p.id}',false)">Set</button>
          ${os !== 'draft' ? `<div style="margin-top:4px">${pillHtml(os)}</div>` : ''}
        </td>
        <td style="text-align:center">
          <button class="step-btn step-btn-track" ${!canTrack?'disabled':''} onclick="openTrack('${p.id}')">Track Progress</button>
        </td>
        <td style="text-align:center">
          <button class="step-btn step-btn-ap" ${!canAppraisal?'disabled':''} onclick="openAppraisal('${p.id}',false)">Appraisal</button>
          ${as !== 'draft' ? `<div style="margin-top:4px">${pillHtml(as)}</div>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function renderHistory(plans) {
  const grid = document.getElementById('history-grid');
  if (!plans.length) {
    grid.innerHTML = '<div class="text-muted py-4" style="font-size:13px">No performance history available.</div>';
    return;
  }
  // sort newest first
  plans.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  grid.innerHTML = plans.map(p => {
    const rating = p.finalRating || 0;
    const date   = p.completedAt ? p.completedAt.substring(0, 10) : p.appraisalDetails?.appraisalDate || '';
    const year   = p.endDate ? p.endDate.substring(0, 4) : '';
    const score  = p.finalScore ?? '';
    const label  = p.finalRatingLabel || '';
    return `
      <div class="hist-card" onclick="openAppraisal('${p.id}',false)">
        <div class="hist-card-top">${starsHtml(rating)}</div>
        <div class="hist-card-bot">
          <div class="hist-card-year">${year}</div>
          <div class="hist-card-date">${date}</div>
          <div class="hist-card-score">${score}</div>
          <div class="hist-card-label">${label}</div>
        </div>
      </div>`;
  }).join('');
}

function renderPending(plans) {
  const section = document.getElementById('pending-section');
  const list    = document.getElementById('pending-list');
  if (!plans.length) { section.classList.add('d-none'); return; }
  section.classList.remove('d-none');

  list.innerHTML = plans.map(p => {
    const isObj = p.objectivesStatus === 'pending-line-manager';
    const type  = isObj ? 'Setting Objectives' : 'Appraisal';
    const subDt = isObj ? p.objectivesSubmittedAt : p.appraisalSubmittedAt;
    const icon  = isObj ? 'bi-bullseye' : 'bi-clipboard2-check';
    return `
      <div class="inbox-card">
        <div class="inbox-icon"><i class="bi ${icon}"></i></div>
        <div class="inbox-info">
          <div class="inbox-title">${type} - Line Manager Approval</div>
          <div class="inbox-meta">
            <span><strong>Employee:</strong> ${p.userName || '—'}</span>
            <span><strong>Plan:</strong> ${p.planName}</span>
            <span><strong>Submitted:</strong> ${subDt ? fmtDateTime(subDt) : '—'}</span>
          </div>
        </div>
        <span class="pm-pill pill-pending"><i class="bi bi-clock"></i> PENDING</span>
        <button class="pm-btn pm-btn-primary pm-btn-sm" style="margin-left:8px"
          onclick="${isObj ? `openSetObjectives('${p.id}',true)` : `openAppraisal('${p.id}',true)`}">
          <i class="bi bi-eye"></i> Review
        </button>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   SET OBJECTIVES SCREEN
   ═══════════════════════════════════════════════════════════ */
function openSetObjectives(planId, mgrMode) {
  currentPlan = allPlans.find(p => p.id === planId);
  isMgrMode = mgrMode;
  renderObjectivesScreen();
  showScreen('objectives');
}

function renderObjectivesScreen() {
  const p = currentPlan;

  // Subtitle
  document.getElementById('obj-subtitle').textContent = `${p.planName} (${p.userName || ''})`;

  // Action buttons
  const acts = document.getElementById('obj-actions');
  if (isMgrMode) {
    acts.innerHTML = `
      <button class="pm-btn pm-btn-warn" onclick="returnObjectives()"><i class="bi bi-arrow-return-left"></i> Return for Correction to Employee</button>
      <button class="pm-btn pm-btn-success" onclick="approveObjectives()"><i class="bi bi-check-lg"></i> Approve</button>
      <button class="pm-btn pm-btn-outline" onclick="showScreen('main')">Back</button>`;
  } else {
    acts.innerHTML = `
      <button class="pm-btn pm-btn-primary" onclick="submitObjectives()"><i class="bi bi-send"></i> Submit</button>
      <button class="pm-btn pm-btn-success" onclick="saveObjectives()"><i class="bi bi-save"></i> Save</button>
      <button class="pm-btn pm-btn-outline" onclick="showScreen('main')">Cancel</button>`;
  }

  // Show/hide create button
  document.getElementById('obj-create-wrap').style.display =
    (isMgrMode && p.objectivesStatus !== 'pending-line-manager') ? 'none' : '';

  // Employee data
  document.getElementById('obj-emp-data').innerHTML = empDataHtml(p);

  // Objectives table
  renderObjList();
}

function renderObjList() {
  const tbody = document.getElementById('obj-list-tbody');
  const objs  = currentPlan?.objectives || [];

  // Weight pill
  const totalW = objs.reduce((s, o) => s + (o.weightingScale || 0), 0);
  document.getElementById('obj-weight-pill').textContent = `Total Weight: ${totalW} / 100`;
  document.getElementById('obj-weight-pill').className = `pm-pill ${totalW === 100 ? 'pill-approved' : totalW > 100 ? 'pill-returned' : 'pill-pending'}`;

  if (!objs.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted py-3 text-center" style="font-size:13px">No objectives added yet.</td></tr>';
    return;
  }
  tbody.innerHTML = objs.map(o => `
    <tr>
      <td style="color:var(--color-primary);font-weight:500">${o.name}</td>
      <td style="text-align:center"><button class="pm-btn pm-btn-primary pm-btn-sm" onclick="openObjModal('${o.id}')"><i class="bi bi-pencil"></i> Edit</button></td>
      <td style="text-align:center"><button class="pm-btn pm-btn-danger pm-btn-sm" onclick="deleteObjective('${o.id}')"><i class="bi bi-trash3"></i> Delete</button></td>
    </tr>`).join('');
}

function openObjModal(objId) {
  editingObjId = objId;
  const obj = objId ? currentPlan.objectives.find(o => o.id === objId) : null;

  document.getElementById('objModalTitle').textContent = obj ? 'Edit Objective' : 'Create Objective';
  document.getElementById('objModalSave').innerHTML = obj
    ? '<i class="bi bi-pencil-square"></i> Update'
    : '<i class="bi bi-plus-lg"></i> Add';

  document.getElementById('om-name').value         = obj?.name || '';
  document.getElementById('om-weight').value        = obj?.weightingScale || '';
  document.getElementById('om-startDate').value     = obj?.startDate || '';
  document.getElementById('om-group').value         = obj?.group || 'Customer';
  document.getElementById('om-priority').value      = obj?.priority || 'High';
  document.getElementById('om-appraise').checked    = obj?.appraise !== false;
  document.getElementById('om-measureStyle').value  = obj?.measurementStyle || 'Quantitative';
  document.getElementById('om-measureName').value   = obj?.measureName || '';
  document.getElementById('om-unitOfMeasure').value = obj?.unitOfMeasure || '';
  document.getElementById('om-measureType').value   = obj?.measureType || '';
  document.getElementById('om-targetValue').value   = obj?.targetValue || '';
  document.getElementById('om-description').value   = obj?.description || '';

  switchObjTab('measurement', document.querySelector('.obj-tab'));
  bootstrap.Modal.getOrCreateInstance(document.getElementById('objModal')).show();
}

function switchObjTab(tab, el) {
  document.querySelectorAll('.obj-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.obj-panel').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('otp-' + tab)?.classList.add('active');
}

async function saveObjective() {
  const name = document.getElementById('om-name').value.trim();
  if (!name) return UI.toast('Objective name is required', 'warning');

  const payload = {
    name, weightingScale: parseInt(document.getElementById('om-weight').value) || 0,
    startDate: document.getElementById('om-startDate').value,
    group: document.getElementById('om-group').value,
    priority: document.getElementById('om-priority').value,
    appraise: document.getElementById('om-appraise').checked,
    measurementStyle: document.getElementById('om-measureStyle').value,
    measureName: document.getElementById('om-measureName').value.trim(),
    unitOfMeasure: document.getElementById('om-unitOfMeasure').value,
    measureType: document.getElementById('om-measureType').value,
    targetValue: document.getElementById('om-targetValue').value.trim(),
    description: document.getElementById('om-description').value.trim()
  };

  let res;
  if (editingObjId) {
    res = await API.put(`/api/appraisal/${currentPlan.id}/objectives/item/${editingObjId}`, payload);
    if (res?.success) {
      const i = currentPlan.objectives.findIndex(o => o.id === editingObjId);
      if (i !== -1) currentPlan.objectives[i] = { ...currentPlan.objectives[i], ...payload };
    }
  } else {
    res = await API.post(`/api/appraisal/${currentPlan.id}/objectives/item`, payload);
    if (res?.success) currentPlan.objectives.push(res.objective);
  }

  if (res?.success) {
    UI.toast(editingObjId ? 'Objective updated' : 'Objective added', 'success');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('objModal')).hide();
    syncPlan();
    renderObjList();
  }
}

async function deleteObjective(objId) {
  if (!confirm('Are you sure you want to delete this objective?')) return;
  const res = await API.del(`/api/appraisal/${currentPlan.id}/objectives/item/${objId}`);
  if (res?.success) {
    currentPlan.objectives = currentPlan.objectives.filter(o => o.id !== objId);
    syncPlan();
    renderObjList();
    UI.toast('Objective deleted', 'success');
  }
}

async function saveObjectives() {
  const res = await API.put(`/api/appraisal/${currentPlan.id}/objectives/save`, { objectives: currentPlan.objectives });
  if (res?.success) UI.toast('Objectives saved as draft', 'success');
}

async function submitObjectives() {
  if (!currentPlan.objectives.length) return UI.toast('Please add at least one objective', 'warning');
  const totalW = currentPlan.objectives.reduce((s, o) => s + (o.weightingScale || 0), 0);
  if (totalW !== 100) return UI.toast(`Total weighting must equal 100 (currently ${totalW})`, 'warning');

  const res = await API.put(`/api/appraisal/${currentPlan.id}/objectives/submit`, { objectives: currentPlan.objectives });
  if (res?.success) {
    UI.toast('Objectives submitted for Line Manager approval', 'success');
    await loadPlans();
    showScreen('main');
  }
}

async function approveObjectives() {
  const res = await API.put(`/api/appraisal/${currentPlan.id}/objectives/approve`, { objectives: currentPlan.objectives });
  if (res?.success) {
    UI.toast('Objectives approved', 'success');
    await loadPlans();
    showScreen('main');
  }
}

async function returnObjectives() {
  const res = await API.put(`/api/appraisal/${currentPlan.id}/objectives/return`);
  if (res?.success) {
    UI.toast('Objectives returned to employee for correction', 'success');
    await loadPlans();
    showScreen('main');
  }
}

/* ═══════════════════════════════════════════════════════════
   TRACK PROGRESS SCREEN
   ═══════════════════════════════════════════════════════════ */
function openTrack(planId) {
  currentPlan = allPlans.find(p => p.id === planId);
  renderTrackScreen();
  showScreen('track');
}

function renderTrackScreen() {
  const p = currentPlan;
  document.getElementById('track-subtitle').textContent = `${p.planName} (${p.userName || ''})`;
  document.getElementById('track-emp-data').innerHTML = empDataHtml(p);

  const tbody = document.getElementById('track-tbody');
  const objs  = p.objectives || [];
  if (!objs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted py-3 text-center">No objectives to track.</td></tr>';
    return;
  }
  tbody.innerHTML = objs.map(o => `
    <tr>
      <td style="color:var(--color-primary);font-weight:500">${o.name}</td>
      <td>${o.complete != null ? `<span style="font-weight:600">${o.complete}%</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${o.actualAchievementDate || '<span class="text-muted">—</span>'}</td>
      <td style="text-align:center"><button class="pm-btn pm-btn-primary pm-btn-sm" onclick="openTrackEdit('${o.id}')"><i class="bi bi-pencil"></i> Edit</button></td>
    </tr>`).join('');
}

function openTrackEdit(objId) {
  trackingObjId = objId;
  const o = currentPlan.objectives.find(ob => ob.id === objId);
  if (!o) return;
  document.getElementById('tm-name').value        = o.name;
  document.getElementById('tm-complete').value    = o.complete ?? '';
  document.getElementById('tm-actualDate').value  = o.actualAchievementDate || '';
  document.getElementById('tm-comments').value    = o.comments || '';
  document.getElementById('tm-alignedWith').value = o.group || '';
  document.getElementById('tm-weight').value      = String(o.weightingScale || '');
  document.getElementById('tm-startDate').value   = o.startDate || '';
  document.getElementById('tm-targetDate').value  = o.targetDate || '';
  document.getElementById('tm-achieveDate').value = o.achievementDate || '';
  document.getElementById('tm-nextReviewer').value= o.nextReviewerDate || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('trackModal')).show();
}

function saveTrackEdit() {
  const o = currentPlan.objectives.find(ob => ob.id === trackingObjId);
  if (!o) return;
  o.complete               = document.getElementById('tm-complete').value !== '' ? Number(document.getElementById('tm-complete').value) : null;
  o.actualAchievementDate  = document.getElementById('tm-actualDate').value;
  o.comments               = document.getElementById('tm-comments').value;
  o.achievementDate        = document.getElementById('tm-achieveDate').value;
  o.nextReviewerDate       = document.getElementById('tm-nextReviewer').value;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('trackModal')).hide();
  renderTrackScreen();
  UI.toast('Progress updated', 'success');
}

async function saveTracking() {
  const updates = currentPlan.objectives.map(o => ({
    id: o.id, complete: o.complete, actualAchievementDate: o.actualAchievementDate,
    achievementDate: o.achievementDate, nextReviewerDate: o.nextReviewerDate, comments: o.comments
  }));
  const res = await API.put(`/api/appraisal/${currentPlan.id}/track`, { updates });
  if (res?.success) {
    UI.toast('Progress saved successfully', 'success');
    syncPlan();
    showScreen('main');
    renderMain();
  }
}

/* ═══════════════════════════════════════════════════════════
   APPRAISAL SCREEN
   ═══════════════════════════════════════════════════════════ */
function openAppraisal(planId, mgrMode) {
  currentPlan = allPlans.find(p => p.id === planId);
  isMgrMode = mgrMode;
  renderAppraisalScreen();
  showScreen('appraisal');
}

function renderAppraisalScreen() {
  const p          = currentPlan;
  const isCompleted= p.appraisalStatus === 'completed';
  const isPending  = p.appraisalStatus === 'pending-line-manager';
  const readonly   = isCompleted || (isPending && !isMgrMode);

  document.getElementById('ap-subtitle').textContent = `${p.planName} (${p.userName || ''})`;

  // Action buttons
  const acts = document.getElementById('ap-actions');
  if (isMgrMode && isPending) {
    acts.innerHTML = `
      <button class="pm-btn pm-btn-primary" onclick="shareAppraisee()"><i class="bi bi-share"></i> Share with Appraisee</button>
      <button class="pm-btn pm-btn-success" onclick="approveAppraisal()"><i class="bi bi-check-lg"></i> Approve</button>
      <button class="pm-btn pm-btn-danger" onclick="rejectAppraisal()"><i class="bi bi-x-lg"></i> Reject</button>
      <button class="pm-btn pm-btn-outline" onclick="showScreen('main')">Back</button>`;
  } else if (isCompleted) {
    acts.innerHTML = `<button class="pm-btn pm-btn-outline" onclick="showScreen('main')"><i class="bi bi-arrow-left"></i> Back</button>`;
  } else {
    const canSubmit = p.objectivesStatus === 'approved' && !isPending;
    acts.innerHTML = `
      ${canSubmit ? `<button class="pm-btn pm-btn-primary" onclick="saveAppraisal(true)"><i class="bi bi-send"></i> Submit</button>` : ''}
      <button class="pm-btn pm-btn-success" onclick="saveAppraisal(false)"><i class="bi bi-save"></i> Save</button>
      <button class="pm-btn pm-btn-outline" onclick="showScreen('main')">Cancel</button>`;
  }

  // Employee data
  document.getElementById('ap-emp-data').innerHTML = empDataHtml(p);

  // Appraisal details
  const d = p.appraisalDetails || {};
  document.getElementById('ap-periodStart').value = d.periodStartDate || '';
  document.getElementById('ap-periodEnd').value   = d.periodEndDate   || '';
  document.getElementById('ap-type').value        = d.typeOfAppraisal || '';
  document.getElementById('ap-date').value        = d.appraisalDate   || '';
  document.getElementById('ap-appraiser').value   = d.mainAppraiser   || p.reviewerName || '';
  ['ap-periodStart','ap-periodEnd','ap-type','ap-date'].forEach(id => { document.getElementById(id).disabled = readonly; });

  // Competencies table
  document.getElementById('ap-comp-tbody').innerHTML = (p.competencies || []).map((c, i) => `
    <tr>
      <td style="font-weight:500">${c.name}</td>
      <td>${readonly
        ? `<span class="pm-pill ${ratingPillClass(c.performanceRating)}">${c.performanceRating}</span>`
        : `<select class="perf-sel" onchange="currentPlan.competencies[${i}].performanceRating=this.value">
             <option ${c.performanceRating==='Failed to Meet the target'?'selected':''}>Failed to Meet the target</option>
             <option ${c.performanceRating==='Meet the target'?'selected':''}>Meet the target</option>
             <option ${c.performanceRating==='Exceed the target'?'selected':''}>Exceed the target</option>
           </select>`
      }</td>
      <td>${c.weighting}</td>
    </tr>`).join('');

  // Objectives table
  const apObjs = (p.objectives || []).filter(o => o.appraise !== false);
  document.getElementById('ap-obj-tbody').innerHTML = apObjs.map(o => `
    <tr>
      <td style="color:var(--color-primary);font-weight:500">${o.name}</td>
      <td>${fmtDate(o.startDate)}</td>
      <td style="font-weight:600">${o.weightingScale}</td>
      <td>${fmtDate(o.targetDate)}</td>
      <td>${o.achievementDate || '<span class="text-muted">—</span>'}</td>
      <td>${readonly
        ? `<span class="pm-pill ${ratingPillClass(o.appraisedPerformance)}">${o.appraisedPerformance || '—'}</span>`
        : `<select class="perf-sel" onchange="updateObjRating('${o.id}',this.value)">
             <option ${o.appraisedPerformance==='Failed to Meet the target'?'selected':''}>Failed to Meet the target</option>
             <option ${o.appraisedPerformance==='Meet the target'?'selected':''}>Meet the target</option>
             <option ${o.appraisedPerformance==='Exceed the target'?'selected':''}>Exceed the target</option>
           </select>`
      }</td>
      <td style="text-align:center"><button class="pm-btn pm-btn-primary pm-btn-sm" onclick="viewObjective('${o.id}')"><i class="bi bi-eye"></i> View</button></td>
    </tr>`).join('');

  // Overall rating
  const or = p.overallRating || {};
  document.getElementById('ap-totalRating').value   = or.totalOverallRating ?? '';
  document.getElementById('ap-justification').value = or.ratingJustification || '';
  document.getElementById('ap-overallRating').value = or.overallRating || '';
  document.getElementById('ap-feedback').value      = or.appraiseeFeedback || '';
  document.getElementById('ap-behavioral').value    = or.behavioralCompetencies || '';
  document.getElementById('ap-technical').value     = or.technicalCompetencies  || '';
  ['ap-justification','ap-overallRating','ap-feedback','ap-behavioral','ap-technical'].forEach(id => {
    document.getElementById(id).disabled = readonly;
  });
}

function updateObjRating(objId, value) {
  const o = currentPlan.objectives.find(ob => ob.id === objId);
  if (o) o.appraisedPerformance = value;
}

function checkOverallRating() {
  const scoreMap = { 'Failed to Meet the target': 0, 'Meet the target': 5, 'Exceed the target': 10 };
  const comps = currentPlan.competencies || [];
  const total = comps.reduce((sum, c) => sum + (scoreMap[c.performanceRating] || 0), 0);
  document.getElementById('ap-totalRating').value = total;
  if (!currentPlan.overallRating) currentPlan.overallRating = {};
  currentPlan.overallRating.totalOverallRating = total;

  const pct   = comps.length ? total / (comps.length * 10) * 100 : 0;
  const label = pct >= 90 ? 'Exceeds Expectations' : pct >= 70 ? 'Meets Expectations' : pct >= 50 ? 'Partially Meets Expectations' : 'Does Not Meet Expectations';
  if (!document.getElementById('ap-overallRating').value) {
    document.getElementById('ap-overallRating').value = label;
    currentPlan.overallRating.overallRating = label;
  }
  UI.toast(`Overall rating calculated: ${total}`, 'success');
}

function collectAppraisalBody() {
  return {
    appraisalDetails: {
      periodStartDate: document.getElementById('ap-periodStart').value,
      periodEndDate:   document.getElementById('ap-periodEnd').value,
      typeOfAppraisal: document.getElementById('ap-type').value,
      appraisalDate:   document.getElementById('ap-date').value,
      mainAppraiser:   document.getElementById('ap-appraiser').value
    },
    competencies: currentPlan.competencies,
    objectiveRatings: (currentPlan.objectives || []).map(o => ({ id: o.id, appraisedPerformance: o.appraisedPerformance })),
    overallRating: {
      totalOverallRating:     document.getElementById('ap-totalRating').value !== '' ? Number(document.getElementById('ap-totalRating').value) : null,
      ratingJustification:    document.getElementById('ap-justification').value,
      overallRating:          document.getElementById('ap-overallRating').value,
      appraiseeFeedback:      document.getElementById('ap-feedback').value,
      behavioralCompetencies: document.getElementById('ap-behavioral').value,
      technicalCompetencies:  document.getElementById('ap-technical').value
    }
  };
}

async function saveAppraisal(andSubmit) {
  const body = collectAppraisalBody();
  const url  = andSubmit ? `/api/appraisal/${currentPlan.id}/appraisal/submit` : `/api/appraisal/${currentPlan.id}/appraisal/save`;
  const res  = await API.put(url, body);
  if (res?.success) {
    UI.toast(andSubmit ? 'Appraisal submitted for Line Manager approval' : 'Appraisal saved', 'success');
    if (andSubmit) { await loadPlans(); showScreen('main'); }
  }
}

async function approveAppraisal() {
  const res = await API.put(`/api/appraisal/${currentPlan.id}/appraisal/approve`);
  if (res?.success) { UI.toast('Appraisal approved and completed', 'success'); await loadPlans(); showScreen('main'); }
}

async function rejectAppraisal() {
  const res = await API.put(`/api/appraisal/${currentPlan.id}/appraisal/reject`);
  if (res?.success) { UI.toast('Appraisal returned to employee', 'success'); await loadPlans(); showScreen('main'); }
}

function shareAppraisee() { UI.toast('Shared with appraisee', 'success'); }

/* ── Objective View Modal ──────────────────────────────── */
function viewObjective(objId) {
  const o = currentPlan.objectives.find(ob => ob.id === objId);
  if (!o) return;
  const fields = [
    ['Name', o.name], ['Group', o.group], ['Priority', o.priority],
    ['Weighting Scale', o.weightingScale], ['Start Date', fmtDate(o.startDate)], ['Target Date', fmtDate(o.targetDate)],
    ['Measurement Style', o.measurementStyle], ['Measure Name', o.measureName], ['Unit of Measure', o.unitOfMeasure],
    ['Target Value', o.targetValue], ['Complete', o.complete != null ? o.complete + '%' : '—'], ['Achievement Date', o.achievementDate || '—'],
    ['Comments', o.comments || '—'],
    ['Appraised Performance', `<span class="pm-pill ${ratingPillClass(o.appraisedPerformance)}">${o.appraisedPerformance || '—'}</span>`]
  ];
  document.getElementById('obj-view-body').innerHTML = `
    <div class="row g-3">${fields.map(([label, val]) =>
      `<div class="${label === 'Comments' ? 'col-12' : 'col-md-4'}">
        <label class="pm-label">${label}</label>
        <div style="font-size:13px;font-weight:500;color:var(--color-text)">${val}</div>
      </div>`
    ).join('')}</div>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('objViewModal')).show();
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
function syncPlan() {
  const i = allPlans.findIndex(p => p.id === currentPlan.id);
  if (i !== -1) allPlans[i] = { ...allPlans[i], objectives: currentPlan.objectives };
}

function empDataHtml(p) {
  return `<div class="emp-grid">
    <div class="emp-field"><label>Employee</label><span>${p.userName || '—'}</span></div>
    <div class="emp-field"><label>Department</label><span>${p.userDept || '—'}</span></div>
    <div class="emp-field"><label>Job Title</label><span>${p.userJobTitle || '—'}</span></div>
    <div class="emp-field"><label>Main Appraiser</label><span>${p.reviewerName || '—'}</span></div>
    <div class="emp-field"><label>Plan</label><span>${p.planName}</span></div>
    <div class="emp-field"><label>Period</label><span>${fmtDate(p.startDate)} - ${fmtDate(p.endDate)}</span></div>
  </div>`;
}

function starsHtml(count) {
  let h = '<div class="hist-stars">';
  for (let i = 1; i <= 5; i++) h += i <= count ? '<span class="s-on">★</span>' : '<span class="s-off">★</span>';
  return h + '</div>';
}

function pillHtml(status) {
  const m = {
    'draft': ['pill-draft', 'Draft'], 'pending-line-manager': ['pill-pending', 'Pending Approval'],
    'approved': ['pill-approved', 'Approved'], 'returned': ['pill-returned', 'Returned'],
    'completed': ['pill-completed', 'Completed'], 'submitted': ['pill-submitted', 'Submitted']
  };
  const [cls, lbl] = m[status] || ['pill-draft', status];
  return `<span class="pm-pill ${cls}">${lbl}</span>`;
}

function ratingPillClass(rating) {
  if (!rating) return 'pill-draft';
  if (rating.includes('Exceed')) return 'pill-approved';
  if (rating.includes('Meet')) return 'pill-pending';
  return 'pill-returned';
}

function fmtDate(d) { return d || '—'; }
function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' ' + dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
