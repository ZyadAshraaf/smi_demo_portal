/* ═══════════════════════════════════════════════════════════════
   customize.js — Color palette & logo management controller
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Color math (mirrors server-side logic for live preview) ──────────────
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  function toHex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
  }

  function shade(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return toHex(r + amount, g + amount, b + amount);
  }

  function mixWhite(hex, ratio) {
    const { r, g, b } = hexToRgb(hex);
    return toHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio);
  }

  function isValidHex(hex) { return /^#[0-9a-fA-F]{6}$/.test(hex); }

  // ── State ────────────────────────────────────────────────────────────────
  let currentPrimary   = '#001E57';
  let currentSecondary = '#DF6512';
  let pendingLogoBase64 = null;   // set when user picks a new logo file

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const pickPrimary    = document.getElementById('pickPrimary');
  const pickSecondary  = document.getElementById('pickSecondary');
  const hexPrimary     = document.getElementById('hexPrimary');
  const hexSecondary   = document.getElementById('hexSecondary');
  const swatchPrimary  = document.getElementById('swatchPrimary');
  const swatchSecondary= document.getElementById('swatchSecondary');
  const appNameInput   = document.getElementById('appNameInput');
  const logoDropZone   = document.getElementById('logoDropZone');
  const logoFileInput  = document.getElementById('logoFileInput');
  const logoFileName   = document.getElementById('logoFileName');
  const logoFileNameText = document.getElementById('logoFileNameText');
  const logoPreviewImg = document.getElementById('logoPreviewImg');
  const sidebarLogo    = document.getElementById('sidebarLogo');
  const btnSaveAll     = document.getElementById('btnSaveAll');
  const btnReset       = document.getElementById('btnReset');

  // Preview elements
  const previewSidebar    = document.getElementById('previewSidebar');
  const previewSidebarBg  = document.getElementById('previewSidebarBg');
  const previewNavActive  = document.getElementById('previewNavActive');
  const previewAppName    = document.getElementById('previewAppName');
  const previewIconBg     = document.getElementById('previewIconBg');
  const previewIconColor  = document.getElementById('previewIconColor');
  const previewBtnPrimary = document.getElementById('previewBtnPrimary');
  const previewBtnOutline = document.getElementById('previewBtnOutline');
  const previewProgressBar= document.getElementById('previewProgressBar');
  const previewLink       = document.getElementById('previewLink');
  const shadeReference    = document.getElementById('shadeReference');

  // Shade chips
  const shadeDarker  = document.getElementById('shadeDarker');
  const shadeDark    = document.getElementById('shadeDark');
  const shadeBase    = document.getElementById('shadeBase');
  const shadeLight   = document.getElementById('shadeLight');
  const shadeLighter = document.getElementById('shadeLighter');
  const shadeFaint   = document.getElementById('shadeFaint');

  // ── Live Preview update ──────────────────────────────────────────────────
  function updatePreview(primary, secondary) {
    const pDark    = shade(primary, -18);
    const pDarker  = shade(primary, -40);
    const pLight   = shade(primary, 14);
    const pLighter = mixWhite(primary, 0.38);
    const pFaint   = mixWhite(primary, 0.88);

    // Sidebar
    previewSidebar.style.background   = primary;
    previewSidebarBg.style.background = pDark;
    previewNavActive.style.background = 'rgba(255,255,255,0.2)';

    // Buttons
    previewBtnPrimary.style.background  = primary;
    previewBtnPrimary.style.borderColor = primary;
    previewBtnOutline.style.color       = primary;
    previewBtnOutline.style.borderColor = primary;

    // Icon stat card
    previewIconBg.style.background = pFaint;
    previewIconColor.style.color   = primary;

    // Progress bar
    previewProgressBar.style.background = primary;

    // Link
    previewLink.style.color = primary;

    // App name in mini sidebar
    previewAppName.textContent = appNameInput.value.trim() || 'Unified Workspace';

    // Shade chips (inline)
    shadeDarker.style.background  = pDarker;
    shadeDark.style.background    = pDark;
    shadeBase.style.background    = primary;
    shadeLight.style.background   = pLight;
    shadeLighter.style.background = pLighter;
    shadeFaint.style.background   = pFaint;

    // Shade reference panel
    const shades = [
      { label: 'Darker',  color: pDarker  },
      { label: 'Dark',    color: pDark    },
      { label: 'Base',    color: primary  },
      { label: 'Light',   color: pLight   },
      { label: 'Lighter', color: pLighter },
      { label: 'Faint',   color: pFaint   },
      { label: 'Secondary', color: secondary }
    ];
    shadeReference.innerHTML = shades.map(s => `
      <div class="col">
        <div style="height:28px;border-radius:6px;background:${s.color};border:1px solid rgba(0,0,0,0.07)" title="${s.color}"></div>
        <div class="mt-1" style="color:#888;font-size:10px">${s.label}</div>
        <div style="font-size:9px;color:#aaa">${s.color}</div>
      </div>`).join('');

    // Swatch backgrounds
    swatchPrimary.style.background   = primary;
    swatchSecondary.style.background = secondary;
  }

  // ── Load settings from server ────────────────────────────────────────────
  async function loadSettings() {
    try {
      const data = await API.get('/api/customize/settings');
      if (!data.success) return;
      const s = data.settings;
      currentPrimary   = s.colors.primary;
      currentSecondary = s.colors.secondary;

      pickPrimary.value    = currentPrimary;
      pickSecondary.value  = currentSecondary;
      hexPrimary.value     = currentPrimary;
      hexSecondary.value   = currentSecondary;
      appNameInput.value   = s.appName || 'Unified Workspace';

      updatePreview(currentPrimary, currentSecondary);
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  // ── Primary color picker ─────────────────────────────────────────────────
  pickPrimary.addEventListener('input', function () {
    currentPrimary    = this.value;
    hexPrimary.value  = this.value;
    updatePreview(currentPrimary, currentSecondary);
  });

  hexPrimary.addEventListener('change', function () {
    let v = this.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (isValidHex(v)) {
      currentPrimary   = v;
      pickPrimary.value = v;
      this.value       = v;
      updatePreview(currentPrimary, currentSecondary);
    }
  });

  // ── Secondary color picker ───────────────────────────────────────────────
  pickSecondary.addEventListener('input', function () {
    currentSecondary    = this.value;
    hexSecondary.value  = this.value;
    updatePreview(currentPrimary, currentSecondary);
  });

  hexSecondary.addEventListener('change', function () {
    let v = this.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (isValidHex(v)) {
      currentSecondary   = v;
      pickSecondary.value = v;
      this.value         = v;
      updatePreview(currentPrimary, currentSecondary);
    }
  });

  // ── App name live preview ────────────────────────────────────────────────
  appNameInput.addEventListener('input', function () {
    previewAppName.textContent = this.value.trim() || 'Unified Workspace';
  });

  // ── Logo file handling ───────────────────────────────────────────────────
  function handleLogoFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      UI.toast('Please select a valid image file.', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      UI.toast('Image must be under 2 MB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      pendingLogoBase64 = e.target.result;  // full DataURL
      logoPreviewImg.src = pendingLogoBase64;
      logoPreviewImg.style.display = '';
      sidebarLogo.src = pendingLogoBase64;
      const topbarLogo = document.getElementById('topbarLogo');
      if (topbarLogo) topbarLogo.src = pendingLogoBase64;
      logoFileName.classList.remove('d-none');
      logoFileNameText.textContent = file.name;
    };
    reader.readAsDataURL(file);
  }

  logoDropZone.addEventListener('click', () => logoFileInput.click());
  logoFileInput.addEventListener('change', function () {
    if (this.files[0]) handleLogoFile(this.files[0]);
  });

  logoDropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    this.classList.add('dragover');
  });
  logoDropZone.addEventListener('dragleave', function () {
    this.classList.remove('dragover');
  });
  logoDropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    this.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleLogoFile(file);
  });

  // ── Save & Apply ─────────────────────────────────────────────────────────
  btnSaveAll.addEventListener('click', async function () {
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving…';

    try {
      // 1. Save colors + app name
      const settingsRes = await API.put('/api/customize/settings', {
        primary:   currentPrimary,
        secondary: currentSecondary,
        appName:   appNameInput.value.trim() || 'Unified Workspace'
      });
      if (!settingsRes.success) throw new Error(settingsRes.message || 'Failed to save settings');

      // 2. Upload logo if a new one was picked
      if (pendingLogoBase64) {
        const logoRes = await API.post('/api/customize/logo', { data: pendingLogoBase64 });
        if (!logoRes.success) throw new Error(logoRes.message || 'Failed to upload logo');
        pendingLogoBase64 = null;
        logoFileName.classList.add('d-none');
      }

      UI.toast('Settings saved! Refreshing theme…', 'success');

      // 3. Force reload so /theme.css is re-fetched with new colors
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      UI.toast(err.message || 'Save failed.', 'danger');
      this.disabled = false;
      this.innerHTML = '<i class="bi bi-check-lg me-2"></i>Save & Apply';
    }
  });

  // ── Reset to Defaults ────────────────────────────────────────────────────
  btnReset.addEventListener('click', async function () {
    const confirmed = await UI.confirm(
      'Reset to defaults?',
      'This will restore the original color palette, app name, and logo.',
      'Reset',
      'danger'
    );
    if (!confirmed) return;

    this.disabled = true;
    try {
      const res = await API.post('/api/customize/reset', {});
      if (!res.success) throw new Error(res.message || 'Reset failed');

      UI.toast('Defaults restored. Refreshing…', 'success');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      UI.toast(err.message || 'Reset failed.', 'danger');
      this.disabled = false;
    }
  });

  // ── Bootstrap Layout & init ──────────────────────────────────────────────
  Layout.init('customize');
  loadSettings();

})();
