/* ── Directory Controller ────────────────────────────────── */
let allUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('directory');
  await loadDirectory();
  bindSearch();
});

async function loadDirectory() {
  const [usersData, deptsData] = await Promise.all([
    API.get('/api/directory'),
    API.get('/api/directory/departments')
  ]);

  if (usersData?.success) {
    allUsers = usersData.users;
    renderGrid(allUsers);
    updateCount(allUsers.length);
  }

  if (deptsData?.success) {
    const select = document.getElementById('dirDeptFilter');
    deptsData.departments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = d;
      select.appendChild(opt);
    });
  }
}

function renderGrid(users) {
  const grid = document.getElementById('directoryGrid');

  if (!users.length) {
    grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-people"></i><h5>No employees found</h5><p>Try adjusting your search.</p></div></div>`;
    return;
  }

  const avatarColors = [getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()||'#001E57','#126660','#0D7BB5','#6f42c1','#fd7e14','#1A9E6A','#E6A817'];

  grid.innerHTML = users.map((u, i) => {
    const color = avatarColors[i % avatarColors.length];
    return `
      <div class="col-6 col-md-4 col-lg-3">
        <div class="emp-card" onclick="openProfile('${u.id}')">
          <div class="emp-avatar" style="background:${color}">${u.avatar || u.name.charAt(0)}</div>
          <div class="emp-name">${u.name}</div>
          <div class="emp-title">${u.jobTitle}</div>
          <span class="emp-dept">${u.department}</span>
          <div><span class="role-badge role-${u.role}">${u.role}</span></div>
          <div class="emp-contact">
            <a href="mailto:${u.email}" title="Email" onclick="event.stopPropagation()"><i class="bi bi-envelope"></i></a>
            ${u.phone ? `<a href="tel:${u.phone}" title="Call" onclick="event.stopPropagation()"><i class="bi bi-telephone"></i></a>` : ''}
            <a href="#" title="Message" onclick="event.stopPropagation()"><i class="bi bi-chat-dots"></i></a>
          </div>
        </div>
      </div>`;
  }).join('');
}

function openProfile(id) {
  const u = allUsers.find(u => u.id === id);
  if (!u) return;

  const avatarColors = [getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()||'#001E57','#126660','#0D7BB5','#6f42c1','#fd7e14','#1A9E6A','#E6A817'];
  const color = avatarColors[allUsers.indexOf(u) % avatarColors.length];

  document.getElementById('empProfileBody').innerHTML = `
    <div class="text-center mb-4">
      <div style="width:80px;height:80px;border-radius:50%;background:${color};color:white;font-size:32px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">${u.avatar || u.name.charAt(0)}</div>
      <h5 class="fw-700 mb-1">${u.name}</h5>
      <div class="text-muted fs-sm">${u.jobTitle}</div>
      <div class="mt-2"><span class="emp-dept">${u.department}</span> <span class="role-badge role-${u.role} ms-1">${u.role}</span></div>
    </div>
    <div class="row g-2">
      <div class="col-12">
        <div class="p-3 rounded" style="background:var(--color-surface);border:1px solid var(--color-border)">
          <div class="row g-2">
            <div class="col-6">
              <div class="fs-xs text-muted fw-600 text-uppercase">Email</div>
              <div class="fs-sm"><a href="mailto:${u.email}" class="text-primary">${u.email}</a></div>
            </div>
            ${u.phone ? `<div class="col-6"><div class="fs-xs text-muted fw-600 text-uppercase">Phone</div><div class="fs-sm">${u.phone}</div></div>` : ''}
            <div class="col-6">
              <div class="fs-xs text-muted fw-600 text-uppercase">Location</div>
              <div class="fs-sm">${u.location || '—'}</div>
            </div>
            <div class="col-6">
              <div class="fs-xs text-muted fw-600 text-uppercase">Join Date</div>
              <div class="fs-sm">${UI.formatDate(u.joinDate)}</div>
            </div>
            ${u.managerName ? `<div class="col-12"><div class="fs-xs text-muted fw-600 text-uppercase">Manager</div><div class="fs-sm fw-600">${u.managerName}</div></div>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('empProfileModal')).show();
}

function bindSearch() {
  const searchEl = document.getElementById('dirSearch');
  const deptEl   = document.getElementById('dirDeptFilter');

  const filter = () => {
    const q    = searchEl.value.toLowerCase();
    const dept = deptEl.value.toLowerCase();
    const filtered = allUsers.filter(u => {
      const matchQ    = !q || u.name.toLowerCase().includes(q) || u.jobTitle.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchDept = !dept || u.department.toLowerCase() === dept;
      return matchQ && matchDept;
    });
    renderGrid(filtered);
    updateCount(filtered.length);
  };

  searchEl?.addEventListener('input', filter);
  deptEl?.addEventListener('change', filter);
}

function updateCount(count) {
  document.getElementById('dirCount').textContent = `Showing ${count} employee${count !== 1 ? 's' : ''}`;
}
