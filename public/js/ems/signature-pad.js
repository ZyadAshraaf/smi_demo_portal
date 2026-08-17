/* ═══════════════════════════════════════════════════════
   EMS — Signature Pad Component  (uses signature_pad library)
   ═══════════════════════════════════════════════════════ */
const EMS_SignaturePad = (() => {
  let signaturePad    = null;  // SignaturePad instance
  let _strokeHistory  = [];    // snapshot after each stroke, for undo
  let savedSignatures = [];
  let selectedSavedId = null;
  let targetDocId     = null;
  let eventsAttached  = false; // prevent stacking listeners on repeated opens

  /* ── Canvas sizing ─────────────────────────────────────
     Must run AFTER the modal is visible so getBoundingClientRect()
     returns the real layout width (not 0 from a hidden element).   */
  function resizeCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    // Destroy previous instance so its internal listeners are removed
    if (signaturePad) {
      signaturePad.off();
      signaturePad = null;
    }
    _strokeHistory = [];

    const rect  = canvas.getBoundingClientRect();
    const w     = rect.width || 600;
    const ratio = window.devicePixelRatio || 1;

    canvas.width        = w   * ratio;
    canvas.height       = 200 * ratio;
    canvas.style.height = '200px';
    // Do NOT pre-scale the context — SignaturePad v4 handles HiDPI internally
    // via (clientX - rect.left) * (canvas.width / rect.width).

    signaturePad = new SignaturePad(canvas, {
      penColor:        document.getElementById('signColor')?.value || '#000000',
      minWidth:        getThickness(),
      maxWidth:        getThickness() + 0.5,
      backgroundColor: 'rgba(0,0,0,0)' // keep canvas transparent; we add white bg on export
    });

    // Snapshot after every completed stroke so undo has per-stroke granularity
    signaturePad.addEventListener('endStroke', () => {
      _strokeHistory.push(JSON.parse(JSON.stringify(signaturePad.toData())));
    });
  }

  /* ── Event listeners (bound once per page load) ──────── */
  function attachEvents() {
    if (eventsAttached) return;
    eventsAttached = true;

    document.getElementById('btnSignClear')?.addEventListener('click', clearCanvas);
    document.getElementById('btnSignUndo')?.addEventListener('click', undo);
    document.getElementById('btnSaveSignature')?.addEventListener('click', saveSignature);
    document.getElementById('btnApplySignature')?.addEventListener('click', applySignature);

    // Live pen color — update the active SignaturePad instance
    document.getElementById('signColor')?.addEventListener('input', function () {
      if (signaturePad) signaturePad.penColor = this.value;
    });

    // Live pen thickness
    document.getElementById('signThickness')?.addEventListener('change', function () {
      const t = parseInt(this.value);
      if (signaturePad) {
        signaturePad.minWidth = t;
        signaturePad.maxWidth = t + 0.5;
      }
    });

    document.querySelectorAll('#signTabs .nav-link').forEach(tab => {
      tab.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('#signTabs .nav-link').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.signtab;
        document.getElementById('signDrawTab').classList.toggle('d-none', target !== 'draw');
        document.getElementById('signSavedTab').classList.toggle('d-none', target !== 'saved');
      });
    });

    // Resize (and re-create) the SignaturePad after Bootstrap finishes showing the modal
    document.getElementById('signatureModal')?.addEventListener('shown.bs.modal', () => {
      resizeCanvas();
    });
  }

  function getThickness() {
    return parseInt(document.getElementById('signThickness')?.value || '3');
  }

  function clearCanvas() {
    signaturePad?.clear();
    _strokeHistory = [];
  }

  function undo() {
    if (!_strokeHistory.length) return;
    _strokeHistory.pop();                                     // discard last stroke
    signaturePad?.fromData(_strokeHistory[_strokeHistory.length - 1] || []);
  }

  /* Export the signature as a PNG data-URI with a white background
     so it embeds cleanly into PDFs (transparent areas become white).  */
  function getCanvasData() {
    if (!signaturePad || signaturePad.isEmpty()) return '';

    const src     = document.getElementById('signatureCanvas');
    const tmp     = document.createElement('canvas');
    const ratio   = window.devicePixelRatio || 1;
    tmp.width     = src.width  / ratio;
    tmp.height    = src.height / ratio;
    const tmpCtx  = tmp.getContext('2d');
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
    tmpCtx.drawImage(src, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/png');
  }

  async function saveSignature() {
    if (!signaturePad || signaturePad.isEmpty()) return UI.toast('Please draw a signature first', 'warning');
    const name = prompt('Name this signature:', 'My Signature');
    if (!name) return;
    const imageData = getCanvasData();
    const data = await API.post('/api/ems/signatures', { name, imageData, type: 'drawn' });
    if (data?.success) {
      UI.toast('Signature saved');
      await loadSaved();
    }
  }

  async function loadSaved() {
    const data = await API.get('/api/ems/signatures');
    if (data?.success) {
      savedSignatures = data.signatures;
      renderSaved();
    }
  }

  function renderSaved() {
    const container = document.getElementById('savedSignaturesList');
    const empty     = document.getElementById('noSavedSignatures');
    if (!container) return;

    if (!savedSignatures.length) {
      container.innerHTML = '';
      empty?.classList.remove('d-none');
      return;
    }
    empty?.classList.add('d-none');

    container.innerHTML = savedSignatures.map(s => `
      <div class="col-md-4">
        <div class="saved-sig-card ${selectedSavedId === s.id ? 'selected' : ''}" data-sig-id="${s.id}">
          <img src="${s.imageData}" alt="${s.name}">
          <div class="sig-name">${s.name}</div>
          <button class="btn btn-sm btn-link text-danger p-0 mt-1" onclick="event.stopPropagation(); EMS_SignaturePad.deleteSaved('${s.id}')">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.saved-sig-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedSavedId = card.dataset.sigId;
        container.querySelectorAll('.saved-sig-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  async function deleteSaved(sigId) {
    if (!confirm('Delete this saved signature?')) return;
    await API.del(`/api/ems/signatures/${sigId}`);
    await loadSaved();
  }

  async function applySignature() {
    if (!targetDocId) return;

    const activeTab = document.querySelector('#signTabs .nav-link.active')?.dataset.signtab;
    let sigId, imageData;

    if (activeTab === 'saved' && selectedSavedId) {
      sigId     = selectedSavedId;
      imageData = savedSignatures.find(s => s.id === selectedSavedId)?.imageData;
    } else if (activeTab === 'draw' && signaturePad && !signaturePad.isEmpty()) {
      imageData      = getCanvasData();
      const saveData = await API.post('/api/ems/signatures', { name: 'Quick Sign', imageData, type: 'drawn' });
      if (!saveData?.success) return UI.toast('Failed to save signature', 'danger');
      sigId = saveData.signature.id;
    } else {
      return UI.toast('Please draw or select a signature', 'warning');
    }

    // Close the drawing modal then enter placement mode on the doc viewer
    bootstrap.Modal.getOrCreateInstance(document.getElementById('signatureModal')).hide();
    EMS_DocViewer.enterSignaturePlacementMode(targetDocId, sigId, imageData);
  }

  function openForDoc(docId) {
    targetDocId     = docId;
    selectedSavedId = null;
    _strokeHistory  = [];
    signaturePad?.clear(); // reset the pad without destroying it (resizeCanvas does full reset)

    attachEvents();
    loadSaved();

    // Show modal — SignaturePad is re-created in the 'shown.bs.modal' handler
    bootstrap.Modal.getOrCreateInstance(document.getElementById('signatureModal')).show();
  }

  return { openForDoc, deleteSaved };
})();
