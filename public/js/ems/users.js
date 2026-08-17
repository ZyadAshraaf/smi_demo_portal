/* ═══════════════════════════════════════════════════════
   EMS — Users Tab Controller
   ═══════════════════════════════════════════════════════ */
const EMS_Users = (() => {
  let allUsers = [];

  async function init() {
    await loadUsers();
  }

  async function loadUsers() {
    const data = await API.get('/api/ems/users');
    if (data?.success) {
      allUsers = data.users;
      render();
    }
  }

  function render() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!allUsers.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = allUsers.map(u => {
      const groupBadges = u.emsGroups.map(g =>
        `<span class="badge me-1" style="font-size:10px;background:var(--color-primary);color:#fff;opacity:.85;">${g.name}</span>`
      ).join('') || '<span class="text-muted" style="font-size:11px;">No groups</span>';

      return `<tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="user-avatar-sidebar" style="width:30px;height:30px;font-size:12px;">${u.avatar || u.name?.charAt(0) || '?'}</div>
            <div>
              <div style="font-size:13px;font-weight:600;">${u.name}</div>
              <div style="font-size:11px;color:var(--color-text-muted);">${u.email}</div>
            </div>
          </div>
        </td>
        <td style="font-size:13px;">${u.department || '—'}</td>
        <td><span class="badge bg-secondary bg-opacity-10 text-secondary" style="font-size:10px;">${u.role}</span></td>
        <td>${groupBadges}</td>
        <td class="text-center"><span class="badge bg-info bg-opacity-10 text-info">${u.documentCount}</span></td>
      </tr>`;
    }).join('');
  }

  return { init, loadUsers };
})();
