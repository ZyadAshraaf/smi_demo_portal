/* ═══════════════════════════════════════════════════════
   EMS — Groups Tab Controller
   ═══════════════════════════════════════════════════════ */
const EMS_Groups = (() => {
  let allGroups = [];
  let allUsers = [];

  async function init() {
    await loadGroups();
    bindEvents();
  }

  async function loadGroups() {
    const [gData, uData] = await Promise.all([
      API.get('/api/ems/groups'),
      API.get('/api/ems/users')
    ]);
    if (gData?.success) allGroups = gData.groups;
    if (uData?.success) allUsers = uData.users;
    render();
  }

  function render() {
    const tbody = document.getElementById('groupsTableBody');
    if (!tbody) return;

    if (!allGroups.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No groups created yet</td></tr>';
      return;
    }

    tbody.innerHTML = allGroups.map(g => `
      <tr>
        <td class="fw-bold">${g.name}</td>
        <td class="text-muted" style="font-size:13px;">${g.description || '—'}</td>
        <td><span class="badge text-white" style="background:var(--color-primary)">${g.members.length}</span></td>
        <td><span class="badge bg-success bg-opacity-10 text-success">${g.permissions.length} folders</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="EMS_Groups.showDetail('${g.id}')"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="EMS_Groups.deleteGroup('${g.id}')"><i class="bi bi-trash3"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function bindEvents() {
    document.getElementById('btnNewGroup')?.addEventListener('click', () => {
      document.getElementById('groupName').value = '';
      document.getElementById('groupDesc').value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newGroupModal')).show();
    });

    document.getElementById('btnCreateGroup')?.addEventListener('click', async () => {
      const name = document.getElementById('groupName').value.trim();
      if (!name) return UI.toast('Group name is required', 'warning');
      const data = await API.post('/api/ems/groups', {
        name,
        description: document.getElementById('groupDesc').value.trim()
      });
      if (data?.success) {
        UI.toast('Group created');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('newGroupModal')).hide();
        await loadGroups();
      }
    });
  }

  async function showDetail(groupId) {
    const data = await API.get(`/api/ems/groups/${groupId}`);
    if (!data?.success) return;
    const group = data.group;
    const folders = FolderTree.getFolders();

    const membersHtml = group.memberDetails.map(m => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <div class="user-avatar-sidebar" style="width:28px;height:28px;font-size:11px;">${m.name?.charAt(0) || '?'}</div>
        <div>
          <div style="font-size:13px;font-weight:600;">${m.name}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${m.department || ''} — ${m.role || ''}</div>
        </div>
        <button class="btn btn-sm btn-link text-danger ms-auto" onclick="EMS_Groups.removeMember('${groupId}','${m.id}')"><i class="bi bi-x-lg"></i></button>
      </div>
    `).join('');

    const permsHtml = group.permissions.map(p => {
      const folder = folders.find(f => f.id === p.folderId);
      return `<div class="d-flex align-items-center gap-2 mb-2">
        <i class="bi bi-folder text-primary"></i>
        <span style="font-size:13px;">${folder?.name || p.folderId}</span>
        <span class="badge bg-${p.level === 'admin' ? 'danger' : p.level === 'write' ? 'warning' : 'info'} bg-opacity-10 text-${p.level === 'admin' ? 'danger' : p.level === 'write' ? 'warning' : 'info'} ms-auto">${p.level}</span>
        ${p.inherited ? '<small class="text-muted">(inherited)</small>' : ''}
      </div>`;
    }).join('') || '<span class="text-muted">No folder permissions</span>';

    // Build add member dropdown (users not already in group)
    const nonMembers = allUsers.filter(u => !group.members.includes(u.id));
    const addMemberHtml = nonMembers.length ? `
      <div class="mt-3 d-flex gap-2">
        <select class="form-select form-select-sm" id="addMemberSelect">
          ${nonMembers.map(u => `<option value="${u.id}">${u.name} (${u.department})</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-primary" onclick="EMS_Groups.addMember('${groupId}')">Add</button>
      </div>` : '';

    // Build add permission controls
    const folderOptions = FolderTree.getFolderOptions();
    const addPermHtml = `
      <div class="mt-3 d-flex gap-2">
        <select class="form-select form-select-sm" id="addPermFolder">
          ${folderOptions.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
        </select>
        <select class="form-select form-select-sm" id="addPermLevel" style="width:100px;">
          <option value="read">Read</option>
          <option value="write">Write</option>
          <option value="admin">Admin</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="EMS_Groups.addPermission('${groupId}')">Add</button>
      </div>`;

    document.getElementById('groupDetailBody').innerHTML = `
      <div class="row">
        <div class="col-md-6">
          <h6 class="fw-bold mb-3">Members (${group.members.length})</h6>
          ${membersHtml}
          ${addMemberHtml}
        </div>
        <div class="col-md-6">
          <h6 class="fw-bold mb-3">Folder Permissions</h6>
          ${permsHtml}
          ${addPermHtml}
        </div>
      </div>`;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('groupDetailModal')).show();
  }

  async function addMember(groupId) {
    const userId = document.getElementById('addMemberSelect')?.value;
    if (!userId) return;
    const data = await API.post(`/api/ems/groups/${groupId}/members`, { userIds: [userId] });
    if (data?.success) { UI.toast('Member added'); await loadGroups(); showDetail(groupId); }
  }

  async function removeMember(groupId, userId) {
    if (!confirm('Remove this member?')) return;
    const data = await API.del(`/api/ems/groups/${groupId}/members/${userId}`);
    if (data?.success) { UI.toast('Member removed'); await loadGroups(); showDetail(groupId); }
  }

  async function addPermission(groupId) {
    const folderId = document.getElementById('addPermFolder')?.value;
    const level = document.getElementById('addPermLevel')?.value;
    if (!folderId || !level) return;
    const data = await API.post(`/api/ems/groups/${groupId}/permissions`, { folderId, level, inherited: true });
    if (data?.success) { UI.toast('Permission added'); showDetail(groupId); }
  }

  async function deleteGroup(groupId) {
    if (!confirm('Delete this group?')) return;
    const data = await API.del(`/api/ems/groups/${groupId}`);
    if (data?.success) { UI.toast('Group deleted'); await loadGroups(); }
  }

  return { init, loadGroups, showDetail, addMember, removeMember, addPermission, deleteGroup };
})();
