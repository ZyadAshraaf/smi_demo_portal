/* ═══════════════════════════════════════════════════════
   EMS — Folder Tree Component
   ═══════════════════════════════════════════════════════ */
const FolderTree = (() => {
  let folders = [];
  let activeId = null;
  let expandedIds = new Set();
  let onSelect = null;
  let onContextMenu = null;

  function setFolders(data) { folders = data; }
  function getActiveId() { return activeId; }
  function getActiveName() { const f = folders.find(x => x.id === activeId); return f ? _dn(f.name) : ''; }
  function _dn(name) { return (name || '').replace(/^\/+/, ''); }
  function setCallbacks(selectCb, contextCb) { onSelect = selectCb; onContextMenu = contextCb; }

  function buildTree(parentId) {
    const children = folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (!children.length) return '';

    let html = '<ul>';
    children.forEach(f => {
      const hasKids = folders.some(c => c.parentId === f.id);
      const isExpanded = expandedIds.has(f.id);
      const isActive = f.id === activeId;
      const docCount = typeof window.EMS_getDocCountForFolder === 'function'
        ? window.EMS_getDocCountForFolder(f.id) : '';

      html += `<li>
        <div class="folder-tree-item ${isActive ? 'active' : ''}" data-folder-id="${f.id}">
          <span class="folder-expand">${hasKids ? (isExpanded ? '<i class="bi bi-chevron-down"></i>' : '<i class="bi bi-chevron-right"></i>') : ''}</span>
          <i class="folder-icon bi ${f.icon || 'bi-folder'}${isActive ? '-fill' : ''}"></i>
          <span class="folder-name">${_dn(f.name)}</span>
          ${docCount ? `<span class="folder-count">${docCount}</span>` : ''}
        </div>
        ${hasKids && isExpanded ? buildTree(f.id) : ''}
      </li>`;
    });
    html += '</ul>';
    return html;
  }

  function render() {
    const root = folders.find(f => f.parentId === null);
    if (!root) return;

    // Auto-expand root
    expandedIds.add(root.id);

    const container = document.getElementById('folderTree');
    if (!container) return;
    container.innerHTML = buildTree(null);
    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelectorAll('.folder-tree-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const folderId = el.dataset.folderId;
        const clickedExpand = e.target.closest('.folder-expand');

        if (clickedExpand) {
          // Toggle expand
          if (expandedIds.has(folderId)) expandedIds.delete(folderId);
          else expandedIds.add(folderId);
          render();
        } else {
          // Select folder
          activeId = folderId;
          render();
          if (onSelect) onSelect(folderId);
        }
      });

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const folderId = el.dataset.folderId;
        activeId = folderId;
        render();
        if (onContextMenu) onContextMenu(e, folderId);
      });
    });
  }

  function selectFolder(folderId) {
    activeId = folderId;
    // Expand all parents
    let current = folders.find(f => f.id === folderId);
    while (current && current.parentId) {
      expandedIds.add(current.parentId);
      current = folders.find(f => f.id === current.parentId);
    }
    render();
    if (onSelect) onSelect(folderId);
  }

  function getBreadcrumb(folderId) {
    const path = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      path.unshift({ id: current.id, name: _dn(current.name) });
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return path;
  }

  function getFolderOptions(excludeId) {
    // Flat list for <select> dropdowns, indented by depth
    const result = [];
    function walk(parentId, depth) {
      folders
        .filter(f => f.parentId === parentId && f.id !== excludeId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach(f => {
          result.push({ id: f.id, name: '\u00A0\u00A0'.repeat(depth) + _dn(f.name), depth });
          walk(f.id, depth + 1);
        });
    }
    walk(null, 0);
    return result;
  }

  function clearActive() { activeId = null; render(); }

  return { setFolders, getActiveId, getActiveName, setCallbacks, render, selectFolder, clearActive, getBreadcrumb, getFolderOptions, getFolders: () => folders };
})();
