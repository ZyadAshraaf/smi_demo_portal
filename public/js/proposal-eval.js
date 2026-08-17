/* ── Proposal Evaluation Controller ─────────────────────────
   Talks directly to the DocEval external API (not our Express
   server) using fetch + FormData for multipart uploads.
   ─────────────────────────────────────────────────────────── */

const DOCEVAL_BASE = '/unifiedsmi/api/doceval-proxy';

/* ── Module State ── */
let uploadedFiles    = [];   // File objects chosen by the user
let selectedContext  = '';   // RFP context_id from the dropdown
let criteriaRows     = [];   // [{ name: string, weight: number }]
let reportId         = null; // Returned by /api/rfp/analyze
let currentSections  = [];   // Full sections array of the live report
let chatHistory      = [];   // [{ role: 'user'|'assistant', content: string }]
let uploadedRfpFile  = null; // File object for user-uploaded RFP (upload mode only)
let rfpMode          = 'select'; // 'select' | 'upload'

/* ── Session persistence helpers ── */
const SESSION_KEY = 'proposalEvalSession';

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ reportId, currentSections, chatHistory }));
  } catch {}
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s.reportId || !s.currentSections?.length) return false;
    reportId        = s.reportId;
    currentSections = s.currentSections;
    chatHistory     = s.chatHistory || [];
    return true;
  } catch { return false; }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* ════════════════════════════════════════════════════════════
   Initialisation
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('proposal-eval');
  await loadContexts();
  bindEvents();

  // Restore a previous session if the user navigated away and came back
  if (loadSession()) {
    renderReport(currentSections);
    restoreChatHistory();
    showStep(3);
  } else {
    showStep(1);
  }
});

/* ════════════════════════════════════════════════════════════
   DocEval API helpers  (bypass our Express server — external)
   ════════════════════════════════════════════════════════════ */
async function deGet(path) {
  const res = await fetch(DOCEVAL_BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function dePost(path, body, isFormData = false) {
  const opts = { method: 'POST' };
  if (isFormData) {
    opts.body = body;
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body    = JSON.stringify(body);
  }
  const res = await fetch(DOCEVAL_BASE + path, opts);
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error || j.message || ''; } catch {}
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  }
  return res.json();
}

/* ════════════════════════════════════════════════════════════
   Wizard step management
   ════════════════════════════════════════════════════════════ */
let _loadingStepInterval = null;

function startLoadingStepCycle() {
  const steps = document.querySelectorAll('#step2 .ai-loading-step');
  let current = 0;
  steps.forEach((s, i) => s.classList.toggle('active', i === 0));
  _loadingStepInterval = setInterval(() => {
    if (current >= steps.length - 1) {
      clearInterval(_loadingStepInterval);
      _loadingStepInterval = null;
      return;
    }
    steps[current].classList.remove('active');
    current++;
    steps[current].classList.add('active');
  }, 4000);
}

function stopLoadingStepCycle() {
  if (_loadingStepInterval) { clearInterval(_loadingStepInterval); _loadingStepInterval = null; }
  document.querySelectorAll('#step2 .ai-loading-step').forEach((s, i) => s.classList.toggle('active', i === 0));
}

function showStep(n) {
  document.getElementById('step1').classList.toggle('d-none', n !== 1);
  document.getElementById('step2').classList.toggle('d-none', n !== 2);
  document.getElementById('step3').classList.toggle('d-none', n !== 3);

  if (n === 2) startLoadingStepCycle();
  else         stopLoadingStepCycle();

  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`wizStep${i}`);
    if (i < n)       el.className = 'wizard-step done';
    else if (i === n) el.className = 'wizard-step active';
    else              el.className = 'wizard-step pending';
  });
}

/* ════════════════════════════════════════════════════════════
   Context (RFP list) + Criteria loading
   ════════════════════════════════════════════════════════════ */
async function loadContexts() {
  try {
    const data = await deGet('/api/rfp/contexts');
    const sel  = document.getElementById('contextSelect');
    sel.innerHTML =
      '<option value="">— Select an RFP —</option>' +
      data.contexts.map(c =>
        `<option value="${c.context_id}">${c.title}</option>`
      ).join('');
  } catch (e) {
    UI.toast('Could not load RFP list — check network connection', 'danger');
  }
}

async function loadCriteria(contextId) {
  if (!contextId) {
    criteriaRows = [];
    renderCriteria();
    return;
  }
  try {
    const data   = await deGet(`/api/rfp/context/${contextId}/criteria`);
    criteriaRows = data.criteria.map(c => ({ name: c.name, weight: c.weight }));
    renderCriteria();
  } catch (e) {
    UI.toast('Could not load criteria for this RFP', 'danger');
  }
}

/* ════════════════════════════════════════════════════════════
   Criteria editor
   ════════════════════════════════════════════════════════════ */
function renderCriteria() {
  const container = document.getElementById('criteriaContainer');

  if (!criteriaRows.length) {
    container.innerHTML = '<div class="text-muted" style="font-size:13px;padding:8px 0">' +
      (rfpMode === 'upload'
        ? 'Upload an RFP document above to auto-extract criteria.'
        : 'Select an RFP above to load its default criteria.') +
      '</div>';
    updateWeightTotal();
    return;
  }

  container.innerHTML = criteriaRows.map((c, i) => `
    <div class="criteria-row">
      <input type="text"
             class="form-control form-control-sm criteria-name"
             value="${escHtml(c.name)}"
             placeholder="Criterion name"
             oninput="criteriaRows[${i}].name = this.value">
      <input type="number"
             class="form-control form-control-sm criteria-weight"
             value="${c.weight}"
             min="0" max="100"
             oninput="criteriaRows[${i}].weight = +this.value; updateWeightTotal()">
      <button class="btn-remove-criteria" onclick="removeCriteria(${i})" title="Remove">
        <i class="bi bi-x-lg" style="font-size:12px"></i>
      </button>
    </div>`).join('');

  updateWeightTotal();
}

function updateWeightTotal() {
  const total = criteriaRows.reduce((s, c) => s + (+c.weight || 0), 0);
  const el    = document.getElementById('weightTotal');
  el.textContent = `Total: ${total} / 100`;
  el.style.background = total === 100 ? 'var(--color-success-light)' : 'var(--color-danger-light)';
  el.style.color      = total === 100 ? 'var(--color-success)'       : 'var(--color-danger)';
}

/* Called from inline onclick in renderCriteria */
function addCriteria() {
  criteriaRows.push({ name: '', weight: 0 });
  renderCriteria();
}

function removeCriteria(i) {
  criteriaRows.splice(i, 1);
  renderCriteria();
}

/* ════════════════════════════════════════════════════════════
   File upload
   ════════════════════════════════════════════════════════════ */
function handleFiles(files) {
  const pdfs = Array.from(files).filter(
    f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (!pdfs.length) { UI.toast('Only PDF files are accepted', 'warning'); return; }
  uploadedFiles.push(...pdfs);
  renderFileList();
}

function renderFileList() {
  const el = document.getElementById('fileList');
  if (!uploadedFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = uploadedFiles.map((f, i) => `
    <div class="file-chip">
      <i class="bi bi-file-earmark-pdf file-chip-icon"></i>
      <span class="file-chip-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
      <span class="file-chip-size">${formatBytes(f.size)}</span>
      <button class="file-chip-remove" onclick="removeFile(${i})" title="Remove">
        <i class="bi bi-x"></i>
      </button>
    </div>`).join('');
}

/* Called from inline onclick */
function removeFile(i) {
  uploadedFiles.splice(i, 1);
  renderFileList();
}

/* ── RFP upload panel helpers ──────────────────────────────── */
function resetRfpUploadPanel() {
  uploadedRfpFile = null;
  selectedContext  = '';
  document.getElementById('rfpUploadZone').classList.remove('d-none');
  document.getElementById('rfpUploading').classList.add('d-none');
  document.getElementById('rfpFileChip').classList.add('d-none');
  document.getElementById('rfpChipName').textContent  = '';
  document.getElementById('rfpChipTitle').textContent = '';
  criteriaRows = [];
  renderCriteria();
}

async function handleRfpUpload(file) {
  const extOk  = /\.(pdf|docx)$/i.test(file.name);
  const typeOk = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ].includes(file.type);
  if (!typeOk && !extOk) {
    UI.toast('Only PDF or DOCX files are accepted for RFP upload', 'warning');
    return;
  }

  document.getElementById('rfpUploadZone').classList.add('d-none');
  document.getElementById('rfpUploading').classList.remove('d-none');
  document.getElementById('rfpFileChip').classList.add('d-none');

  const fd = new FormData();
  fd.append('file', file);

  try {
    const data = await dePost('/api/rfp/upload-context', fd, true);
    uploadedRfpFile = file;
    selectedContext  = data.context_id;
    criteriaRows     = (data.criteria || []).map(c => ({ name: c.name, weight: +c.weight }));

    document.getElementById('rfpUploading').classList.add('d-none');
    const chip = document.getElementById('rfpFileChip');
    chip.classList.remove('d-none');
    document.getElementById('rfpChipName').textContent  = file.name;
    document.getElementById('rfpChipTitle').textContent = data.title ? `Extracted: ${data.title}` : '';

    renderCriteria();
    UI.toast('RFP uploaded — criteria auto-populated', 'success');
  } catch (e) {
    UI.toast('RFP upload failed: ' + e.message, 'danger');
    document.getElementById('rfpUploadZone').classList.remove('d-none');
    document.getElementById('rfpUploading').classList.add('d-none');
  }
}

/* ════════════════════════════════════════════════════════════
   Run evaluation
   ════════════════════════════════════════════════════════════ */
async function runEvaluation() {
  if (!uploadedFiles.length)
    return UI.toast('Upload at least one proposal PDF', 'warning');
  if (!selectedContext)
    return UI.toast(
      rfpMode === 'upload'
        ? 'Upload an RFP document before running evaluation'
        : 'Select an RFP from the dropdown',
      'warning'
    );
  if (!criteriaRows.length)
    return UI.toast('Add at least one evaluation criterion', 'warning');
  if (criteriaRows.some(c => !c.name.trim()))
    return UI.toast('All criteria must have a name', 'warning');

  const total = criteriaRows.reduce((s, c) => s + (+c.weight || 0), 0);
  if (total !== 100)
    return UI.toast(`Criteria weights must sum to 100 (currently ${total})`, 'warning');

  showStep(2);

  const fd = new FormData();
  fd.append('context_id', selectedContext);
  fd.append('criteria_payload', JSON.stringify(criteriaRows));
  uploadedFiles.forEach(f => fd.append('files', f));

  try {
    const data      = await dePost('/api/rfp/analyze', fd, true);
    reportId        = data.report_id;
    currentSections = data.sections || [];
    chatHistory     = [];

    saveSession();
    renderReport(currentSections);
    showStep(3);
    document.getElementById('chatMessages').scrollTop = 0;
  } catch (e) {
    UI.toast('Evaluation failed: ' + e.message, 'danger');
    showStep(1);
  }
}

/* ════════════════════════════════════════════════════════════
   Report rendering
   ════════════════════════════════════════════════════════════ */
function renderReport(sections) {
  const container = document.getElementById('reportContainer');
  container.innerHTML = sections.map((s, i) => buildSectionHtml(s, i)).join('');

  // Plotly renders after the DOM is populated
  sections.forEach((s, i) => {
    if (s.type === 'plotly' && Array.isArray(s.plot_data) && s.plot_data.length) {
      renderPlotlyChart(`chart_${i}`, s.plot_data, s.title);
    }
  });
}

function buildSectionHtml(s, idx) {
  const { iconClass, iconTheme } = resolveSectionIcon(s.icon);

  const header = `
    <div class="report-section-head">
      <div class="section-icon ${iconTheme}"><i class="bi ${iconClass}"></i></div>
      <div class="section-title">${escHtml(s.title)}</div>
    </div>`;

  let body = '';

  switch (s.type) {

    case 'text':
      body = `<div class="section-text">${escHtml(s.content || '')}</div>`;
      break;

    case 'table': {
      // Content block: overall score, strengths, concern + description
      let contentHtml = '';
      if (s.content) {
        contentHtml = `<div class="section-content-block">`;
        s.content.split('\n').forEach(line => {
          if (!line.trim()) {
            contentHtml += '<div style="height:6px"></div>';
          } else if (line.startsWith('•')) {
            contentHtml += `<div class="content-line-bullet">${escHtml(line)}</div>`;
          } else if (line.match(/^Overall Score:/)) {
            contentHtml += `<div class="content-line-score">${escHtml(line)}</div>`;
          } else {
            contentHtml += `<div>${escHtml(line)}</div>`;
          }
        });
        contentHtml += `</div>`;
      }
      // Criteria table
      let tableHtml = '';
      if (s.columns && s.rows) {
        tableHtml = `
          <div class="table-responsive">
            <table class="table report-table mb-0">
              <thead><tr>${s.columns.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
              <tbody>${s.rows.map(row =>
                `<tr>${row.map(cell => `<td>${escHtml(String(cell))}</td>`).join('')}</tr>`
              ).join('')}</tbody>
            </table>
          </div>`;
      }
      body = contentHtml + tableHtml;
      break;
    }

    case 'list':
      body = (s.items || []).map(item => `
        <div class="report-list-item">
          <span class="report-list-bullet">•</span>
          <span>${escHtml(item)}</span>
        </div>`).join('');
      break;

    case 'score_matrix':
      body = (s.scores || []).map(score => {
        const pct = score.max > 0 ? ((score.score / score.max) * 100).toFixed(1) : 0;
        return `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:13px;font-weight:600;color:var(--color-text)">${escHtml(score.category)}</span>
              <span style="font-size:13px;font-weight:700;color:var(--color-primary)">${score.score} / ${score.max}</span>
            </div>
            <div style="height:8px;background:var(--color-surface);border-radius:4px;overflow:hidden;border:1px solid var(--color-border-light)">
              <div style="width:${pct}%;height:100%;background:var(--color-primary);border-radius:4px;transition:width 0.6s ease"></div>
            </div>
          </div>`;
      }).join('');
      break;

    case 'plotly':
      body = `<div id="chart_${idx}" style="min-height:280px;margin:-4px"></div>`;
      break;

    default:
      body = s.content ? `<div class="section-text">${escHtml(s.content)}</div>` : '';
  }

  return `<div class="report-section">${header}${body}</div>`;
}

/* Map API icon names → Bootstrap Icon classes + colour themes */
function resolveSectionIcon(icon) {
  const map = {
    'check-circle':   { iconClass: 'bi-check-circle-fill', iconTheme: 'primary' },
    'alert-triangle': { iconClass: 'bi-exclamation-triangle-fill', iconTheme: 'warning' },
    'bar-chart-2':    { iconClass: 'bi-bar-chart-fill',    iconTheme: 'primary' },
    'table':          { iconClass: 'bi-table',             iconTheme: 'primary' },
    'info':           { iconClass: 'bi-info-circle-fill',  iconTheme: 'primary' },
  };
  return map[icon] || { iconClass: 'bi-file-text', iconTheme: 'primary' };
}

function renderPlotlyChart(elementId, plotData, title) {
  if (typeof Plotly === 'undefined') return;

  // Apply brand colour palette to each trace
  const palette = [
    'var(--color-primary)', '#DF6512', '#1A9E6A',
    '#E6A817', '#DC3545', '#0D7BB5', '#6f42c1'
  ];

  // Resolve CSS variables to actual colours for Plotly
  const style   = getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue('--color-primary').trim() || '#001E57';
  const secondary = style.getPropertyValue('--color-secondary').trim() || '#DF6512';
  const resolvedPalette = [primary, secondary, '#1A9E6A', '#E6A817', '#DC3545', '#0D7BB5'];

  const traces = plotData.map((trace, i) => ({
    ...trace,
    marker: { color: resolvedPalette[i % resolvedPalette.length] }
  }));

  const layout = {
    barmode:       'group',
    margin:        { t: 16, b: 90, l: 50, r: 16 },
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    font:          { family: 'inherit', size: 12, color: '#1A2233' },
    legend:        { orientation: 'h', y: -0.35, font: { size: 11 } },
    xaxis:         { tickangle: -20, automargin: true, gridcolor: 'transparent' },
    yaxis:         { gridcolor: '#E6E9F0', zeroline: false }
  };

  Plotly.newPlot(elementId, traces, layout, { responsive: true, displayModeBar: false });
}

/* ════════════════════════════════════════════════════════════
   Chat
   ════════════════════════════════════════════════════════════ */
function appendChatMsg(role, text) {
  const container = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div  = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-bubble">${escHtml(text)}</div>
    <div class="chat-time">${time}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg assistant';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="chat-bubble chat-typing">
      <span></span><span></span><span></span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

/* Silent re-evaluation when the server loses the report (Heroku restart).
   Re-calls /api/rfp/analyze with the same inputs already in memory.
   Returns true on success, false on any failure. */
async function silentReEvaluate() {
  try {
    const fd = new FormData();
    fd.append('context_id', selectedContext);
    fd.append('criteria_payload', JSON.stringify(criteriaRows));
    uploadedFiles.forEach(f => fd.append('files', f));
    const data      = await dePost('/api/rfp/analyze', fd, true);
    reportId        = data.report_id;
    currentSections = data.sections || [];
    saveSession();
    return true;
  } catch {
    return false;
  }
}

async function sendChatMessage() {
  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const msg     = input.value.trim();
  if (!msg || !reportId) return;

  input.value      = '';
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:14px;height:14px"></span>';

  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });
  showTypingIndicator();

  const payload = {
    message:         msg,
    chat_history:    chatHistory.slice(0, -1),
    previous_report: { report_id: reportId, sections: currentSections }
  };

  let data = null;
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      data = await dePost(`/api/rfp/reports/${reportId}/chat`, payload);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        // Brief pause before retry (handles Heroku cold-start / transient errors)
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  removeTypingIndicator();

  // 404 → server lost the report; try to reconnect if files are still in memory
  if (lastError && lastError.message.startsWith('404') &&
      uploadedFiles.length && selectedContext && criteriaRows.length) {
    appendChatMsg('assistant', 'Session expired. Reconnecting automatically, please wait…');
    showTypingIndicator();
    const ok = await silentReEvaluate();
    removeTypingIndicator();
    if (ok) {
      payload.previous_report = { report_id: reportId, sections: currentSections };
      try {
        data      = await dePost(`/api/rfp/reports/${reportId}/chat`, payload);
        lastError = null;
      } catch (retryErr) {
        lastError = retryErr;
      }
    }
  }

  if (lastError) {
    console.error('Chat error:', lastError);
    const sessionGone = lastError.message.startsWith('404') || !uploadedFiles.length;
    if (sessionGone) {
      appendChatMsg('assistant', 'The evaluation session expired. Please start a new evaluation to continue chatting.');
      clearSession();
    } else {
      appendChatMsg('assistant', `Sorry, something went wrong (${lastError.message}). Please try again.`);
    }
    chatHistory.pop();
  } else {
    const reply = data.message || 'Report updated.';
    appendChatMsg('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

    if (data.full_report?.sections?.length) {
      currentSections = data.full_report.sections;
      renderReport(currentSections);
      document.getElementById('reportContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    saveSession();
  }

  sendBtn.disabled  = false;
  sendBtn.innerHTML = '<i class="bi bi-send"></i>';
  input.focus();
}

/* Rebuild chat bubbles from saved chatHistory (used on session restore) */
function restoreChatHistory() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  chatHistory.forEach(m => appendChatMsg(m.role, m.content));
  if (!chatHistory.length) {
    container.innerHTML = `
      <div class="chat-msg assistant">
        <div class="chat-bubble">The evaluation report is ready. Ask me anything about the proposals — for example, try <em>"Which vendor has the best security posture?"</em> or <em>"Add a section about implementation timeline."</em></div>
        <div class="chat-time">Now</div>
      </div>`;
  }
}

/* ════════════════════════════════════════════════════════════
   Reset / new evaluation
   ════════════════════════════════════════════════════════════ */
function resetState() {
  clearSession();
  uploadedFiles   = [];
  selectedContext = '';
  criteriaRows    = [];
  reportId        = null;
  currentSections = [];
  chatHistory     = [];

  uploadedRfpFile = null;
  rfpMode         = 'select';

  document.getElementById('fileList').innerHTML         = '';
  document.getElementById('contextSelect').value        = '';
  document.getElementById('reportContainer').innerHTML  = '';
  document.getElementById('rfpModeSelect').classList.add('active');
  document.getElementById('rfpModeUpload').classList.remove('active');
  document.getElementById('rfpSelectPanel').classList.remove('d-none');
  document.getElementById('rfpUploadPanel').classList.add('d-none');
  resetRfpUploadPanel();
  // Reset chat to welcome message
  document.getElementById('chatMessages').innerHTML = `
    <div class="chat-msg assistant">
      <div class="chat-bubble">The evaluation report is ready. Ask me anything about the proposals — for example, try <em>"Which vendor has the best security posture?"</em> or <em>"Add a section about implementation timeline."</em></div>
      <div class="chat-time">Now</div>
    </div>`;

  renderCriteria();
  showStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   Event binding
   ════════════════════════════════════════════════════════════ */
function bindEvents() {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  // Drag-and-drop
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });

  // Context selector
  document.getElementById('contextSelect').addEventListener('change', e => {
    selectedContext = e.target.value;
    loadCriteria(selectedContext);
  });

  // Add criterion button
  document.getElementById('btnAddCriteria').addEventListener('click', addCriteria);

  // Run evaluation
  document.getElementById('btnEvaluate').addEventListener('click', runEvaluation);

  // Reset
  document.getElementById('btnReset').addEventListener('click', resetState);

  // Chat send
  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // ── RFP Mode Toggle ──────────────────────────────────────
  const rfpModeSelectBtn = document.getElementById('rfpModeSelect');
  const rfpModeUploadBtn = document.getElementById('rfpModeUpload');
  const rfpSelectPanel   = document.getElementById('rfpSelectPanel');
  const rfpUploadPanel   = document.getElementById('rfpUploadPanel');

  rfpModeSelectBtn.addEventListener('click', () => {
    if (rfpMode === 'select') return;
    rfpMode = 'select';
    rfpModeSelectBtn.classList.add('active');
    rfpModeUploadBtn.classList.remove('active');
    rfpSelectPanel.classList.remove('d-none');
    rfpUploadPanel.classList.add('d-none');
    resetRfpUploadPanel();
    const sel = document.getElementById('contextSelect');
    selectedContext = sel.value;
    if (selectedContext) loadCriteria(selectedContext);
    else { criteriaRows = []; renderCriteria(); }
  });

  rfpModeUploadBtn.addEventListener('click', () => {
    if (rfpMode === 'upload') return;
    rfpMode = 'upload';
    rfpModeUploadBtn.classList.add('active');
    rfpModeSelectBtn.classList.remove('active');
    rfpUploadPanel.classList.remove('d-none');
    rfpSelectPanel.classList.add('d-none');
    selectedContext = '';
    document.getElementById('contextSelect').value = '';
    criteriaRows = [];
    renderCriteria();
  });

  // ── RFP Upload Zone ──────────────────────────────────────
  const rfpZone  = document.getElementById('rfpUploadZone');
  const rfpInput = document.getElementById('rfpFileInput');

  rfpZone.addEventListener('dragover',  e => { e.preventDefault(); rfpZone.classList.add('drag-over'); });
  rfpZone.addEventListener('dragleave', ()  => rfpZone.classList.remove('drag-over'));
  rfpZone.addEventListener('drop', e => {
    e.preventDefault();
    rfpZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleRfpUpload(e.dataTransfer.files[0]);
  });
  rfpZone.addEventListener('click', () => rfpInput.click());
  rfpInput.addEventListener('change', () => {
    if (rfpInput.files.length) { handleRfpUpload(rfpInput.files[0]); rfpInput.value = ''; }
  });

  // ── RFP Chip Remove ──────────────────────────────────────
  document.getElementById('rfpChipRemove').addEventListener('click', resetRfpUploadPanel);
}

/* ════════════════════════════════════════════════════════════
   Utilities
   ════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
