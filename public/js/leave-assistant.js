document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('leave-assistant');
  await loadBalance();
  bindEvents();
  setStatus('connected');
});

// ── Conversation history (sent to server on every message) ──────────────────
let history = [];

// ── Load & display real leave balance ───────────────────────────────────────
async function loadBalance() {
  try {
    const data = await API.get('/api/leave-assistant/balance');
    if (!data.success) return;
    const { annual, sick } = data.balance;
    setBalanceRow('balAnnual', annual.remaining, annual.total);
    setBalanceRow('balSick',   sick.remaining,   sick.total);
  } catch { /* leave static fallback */ }
}

function setBalanceRow(id, remaining, total) {
  const el  = document.getElementById(id);
  const bar = document.getElementById(id + 'Bar');
  const sub = document.getElementById(id + 'Sub');
  if (!el) return;

  const cls = remaining > 5 ? 'green' : remaining > 0 ? 'orange' : 'red';
  el.textContent = remaining + ' days';
  el.className   = 'bal-row-val ' + cls;

  if (bar) {
    const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
    bar.style.width = pct + '%';
    bar.className   = 'bal-bar-fill ' + (cls !== 'green' ? cls : '');
  }
  if (sub) sub.textContent = `of ${total} days`;
}

// ── Status badge ─────────────────────────────────────────────────────────────
function setStatus(state) {
  const badge = document.getElementById('statusBadge');
  if (!badge) return;
  if (state === 'connected') {
    badge.innerHTML = '<i class="bi bi-circle-fill me-1" style="font-size:8px;color:#22c55e"></i>AI Connected';
  } else if (state === 'thinking') {
    badge.innerHTML = '<i class="bi bi-hourglass-split me-1" style="font-size:10px"></i>Thinking...';
  } else {
    badge.innerHTML = '<i class="bi bi-circle-fill me-1" style="font-size:8px;color:#f59e0b"></i>AI Connected';
  }
}

// ── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
  const input  = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');

  btnSend.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

// ── Public: suggestion chips ─────────────────────────────────────────────────
window.LeaveAssistant = {
  askSuggestion(btn) {
    const input = document.getElementById('chatInput');
    input.value = btn.textContent.trim();
    sendMessage();
  }
};

// ── Send message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input   = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const text    = input.value.trim();
  if (!text) return;

  // Append user message to UI + history
  appendMessage('user', text);
  history.push({ role: 'user', content: text });

  input.value = '';
  input.style.height = 'auto';
  btnSend.disabled   = true;
  setStatus('thinking');

  // Show typing indicator
  const typingId = appendTyping();

  try {
    const data = await API.post('/api/leave-assistant/chat', { messages: history });

    removeTyping(typingId);
    btnSend.disabled = false;
    setStatus('connected');

    if (!data.success) {
      appendMessage('bot', data.message || 'Something went wrong. Please try again.');
      return;
    }

    // Append AI reply to history
    history.push({ role: 'assistant', content: data.message });
    appendMessage('bot', data.message, data.submitted ? { id: data.id, type: data.type } : null);

    // If a request was submitted, refresh balance (may have changed for leave)
    if (data.submitted) {
      await loadBalance();
    }

  } catch {
    removeTyping(typingId);
    btnSend.disabled = false;
    setStatus('connected');
    appendMessage('bot', 'Connection error. Please check your network and try again.');
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
const SUBMISSION_CONFIG = {
  leave:    { title: 'Leave Request Submitted',          href: '/unifiedsmi/leaves',    label: 'View in Leave Requests' },
  wfh:      { title: 'Work From Home Request Submitted', href: '/unifiedsmi/wfh',       label: 'View in WFH Requests' },
  travel:   { title: 'Business Trip Request Submitted',  href: '/unifiedsmi/travel',    label: 'View in Travel Requests' },
  helpdesk: { title: 'Support Ticket Submitted',         href: '/unifiedsmi/helpdesk',  label: 'View in Help Desk' }
};

function appendMessage(role, text, submission = null) {
  const container = document.getElementById('chatMessages');
  const isUser    = role === 'user';

  const wrap = document.createElement('div');
  wrap.className = `msg ${isUser ? 'user' : 'bot'}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.innerHTML = isUser
    ? '<i class="bi bi-person-fill"></i>'
    : '<i class="bi bi-stars"></i>';

  const inner = document.createElement('div');

  if (text) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (/[؀-ۿ]/.test(text)) bubble.dir = 'rtl';
    bubble.innerHTML = formatMessage(text);
    inner.appendChild(bubble);
  }

  // If a request was submitted, show a success card
  if (submission && submission.id) {
    const cfg  = SUBMISSION_CONFIG[submission.type] || SUBMISSION_CONFIG.leave;
    const ref  = submission.ticketNo || submission.id;
    const card = document.createElement('div');
    card.className = 'leave-submitted-card';
    card.innerHTML = `
      <div class="lsc-icon"><i class="bi bi-check-circle-fill"></i></div>
      <div class="lsc-body">
        <div class="lsc-title">${cfg.title}</div>
        <div class="lsc-id">Reference: <strong>${ref}</strong></div>
        <a href="${cfg.href}" class="lsc-link">${cfg.label} <i class="bi bi-arrow-right"></i></a>
      </div>`;
    inner.appendChild(card);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(inner);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function appendTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.id = id;
  wrap.innerHTML = `
    <div class="msg-avatar"><i class="bi bi-stars"></i></div>
    <div class="msg-bubble" style="padding:14px 16px">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function formatMessage(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
