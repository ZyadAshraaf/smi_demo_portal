/* ── Policy AI Controller ────────────────────────────────── */
const PolicyPage = {
  isTyping: false,

  async init() {
    await Layout.init('policy');
    await this.loadPolicies();
    this.bindInput();
  },

  async loadPolicies() {
    const data = await API.get('/api/policy');
    if (!data?.success) return;

    const el = document.getElementById('policyList');
    el.innerHTML = data.policies.map(p => `
      <div class="policy-card" onclick="PolicyPage.askAbout('${p.title}')">
        <div class="policy-card-title">${p.title}</div>
        <div class="policy-card-cat"><i class="bi bi-tag me-1"></i>${p.category} · v${p.version}</div>
      </div>`).join('');
  },

  bindInput() {
    const input = document.getElementById('chatInput');
    const btn   = document.getElementById('btnSend');

    btn.addEventListener('click', () => this.sendMessage());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  },

  async sendMessage() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();
    if (!question || this.isTyping) return;

    input.value = '';
    input.style.height = 'auto';

    this.appendMessage('user', question);
    this.showTyping();

    const data = await API.post('/api/policy/ask', { question });
    this.hideTyping();

    if (data?.success) {
      this.appendBotMessage(data.answer, data.sources);
    } else {
      this.appendBotMessage("Sorry, I couldn't process your request. Please try again.", []);
    }
  },

  appendMessage(role, text) {
    const messages = document.getElementById('chatMessages');
    const user     = Layout.user;
    const initials = user?.name?.charAt(0).toUpperCase() || 'U';

    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `
      <div class="msg-avatar">${role === 'user' ? initials : '<i class="bi bi-robot"></i>'}</div>
      <div class="msg-bubble">${this.escapeHtml(text)}</div>`;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  },

  appendBotMessage(text, sources = []) {
    const messages = document.getElementById('chatMessages');
    const div      = document.createElement('div');
    div.className  = 'msg bot';

    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n---\n/g, '<hr style="border-color:var(--color-border);margin:12px 0">')
      .replace(/\n/g, '<br>');

    const sourcesHtml = sources.length
      ? `<div class="msg-sources">${sources.map(s => `<span class="source-tag"><i class="bi bi-file-text me-1"></i>${s.title}</span>`).join('')}</div>`
      : '';

    div.innerHTML = `
      <div class="msg-avatar"><i class="bi bi-robot"></i></div>
      <div>
        <div class="msg-bubble">${formattedText}</div>
        ${sourcesHtml}
      </div>`;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  },

  showTyping() {
    this.isTyping = true;
    document.getElementById('btnSend').disabled = true;
    const messages = document.getElementById('chatMessages');
    const div      = document.createElement('div');
    div.className  = 'msg bot';
    div.id         = 'typingIndicator';
    div.innerHTML  = `
      <div class="msg-avatar"><i class="bi bi-robot"></i></div>
      <div class="msg-bubble" style="padding:12px 16px">
        <div class="typing-indicator">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>
      </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  },

  hideTyping() {
    this.isTyping = false;
    document.getElementById('btnSend').disabled = false;
    document.getElementById('typingIndicator')?.remove();
  },

  askSuggestion(btn) {
    document.getElementById('chatInput').value = btn.textContent;
    this.sendMessage();
  },

  askAbout(policyTitle) {
    document.getElementById('chatInput').value = `What is the ${policyTitle}?`;
    this.sendMessage();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => PolicyPage.init());
