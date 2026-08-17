/* ── Goals Page Controller ───────────────────────────────── */
let allGoals   = [];
let activeGoal = null;
let krCount    = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('goals');
  await loadGoals();
  bindActions();
});

async function loadGoals() {
  const data = await API.get('/api/goals');
  if (!data?.success) return;
  allGoals = data.goals;
  renderGoals();
}

function renderGoals() {
  const grid = document.getElementById('goalsGrid');
  if (!allGoals.length) {
    grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-bullseye"></i><h5>No goals yet</h5><p>Create your first goal to start tracking your progress.</p></div></div>`;
    return;
  }

  grid.innerHTML = allGoals.map(g => {
    const statusIcon  = { 'on-track': 'bi-check-circle-fill text-success', 'at-risk': 'bi-exclamation-circle-fill text-warning', 'behind': 'bi-x-circle-fill text-danger', 'completed': 'bi-trophy-fill text-primary' };
    const barColor    = g.progress >= 80 ? 'bg-success' : g.progress >= 50 ? '' : g.progress >= 25 ? 'bg-warning' : 'bg-danger';
    const krs         = (g.keyResults || []).slice(0, 3);

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="goal-card">
          <div class="goal-header">
            <div style="flex:1;min-width:0">
              <div class="goal-title">${g.title}</div>
              <div class="goal-category"><i class="bi bi-tag me-1"></i>${g.category} · Due ${UI.formatDate(g.dueDate)}</div>
            </div>
            <i class="bi ${statusIcon[g.status] || 'bi-circle'} fs-5"></i>
          </div>

          <div class="goal-progress-label">
            <span class="text-muted fs-sm">Progress</span>
            <span class="goal-progress-pct">${g.progress}%</span>
          </div>
          <div class="progress mb-3">
            <div class="progress-bar ${barColor}" style="width:${g.progress}%"></div>
          </div>

          ${krs.length ? `
            <div class="mb-3" style="border-top:1px solid var(--color-border-light);padding-top:10px">
              ${krs.map(kr => `
                <div class="kr-item">
                  <div class="kr-check ${kr.done ? 'done' : ''}">
                    ${kr.done ? '<i class="bi bi-check"></i>' : ''}
                  </div>
                  <span style="flex:1;font-size:12px;${kr.done ? 'text-decoration:line-through;color:var(--color-text-muted)' : ''}">${kr.title}</span>
                  <span class="fs-xs text-muted">${kr.progress}%</span>
                </div>`).join('')}
            </div>` : ''}

          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary flex-1" onclick="openUpdateProgress('${g.id}')">
              <i class="bi bi-graph-up me-1"></i>Update
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function openUpdateProgress(id) {
  activeGoal = allGoals.find(g => g.id === id);
  if (!activeGoal) return;

  const range  = document.getElementById('progressRange');
  const valEl  = document.getElementById('progressVal');
  const status = document.getElementById('goalStatusSelect');

  range.value  = activeGoal.progress;
  valEl.textContent = activeGoal.progress;
  status.value = activeGoal.status;

  range.addEventListener('input', () => { valEl.textContent = range.value; });

  bootstrap.Modal.getOrCreateInstance(document.getElementById('updateProgressModal')).show();
}

function bindActions() {
  // New Goal
  document.getElementById('btnNewGoal')?.addEventListener('click', () => {
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalDesc').value  = '';
    document.getElementById('krList').innerHTML = '';
    krCount = 0;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newGoalModal')).show();
  });

  // Add Key Result
  document.getElementById('btnAddKR')?.addEventListener('click', () => {
    krCount++;
    const kr = document.createElement('div');
    kr.className = 'input-group mb-2';
    kr.innerHTML = `
      <span class="input-group-text fs-sm fw-600" style="min-width:30px">KR${krCount}</span>
      <input type="text" class="form-control kr-input" placeholder="Describe this key result...">
      <button type="button" class="input-group-text text-danger" onclick="this.closest('.input-group').remove()"><i class="bi bi-trash"></i></button>`;
    document.getElementById('krList').appendChild(kr);
  });

  // Save Goal
  document.getElementById('btnSaveGoal')?.addEventListener('click', async () => {
    const title = document.getElementById('goalTitle').value.trim();
    if (!title) return UI.toast('Goal title is required', 'warning');

    const keyResults = [...document.querySelectorAll('.kr-input')]
      .map((el, i) => ({ id: `kr${Date.now()}_${i}`, title: el.value.trim(), progress: 0, done: false }))
      .filter(kr => kr.title);

    const data = await API.post('/api/goals', {
      title,
      description:  document.getElementById('goalDesc').value,
      category:     document.getElementById('goalCategory').value,
      startDate:    document.getElementById('goalStart').value,
      dueDate:      document.getElementById('goalDue').value,
      keyResults
    });

    if (data?.success) {
      UI.toast('Goal created successfully', 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newGoalModal')).hide();
      await loadGoals();
    } else {
      UI.toast(data?.message || 'Error creating goal', 'danger');
    }
  });

  // Save Progress
  document.getElementById('btnSaveProgress')?.addEventListener('click', async () => {
    if (!activeGoal) return;
    const data = await API.put(`/api/goals/${activeGoal.id}`, {
      progress: parseInt(document.getElementById('progressRange').value),
      status:   document.getElementById('goalStatusSelect').value
    });
    if (data?.success) {
      UI.toast('Progress updated', 'success');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('updateProgressModal')).hide();
      await loadGoals();
    }
  });
}
