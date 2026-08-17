/* ═══════════════════════════════════════════════════════
   EMS — Document Types Manager
   ═══════════════════════════════════════════════════════ */
const EMS_DoctypesMgr = (() => {
  let allTypes = [];
  let allCollections = [];
  let editingTypeId = null;
  let selectedCollectionId = null; // single metadata collection linked to this type
  let extraFields = [];            // additional type-specific fields not from any collection
  let initialized = false;

  async function init() {
    await loadAll();
    if (!initialized) { bindEvents(); initialized = true; }
  }

  async function loadAll() {
    const [tData, cData] = await Promise.all([
      API.get('/api/ems/doctypes'),
      API.get('/api/ems/metadata')
    ]);
    if (tData?.success) allTypes = tData.docTypes;
    if (cData?.success) allCollections = cData.collections;
    render(); // always render even if one request failed
  }

  function render() {
    const container = document.getElementById('doctypesGrid');
    if (!container) return;

    if (!allTypes.length) {
      container.innerHTML = `<div class="text-center text-muted py-5">
        <i class="bi bi-tags d-block" style="font-size:3rem;opacity:.2;"></i>
        <p class="mt-2">No document types yet</p>
      </div>`;
      return;
    }

    container.innerHTML = `<div class="row g-3">${allTypes.map(dt => {
      const linkedCol = allCollections.find(x => x.id === dt.metadataId);
      // Fall back to _fromCollection hint embedded in resolvedFields if collections not loaded yet
      const templateName = linkedCol?.name || dt.resolvedFields?.[0]?._fromCollection || null;
      const collectionNames = templateName
        ? `<span class="badge" style="background:${dt.color}20;color:${dt.color};font-size:10px;">${templateName}</span>`
        : '<span style="font-size:11px;color:var(--color-text-muted);">No metadata template</span>';
      const fieldCount = (dt.resolvedFields || []).length;

      return `<div class="col-md-4 col-lg-3">
        <div class="card border-0 shadow-sm h-100" style="border-radius:12px;overflow:hidden;">
          <div style="height:5px;background:${dt.color};"></div>
          <div class="card-body pb-1">
            <div class="d-flex align-items-center gap-2 mb-2">
              <div style="width:38px;height:38px;border-radius:9px;background:${dt.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="bi ${dt.icon || 'bi-file-earmark'}" style="color:${dt.color};font-size:1.2rem;"></i>
              </div>
              <div style="min-width:0;">
                <div class="fw-bold" style="font-size:13px;">${dt.name}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${fieldCount} total fields</div>
              </div>
            </div>
            <p style="font-size:11px;color:var(--color-text-muted);margin:0 0 6px;">${dt.description || ''}</p>
            <div>${collectionNames || '<span style="font-size:11px;color:var(--color-text-muted);">No metadata collections</span>'}</div>
          </div>
          <div class="card-footer bg-transparent border-0 pt-1 pb-2 px-3">
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-primary flex-grow-1" style="font-size:11px;" onclick="EMS_DoctypesMgr.openEdit('${dt.id}')">
                <i class="bi bi-pencil me-1"></i>Edit
              </button>
              <button class="btn btn-sm btn-outline-danger" style="font-size:11px;" onclick="EMS_DoctypesMgr.deleteType('${dt.id}')">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function bindEvents() {
    document.getElementById('btnNewDocType')?.addEventListener('click', openCreate);
    document.getElementById('btnSaveDocType')?.addEventListener('click', saveType);

    // Collection select change
    document.getElementById('dtCollectionSelect')?.addEventListener('change', function () {
      EMS_DoctypesMgr.onCollectionChange(this.value);
    });

    // Icon live preview
    document.getElementById('dtIcon')?.addEventListener('input', function () {
      document.getElementById('dtIconPreview').className = 'bi ' + (this.value || 'bi-file-earmark');
    });
    document.getElementById('dtColor')?.addEventListener('input', function () {
      document.getElementById('dtIconPreview').style.color = this.value;
    });

    // Extra field type toggle
    document.getElementById('dtExtraFieldType')?.addEventListener('change', function () {
      document.getElementById('dtExtraOptionsWrap')?.classList.toggle('d-none', this.value !== 'select');
    });
    document.getElementById('dtExtraFieldLabel')?.addEventListener('input', function () {
      document.getElementById('dtExtraFieldKey').value = this.value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    });
    document.getElementById('btnAddExtraField')?.addEventListener('click', addExtraField);
  }

  function openCreate() {
    editingTypeId = null;
    selectedCollectionId = null;
    extraFields = [];
    document.getElementById('dtModalTitle').textContent = 'New Document Type';
    document.getElementById('dtName').value = '';
    document.getElementById('dtDesc').value = '';
    document.getElementById('dtIcon').value = 'bi-file-earmark';
    document.getElementById('dtColor').value = '#001E57';
    document.getElementById('dtIconPreview').className = 'bi bi-file-earmark';
    document.getElementById('dtIconPreview').style.color = '#001E57';
    clearExtraFieldForm();
    renderCollectionPicker();
    renderExtraFields();
    renderFieldPreview();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newDocTypeModal')).show();
  }

  function openEdit(typeId) {
    const dt = allTypes.find(t => t.id === typeId);
    if (!dt) return;
    editingTypeId = typeId;
    selectedCollectionId = dt.metadataId || null;
    extraFields = (dt.fields || []).map(f => ({ ...f }));

    document.getElementById('dtModalTitle').textContent = 'Edit Document Type';
    document.getElementById('dtName').value = dt.name;
    document.getElementById('dtDesc').value = dt.description || '';
    document.getElementById('dtIcon').value = dt.icon || 'bi-file-earmark';
    document.getElementById('dtColor').value = dt.color || '#001E57';
    document.getElementById('dtIconPreview').className = 'bi ' + (dt.icon || 'bi-file-earmark');
    document.getElementById('dtIconPreview').style.color = dt.color || '#001E57';
    clearExtraFieldForm();
    renderCollectionPicker();
    renderExtraFields();
    renderFieldPreview();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('newDocTypeModal')).show();
  }

  function renderCollectionPicker() {
    const select = document.getElementById('dtCollectionSelect');
    if (!select) return;

    select.innerHTML = '<option value="">— None —</option>' +
      allCollections.map(c =>
        `<option value="${c.id}" ${selectedCollectionId === c.id ? 'selected' : ''}>${c.name} (${(c.fields || []).length} fields)</option>`
      ).join('');

    // Show fields of selected collection
    renderCollectionFieldsHint();
  }

  function renderCollectionFieldsHint() {
    const hint = document.getElementById('dtCollectionHint');
    if (!hint) return;
    const col = allCollections.find(c => c.id === selectedCollectionId);
    if (!col) { hint.innerHTML = ''; return; }
    const typeIcon = { text: 'bi-fonts', number: 'bi-123', date: 'bi-calendar3', select: 'bi-list-ul' };
    hint.innerHTML = `<div class="d-flex flex-wrap gap-1 mt-2">` +
      (col.fields || []).map(f =>
        `<span class="badge border" style="background:#fff;color:#444;font-size:11px;">
          <i class="bi ${typeIcon[f.type] || 'bi-question'} me-1" style="opacity:.5;"></i>${f.label}${f.required ? '<span class="text-danger ms-1">*</span>' : ''}
        </span>`
      ).join('') + `</div>`;
  }

  function onCollectionChange(value) {
    selectedCollectionId = value || null;
    renderCollectionFieldsHint();
    renderFieldPreview();
  }

  function renderFieldPreview() {
    const container = document.getElementById('dtFieldPreview');
    if (!container) return;

    // Build full field list: inherited from the linked collection + extra
    const allFields = [];
    const seen = new Set();

    const col = allCollections.find(c => c.id === selectedCollectionId);
    if (col) {
      (col.fields || []).forEach(f => {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          allFields.push({ ...f, _source: col.name });
        }
      });
    }

    extraFields.forEach(f => {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        allFields.push({ ...f, _source: 'Custom' });
      }
    });

    const countEl = document.getElementById('dtFieldCount');
    if (countEl) countEl.textContent = allFields.length;

    if (!allFields.length) {
      container.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Select metadata collections above</div>';
      return;
    }

    const typeIcon = { text: 'bi-fonts', number: 'bi-123', date: 'bi-calendar3', select: 'bi-list-ul' };
    container.innerHTML = allFields.map(f => `
      <div class="d-flex align-items-center gap-2 px-2 py-1 border-bottom">
        <i class="bi ${typeIcon[f.type] || 'bi-question'}" style="font-size:11px;width:12px;color:var(--color-text-muted);"></i>
        <span style="font-size:12px;flex:1;">${f.label}${f.required ? ' <span class="text-danger">*</span>' : ''}</span>
        <span style="font-size:10px;color:var(--color-text-muted);">${f._source}</span>
      </div>`).join('');
  }

  function clearExtraFieldForm() {
    document.getElementById('dtExtraFieldLabel').value = '';
    document.getElementById('dtExtraFieldKey').value = '';
    document.getElementById('dtExtraFieldType').value = 'text';
    document.getElementById('dtExtraFieldRequired').checked = false;
    document.getElementById('dtExtraOptions').value = '';
    document.getElementById('dtExtraOptionsWrap')?.classList.add('d-none');
  }

  function addExtraField() {
    const label = document.getElementById('dtExtraFieldLabel').value.trim();
    const key = document.getElementById('dtExtraFieldKey').value.trim();
    const type = document.getElementById('dtExtraFieldType').value;
    const required = document.getElementById('dtExtraFieldRequired').checked;
    const optText = document.getElementById('dtExtraOptions').value.trim();
    const options = type === 'select' ? optText.split(/[\n,]+/).map(o => o.trim()).filter(Boolean) : [];

    if (!label || !key) return UI.toast('Label and key are required', 'warning');
    if (type === 'select' && !options.length) return UI.toast('Add at least one option', 'warning');

    extraFields.push({ id: key, label, type, required, options });
    clearExtraFieldForm();
    renderExtraFields();
    renderFieldPreview();
  }

  function removeExtraField(index) {
    extraFields.splice(index, 1);
    renderExtraFields();
    renderFieldPreview();
  }

  function renderExtraFields() {
    const container = document.getElementById('dtExtraFieldsList');
    if (!container) return;

    if (!extraFields.length) {
      container.innerHTML = '<div class="text-muted" style="font-size:11px;">No extra fields added</div>';
      return;
    }

    const typeIcon = { text: 'bi-fonts', number: 'bi-123', date: 'bi-calendar3', select: 'bi-list-ul' };
    container.innerHTML = extraFields.map((f, i) => `
      <span class="badge border me-1 mb-1" style="background:#fff;color:#333;font-size:11px;">
        <i class="bi ${typeIcon[f.type] || 'bi-question'} me-1" style="opacity:.5;"></i>${f.label}${f.required ? '<span class="text-danger ms-1">*</span>' : ''}
        <button type="button" class="btn-close btn-close-sm ms-1" style="font-size:8px;" onclick="EMS_DoctypesMgr.removeExtra(${i})"></button>
      </span>`).join('');
  }

  async function saveType() {
    const name = document.getElementById('dtName').value.trim();
    const description = document.getElementById('dtDesc').value.trim();
    const icon = document.getElementById('dtIcon').value.trim() || 'bi-file-earmark';
    const color = document.getElementById('dtColor').value;

    if (!name) return UI.toast('Type name is required', 'warning');
    if (!selectedCollectionId && !extraFields.length) {
      return UI.toast('Select a metadata template or add extra fields', 'warning');
    }

    const payload = { name, description, icon, color, metadataId: selectedCollectionId, fields: extraFields };
    const data = editingTypeId
      ? await API.put(`/api/ems/doctypes/${editingTypeId}`, payload)
      : await API.post('/api/ems/doctypes', payload);

    if (data?.success) {
      UI.toast(editingTypeId ? 'Type updated' : 'Type created');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('newDocTypeModal')).hide();
      await loadAll();
      if (typeof EMS_Documents !== 'undefined') {
        try { await EMS_Documents.loadDocTypes(); } catch (e) {}
      }
    } else {
      UI.toast(data?.message || 'Failed to save', 'danger');
    }
  }

  async function deleteType(typeId) {
    if (!confirm('Delete this document type?')) return;
    const data = await API.del(`/api/ems/doctypes/${typeId}`);
    if (data?.success) { UI.toast('Type deleted'); await loadAll(); }
    else UI.toast(data?.message || 'Cannot delete: documents are using this type', 'danger');
  }

  function refreshCollections(collections) {
    allCollections = collections;
    if (document.getElementById('newDocTypeModal')?.classList.contains('show')) {
      renderCollectionPicker();
      renderFieldPreview();
    }
  }

  // Called by metadata mgr after save — keeps collection list fresh
  // (already handled above via refreshCollections)

  return { init, loadAll, openEdit, deleteType, onCollectionChange, removeExtra: removeExtraField, refreshCollections };
})();
