/* ═══════════════════════════════════════════════════════
   EMS — Main Controller (Tab switching, Init)
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('ems');

  // Store current user info for permission checks
  const meData = await API.get('/api/me');
  if (meData?.success) {
    window.EMS_currentUserId   = meData.user.id;
    window.EMS_currentUserRole = meData.user.role;
    window.EMS_currentUserName = meData.user.name || meData.user.email || 'You';
  }

  // Load folders, then init documents tab
  const folderData = await API.get('/api/ems/folders');
  if (folderData?.success) {
    FolderTree.setFolders(folderData.folders);
    FolderTree.setCallbacks(onFolderSelect, onFolderContextMenu);
    FolderTree.render();
  }

  await EMS_Documents.init();

  // Select root folder by default
  const root = folderData?.folders?.find(f => f.parentId === null);
  if (root) FolderTree.selectFolder(root.id);

  // Bind Document Types and Metadata virtual nav items
  document.querySelectorAll('.folder-virtual-item[data-virtual="doctypes"], .folder-virtual-item[data-virtual="metadata"]').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.dataset.virtual;
      // Deselect all tree items and other virtual items
      FolderTree.clearActive();
      document.querySelectorAll('.folder-virtual-item').forEach(x => x.classList.remove('active'));
      EMS_Documents.setDocToolbarVisible(false);
      el.classList.add('active');
      // Hide doc area panels
      document.getElementById('docListWrap')?.classList.add('d-none');
      document.getElementById('docViewerWrap')?.classList.add('d-none');
      if (v === 'doctypes') {
        document.getElementById('metadataPanelWrap')?.classList.add('d-none');
        document.getElementById('doctypesPanelWrap')?.classList.remove('d-none');
        EMS_DoctypesMgr.init();
      } else {
        document.getElementById('doctypesPanelWrap')?.classList.add('d-none');
        document.getElementById('metadataPanelWrap')?.classList.remove('d-none');
        EMS_MetadataMgr.init();
      }
    });
  });

  // Bind tab switching
  document.querySelectorAll('#emsTabs .nav-link').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(tab.dataset.tab);
    });
  });

  // Bind new folder modal
  document.getElementById('btnNewFolder')?.addEventListener('click', openNewFolderModal);
  document.getElementById('btnCreateFolder')?.addEventListener('click', createFolder);

  // Bind rename folder
  document.getElementById('btnConfirmRename')?.addEventListener('click', renameFolder);
});

let activeTab = 'documents';

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('#emsTabs .nav-link').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));

  // Lazy-load tab data
  if (tabName === 'groups') EMS_Groups.init();
  else if (tabName === 'users') EMS_Users.init();
  else if (tabName === 'audit') EMS_Audit.init();
}

function onFolderSelect(folderId) {
  EMS_Documents.onFolderSelected(folderId);
}

// ─── Folder Context Menu ────────────────────────
let contextMenuTarget = null;

function onFolderContextMenu(e, folderId) {
  // Remove existing context menu
  document.querySelector('.ems-context-menu')?.remove();
  contextMenuTarget = folderId;

  const folder = FolderTree.getFolders().find(f => f.id === folderId);
  const isRoot = folder && folder.parentId === null;

  const menu = document.createElement('div');
  menu.className = 'ems-context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  menu.innerHTML = `
    <div class="ctx-item" onclick="openNewFolderModal()"><i class="bi bi-folder-plus"></i> New Subfolder</div>
    ${!isRoot ? `
      <div class="ctx-item" onclick="openRenameFolder('${folderId}')"><i class="bi bi-pencil"></i> Rename</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item text-danger" onclick="deleteFolder('${folderId}')"><i class="bi bi-trash3"></i> Delete</div>
    ` : ''}
  `;

  document.body.appendChild(menu);

  // Close on click outside
  const close = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 10);
}

function openNewFolderModal() {
  document.querySelector('.ems-context-menu')?.remove();
  document.getElementById('newFolderName').value = '';
  document.getElementById('newFolderColor').value = '#001E57';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('newFolderModal')).show();
}

async function createFolder() {
  const name = document.getElementById('newFolderName').value.trim();
  if (!name) return UI.toast('Folder name is required', 'warning');

  const parentId = FolderTree.getActiveId() || FolderTree.getFolders().find(f => f.parentId === null)?.id;
  const color = document.getElementById('newFolderColor').value;

  const data = await API.post('/api/ems/folders', { name, parentId, color });
  if (data?.success) {
    UI.toast('Folder created');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newFolderModal')).hide();
    // Refresh folders
    const fData = await API.get('/api/ems/folders');
    if (fData?.success) {
      FolderTree.setFolders(fData.folders);
      FolderTree.render();
    }
  }
}

function openRenameFolder(folderId) {
  document.querySelector('.ems-context-menu')?.remove();
  const folder = FolderTree.getFolders().find(f => f.id === folderId);
  if (!folder) return;
  document.getElementById('renameFolderInput').value = folder.name;
  contextMenuTarget = folderId;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('renameFolderModal')).show();
}

async function renameFolder() {
  const name = document.getElementById('renameFolderInput').value.trim();
  if (!name || !contextMenuTarget) return;

  const data = await API.put(`/api/ems/folders/${contextMenuTarget}`, { name });
  if (data?.success) {
    UI.toast('Folder renamed');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('renameFolderModal')).hide();
    const fData = await API.get('/api/ems/folders');
    if (fData?.success) {
      FolderTree.setFolders(fData.folders);
      FolderTree.render();
      EMS_Documents.updateBreadcrumb();
    }
  }
}

async function deleteFolder(folderId) {
  document.querySelector('.ems-context-menu')?.remove();
  if (!confirm('Delete this folder and all its contents?')) return;

  const data = await API.del(`/api/ems/folders/${folderId}?force=true`);
  if (data?.success) {
    UI.toast('Folder deleted');
    const fData = await API.get('/api/ems/folders');
    if (fData?.success) {
      FolderTree.setFolders(fData.folders);
      const root = fData.folders.find(f => f.parentId === null);
      if (root) FolderTree.selectFolder(root.id);
      else FolderTree.render();
    }
  }
}
