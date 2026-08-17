/* ═══════════════════════════════════════════════════════
   EMS — Metadata Collections Manager
   ═══════════════════════════════════════════════════════ */
const EMS_MetadataMgr = (() => {
  let allCollections = [];
  let editingId = null;
  let editingFields = []; // fields being built in the modal
  let initialized = false;

  async function init() {
    await load();
    if (!initialized) { bindEvents(); initialized = true; }
  }

  async function load() {
    const data = await API.get('/api/ems/metadata');
    if (data?.success) allCollections = data.collections;
    render();
  }

  function render() {
    const tbody = document.getElementById('metadataTableBody');
    if (!tbody) return;

    if (!allCollections.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-5">
        <i class="bi bi-collection d-block" style="font-size:2.5rem;opacity:.2;"></i>
        <p class="mt-2 mb-0">No metadata collections yet</p>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = allCollections.map(c => {
      const fieldBadges = (c.fields || []).map(f => {
        const icon = { text: 'bi-fonts', number: 'bi-123', date: 'bi-calendar3', select: 'bi-list-ul' }[f.type] || 'bi-question';
        return `<span class="badge border me-1 mb-1" style="background:#fff;color:#555;font-size:10px;font-weight:500;">
          <i class="bi ${icon} me-1" style="opacity:.6;"></i>${f.label}${f.required ? '<span class="text-danger ms-1">*</span>' : ''}
        </span>`;
      }).join('');

      return `<tr>
        <td>
          <div class="fw-bold" style="font-size:13px;">${c.name}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${c.description || ''}</div>
        </td>
        <td><span class="badge" style="background:var(--color-primary-faint);color:var(--color-primary-darker);font-weight:600;font-size:11px;border:1px solid var(--color-border);">${(c.fields || []).length} fields</span></td>
        <td style="max-width:300px;">${fieldBadges || '<span class="text-muted" style="font-size:11px;">No fields</span>'}</td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="EMS_MetadataMgr.openEdit('${c.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="EMS_MetadataMgr.deleteCollection('${c.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function bindEvents() {
    document.getElementById('btnNewMetaField')?.addEventListener('click', openCreate);
    document.getElementById('btnSaveMetaCollection')?.addEventListener('click', saveCollection);

    // Add field to collection
    document.getElementById('btnAddCollectionField')?.addEventListener('click', addFieldToCollection);

    // Field type toggle (show/hide options)
    document.getElementById('colFieldType')?.addEventListener('change', function () {
      document.getElementById('colFieldOptionsWrap')?.classList.toggle('d-none', this.value !== 'select');
    });

    // Auto-generate key from label
    document.getElementById('colFieldLabel')?.addEventListener('input', function () {
      document.getElementById('colFieldKey').value = this.value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    });
  }

  function openCreate() {
    editingId = null;
    editingFields = [];
    document.getElementById('metaCollectionModalTitle').textContent = 'New Metadata Collection';
    document.getElementById('colName').value = '';
    document.getElementById('colDesc').value = '';
    clearFieldForm();
    renderEditingFields();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('metaCollectionModal')).show();
  }

  function openEdit(collectionId) {
    const c = allCollections.find(x => x.id === collectionId);
    if (!c) return;
    editingId = collectionId;
    editingFields = (c.fields || []).map(f => ({ ...f }));
    document.getElementById('metaCollectionModalTitle').textContent = 'Edit Metadata Collection';
    document.getElementById('colName').value = c.name;
    document.getElementById('colDesc').value = c.description || '';
    clearFieldForm();
    renderEditingFields();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('metaCollectionModal')).show();
  }

  function clearFieldForm() {
    document.getElementById('colFieldLabel').value = '';
    document.getElementById('colFieldKey').value = '';
    document.getElementById('colFieldType').value = 'text';
    document.getElementById('colFieldRequired').checked = false;
    document.getElementById('colFieldOptions').value = '';
    document.getElementById('colFieldOptionsWrap')?.classList.add('d-none');
  }

  function addFieldToCollection() {
    const label = document.getElementById('colFieldLabel').value.trim();
    const key = document.getElementById('colFieldKey').value.trim();
    const type = document.getElementById('colFieldType').value;
    const required = document.getElementById('colFieldRequired').checked;
    const optText = document.getElementById('colFieldOptions').value.trim();
    const options = type === 'select' ? optText.split(/[\n,]+/).map(o => o.trim()).filter(Boolean) : [];

    if (!label) return UI.toast('Field label is required', 'warning');
    if (!key) return UI.toast('Field key is required', 'warning');
    if (type === 'select' && !options.length) return UI.toast('Add at least one option', 'warning');
    if (editingFields.some(f => f.id === key)) return UI.toast(`Key "${key}" already exists in this collection`, 'warning');

    editingFields.push({ id: key, label, type, required, options });
    clearFieldForm();
    renderEditingFields();
  }

  function removeFieldFromCollection(index) {
    editingFields.splice(index, 1);
    renderEditingFields();
  }

  function renderEditingFields() {
    const container = document.getElementById('colFieldsList');
    if (!container) return;

    const countEl = document.getElementById('colFieldsCount');
    if (countEl) countEl.textContent = editingFields.length;

    if (!editingFields.length) {
      container.innerHTML = `<div class="text-muted text-center py-3" style="font-size:12px;">
        <i class="bi bi-arrow-down me-1"></i>Add fields using the form below
      </div>`;
      return;
    }

    const typeIcon = { text: 'bi-fonts', number: 'bi-123', date: 'bi-calendar3', select: 'bi-list-ul' };
    container.innerHTML = editingFields.map((f, i) => `
      <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
        <i class="bi ${typeIcon[f.type] || 'bi-question'}" style="font-size:12px;color:var(--color-text-muted);width:14px;"></i>
        <span style="font-size:13px;font-weight:500;flex:1;">${f.label}</span>
        <code style="font-size:10px;color:var(--color-text-muted);">${f.id}</code>
        ${f.type === 'select' ? `<span class="badge bg-light text-dark border" style="font-size:10px;">${f.options?.length || 0} opts</span>` : `<span class="badge bg-light text-dark border" style="font-size:10px;">${f.type}</span>`}
        ${f.required ? '<span class="badge bg-danger bg-opacity-10 text-danger" style="font-size:10px;">required</span>' : '<span class="badge bg-light text-dark border" style="font-size:10px;">optional</span>'}
        <button class="btn btn-link text-danger p-0 ms-1" style="font-size:13px;" onclick="EMS_MetadataMgr.removeField(${i})">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    `).join('');
  }

  async function saveCollection() {
    const name = document.getElementById('colName').value.trim();
    const description = document.getElementById('colDesc').value.trim();

    if (!name) return UI.toast('Collection name is required', 'warning');
    if (!editingFields.length) return UI.toast('Add at least one field', 'warning');

    const payload = { name, description, fields: editingFields };
    const data = editingId
      ? await API.put(`/api/ems/metadata/${editingId}`, payload)
      : await API.post('/api/ems/metadata', payload);

    if (data?.success) {
      UI.toast(editingId ? 'Collection updated' : 'Collection created');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('metaCollectionModal')).hide();
      await load();
      if (typeof EMS_DoctypesMgr !== 'undefined') EMS_DoctypesMgr.refreshCollections(allCollections);
    } else {
      UI.toast(data?.message || 'Failed to save', 'danger');
    }
  }

  async function deleteCollection(collectionId) {
    if (!confirm('Delete this metadata collection?')) return;
    const data = await API.del(`/api/ems/metadata/${collectionId}`);
    if (data?.success) { UI.toast('Collection deleted'); await load(); }
    else UI.toast(data?.message || 'Cannot delete', 'danger');
  }

  function getCollections() { return allCollections; }

  return { init, load, openEdit, deleteCollection, removeField: removeFieldFromCollection, getCollections };
})();
