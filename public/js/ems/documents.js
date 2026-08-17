/* ═══════════════════════════════════════════════════════
   EMS — Documents Tab Controller
   ═══════════════════════════════════════════════════════ */
const EMS_Documents = (() => {
  let allDocs = [];
  let allDocTypes = [];
  let selectedDocType = null;
  let selectedFile = null;
  let activeDocId = null;
  let selectedDocIds = new Set();
  let virtualMode = null; // null | 'starred' | 'recent' | 'trash'

  // Helper for other modules
  window.EMS_getDocCountForFolder = (folderId) => {
    return allDocs.filter(d => d.folderId === folderId && !d.trashedAt).length;
  };

  async function init() {
    await loadDocTypes();
    await loadDocs();
    bindEvents();
  }

  async function loadDocTypes() {
    const data = await API.get('/api/ems/doctypes');
    if (data?.success) {
      allDocTypes = data.docTypes;
      renderDocTypeFilter();
      renderDocTypeGrid();
    }
  }

  async function loadDocs() {
    const folderId = FolderTree.getActiveId();
    let url = '/api/ems/documents';
    const params = [];

    if (virtualMode === 'trash') {
      params.push('trashed=true');
    } else if (virtualMode === 'starred') {
      params.push('starred=true');
    } else if (virtualMode === 'recent') {
      url = '/api/ems/documents/recent';
    } else if (folderId) {
      params.push(`folderId=${folderId}`);
    }

    const search = document.getElementById('docSearchInput')?.value.trim();
    if (search) params.push(`search=${encodeURIComponent(search)}`);

    const typeFilter = document.getElementById('docTypeFilter')?.value;
    if (typeFilter) params.push(`docTypeId=${typeFilter}`);

    if (params.length) url += '?' + params.join('&');

    const data = await API.get(url);
    if (data?.success) {
      allDocs = data.documents;
      renderSubfolders(folderId);
      renderDocList();
    }
  }

  function renderSubfolders(folderId) {
    const wrap = document.getElementById('docSubfoldersWrap');
    if (!wrap) return;

    // Only show subfolders when browsing a real folder (not virtual modes)
    if (virtualMode || !folderId) {
      wrap.classList.add('d-none');
      wrap.innerHTML = '';
      return;
    }

    const allFolders = FolderTree.getFolders();
    const children = allFolders.filter(f => f.parentId === folderId);

    if (!children.length) {
      wrap.classList.add('d-none');
      wrap.innerHTML = '';
      return;
    }

    wrap.classList.remove('d-none');
    wrap.innerHTML = `
      <div class="subfolder-section-label">
        <i class="bi bi-folder2-open me-1"></i>Folders <span class="subfolder-count">${children.length}</span>
      </div>
      <div class="subfolder-grid">
        ${children.map(f => {
          const docCount = typeof window.EMS_getDocCountForFolder === 'function'
            ? window.EMS_getDocCountForFolder(f.id) : 0;
          const subCount = allFolders.filter(x => x.parentId === f.id).length;
          const color = f.color || 'var(--color-primary)';
          return `
            <div class="subfolder-card" onclick="FolderTree.selectFolder('${f.id}')">
              <div class="subfolder-icon" style="background:${color}18;color:${color};">
                <i class="bi ${f.icon || 'bi-folder'}"></i>
              </div>
              <div class="subfolder-info">
                <div class="subfolder-name">${_dn(f.name)}</div>
              </div>
              <i class="bi bi-chevron-right subfolder-arrow"></i>
            </div>`;
        }).join('')}
      </div>
      ${allDocs.length ? '<div class="subfolder-docs-label"><i class="bi bi-file-earmark me-1"></i>Documents in this folder</div>' : ''}
    `;
  }

  function _dn(name) { return (name || '').replace(/^\/+/, ''); }

  function renderDocTypeFilter() {
    const select = document.getElementById('docTypeFilter');
    if (!select) return;
    select.innerHTML = '<option value="">All Types</option>';
    allDocTypes.forEach(dt => {
      select.innerHTML += `<option value="${dt.id}">${dt.name}</option>`;
    });
  }

  function renderDocTypeGrid() {
    const grid = document.getElementById('docTypeGrid');
    if (!grid) return;
    grid.innerHTML = allDocTypes.map(dt => `
      <div class="doc-type-card" data-type-id="${dt.id}">
        <i class="bi ${dt.icon}" style="color:${dt.color};"></i>
        <div class="doc-type-name">${dt.name}</div>
        <div class="doc-type-desc">${dt.description}</div>
      </div>
    `).join('');
  }

  function renderDocList() {
    const tbody = document.getElementById('docTableBody');
    if (!tbody) return;

    if (!allDocs.length) {
      // If subfolders are shown, hide the empty-state table entirely
      const hasSubs = document.getElementById('docSubfoldersWrap') && !document.getElementById('docSubfoldersWrap').classList.contains('d-none');
      if (hasSubs) { tbody.innerHTML = ''; return; }
      const msg = virtualMode === 'trash' ? 'Trash is empty' :
                  virtualMode === 'starred' ? 'No starred documents' :
                  virtualMode === 'recent' ? 'No recent documents' :
                  'No documents in this folder';
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-5"><i class="bi bi-folder2-open d-block" style="font-size:2rem;opacity:.2;"></i>${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = allDocs.map(doc => {
      const dt = allDocTypes.find(t => t.id === doc.docTypeId) || { name: 'Unknown', icon: 'bi-file-earmark', color: '#6c757d' };
      const isStarred = doc.starred?.includes(window.EMS_currentUserId) || false;
      const isLocked = !!doc.lockedBy;
      const hasPending = doc.versions?.some(v => v.status === 'pending');
      const latestVer = doc.versions?.[doc.versions.length - 1];

      return `<tr data-doc-id="${doc.id}">
        <td onclick="event.stopPropagation();">
          <input type="checkbox" class="form-check-input doc-checkbox" data-doc-id="${doc.id}" ${selectedDocIds.has(doc.id) ? 'checked' : ''}>
        </td>
        <td>
          <div class="doc-title-cell">
            <i class="doc-title-icon bi ${dt.icon}" style="color:${dt.color};"></i>
            <div class="doc-title-info">
              <div class="doc-title-name">
                ${(isLocked || hasPending) ? '<i class="bi bi-lock-fill doc-lock-badge me-1"></i>' : ''}
                ${doc.title}
                ${hasPending ? '<span class="badge ms-1" style="background:#fff3cd;color:#856404;font-size:0.65rem;vertical-align:middle;"><i class="bi bi-hourglass-split me-1"></i>Pending Approval</span>' : ''}
              </div>
              <div class="doc-title-desc">${doc.description || ''}</div>
            </div>
          </div>
        </td>
        <td><span class="doc-type-badge" style="background:${dt.color}15;color:${dt.color};"><i class="bi ${dt.icon} me-1"></i>${dt.name}</span></td>
        <td class="text-center">v${doc.currentVersion || 0}</td>
        <td><small>${UI.formatDate(doc.updatedAt)}</small></td>
        <td>
          <div class="d-flex align-items-center gap-1">
            <span class="doc-star ${isStarred ? 'starred' : ''}" onclick="EMS_Documents.toggleStar('${doc.id}')" title="Star">
              <i class="bi ${isStarred ? 'bi-star-fill' : 'bi-star'}"></i>
            </span>
            <div class="dropdown">
              <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown" style="padding:2px 6px;font-size:12px;">
                <i class="bi bi-three-dots-vertical"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item" onclick="EMS_Documents.viewDoc('${doc.id}')"><i class="bi bi-eye me-2"></i>View</button></li>
                <li><button class="dropdown-item" onclick="EMS_Documents.showDetail('${doc.id}')"><i class="bi bi-info-circle me-2"></i>Properties</button></li>
                <li><button class="dropdown-item" ${(doc.lockedBy && doc.lockedBy !== window.EMS_currentUserId) || doc.versions?.some(v => v.status === 'pending') ? `disabled title="${doc.versions?.some(v => v.status === 'pending') ? 'Pending version approval' : 'Document is locked'}"` : `onclick="EMS_Documents.showNewVersion('${doc.id}')"`}><i class="bi bi-arrow-up-circle me-2"></i>New Version</button></li>
                <li><button class="dropdown-item" onclick="EMS_Documents.showMove('${doc.id}')"><i class="bi bi-folder-symlink me-2"></i>Move</button></li>
                <li><hr class="dropdown-divider"></li>
                ${doc.trashedAt
                  ? `<li><button class="dropdown-item" onclick="EMS_Documents.restoreDoc('${doc.id}')"><i class="bi bi-arrow-counterclockwise me-2"></i>Restore</button></li>`
                  : `<li><button class="dropdown-item text-danger" onclick="EMS_Documents.deleteDoc('${doc.id}')"><i class="bi bi-trash3 me-2"></i>Delete</button></li>`
                }
              </ul>
            </div>
          </div>
        </td>
      </tr>`;
    }).join('');

    updateBulkActions();
  }

  function updateBulkActions() {
    const count = selectedDocIds.size;
    const toolbar = document.getElementById('docToolbar');
    const defaultBar = document.getElementById('docToolbarDefault');
    const selectionBar = document.getElementById('docSelectionBar');
    const countNum = document.getElementById('selectionCountNum');

    if (count > 0) {
      toolbar?.classList.add('selection-active');
      defaultBar?.classList.add('d-none');
      selectionBar?.classList.remove('d-none');
      if (countNum) countNum.textContent = count;
    } else {
      toolbar?.classList.remove('selection-active');
      defaultBar?.classList.remove('d-none');
      selectionBar?.classList.add('d-none');
    }
  }

  function updateBreadcrumb() {
    const el = document.getElementById('docBreadcrumb');
    if (!el) return;

    if (virtualMode) {
      const labels = { starred: 'Starred', recent: 'Recent', trash: 'Trash' };
      const icons = { starred: 'bi-star', recent: 'bi-clock-history', trash: 'bi-trash3' };
      el.innerHTML = `<span class="breadcrumb-item"><i class="bi ${icons[virtualMode]} me-1"></i>${labels[virtualMode]}</span>`;
      return;
    }

    const folderId = FolderTree.getActiveId();
    if (!folderId) { el.innerHTML = '<span class="breadcrumb-item">Select a folder</span>'; return; }

    const path = FolderTree.getBreadcrumb(folderId);
    el.innerHTML = path.map((p, i) => {
      if (i < path.length - 1) {
        return `<span class="breadcrumb-item clickable" onclick="FolderTree.selectFolder('${p.id}')">${p.name}</span>`;
      }
      return `<span class="breadcrumb-item">${p.name}</span>`;
    }).join('');
  }

  // ─── Event Binding ────────────────────────────
  function bindEvents() {
    // Search
    document.getElementById('docSearchInput')?.addEventListener('input', debounce(loadDocs, 300));
    document.getElementById('docTypeFilter')?.addEventListener('change', loadDocs);

    // Select all checkbox
    document.getElementById('selectAllDocs')?.addEventListener('change', function() {
      const checked = this.checked;
      selectedDocIds.clear();
      if (checked) allDocs.forEach(d => selectedDocIds.add(d.id));
      renderDocList();
    });

    // Individual checkboxes (delegated)
    document.getElementById('docTableBody')?.addEventListener('change', (e) => {
      if (e.target.classList.contains('doc-checkbox')) {
        const id = e.target.dataset.docId;
        if (e.target.checked) selectedDocIds.add(id);
        else selectedDocIds.delete(id);
        updateBulkActions();
      }
    });

    // Row click → view
    document.getElementById('docTableBody')?.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-doc-id]');
      if (row && !e.target.closest('.dropdown') && !e.target.closest('.doc-star') && !e.target.closest('.doc-checkbox') && !e.target.closest('input')) {
        viewDoc(row.dataset.docId);
      }
    });

    // Upload button
    document.getElementById('btnUploadDoc')?.addEventListener('click', openUploadModal);

    // Upload modal — doc type selection
    document.getElementById('docTypeGrid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.doc-type-card');
      if (!card) return;
      document.querySelectorAll('.doc-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedDocType = card.dataset.typeId;
      showUploadStep2();
    });

    // Upload back button
    document.getElementById('btnUploadBack')?.addEventListener('click', showUploadStep1);

    // Drop zone
    setupDropZone('uploadDropZone', 'uploadFileInput', (file) => {
      selectedFile = file;
      document.getElementById('selectedFileName').textContent = file.name;
      document.getElementById('selectedFileInfo').classList.remove('d-none');
    });
    document.getElementById('btnRemoveFile')?.addEventListener('click', () => {
      selectedFile = null;
      document.getElementById('selectedFileInfo').classList.add('d-none');
      document.getElementById('uploadFileInput').value = '';
    });

    // Submit upload
    document.getElementById('btnSubmitUpload')?.addEventListener('click', submitUpload);

    // Virtual folders (starred, recent, trash) — doctypes/metadata handled by their own managers
    document.querySelectorAll('.folder-virtual-item').forEach(el => {
      const v = el.dataset.virtual;
      if (v === 'doctypes' || v === 'metadata') return;
      el.addEventListener('click', () => {
        virtualMode = v;
        document.querySelectorAll('.folder-virtual-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        FolderTree.clearActive();
        hideManagementPanels();
        setDocToolbarVisible(false);
        document.getElementById('docListWrap')?.classList.remove('d-none');
        document.getElementById('docViewerWrap')?.classList.add('d-none');
        updateBreadcrumb();
        loadDocs();
      });
    });

    // Clear selection
    document.getElementById('btnSelectionClear')?.addEventListener('click', () => {
      selectedDocIds.clear();
      const selectAll = document.getElementById('selectAllDocs');
      if (selectAll) selectAll.checked = false;
      renderDocList();
    });

    // Bulk actions
    document.getElementById('btnBulkMove')?.addEventListener('click', () => {
      if (selectedDocIds.size === 0) return;
      populateMoveSelect();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('moveDocModal')).show();
      document.getElementById('btnConfirmMove').onclick = async () => {
        const folderId = document.getElementById('moveFolderSelect').value;
        const data = await API.post('/api/ems/documents/bulk/move', { documentIds: [...selectedDocIds], folderId });
        if (data?.success) { UI.toast(`Moved ${data.moved} documents`); selectedDocIds.clear(); await loadDocs(); }
        else { UI.toast(data?.message || 'Move failed', 'danger'); }
        bootstrap.Modal.getOrCreateInstance(document.getElementById('moveDocModal')).hide();
      };
    });

    document.getElementById('btnBulkDelete')?.addEventListener('click', async () => {
      if (selectedDocIds.size === 0) return;
      if (!confirm(`Delete ${selectedDocIds.size} documents?`)) return;
      const data = await API.post('/api/ems/documents/bulk/delete', { documentIds: [...selectedDocIds] });
      if (data?.success) { UI.toast(`Deleted ${data.deleted} documents`); selectedDocIds.clear(); await loadDocs(); }
    });

    document.getElementById('btnBulkKnowledgeChat')?.addEventListener('click', async () => {
      if (selectedDocIds.size === 0) return;
      if (selectedDocIds.size > 5) {
        UI.toast('Select up to 5 documents for Knowledge Conversation', 'warning');
        return;
      }

      const selectedDocs = [...selectedDocIds]
        .map(id => allDocs.find(d => d.id === id))
        .filter(d => d && d.currentVersion > 0);

      if (selectedDocs.length === 0) {
        UI.toast('Selected documents have no uploaded files', 'warning');
        return;
      }

      // Open drawer immediately in loading state
      EMS_KnowledgeChat.openLoading(selectedDocs.map(d => d.title));

      try {
        const fd = new FormData();
        for (const doc of selectedDocs) {
          const ver = doc.versions?.find(v => v.version === doc.currentVersion);
          const filename = ver?.filename || `${doc.title}.pdf`;
          const resp = await fetch(
            `/unifiedsmi/api/ems/documents/${doc.id}/versions/${doc.currentVersion}/download`,
            { credentials: 'include' }
          );
          if (!resp.ok) throw new Error(`Could not fetch "${doc.title}"`);
          const blob = await resp.blob();
          fd.append('files', blob, filename);
        }

        const ingestResp = await fetch('/unifiedsmi/api/doceval-proxy/api/general/ingest', {
          method: 'POST', credentials: 'include', body: fd
        });
        if (!ingestResp.ok) throw new Error('Ingest failed: ' + ingestResp.statusText);
        const ingestData = await ingestResp.json();

        EMS_KnowledgeChat.open(ingestData.session_id, selectedDocs.map(d => d.title));

      } catch (err) {
        EMS_KnowledgeChat.close();
        UI.toast('Ask Documents failed: ' + err.message, 'danger');
      }
    });

    // Back to list from viewer — close the fullscreen modal
    document.getElementById('btnBackToList')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('docViewerModal')).hide();
      activeDocId = null;
    });

  }

  // ─── Upload Flow ──────────────────────────────
  function openUploadModal() {
    selectedDocType = null;
    selectedFile = null;
    showUploadStep1();
    document.getElementById('uploadTitle').value = '';
    document.getElementById('uploadDesc').value = '';
    document.getElementById('uploadNotes').value = '';
    document.getElementById('selectedFileInfo')?.classList.add('d-none');
    document.getElementById('uploadFileInput').value = '';
    document.querySelectorAll('.doc-type-card').forEach(c => c.classList.remove('selected'));

    // Populate folder select
    const folderSelect = document.getElementById('uploadFolder');
    if (folderSelect) {
      const options = FolderTree.getFolderOptions();
      folderSelect.innerHTML = options.map(o => `<option value="${o.id}" ${o.id === FolderTree.getActiveId() ? 'selected' : ''}>${o.name}</option>`).join('');
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('uploadDocModal')).show();
  }

  function showUploadStep1() {
    document.getElementById('uploadStep1').classList.remove('d-none');
    document.getElementById('uploadStep2').classList.add('d-none');
    document.getElementById('btnSubmitUpload').classList.add('d-none');
  }

  function showUploadStep2() {
    if (!selectedDocType) return;
    const dt = allDocTypes.find(t => t.id === selectedDocType);
    if (!dt) return;

    document.getElementById('uploadStep1').classList.add('d-none');
    document.getElementById('uploadStep2').classList.remove('d-none');
    document.getElementById('btnSubmitUpload').classList.remove('d-none');

    // Show selected type badge
    document.getElementById('selectedTypeBadge').innerHTML = `<i class="bi ${dt.icon} me-1"></i>${dt.name}`;
    document.getElementById('selectedTypeBadge').style.cssText = `background:${dt.color}15;color:${dt.color};`;

    // Render dynamic metadata fields (use resolvedFields if available)
    const fieldList = dt.resolvedFields || dt.fields || [];
    const container = document.getElementById('metadataFields');
    container.innerHTML = fieldList.map(f => {
      let input = '';
      if (f.type === 'text') {
        input = `<input type="text" class="form-control" id="meta_${f.id}" ${f.required ? 'required' : ''}>`;
      } else if (f.type === 'date') {
        input = `<input type="date" class="form-control" id="meta_${f.id}" ${f.required ? 'required' : ''}>`;
      } else if (f.type === 'number') {
        input = `<input type="number" class="form-control" id="meta_${f.id}" step="any" ${f.required ? 'required' : ''}>`;
      } else if (f.type === 'select') {
        input = `<select class="form-select" id="meta_${f.id}" ${f.required ? 'required' : ''}>
          <option value="">Select...</option>
          ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`;
      }
      return `<div class="col-md-6">
        <label class="form-label">${f.label}${f.required ? ' <span class="text-danger">*</span>' : ''}</label>
        ${input}
      </div>`;
    }).join('');
  }

  async function submitUpload() {
    const title = document.getElementById('uploadTitle').value.trim();
    if (!title) return UI.toast('Title is required', 'warning');

    const dt = allDocTypes.find(t => t.id === selectedDocType);
    if (!dt) return;

    // Validate required metadata
    const metadata = {};
    const fieldList = dt.resolvedFields || dt.fields || [];
    for (const f of fieldList) {
      const el = document.getElementById(`meta_${f.id}`);
      const val = el?.value?.trim() || '';
      if (f.required && !val) {
        UI.toast(`${f.label} is required`, 'warning');
        el?.focus();
        return;
      }
      if (val) metadata[f.id] = f.type === 'number' ? parseFloat(val) : val;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('uploadDesc').value.trim());
    formData.append('folderId', document.getElementById('uploadFolder').value);
    formData.append('docTypeId', selectedDocType);
    formData.append('metadata', JSON.stringify(metadata));
    formData.append('notes', document.getElementById('uploadNotes').value.trim() || 'Initial upload');
    if (selectedFile) formData.append('file', selectedFile);

    try {
      const res = await fetch('/unifiedsmi/api/ems/documents', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (data?.success) {
        UI.toast('Document uploaded successfully');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('uploadDocModal')).hide();
        await loadDocs();
        FolderTree.render();
      } else {
        UI.toast(data?.message || 'Upload failed', 'danger');
      }
    } catch (e) {
      UI.toast('Upload failed', 'danger');
    }
  }

  // ─── Document Actions ─────────────────────────
  async function viewDoc(docId) {
    activeDocId = docId;
    EMS_DocViewer.open(docId, allDocTypes);
  }

  async function showDetail(docId) {
    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    const doc = data.document;
    const dt = allDocTypes.find(t => t.id === doc.docTypeId) || { name: 'Unknown', fields: [] };

    let metaHtml = '';
    const detailFields = dt.resolvedFields || dt.fields || [];
    if (detailFields.length) {
      metaHtml = detailFields.map(f => {
        const val = doc.metadata?.[f.id] || '—';
        return `<div class="col-md-6 mb-2"><strong class="d-block" style="font-size:11px;color:var(--color-text-muted);">${f.label}</strong><span style="font-size:13px;">${val}</span></div>`;
      }).join('');
    }

    const sigHtml = doc.signatures?.length ? doc.signatures.map(s =>
      `<div class="d-flex align-items-center gap-2 mb-1"><i class="bi bi-pen text-primary"></i><span style="font-size:13px;">${s.userName} — ${UI.formatDate(s.signedAt)}</span></div>`
    ).join('') : '<span class="text-muted">No signatures</span>';

    document.getElementById('docDetailBody').innerHTML = `
      <div class="row">
        <div class="col-md-8">
          <h6 class="fw-bold">${doc.title}</h6>
          <p class="text-muted" style="font-size:13px;">${doc.description || 'No description'}</p>
          <hr>
          <h6 class="fw-bold mb-3" style="font-size:13px;">Metadata <span class="doc-type-badge ms-2" style="background:${dt.color || '#6c757d'}15;color:${dt.color || '#6c757d'};"><i class="bi ${dt.icon} me-1"></i>${dt.name}</span></h6>
          <div class="row">${metaHtml}</div>
        </div>
        <div class="col-md-4">
          <div class="mb-3"><strong style="font-size:11px;color:var(--color-text-muted);">Created By</strong><div style="font-size:13px;">${doc.createdBy}</div></div>
          <div class="mb-3"><strong style="font-size:11px;color:var(--color-text-muted);">Created</strong><div style="font-size:13px;">${UI.formatDate(doc.createdAt)}</div></div>
          <div class="mb-3"><strong style="font-size:11px;color:var(--color-text-muted);">Version</strong><div style="font-size:13px;">v${doc.currentVersion} (${doc.versions?.length || 0} versions)</div></div>
          <div class="mb-3"><strong style="font-size:11px;color:var(--color-text-muted);">Status</strong><div style="font-size:13px;">${doc.lockedBy ? '<i class="bi bi-lock-fill text-danger me-1"></i>Locked' : '<i class="bi bi-unlock text-success me-1"></i>Unlocked'}</div></div>
          <hr>
          <h6 class="fw-bold mb-2" style="font-size:13px;">Signatures</h6>
          ${sigHtml}
        </div>
      </div>`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('docDetailModal')).show();
  }

  function showNewVersion(docId) {
    activeDocId = docId;
    document.getElementById('versionFileInput').value = '';
    document.getElementById('versionFileInfo').classList.add('d-none');
    document.getElementById('versionNotes').value = '';

    setupDropZone('versionDropZone', 'versionFileInput', (file) => {
      selectedFile = file;
      document.getElementById('versionFileName').textContent = file.name;
      document.getElementById('versionFileInfo').classList.remove('d-none');
    });

    document.getElementById('btnSubmitVersion').onclick = async () => {
      if (!selectedFile) return UI.toast('Please select a file', 'warning');
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('notes', document.getElementById('versionNotes').value.trim());

      const res = await fetch(`/unifiedsmi/api/ems/documents/${activeDocId}/versions`, { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (data?.success) {
        UI.toast(data.message || 'Version submitted for approval', 'info');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('newVersionModal')).hide();
        selectedFile = null;
        await loadDocs();
      } else {
        UI.toast(data?.message || 'Upload failed', 'danger');
      }
    };

    bootstrap.Modal.getOrCreateInstance(document.getElementById('newVersionModal')).show();
  }

  function showMove(docId) {
    activeDocId = docId;
    populateMoveSelect();
    document.getElementById('btnConfirmMove').onclick = async () => {
      const folderId = document.getElementById('moveFolderSelect').value;
      const data = await API.post(`/api/ems/documents/${docId}/move`, { folderId });
      if (data?.success) { UI.toast('Document moved'); await loadDocs(); FolderTree.render(); }
      else { UI.toast(data?.message || 'Move failed', 'danger'); }
      bootstrap.Modal.getOrCreateInstance(document.getElementById('moveDocModal')).hide();
    };
    bootstrap.Modal.getOrCreateInstance(document.getElementById('moveDocModal')).show();
  }

  async function toggleStar(docId) {
    const data = await API.post(`/api/ems/documents/${docId}/star`);
    if (data?.success) {
      UI.toast(data.starred ? 'Starred' : 'Unstarred');
      await loadDocs();
    }
  }

  async function deleteDoc(docId) {
    if (!confirm('Move this document to trash?')) return;
    const data = await API.del(`/api/ems/documents/${docId}`);
    if (data?.success) { UI.toast('Moved to trash'); await loadDocs(); FolderTree.render(); }
  }

  async function restoreDoc(docId) {
    const data = await API.post(`/api/ems/documents/${docId}/restore`);
    if (data?.success) { UI.toast('Document restored'); await loadDocs(); }
  }

  // ─── Helpers ──────────────────────────────────
  function populateMoveSelect() {
    const select = document.getElementById('moveFolderSelect');
    if (!select) return;
    const options = FolderTree.getFolderOptions();
    select.innerHTML = options.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  }

  function setupDropZone(zoneId, inputId, onFile) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) onFile(input.files[0]); };

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function onFolderSelected(folderId) {
    virtualMode = null;
    document.querySelectorAll('.folder-virtual-item').forEach(v => v.classList.remove('active'));
    hideManagementPanels();
    setDocToolbarVisible(true);
    document.getElementById('docListWrap')?.classList.remove('d-none');
    document.getElementById('docViewerWrap')?.classList.add('d-none');
    updateBreadcrumb();
    selectedDocIds.clear();
    loadDocs();
  }

  function hideManagementPanels() {
    document.getElementById('doctypesPanelWrap')?.classList.add('d-none');
    document.getElementById('metadataPanelWrap')?.classList.add('d-none');
  }

  function setDocToolbarVisible(visible) {
    document.getElementById('docToolbar')?.classList.toggle('d-none', !visible);
  }

  function getDocTypes() { return allDocTypes; }
  function getActiveDocId() { return activeDocId; }

  return {
    init, loadDocs, loadDocTypes, onFolderSelected, viewDoc, showDetail, showNewVersion, showMove,
    toggleStar, deleteDoc, restoreDoc, getDocTypes, getActiveDocId, updateBreadcrumb, setDocToolbarVisible
  };
})();
