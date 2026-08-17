/* ── Doc Chat Controller ─────────────────────────────────────
   General-purpose document Q&A.
   Flow: upload PDFs → POST /api/general/ingest → get session_id
         → POST /api/general/query for each question (with
           accumulated chat_history for conversational context).
   ─────────────────────────────────────────────────────────── */

const DOCEVAL_BASE = '/unifiedsmi/api/doceval-proxy';
const MAX_FILES    = 5;

/* ── Module State ── */
let uploadedFiles = [];   // File objects chosen by the user
let sessionId     = null; // Returned by /api/general/ingest
let ingestedFiles = [];   // File names confirmed by the server
let chunkCount    = 0;    // Number of indexed chunks
let chatHistory   = [];   // [{ role: 'user'|'assistant', content: string }]

/* ════════════════════════════════════════════════════════════
   Initialisation
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('doc-chat');
  bindEvents();
  showStep(1);
});

/* ════════════════════════════════════════════════════════════
   DocEval API helpers
   ════════════════════════════════════════════════════════════ */
async function dePost(path, body, isFormData = false) {
  const opts = { method: 'POST' };
  if (isFormData) {
    opts.body = body;
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body    = JSON.stringify(body);
  }
  const res = await fetch(DOCEVAL_BASE + path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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
    if (i < n)        el.className = 'wizard-step done';
    else if (i === n) el.className = 'wizard-step active';
    else              el.className = 'wizard-step pending';
  });
}

/* ════════════════════════════════════════════════════════════
   File upload
   ════════════════════════════════════════════════════════════ */
function handleFiles(files) {
  const pdfs = Array.from(files).filter(
    f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (!pdfs.length) { UI.toast('Only PDF files are accepted', 'warning'); return; }

  const remaining = MAX_FILES - uploadedFiles.length;
  if (remaining <= 0) {
    UI.toast(`Maximum ${MAX_FILES} files allowed`, 'warning');
    return;
  }
  uploadedFiles.push(...pdfs.slice(0, remaining));
  if (pdfs.length > remaining) {
    UI.toast(`Only ${remaining} more file${remaining > 1 ? 's' : ''} allowed (max ${MAX_FILES})`, 'warning');
  }
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

/* ════════════════════════════════════════════════════════════
   Ingest documents
   ════════════════════════════════════════════════════════════ */
async function ingestDocuments() {
  if (!uploadedFiles.length) {
    UI.toast('Upload at least one PDF document', 'warning');
    return;
  }

  showStep(2);

  const fd = new FormData();
  uploadedFiles.forEach(f => fd.append('files', f));

  try {
    const data    = await dePost('/api/general/ingest', fd, true);
    sessionId     = data.session_id;
    ingestedFiles = data.files  || uploadedFiles.map(f => f.name);
    chunkCount    = data.chunks || 0;

    populateDocSidebar();
    showStep(3);

    // Focus the chat input once the chat panel appears
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);

  } catch (e) {
    UI.toast('Failed to process documents: ' + e.message, 'danger');
    showStep(1);
  }
}

/* ════════════════════════════════════════════════════════════
   Document sidebar (shown in step 3)
   ════════════════════════════════════════════════════════════ */
function populateDocSidebar() {
  // File list
  const fileListEl = document.getElementById('docFileList');
  fileListEl.innerHTML = ingestedFiles.map(name => `
    <div class="doc-file-item">
      <i class="bi bi-file-earmark-pdf"></i>
      <span class="doc-file-name">${escHtml(name)}</span>
    </div>`).join('');

  // Stats
  document.getElementById('docStats').innerHTML = `
    <div class="doc-stat">
      <span class="doc-stat-label">Documents</span>
      <span class="doc-stat-value">${ingestedFiles.length}</span>
    </div>
    <div class="doc-stat">
      <span class="doc-stat-label">Indexed chunks</span>
      <span class="doc-stat-value">${chunkCount}</span>
    </div>
    <div class="doc-stat">
      <span class="doc-stat-label">Session ID</span>
      <span class="doc-stat-value" style="font-family:monospace;font-size:10px">${sessionId?.slice(-8) || '—'}</span>
    </div>`;

  // Update chat header subtitle
  const names = ingestedFiles.map(f => f.replace(/\.pdf$/i, '')).join(', ');
  document.getElementById('chatHeaderSub').textContent =
    ingestedFiles.length === 1
      ? `Chatting with: ${names}`
      : `Chatting with ${ingestedFiles.length} documents`;
}

/* ════════════════════════════════════════════════════════════
   Chat
   ════════════════════════════════════════════════════════════ */
function appendChatMsg(role, text, sources) {
  const container = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const sourcesHtml = (role === 'assistant' && sources?.length)
    ? `<div class="chat-sources">${sources.map(s =>
        `<span class="source-chip"><i class="bi bi-file-earmark-text me-1"></i>${escHtml(s)}</span>`
      ).join('')}</div>`
    : '';

  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-bubble">${escHtml(text)}</div>
    ${sourcesHtml}
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

async function sendChatMessage(question) {
  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const msg     = question || input.value.trim();
  if (!msg || !sessionId) return;

  // Hide suggestions after first message
  document.getElementById('suggestionsRow').style.display = 'none';

  input.value      = '';
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:14px;height:14px"></span>';

  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });
  showTypingIndicator();

  try {
    const data = await dePost('/api/general/query', {
      session_id:   sessionId,
      question:     msg,
      chat_history: chatHistory.slice(0, -1)   // history before this turn
    });

    removeTypingIndicator();

    const answer  = data.answer  || 'No answer returned.';
    const sources = data.sources || [];

    appendChatMsg('assistant', answer, sources);
    chatHistory.push({ role: 'assistant', content: answer });

  } catch (e) {
    removeTypingIndicator();
    appendChatMsg('assistant', 'Sorry, something went wrong. Please try again.');
    chatHistory.pop();
  } finally {
    sendBtn.disabled  = false;
    sendBtn.innerHTML = '<i class="bi bi-send"></i>';
    input.focus();
  }
}

/* Called from inline onclick on suggestion chips */
function useSuggestion(el) {
  const text = el.textContent.trim();
  document.getElementById('chatInput').value = text;
  sendChatMessage(text);
}

/* ════════════════════════════════════════════════════════════
   New session (reset)
   ════════════════════════════════════════════════════════════ */
function startNewSession() {
  uploadedFiles = [];
  sessionId     = null;
  ingestedFiles = [];
  chunkCount    = 0;
  chatHistory   = [];

  document.getElementById('fileList').innerHTML   = '';
  document.getElementById('chatMessages').innerHTML = `
    <div class="chat-msg assistant">
      <div class="chat-bubble">Your documents are ready. Ask me anything about their contents — I'll find the relevant information and cite my sources.</div>
      <div class="chat-time">Now</div>
    </div>`;

  // Restore suggestions
  document.getElementById('suggestionsRow').style.display = '';

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

  document.getElementById('btnIngest').addEventListener('click', ingestDocuments);
  document.getElementById('btnNewSession').addEventListener('click', startNewSession);

  document.getElementById('chatSendBtn').addEventListener('click', () => sendChatMessage());
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
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
