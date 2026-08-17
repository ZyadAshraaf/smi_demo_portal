/* ── Resume Evaluation Controller ───────────────────────────
   HR variant of proposal-eval.js.
   Talks directly to the DocEval external API using the /hr/
   endpoints. Adds rendering for the score_matrix section type
   which is unique to CV evaluations.
   ─────────────────────────────────────────────────────────── */

const DOCEVAL_BASE = '/unifiedsmi/api/doceval-proxy';

/* ── Module State ── */
let uploadedFiles    = [];
let selectedContext  = '';
let criteriaRows     = [];
let reportId         = null;
let currentSections  = [];
let chatHistory      = [];
let jdMode           = 'select'; // 'select' | 'custom'
let customDescription = '';      // Job description text (custom mode only)

/* ════════════════════════════════════════════════════════════
   Initialisation
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('resume-eval');
  await loadContexts();
  bindEvents();
  showStep(1);
});

/* ════════════════════════════════════════════════════════════
   DocEval API helpers
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
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await res.json();
        detail = j.message || j.detail || j.error || '';
      } else {
        // HTML or plain-text error (e.g. raw Heroku error page leaking through)
        detail = 'The AI service returned an unexpected error. Please try again.';
      }
    } catch {}
    throw new Error(`${res.status}${detail ? ' — ' + detail : ' ' + res.statusText}`);
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
  // reset to step 1 only when leaving step 2, ready for next run
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
    if (i < n)        el.className = 'wizard-step done';
    else if (i === n) el.className = 'wizard-step active';
    else              el.className = 'wizard-step pending';
  });
}

/* ════════════════════════════════════════════════════════════
   Context (Job Vacancies) + Criteria loading
   ════════════════════════════════════════════════════════════ */
async function loadContexts() {
  try {
    const data = await deGet('/api/hr/contexts');
    const sel  = document.getElementById('contextSelect');
    sel.innerHTML =
      '<option value="">— Select a Job Vacancy —</option>' +
      data.contexts.map(c =>
        `<option value="${c.context_id}">${c.title}</option>`
      ).join('');
  } catch (e) {
    UI.toast('Could not load job vacancy list — check network connection', 'danger');
  }
}

async function loadCriteria(contextId) {
  if (!contextId) {
    criteriaRows = [];
    renderCriteria();
    return;
  }
  try {
    const data   = await deGet(`/api/hr/context/${contextId}/criteria`);
    criteriaRows = data.criteria.map(c => ({ name: c.name, weight: c.weight }));
    renderCriteria();
  } catch (e) {
    UI.toast('Could not load criteria for this vacancy', 'danger');
  }
}

/* ════════════════════════════════════════════════════════════
   Criteria editor
   ════════════════════════════════════════════════════════════ */
function renderCriteria() {
  const container = document.getElementById('criteriaContainer');

  if (!criteriaRows.length) {
    container.innerHTML = '<div class="text-muted" style="font-size:13px;padding:8px 0">' +
      (jdMode === 'custom'
        ? 'Enter a job description above and click <strong>Generate Criteria</strong>.'
        : 'Select a job vacancy above to load its default criteria.') +
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
  el.textContent      = `Total: ${total} / 100`;
  el.style.background = total === 100 ? 'var(--color-success-light)' : 'var(--color-danger-light)';
  el.style.color      = total === 100 ? 'var(--color-success)'       : 'var(--color-danger)';
}

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

function removeFile(i) {
  uploadedFiles.splice(i, 1);
  renderFileList();
}

/* ════════════════════════════════════════════════════════════
   Custom JD — generate criteria from description
   ════════════════════════════════════════════════════════════ */
async function generateCriteria() {
  const textarea = document.getElementById('jdTextarea');
  const btn      = document.getElementById('btnGenerateCriteria');
  const desc     = textarea.value.trim();

  if (!desc)
    return UI.toast('Enter a job description first', 'warning');

  btn.disabled     = true;
  btn.innerHTML    = '<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;border-width:2px"></span> Generating…';

  try {
    const data   = await dePost('/api/hr/generate-criteria', { description: desc });
    criteriaRows = (data.criteria || []).map(c => ({ name: c.name, weight: +c.weight }));
    renderCriteria();
    UI.toast('Criteria generated — review and adjust weights', 'success');
  } catch (e) {
    UI.toast('Could not generate criteria: ' + e.message, 'danger');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="bi bi-stars"></i> Generate Criteria from JD';
  }
}

/* ════════════════════════════════════════════════════════════
   Run evaluation
   ════════════════════════════════════════════════════════════ */
async function runEvaluation() {
  if (!uploadedFiles.length)
    return UI.toast('Upload at least one CV / resume PDF', 'warning');

  if (jdMode === 'custom') {
    // Sanitize: normalize line endings, replace multi-byte Unicode punctuation with
    // ASCII equivalents, and strip control chars. Some Python multipart parsers on
    // Heroku misread non-ASCII bytes in form fields when no charset is declared,
    // which crashes the server. Safe ASCII-equivalent substitutions preserve meaning.
    customDescription = document.getElementById('jdTextarea').value
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')               // normalise CRLF → LF
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")   // curly single quotes → '
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')   // curly double quotes → "
      .replace(/[\u2013\u2014\u2015\u2212]/g, '-')               // en-dash, em-dash, minus → -
      .replace(/[\u2022\u2023\u2024\u2025]/g, '*')               // bullet variants → *
      .replace(/\u2026/g, '...')                                  // ellipsis → ...
      .replace(/[\u00A0\u202F\u2009\u200A]/g, ' ')               // non-breaking / thin spaces → space
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')         // strip remaining control chars
      .trim();
    if (!customDescription)
      return UI.toast('Enter a job description before running evaluation', 'warning');
    if (customDescription.length > 6000)
      return UI.toast(`Job description is too long (${customDescription.length} chars). Please keep it under 6,000 characters to avoid timeouts.`, 'warning');
  } else {
    if (!selectedContext)
      return UI.toast('Select a job vacancy from the dropdown', 'warning');
  }

  if (!criteriaRows.length)
    return UI.toast('Add at least one evaluation criterion', 'warning');
  if (criteriaRows.some(c => !c.name.trim()))
    return UI.toast('All criteria must have a name', 'warning');

  const total = criteriaRows.reduce((s, c) => s + (+c.weight || 0), 0);
  if (total !== 100)
    return UI.toast(`Criteria weights must sum to 100 (currently ${total})`, 'warning');

  showStep(2);

  const fd = new FormData();
  fd.append('criteria_payload', JSON.stringify(criteriaRows));
  uploadedFiles.forEach(f => fd.append('files', f));

  let endpoint;
  if (jdMode === 'custom') {
    fd.append('custom_description', customDescription);
    endpoint = '/api/hr/analyze/custom_job_description';
  } else {
    fd.append('context_id', selectedContext);
    endpoint = '/api/hr/analyze';
  }

  try {
    const data      = await dePost(endpoint, fd, true);
    reportId        = data.report_id;
    currentSections = data.sections || [];
    chatHistory     = [];

    renderReport(currentSections);
    showStep(3);
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

  sections.forEach((s, i) => {
    if (s.type === 'plotly' && Array.isArray(s.plot_data) && s.plot_data.length) {
      renderPlotlyChart(`chart_${i}`, s.plot_data);
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

    /* score_matrix is HR-specific: per-candidate criterion score bars */
    case 'score_matrix':
      body = (s.scores || []).map(score => {
        const pct = score.max > 0 ? ((score.score / score.max) * 100).toFixed(1) : 0;
        // Colour the bar based on score percentage
        const barColor = pct >= 70
          ? 'var(--color-primary)'
          : pct >= 40
            ? 'var(--color-warning)'
            : 'var(--color-danger)';
        return `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:13px;font-weight:600;color:var(--color-text)">${escHtml(score.category)}</span>
              <span style="font-size:13px;font-weight:700;color:${barColor}">${score.score} / ${score.max}</span>
            </div>
            <div style="height:9px;background:var(--color-surface);border-radius:5px;overflow:hidden;border:1px solid var(--color-border-light)">
              <div style="width:${pct}%;height:100%;background:${barColor};border-radius:5px;transition:width 0.7s ease"></div>
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

function resolveSectionIcon(icon) {
  const map = {
    'check-circle':   { iconClass: 'bi-check-circle-fill',       iconTheme: 'primary' },
    'alert-triangle': { iconClass: 'bi-exclamation-triangle-fill', iconTheme: 'warning' },
    'bar-chart-2':    { iconClass: 'bi-bar-chart-fill',           iconTheme: 'primary' },
    'table':          { iconClass: 'bi-table',                    iconTheme: 'primary' },
    'info':           { iconClass: 'bi-info-circle-fill',         iconTheme: 'primary' },
  };
  return map[icon] || { iconClass: 'bi-file-person', iconTheme: 'primary' };
}

function renderPlotlyChart(elementId, plotData) {
  if (typeof Plotly === 'undefined') return;

  const style    = getComputedStyle(document.documentElement);
  const primary  = style.getPropertyValue('--color-primary').trim()   || '#001E57';
  const secondary= style.getPropertyValue('--color-secondary').trim() || '#DF6512';
  const palette  = [primary, secondary, '#1A9E6A', '#E6A817', '#DC3545', '#0D7BB5'];

  const traces = plotData.map((trace, i) => ({
    ...trace,
    marker: { color: palette[i % palette.length] }
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

  try {
    const data = await dePost(`/api/hr/reports/${reportId}/chat`, {
      message:         msg,
      chat_history:    chatHistory.slice(0, -1),
      previous_report: { report_id: reportId, sections: currentSections }
    });

    removeTypingIndicator();

    const reply = data.message || 'Report updated.';
    appendChatMsg('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

    // Re-render report with updated or appended sections
    if (data.full_report?.sections?.length) {
      // HR chat returns only the new sections — merge them in
      const newTitles = new Set(data.full_report.sections.map(s => s.title));
      const merged = [
        ...currentSections.filter(s => !newTitles.has(s.title)),
        ...data.full_report.sections
      ];
      currentSections = merged;
      renderReport(currentSections);
      document.getElementById('reportContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

  } catch (e) {
    removeTypingIndicator();
    appendChatMsg('assistant', 'Sorry, something went wrong. Please try again.');
    chatHistory.pop();
  } finally {
    sendBtn.disabled  = false;
    sendBtn.innerHTML = '<i class="bi bi-send"></i>';
  }
}

/* ════════════════════════════════════════════════════════════
   Reset
   ════════════════════════════════════════════════════════════ */
function resetState() {
  uploadedFiles   = [];
  selectedContext = '';
  criteriaRows    = [];
  reportId        = null;
  currentSections = [];
  chatHistory     = [];

  jdMode            = 'select';
  customDescription = '';

  document.getElementById('fileList').innerHTML        = '';
  document.getElementById('contextSelect').value       = '';
  document.getElementById('jdTextarea').value          = '';
  updateJdCharCount();
  document.getElementById('reportContainer').innerHTML = '';
  document.getElementById('jdModeSelect').classList.add('active');
  document.getElementById('jdModeCustom').classList.remove('active');
  document.getElementById('jdSelectPanel').classList.remove('d-none');
  document.getElementById('jdCustomPanel').classList.add('d-none');
  document.getElementById('chatMessages').innerHTML    = `
    <div class="chat-msg assistant">
      <div class="chat-bubble">The candidate evaluation report is ready. Ask me anything — for example, <em>"Who is the best fit for this role?"</em> or <em>"Add a soft skills assessment section."</em></div>
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

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });

  document.getElementById('contextSelect').addEventListener('change', e => {
    selectedContext = e.target.value;
    loadCriteria(selectedContext);
  });

  document.getElementById('btnAddCriteria').addEventListener('click', addCriteria);
  document.getElementById('btnEvaluate').addEventListener('click', runEvaluation);
  document.getElementById('btnReset').addEventListener('click', resetState);

  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // ── Job Mode Toggle ──────────────────────────────────────
  const jdModeSelectBtn = document.getElementById('jdModeSelect');
  const jdModeCustomBtn = document.getElementById('jdModeCustom');
  const jdSelectPanel   = document.getElementById('jdSelectPanel');
  const jdCustomPanel   = document.getElementById('jdCustomPanel');

  jdModeSelectBtn.addEventListener('click', () => {
    if (jdMode === 'select') return;
    jdMode = 'select';
    jdModeSelectBtn.classList.add('active');
    jdModeCustomBtn.classList.remove('active');
    jdSelectPanel.classList.remove('d-none');
    jdCustomPanel.classList.add('d-none');
    // Restore dropdown-driven context if one was selected
    const sel = document.getElementById('contextSelect');
    selectedContext = sel.value;
    if (selectedContext) loadCriteria(selectedContext);
    else { criteriaRows = []; renderCriteria(); }
  });

  jdModeCustomBtn.addEventListener('click', () => {
    if (jdMode === 'custom') return;
    jdMode = 'custom';
    jdModeCustomBtn.classList.add('active');
    jdModeSelectBtn.classList.remove('active');
    jdCustomPanel.classList.remove('d-none');
    jdSelectPanel.classList.add('d-none');
    selectedContext = '';
    document.getElementById('contextSelect').value = '';
    criteriaRows = [];
    renderCriteria();
  });

  // ── Generate Criteria button ─────────────────────────────
  document.getElementById('btnGenerateCriteria').addEventListener('click', generateCriteria);
}

/* ════════════════════════════════════════════════════════════
   JD character counter
   ════════════════════════════════════════════════════════════ */
function updateJdCharCount() {
  const val = document.getElementById('jdTextarea').value;
  const count = val.length;
  const el = document.getElementById('jdCharCount');
  el.textContent = `${count.toLocaleString()} / 6,000 characters`;
  el.style.color = count > 6000
    ? 'var(--color-danger)'
    : count > 5000
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';
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
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
