/* ═══════════════════════════════════════════════════════
   EMS — Document Viewer Component
   ═══════════════════════════════════════════════════════ */
const EMS_DocViewer = (() => {
  let currentDoc = null;

  /* ── Placement state ────────────────────────────────── */
  let placement   = null; // { docId, sigId, imageData, x, y, width }
  let _dragState  = null;
  let _pdfJsState = null; // { pdf, numPages } — alive only during PDF placement mode

  /* ── Annotation state ───────────────────────────────── */
  let _annotation = null; // { docId, text, color, size, x, y, page }

  /* ── Unsaved-edits state ────────────────────────────── */
  let _pendingEdits   = []; // staged edits not yet sent to server
  let _stagedOverlays = []; // visual-only previews of staged edits
  let _isDirty        = false;
  let _allowClose     = false; // bypasses dirty check when we intentionally close

  /* ════════════════════════════════════════════════════
     Open / render
     ════════════════════════════════════════════════════ */
  async function open(docId, docTypes) {
    cancelPlacement();

    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    currentDoc = data.document;

    _markClean();
    _allowClose = false;

    const viewerModal = document.getElementById('docViewerModal');
    if (!viewerModal._viewerCleanupAttached) {
      viewerModal._viewerCleanupAttached = true;

      // Intercept close — show confirmation if there are unsaved edits
      viewerModal.addEventListener('hide.bs.modal', e => {
        if (_isDirty && !_allowClose) {
          e.preventDefault();
          _showUnsavedConfirmation();
        }
      });

      // Final cleanup when modal fully hides
      viewerModal.addEventListener('hidden.bs.modal', () => {
        cancelPlacement();
        cancelAnnotation();
        _markClean();
        _allowClose = false;
        currentDoc  = null;
      });

      // Wire Save & Close / Discard & Close buttons once
      document.getElementById('btnSaveAndClose')?.addEventListener('click', async () => {
        _hideUnsavedOverlay();
        await saveAll();
        if (!_isDirty) { // save succeeded
          _allowClose = true;
          bootstrap.Modal.getOrCreateInstance(viewerModal).hide();
        }
      });

      document.getElementById('btnDiscardAndClose')?.addEventListener('click', () => {
        _hideUnsavedOverlay();
        _markClean();
        _allowClose = true;
        bootstrap.Modal.getOrCreateInstance(viewerModal).hide();
      });
    }
    bootstrap.Modal.getOrCreateInstance(viewerModal).show();

    document.getElementById('viewerTitle').textContent = currentDoc.title;

    // Determine block conditions
    const lockedByOther    = currentDoc.lockedBy && currentDoc.lockedBy !== window.EMS_currentUserId;
    const hasPendingVersion = currentDoc.versions?.some(v => v.status === 'pending');
    const isBlocked        = lockedByOther || hasPendingVersion;
    const blockedReason    = hasPendingVersion ? 'Pending version approval' : 'Document is locked';

    // Lock badge
    let lockBadge = document.getElementById('viewerLockBadge');
    if (!lockBadge) {
      lockBadge = document.createElement('span');
      lockBadge.id = 'viewerLockBadge';
      lockBadge.className = 'badge ms-2 align-middle';
      document.getElementById('viewerTitle').insertAdjacentElement('afterend', lockBadge);
    }
    if (hasPendingVersion) {
      lockBadge.textContent = 'Pending Approval';
      lockBadge.style.cssText = 'background:rgba(255,193,7,0.35);color:#fff;font-size:0.7rem;';
    } else if (lockedByOther) {
      lockBadge.textContent = 'Locked';
      lockBadge.style.cssText = 'background:rgba(255,255,255,0.25);color:#fff;font-size:0.7rem;';
    } else {
      lockBadge.textContent = '';
      lockBadge.style.cssText = '';
    }

    // Lock button — only the locker (or admin) can unlock; hidden when pending version exists
    const lockBtn = document.getElementById('btnViewerLock');
    if (lockBtn) {
      const isLocked   = !!currentDoc.lockedBy;
      const canUnlock  = !isLocked || currentDoc.lockedBy === window.EMS_currentUserId || window.EMS_currentUserRole === 'admin';
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title     = hasPendingVersion ? 'Cannot lock while version is pending' : isLocked ? (canUnlock ? 'Unlock' : 'Locked by another user') : 'Lock';
      lockBtn.disabled  = hasPendingVersion || (isLocked && !canUnlock);
      lockBtn.onclick   = (hasPendingVersion || (isLocked && !canUnlock)) ? null : () => toggleLock(docId);
    }

    // Download
    document.getElementById('btnViewerDownload').onclick = () => {
      if (!currentDoc.versions?.length) return UI.toast('No file to download', 'warning');
      const a = document.createElement('a');
      a.href = `/unifiedsmi/api/ems/documents/${docId}/versions/${currentDoc.currentVersion}/download`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    // Sign
    const signBtn = document.getElementById('btnViewerSign');
    if (signBtn) {
      signBtn.disabled = isBlocked;
      signBtn.title    = isBlocked ? blockedReason : 'Sign';
      signBtn.onclick  = isBlocked ? null : () => EMS_SignaturePad.openForDoc(docId);
    }

    // Annotate
    const annBtn = document.getElementById('btnViewerAnnotate');
    if (annBtn) {
      annBtn.disabled = isBlocked;
      annBtn.title    = isBlocked ? blockedReason : 'Annotate';
      annBtn.onclick  = isBlocked ? null : () => enterAnnotationMode(docId);
    }

    const wmBtn = document.getElementById('btnViewerWatermark');
    if (wmBtn) {
      wmBtn.disabled = isBlocked;
      wmBtn.title    = isBlocked ? blockedReason : 'Watermark';
      wmBtn.onclick  = isBlocked ? null : () => openWatermarkModal(docId);
    }

    const verBtn = document.getElementById('btnViewerVersions');
    if (verBtn) verBtn.onclick = () => showVersionHistory(docId);

    renderPreview();
    renderWatermark();
    renderSignatures();
  }

  function renderPreview() {
    const body = document.getElementById('docViewerBody');
    if (!body || !currentDoc) return;

    if (!currentDoc.versions?.length) {
      body.innerHTML = '<div class="doc-viewer-placeholder"><i class="bi bi-file-earmark-x" style="font-size:4rem;opacity:.2;"></i><p class="mt-2 text-muted">No file uploaded yet</p></div>';
      return;
    }

    const latest = currentDoc.versions[currentDoc.versions.length - 1];
    const url    = `/unifiedsmi/${latest.storagePath}`;

    if (latest.mimeType === 'application/pdf') {
      const viewUrl = `/unifiedsmi/api/ems/documents/${currentDoc.id}/versions/${currentDoc.currentVersion}/view?t=${Date.now()}`;
      _renderPdfPreview(viewUrl); // pdf.js canvas rendering — no browser PDF chrome
    } else if (latest.mimeType?.startsWith('image/')) {
      body.innerHTML = `<img src="${url}" alt="${currentDoc.title}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
      _reapplyStagedOverlays();
    } else {
      body.innerHTML = `<div class="doc-viewer-placeholder">
        <i class="bi bi-file-earmark" style="font-size:4rem;opacity:.2;"></i>
        <p class="mt-2 text-muted">Preview not available for this file type</p>
        <button class="btn btn-sm btn-primary mt-2" onclick="window.open('${url}','_blank')"><i class="bi bi-download me-1"></i>Download to view</button>
      </div>`;
    }
  }

  /* Render all PDF pages via pdf.js into a scrollable canvas container.
     Called both for normal preview and after signing (to bypass browser PDF cache).
     `source` can be a URL string or a {data: ArrayBuffer} object for pdf-lib bytes. */
  async function _renderPdfPreview(source) {
    const body = document.getElementById('docViewerBody');
    if (!body) return;

    // Measure stable width BEFORE touching innerHTML.
    // body.offsetWidth is 0 until the modal is fully shown, so fall back to
    // window.innerWidth (the visible viewport width at current zoom level).
    const availW = Math.max(400, (body.offsetWidth || window.innerWidth) * 0.55);

    body.innerHTML = '<div class="doc-viewer-placeholder"><span class="spinner-border spinner-border-sm me-2" style="color:var(--color-primary);"></span>Loading…</div>';

    try {
      const pdf         = await pdfjsLib.getDocument(source).promise;
      const outputScale = window.devicePixelRatio || 1;

      const scroller = document.createElement('div');
      scroller.id = 'pdfPreviewScroller';
      scroller.style.cssText = 'overflow-y:auto;height:100%;width:100%;';
      body.innerHTML = '';
      body.appendChild(scroller);

      for (let i = 1; i <= pdf.numPages; i++) {
        const page  = await pdf.getPage(i);
        const vp1   = page.getViewport({ scale: 1 });

        // Scale page to fit container width (HiDPI: bake outputScale into viewport)
        const fitScale = availW / vp1.width;
        const viewport = page.getViewport({ scale: fitScale * outputScale });

        // CSS dimensions (logical pixels shown on screen)
        const cssW = Math.floor(vp1.width  * fitScale);
        const cssH = Math.floor(vp1.height * fitScale);

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `margin:0 auto ${i < pdf.numPages ? '4px' : '0'};width:${cssW}px;height:${cssH}px;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#fff;flex-shrink:0;`;

        const canvas = document.createElement('canvas');
        canvas.width        = Math.floor(viewport.width);   // physical pixels
        canvas.height       = Math.floor(viewport.height);
        canvas.style.width  = cssW + 'px';                  // CSS (logical) pixels
        canvas.style.height = cssH + 'px';
        canvas.style.display = 'block';

        wrapper.appendChild(canvas);
        scroller.appendChild(wrapper);

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport
        }).promise;

        // Bake watermark onto the canvas so it repeats on every page
        if (currentDoc.watermark?.enabled) {
          const wm  = currentDoc.watermark;
          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(((wm.angle || -30) * Math.PI) / 180);
          ctx.globalAlpha  = wm.opacity || 0.15;
          ctx.fillStyle    = '#000000';
          ctx.font         = `bold ${Math.floor(canvas.width * 0.09)}px Arial`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wm.text || 'CONFIDENTIAL', 0, 0);
          ctx.restore();
        }
      }

      // Re-apply any staged (unsaved) signature/annotation overlays on top of the pages
      _reapplyStagedOverlays();

    } catch (err) {
      console.error('[DocViewer] pdf.js preview failed:', err);
      const url = typeof source === 'string' ? source
        : `/unifiedsmi/api/ems/documents/${currentDoc.id}/versions/${currentDoc.currentVersion}/view?t=${Date.now()}`;
      body.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`;
    }
  }

  /* ════════════════════════════════════════════════════
     Signature overlays (placed signatures — non-PDF only)
     ════════════════════════════════════════════════════ */
  function renderSignatures() {
    document.querySelectorAll('.sig-placed-overlay').forEach(el => el.remove());
    if (!currentDoc?.signatures?.length) return;

    const latestVer = currentDoc.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType === 'application/pdf') return; // baked into file by server

    const body = document.getElementById('docViewerBody');
    currentDoc.signatures.forEach(sig => {
      if (sig.x == null) return;
      const el = document.createElement('div');
      el.className   = 'sig-placed-overlay';
      el.style.left  = sig.x + '%';
      el.style.top   = sig.y + '%';
      el.style.width = (sig.width || 20) + '%';
      el.innerHTML   = `
        <img src="${sig.imageData}" alt="Signature">
        <div class="sig-placed-meta">${sig.userName} &bull; ${UI.formatDate(sig.signedAt)}</div>`;
      body.appendChild(el);
    });
  }

  /* ════════════════════════════════════════════════════
     Signature placement mode
     ════════════════════════════════════════════════════ */
  async function enterSignaturePlacementMode(docId, sigId, imageData) {
    _removePlacementGhost();

    placement = { docId, sigId, imageData, x: 5, y: 10, width: 22 };

    document.getElementById('signPlacementBanner')?.classList.remove('d-none');
    _setViewerActionsVisible(false);

    // For PDFs: render with pdf.js so the user drags the signature
    // over the actual rendered page content (same coordinate method as reference).
    // For other file types: fall back to the ghost-over-viewer approach.
    const latestVer = currentDoc?.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType === 'application/pdf') {
      await _renderPdfForPlacement();
    } else {
      _spawnGhost();
    }
  }

  /* ── Render PDF pages with pdf.js for placement mode ── */
  async function _renderPdfForPlacement() {
    const body = document.getElementById('docViewerBody');
    if (!body || !currentDoc) return;

    const pageInput = document.getElementById('signPlacementPage');
    const pageNum   = Math.max(1, parseInt(pageInput?.value || '1'));
    const viewUrl   = `/unifiedsmi/api/ems/documents/${currentDoc.id}/versions/${currentDoc.currentVersion}/view?t=${Date.now()}`;

    try {
      const pdf         = await pdfjsLib.getDocument(viewUrl).promise;
      const outputScale = window.devicePixelRatio || 1;

      // Clamp requested page to valid range and update the input's max
      const clampedPage = Math.min(pageNum, pdf.numPages);
      if (pageInput) { pageInput.max = pdf.numPages; pageInput.value = clampedPage; }

      _pdfJsState = { pdf, numPages: pdf.numPages };

      await _renderPage(clampedPage, outputScale);

      // Re-render when the user changes the page number
      pageInput?.addEventListener('change', _onPlacementPageChange);

    } catch (err) {
      console.error('[PDF.js] placement render failed:', err);
      // Graceful fallback: ghost over the existing viewer content
      renderPreview();
      _spawnGhost();
    }
  }

  /* Render one PDF page onto a canvas inside docViewerBody */
  async function _renderPage(pageNum, outputScale) {
    const body = document.getElementById('docViewerBody');
    if (!body || !_pdfJsState?.pdf) return;

    outputScale = outputScale || (window.devicePixelRatio || 1);
    const pdfPage  = await _pdfJsState.pdf.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 1 });

    const cssW = Math.floor(viewport.width);
    const cssH = Math.floor(viewport.height);

    // First call: build the DOM wrapper; subsequent calls (page switch): just update canvas
    let pageDiv = document.getElementById('pdfPageDiv');
    if (!pageDiv) {
      body.innerHTML = ''; // clear iframe

      const wrapper = document.createElement('div');
      wrapper.id = 'pdfPlacementWrapper';
      wrapper.style.cssText = 'position:relative;overflow:auto;width:100%;height:100%;display:flex;align-items:flex-start;justify-content:center;background:#888;padding:16px;box-sizing:border-box;';

      pageDiv = document.createElement('div');
      pageDiv.id = 'pdfPageDiv';
      pageDiv.style.cssText = 'position:relative;display:inline-block;box-shadow:0 4px 16px rgba(0,0,0,.4);';

      const canvas = document.createElement('canvas');
      canvas.id = 'pdfPlacementCanvas';
      canvas.style.display = 'block';

      pageDiv.appendChild(canvas);
      wrapper.appendChild(pageDiv);
      body.appendChild(wrapper);
    }

    const canvas = document.getElementById('pdfPlacementCanvas');
    canvas.width        = cssW * outputScale;
    canvas.height       = cssH * outputScale;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    pageDiv.style.width  = cssW + 'px';
    pageDiv.style.height = cssH + 'px';

    await pdfPage.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
    }).promise;

    // Spawn the appropriate ghost over the page canvas
    if (placement)   _spawnGhostOnPageDiv();
    if (_annotation) _spawnAnnotationGhost();
  }

  /* Re-render when the page input changes during placement mode */
  async function _onPlacementPageChange() {
    if (!_pdfJsState?.pdf || !placement) return;
    const pageInput = document.getElementById('signPlacementPage');
    const pageNum   = Math.max(1, Math.min(
      parseInt(pageInput?.value || '1'),
      _pdfJsState.numPages
    ));
    await _renderPage(pageNum);
  }

  /* Spawn the draggable signature ghost inside pdfPageDiv (PDF mode) */
  function _spawnGhostOnPageDiv() {
    if (!placement) return;
    const pageDiv = document.getElementById('pdfPageDiv');
    if (!pageDiv) return;

    // Remove stale ghost (e.g. after page switch)
    document.getElementById('sigPlacementGhost')?.remove();

    const ghost = document.createElement('div');
    ghost.id        = 'sigPlacementGhost';
    ghost.className = 'sig-placement-ghost';
    ghost.style.left  = placement.x + '%';
    ghost.style.top   = placement.y + '%';
    ghost.style.width = placement.width + '%';
    ghost.innerHTML   = `
      <img src="${placement.imageData}" alt="Signature">
      <div class="sig-placement-ghost-hint"><i class="bi bi-arrows-move"></i> Drag to position</div>`;

    ghost.addEventListener('mousedown', _onGhostMouseDown);
    pageDiv.appendChild(ghost);

    // Ensure the ghost is visible inside the scrollable wrapper
    ghost.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* Original ghost spawn — used for non-PDF files (ghost over viewer body) */
  function _spawnGhost() {
    if (!placement) return;
    const body = document.getElementById('docViewerBody');
    if (!body) return;

    // Transparent intercept layer sits above any iframe so mouse events
    // aren't swallowed by it while the user drags the signature ghost.
    const intercept = document.createElement('div');
    intercept.id    = 'sigDragIntercept';
    intercept.style.cssText = 'position:absolute;inset:0;z-index:25;cursor:grab;';
    body.appendChild(intercept);

    const ghost = document.createElement('div');
    ghost.id        = 'sigPlacementGhost';
    ghost.className = 'sig-placement-ghost';
    ghost.style.left  = placement.x + '%';
    ghost.style.top   = placement.y + '%';
    ghost.style.width = placement.width + '%';
    ghost.innerHTML   = `
      <img src="${placement.imageData}" alt="Signature">
      <div class="sig-placement-ghost-hint"><i class="bi bi-arrows-move"></i> Drag to position</div>`;

    intercept.addEventListener('mousedown', _onGhostMouseDown);
    ghost.addEventListener('mousedown', _onGhostMouseDown);
    body.appendChild(ghost);
  }

  /* Shared drag handler — works for both PDF (pdfPageDiv) and non-PDF (docViewerBody) */
  function _onGhostMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    const ghost     = document.getElementById('sigPlacementGhost');
    const ghostRect = ghost.getBoundingClientRect();

    // Remember where inside the ghost the click landed so it doesn't jump to corner
    const offsetX = e.clientX - ghostRect.left;
    const offsetY = e.clientY - ghostRect.top;

    _dragState = { offsetX, offsetY };

    const ic = document.getElementById('sigDragIntercept');
    if (ic) ic.style.cursor = 'grabbing';

    const onMove = ev => {
      if (!_dragState) return;

      // Use pdfPageDiv as container in PDF placement mode; docViewerBody otherwise
      const container = document.getElementById('pdfPageDiv') || document.getElementById('docViewerBody');
      const ghost     = document.getElementById('sigPlacementGhost');
      if (!container || !ghost) return;

      const cr   = container.getBoundingClientRect();
      const gw   = ghost.offsetWidth;
      const gh   = ghost.offsetHeight;

      let newLeft = ev.clientX - cr.left - _dragState.offsetX;
      let newTop  = ev.clientY - cr.top  - _dragState.offsetY;

      // Clamp so ghost stays fully inside the container
      newLeft = Math.max(0, Math.min(cr.width  - gw, newLeft));
      newTop  = Math.max(0, Math.min(cr.height - gh, newTop));

      const xPct = (newLeft / cr.width)  * 100;
      const yPct = (newTop  / cr.height) * 100;

      ghost.style.left = xPct + '%';
      ghost.style.top  = yPct + '%';
      placement.x = xPct;
      placement.y = yPct;
    };

    const onUp = () => {
      _dragState = null;
      const ic = document.getElementById('sigDragIntercept');
      if (ic) ic.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  function _removePlacementGhost() {
    document.getElementById('sigPlacementGhost')?.remove();
    document.getElementById('sigDragIntercept')?.remove();
    _dragState = null;
  }

  /* Stage the positioned signature — does NOT call the server yet */
  async function confirmPlacement() {
    if (!placement) return;

    const docId = placement.docId;
    const page  = Math.max(1, parseInt(document.getElementById('signPlacementPage')?.value || '1'));
    const x     = Math.round(placement.x     * 10) / 10;
    const y     = Math.round(placement.y     * 10) / 10;
    const width = Math.round(placement.width * 10) / 10;

    _pendingEdits.push({
      type:    'signature',
      apiPath: `/api/ems/documents/${docId}/sign`,
      method:  'post',
      body:    { signatureId: placement.sigId, x, y, width, page }
    });

    // Keep the visual preview in the re-rendered multi-page view
    _stagedOverlays.push({ type: 'signature', page, x, y, width, imageData: placement.imageData });

    cancelPlacement(); // hides banner + re-renders preview (which calls _reapplyStagedOverlays)
    _markDirty();
  }

  function cancelPlacement() {
    document.getElementById('signPlacementPage')?.removeEventListener('change', _onPlacementPageChange);
    _removePlacementGhost();
    _pdfJsState = null;
    placement   = null;
    document.getElementById('signPlacementBanner')?.classList.add('d-none');
    _setViewerActionsVisible(true);
    renderPreview();
  }

  function _setViewerActionsVisible(visible) {
    ['btnViewerDownload', 'btnViewerSign', 'btnViewerAnnotate', 'btnViewerWatermark', 'btnViewerVersions', 'btnViewerLock'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('d-none', !visible);
    });
    // Keep Save button visible whenever there are staged edits, regardless of mode
    if (visible && _isDirty) {
      document.getElementById('btnViewerSave')?.classList.remove('d-none');
    }
  }

  /* ════════════════════════════════════════════════════
     Watermark
     ════════════════════════════════════════════════════ */
  function renderWatermark() {
    if (!currentDoc) return;

    const latestVer = currentDoc.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType === 'application/pdf') {
      // Watermark is baked into each page canvas — re-render preview to apply it
      renderPreview();
      return;
    }

    // Non-PDF: use the CSS overlay
    const overlay = document.getElementById('watermarkOverlay');
    if (!overlay) return;
    if (currentDoc.watermark?.enabled) {
      overlay.classList.remove('d-none');
      overlay.innerHTML = `<span class="watermark-text" style="opacity:${currentDoc.watermark.opacity};transform:rotate(${currentDoc.watermark.angle}deg);">${currentDoc.watermark.text}</span>`;
    } else {
      overlay.classList.add('d-none');
    }
  }

  function openWatermarkModal(docId) {
    if (!currentDoc) return;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('watermarkModal'));

    document.getElementById('watermarkText').value       = currentDoc.watermark?.text    || 'CONFIDENTIAL';
    document.getElementById('watermarkOpacity').value    = (currentDoc.watermark?.opacity || 0.15) * 100;
    document.getElementById('watermarkOpacityVal').textContent = Math.round((currentDoc.watermark?.opacity || 0.15) * 100);
    document.getElementById('watermarkAngle').value      = currentDoc.watermark?.angle   || -30;
    document.getElementById('watermarkAngleVal').textContent   = currentDoc.watermark?.angle || -30;

    document.getElementById('watermarkOpacity').oninput = function () {
      document.getElementById('watermarkOpacityVal').textContent = this.value;
    };
    document.getElementById('watermarkAngle').oninput = function () {
      document.getElementById('watermarkAngleVal').textContent = this.value;
    };

    document.getElementById('btnSaveWatermark').onclick = () => {
      const wm = {
        enabled: true,
        text:    document.getElementById('watermarkText').value || 'CONFIDENTIAL',
        opacity: parseInt(document.getElementById('watermarkOpacity').value) / 100,
        angle:   parseInt(document.getElementById('watermarkAngle').value)
      };
      // Replace any previous watermark edit (only one watermark state possible)
      _pendingEdits = _pendingEdits.filter(e => e.type !== 'watermark');
      _pendingEdits.push({ type: 'watermark', apiPath: `/api/ems/documents/${docId}/watermark`, method: 'put', body: wm });
      currentDoc.watermark = wm; // local preview
      renderWatermark();
      _markDirty();
      UI.toast('Watermark staged — click Save to apply', 'info');
      modal.hide();
    };

    document.getElementById('btnRemoveWatermark').onclick = () => {
      const wm = { enabled: false };
      _pendingEdits = _pendingEdits.filter(e => e.type !== 'watermark');
      _pendingEdits.push({ type: 'watermark', apiPath: `/api/ems/documents/${docId}/watermark`, method: 'put', body: wm });
      currentDoc.watermark = wm; // local preview
      renderWatermark();
      _markDirty();
      UI.toast('Watermark removal staged — click Save to apply', 'info');
      modal.hide();
    };

    modal.show();
  }

  /* ════════════════════════════════════════════════════
     Version history
     ════════════════════════════════════════════════════ */
  async function showVersionHistory(docId) {
    const data = await API.get(`/api/ems/documents/${docId}`);
    if (!data?.success) return;
    const doc = data.document;

    document.getElementById('versionHistoryBody').innerHTML = doc.versions
      .slice().reverse()
      .map(v => {
        const isPending  = v.status === 'pending';
        const isCurrent  = v.version === doc.currentVersion;
        const statusBadge = isPending
          ? `<span class="badge ms-2" style="background:#fff3cd;color:#856404;font-size:0.7rem;"><i class="bi bi-hourglass-split me-1"></i>Pending Approval</span>`
          : isCurrent
          ? `<span class="badge ms-2" style="background:#d1e7dd;color:#0f5132;font-size:0.7rem;"><i class="bi bi-check-circle me-1"></i>Current</span>`
          : '';
        return `
        <div class="version-item">
          <div class="version-number">${v.version}</div>
          <div class="version-info">
            <div class="version-filename">${v.filename}${statusBadge}</div>
            <div class="version-meta">
              ${UI.formatDate(v.uploadedAt)} &bull; ${(v.size / 1024).toFixed(1)} KB &bull; by ${v.uploadedBy}
            </div>
            ${v.notes ? `<div class="version-meta mt-1"><i class="bi bi-chat-left-text me-1"></i>${v.notes}</div>` : ''}
          </div>
          ${!isPending ? `<button class="btn btn-sm btn-outline-primary" onclick="window.open('/unifiedsmi/api/ems/documents/${docId}/versions/${v.version}/download','_blank')"><i class="bi bi-download"></i></button>` : '<span class="btn btn-sm btn-outline-secondary disabled"><i class="bi bi-hourglass"></i></span>'}
        </div>`;
      }).join('');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('versionHistoryModal')).show();
  }

  /* ════════════════════════════════════════════════════
     Lock / Unlock
     ════════════════════════════════════════════════════ */
  async function toggleLock(docId) {
    if (!currentDoc) return;
    const endpoint = currentDoc.lockedBy ? 'unlock' : 'lock';
    const data     = await API.post(`/api/ems/documents/${docId}/${endpoint}`);
    if (data?.success) {
      currentDoc = data.document;
      const lockBtn = document.getElementById('btnViewerLock');
      const isLocked = !!currentDoc.lockedBy;
      lockBtn.innerHTML = isLocked ? '<i class="bi bi-unlock"></i>' : '<i class="bi bi-lock"></i>';
      lockBtn.title     = isLocked ? 'Unlock' : 'Lock';
      UI.toast(isLocked ? 'Document locked' : 'Document unlocked');
    } else {
      UI.toast(data?.message || 'Action failed', 'danger');
    }
  }

  /* ════════════════════════════════════════════════════
     Annotation mode
     ════════════════════════════════════════════════════ */
  function enterAnnotationMode(docId) {
    const latestVer = currentDoc?.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType !== 'application/pdf') return UI.toast('Annotations only supported on PDFs', 'warning');

    _annotation = { docId, text: '', color: '#e63946', size: 13, x: 5, y: 10, page: 1 };

    document.getElementById('annotationBanner')?.classList.remove('d-none');
    _setViewerActionsVisible(false);

    // Live-update ghost as user types
    const textInput = document.getElementById('annotationText');
    const colorInput = document.getElementById('annotationColor');
    const sizeInput  = document.getElementById('annotationSize');
    const pageInput  = document.getElementById('annotationPage');

    textInput.value  = '';
    colorInput.value = _annotation.color;
    sizeInput.value  = '13';
    pageInput.value  = '1';
    pageInput.max    = currentDoc.versions?.[currentDoc.versions.length - 1] ? 999 : 1;

    textInput.oninput  = () => { _annotation.text  = textInput.value;          _updateAnnotationGhost(); };
    colorInput.oninput = () => { _annotation.color = colorInput.value;         _updateAnnotationGhost(); };
    sizeInput.onchange = () => { _annotation.size  = parseInt(sizeInput.value); _updateAnnotationGhost(); };
    pageInput.onchange = () => {
      _annotation.page = Math.max(1, parseInt(pageInput.value) || 1);
      _renderPdfForPlacement();
    };

    _renderPdfForPlacement(); // reuse pdf.js page rendering from placement mode
    setTimeout(() => textInput.focus(), 300);
  }

  function _spawnAnnotationGhost() {
    document.getElementById('annPlacementGhost')?.remove();
    const pageDiv = document.getElementById('pdfPageDiv');
    if (!pageDiv || !_annotation) return;

    const ghost = document.createElement('div');
    ghost.id = 'annPlacementGhost';
    ghost.className = 'ann-placement-ghost';
    ghost.style.left  = _annotation.x + '%';
    ghost.style.top   = _annotation.y + '%';
    ghost.style.color = _annotation.color;
    ghost.style.fontSize = _annotation.size + 'px';
    ghost.textContent = _annotation.text || 'Type your annotation…';
    ghost.style.opacity = _annotation.text ? '1' : '0.45';

    ghost.addEventListener('mousedown', e => _onAnnotationGhostMouseDown(e));
    pageDiv.appendChild(ghost);
    ghost.scrollIntoView({ block: 'nearest' });
  }

  function _updateAnnotationGhost() {
    const ghost = document.getElementById('annPlacementGhost');
    if (!ghost || !_annotation) return;
    ghost.style.color    = _annotation.color;
    ghost.style.fontSize = _annotation.size + 'px';
    ghost.textContent    = _annotation.text || 'Type your annotation…';
    ghost.style.opacity  = _annotation.text ? '1' : '0.45';
  }

  function _onAnnotationGhostMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const ghost     = document.getElementById('annPlacementGhost');
    const ghostRect = ghost.getBoundingClientRect();
    const offsetX   = e.clientX - ghostRect.left;
    const offsetY   = e.clientY - ghostRect.top;

    const onMove = ev => {
      const container = document.getElementById('pdfPageDiv');
      const g = document.getElementById('annPlacementGhost');
      if (!container || !g) return;
      const cr = container.getBoundingClientRect();
      let l = Math.max(0, Math.min(cr.width  - g.offsetWidth,  ev.clientX - cr.left - offsetX));
      let t = Math.max(0, Math.min(cr.height - g.offsetHeight, ev.clientY - cr.top  - offsetY));
      _annotation.x = (l / cr.width)  * 100;
      _annotation.y = (t / cr.height) * 100;
      g.style.left = _annotation.x + '%';
      g.style.top  = _annotation.y + '%';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* Stage the annotation — does NOT call the server yet */
  async function confirmAnnotation() {
    if (!_annotation) return;
    if (!_annotation.text?.trim()) return UI.toast('Please type an annotation first', 'warning');

    const x    = Math.round(_annotation.x * 10) / 10;
    const y    = Math.round(_annotation.y * 10) / 10;
    const text = _annotation.text.trim();

    _pendingEdits.push({
      type:    'annotation',
      apiPath: `/api/ems/documents/${_annotation.docId}/annotate`,
      method:  'post',
      body:    { text, color: _annotation.color, size: _annotation.size, x, y, page: _annotation.page }
    });

    // Keep the visual preview in the re-rendered multi-page view
    _stagedOverlays.push({ type: 'annotation', page: _annotation.page, x, y, text, color: _annotation.color, size: _annotation.size });

    cancelAnnotation(); // hides banner + re-renders preview (which calls _reapplyStagedOverlays)
    _markDirty();
  }

  function cancelAnnotation() {
    document.getElementById('annPlacementGhost')?.remove();
    document.getElementById('annotationBanner')?.classList.add('d-none');
    _annotation = null;
    _pdfJsState = null;
    _setViewerActionsVisible(true);
    renderPreview();
  }

  /* ════════════════════════════════════════════════════
     Staged overlays — show pending edits on top of the
     PDF page wrappers (for signatures) or docViewerBody
     (for image files) without touching the server.
     ════════════════════════════════════════════════════ */
  function _reapplyStagedOverlays() {
    if (!_stagedOverlays.length) return;

    const scroller = document.getElementById('pdfPreviewScroller');
    const body     = document.getElementById('docViewerBody');

    _stagedOverlays.forEach(ov => {
      if (scroller) {
        const pages   = Array.from(scroller.children);
        const wrapper = pages[(ov.page || 1) - 1];
        if (!wrapper) return;
        wrapper.style.position = 'relative';
        wrapper.appendChild(_buildOverlayEl(ov));
      } else if (body && ov.type === 'signature') {
        body.appendChild(_buildOverlayEl(ov));
      }
    });
  }

  function _buildOverlayEl(ov) {
    const el = document.createElement('div');
    el.className = 'staged-edit-preview';
    el.style.cssText = 'position:absolute;pointer-events:none;z-index:10;';

    if (ov.type === 'signature') {
      el.style.left  = ov.x + '%';
      el.style.top   = ov.y + '%';
      el.style.width = ov.width + '%';
      el.innerHTML = `
        <img src="${ov.imageData}" alt="Signature" style="width:100%;display:block;opacity:0.9;">
        <div style="font-size:9px;color:#92400e;background:rgba(254,243,199,0.9);text-align:center;padding:1px 4px;border-radius:0 0 3px 3px;">
          <i class="bi bi-clock-history me-1"></i>Pending save
        </div>`;
    } else if (ov.type === 'annotation') {
      el.style.left       = ov.x + '%';
      el.style.top        = ov.y + '%';
      el.style.color      = ov.color;
      el.style.fontSize   = ov.size + 'px';
      el.style.background = 'rgba(255,255,255,0.75)';
      el.style.padding    = '2px 6px';
      el.style.border     = `1px dashed ${ov.color}`;
      el.style.borderRadius = '3px';
      el.style.lineHeight = '1.3';
      el.innerHTML = `${ov.text}<div style="font-size:9px;color:#92400e;margin-top:2px;"><i class="bi bi-clock-history me-1"></i>Pending save</div>`;
    }

    return el;
  }

  /* ════════════════════════════════════════════════════
     Dirty-state helpers
     ════════════════════════════════════════════════════ */
  function _markDirty() {
    _isDirty = true;
    document.getElementById('btnViewerSave')?.classList.remove('d-none');
  }

  function _markClean() {
    _isDirty        = false;
    _pendingEdits   = [];
    _stagedOverlays = [];
    document.getElementById('btnViewerSave')?.classList.add('d-none');
  }

  function _showUnsavedConfirmation() {
    document.getElementById('unsavedChangesOverlay')?.classList.remove('d-none');
  }

  function _hideUnsavedOverlay() {
    document.getElementById('unsavedChangesOverlay')?.classList.add('d-none');
  }

  /* ════════════════════════════════════════════════════
     Save all staged edits to the server
     ════════════════════════════════════════════════════ */
  async function saveAll() {
    if (!_pendingEdits.length) { _markClean(); return; }

    const toProcess = [..._pendingEdits];
    for (const edit of toProcess) {
      let data;
      if (edit.method === 'post') data = await API.post(edit.apiPath, edit.body);
      else                        data = await API.put(edit.apiPath, edit.body);

      if (!data?.success) {
        UI.toast(data?.message || `Failed to save ${edit.type}`, 'danger');
        return; // leave remaining edits staged
      }
      if (data.document) currentDoc = data.document;
    }

    UI.toast('All changes saved', 'success');
    _markClean();

    // Re-render from fresh server data
    const latestVer = currentDoc?.versions?.[currentDoc.versions.length - 1];
    if (latestVer?.mimeType === 'application/pdf') {
      try {
        const resp = await fetch(
          `/unifiedsmi/api/ems/documents/${currentDoc.id}/versions/${currentDoc.currentVersion}/view?t=${Date.now()}`,
          { cache: 'no-store', credentials: 'include' }
        );
        const ab = await resp.arrayBuffer();
        await _renderPdfPreview({ data: ab });
      } catch (err) {
        console.error('[DocViewer] post-save render failed:', err);
        renderPreview();
      }
    } else {
      renderPreview();
      renderWatermark();
      renderSignatures();
    }
  }

  return { open, renderPreview, renderWatermark, enterSignaturePlacementMode, confirmPlacement, cancelPlacement, confirmAnnotation, cancelAnnotation, saveAll };
})();
