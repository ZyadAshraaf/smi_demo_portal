/* ═══════════════════════════════════════════════════════
   EMS — Knowledge Chat Drawer Controller
   Right-side slide-in drawer for conversational Q&A
   over selected EMS documents.
   ═══════════════════════════════════════════════════════ */
window.EMS_KnowledgeChat = (() => {

  const PROXY = '/unifiedsmi/api/doceval-proxy';

  let _sessionId   = null;
  let _chatHistory = [];
  let _bound       = false;

  /* ─── helpers ────────────────────────────────────────── */
  function _drawer()   { return document.getElementById('knowledgeChatWrap'); }
  function _backdrop() { return document.getElementById('kcBackdrop'); }

  function _drawerOpen() {
    _drawer()?.classList.add('kc-open');
    _backdrop()?.classList.add('kc-open');
    document.body.style.overflow = 'hidden';
  }

  function _drawerClose() {
    _drawer()?.classList.remove('kc-open');
    _backdrop()?.classList.remove('kc-open');
    document.body.style.overflow = '';
  }

  /* ─── Suggested starter questions ────────────────────── */
  function _suggestionsFor(docCount) {
    const base = [
      { icon: 'bi-card-text',     text: 'Summarize the key points' },
      { icon: 'bi-exclamation-triangle', text: 'What are the main risks or concerns?' },
      { icon: 'bi-list-check',    text: 'Extract action items and deadlines' },
      { icon: 'bi-search',        text: 'What are the most important details?' }
    ];
    if (docCount > 1) {
      base[3] = { icon: 'bi-arrow-left-right', text: 'Compare these documents' };
    }
    return base;
  }

  function _renderSuggestions(docCount) {
    const wrap = document.getElementById('kcSuggestions');
    const grid = document.getElementById('kcSuggestionGrid');
    if (!wrap || !grid) return;
    grid.innerHTML = _suggestionsFor(docCount).map(s =>
      `<button class="kc-suggestion-chip" data-q="${_esc(s.text)}">
         <i class="bi ${s.icon}"></i><span>${_esc(s.text)}</span>
       </button>`
    ).join('');
    wrap.classList.remove('d-none');
  }

  function _hideSuggestions() {
    document.getElementById('kcSuggestions')?.classList.add('d-none');
  }

  /* ─── Public: openLoading ───────────────────────────── */
  function openLoading(docNames) {
    _sessionId   = null;
    _chatHistory = [];

    document.getElementById('knowledgeChatLoading')?.classList.remove('d-none');
    document.getElementById('kcChatBody')?.classList.add('d-none');
    document.getElementById('knowledgeChatTitle').textContent = 'Ask Your Documents';

    const sub = document.getElementById('kcDocSubtitle');
    if (sub) sub.textContent = docNames.length === 1
      ? `Reading "${docNames[0]}"`
      : `Reading ${docNames.length} documents`;

    document.getElementById('kcDocChips').innerHTML = '';
    document.getElementById('kcMessages').innerHTML = '';
    _hideSuggestions();

    _drawerOpen();
    if (!_bound) { _bindEvents(); _bound = true; }
  }

  /* ─── Public: open ──────────────────────────────────── */
  function open(sessionId, docNames) {
    _sessionId   = sessionId;
    _chatHistory = [];

    document.getElementById('knowledgeChatLoading')?.classList.add('d-none');
    document.getElementById('kcChatBody')?.classList.remove('d-none');

    const title = document.getElementById('knowledgeChatTitle');
    if (title) title.textContent = 'Ask Your Documents';

    const sub = document.getElementById('kcDocSubtitle');
    if (sub) sub.textContent = docNames.length === 1
      ? `Ready • 1 document indexed`
      : `Ready • ${docNames.length} documents indexed`;

    // Doc chips
    const chips = document.getElementById('kcDocChips');
    if (chips) chips.innerHTML = docNames.map(n =>
      `<span class="kc-doc-chip" title="${_esc(n)}"><i class="bi bi-file-earmark-text"></i>${_esc(n)}</span>`
    ).join('');

    // Greeting message
    _appendMsg('assistant',
      docNames.length === 1
        ? `Hi! I've read through "${docNames[0]}" and I'm ready to answer questions about it.`
        : `Hi! I've read through your ${docNames.length} documents and I'm ready to answer questions about them.`
    );

    // Render starter suggestions
    _renderSuggestions(docNames.length);

    setTimeout(() => document.getElementById('kcInput')?.focus(), 150);
  }

  /* ─── Public: close ─────────────────────────────────── */
  function close() {
    _drawerClose();
    _sessionId   = null;
    _chatHistory = [];
  }

  /* ─── Private: send message ─────────────────────────── */
  async function _sendMessage(prefilled) {
    const input = document.getElementById('kcInput');
    const btn   = document.getElementById('kcSendBtn');
    const text  = (prefilled ?? input?.value ?? '').trim();
    if (!text || !_sessionId) return;

    if (input) input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;"></span>';

    _hideSuggestions();
    _appendMsg('user', text);
    const snapshot = [..._chatHistory];
    _chatHistory.push({ role: 'user', content: text });
    _showTyping();

    try {
      const resp = await fetch(PROXY + '/api/general/query', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: _sessionId, question: text, chat_history: snapshot })
      });
      if (!resp.ok) throw new Error(resp.statusText);
      const data = await resp.json();
      _removeTyping();
      _appendMsg('assistant', data.answer || 'No answer returned.', data.sources);
      _chatHistory.push({ role: 'assistant', content: data.answer || '' });
    } catch (err) {
      _removeTyping();
      _appendMsg('assistant', 'Something went wrong. Please try again.');
      _chatHistory.pop();
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<i class="bi bi-send-fill"></i>';
      input?.focus();
    }
  }

  /* ─── Private: rendering ─────────────────────────────── */
  function _avatarHtml(role) {
    if (role === 'assistant') {
      return `<div class="chat-avatar chat-avatar-ai"><i class="bi bi-stars"></i></div>`;
    }
    const initial = (window.EMS_currentUserName || 'You').trim().charAt(0).toUpperCase() || 'U';
    return `<div class="chat-avatar chat-avatar-user">${_esc(initial)}</div>`;
  }

  function _appendMsg(role, text, sources) {
    const container = document.getElementById('kcMessages');
    if (!container) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sourcesHtml = (role === 'assistant' && sources?.length)
      ? `<div class="chat-sources">${sources.map(s =>
          `<span class="source-chip"><i class="bi bi-file-earmark-text me-1"></i>${_esc(s)}</span>`
        ).join('')}</div>` : '';
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.innerHTML = `
      <div class="chat-row">
        ${_avatarHtml(role)}
        <div class="chat-bubble-wrap">
          <div class="chat-bubble">${_esc(text)}</div>
          ${sourcesHtml}
          <div class="chat-time">${time}</div>
        </div>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function _showTyping() {
    const container = document.getElementById('kcMessages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg assistant';
    div.id = 'kcTyping';
    div.innerHTML = `
      <div class="chat-row">
        ${_avatarHtml('assistant')}
        <div class="chat-bubble-wrap">
          <div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function _removeTyping() { document.getElementById('kcTyping')?.remove(); }

  /* ─── Private: events (bound once) ──────────────────── */
  function _bindEvents() {
    document.getElementById('btnBackFromChat')?.addEventListener('click', close);
    document.getElementById('kcBackdrop')?.addEventListener('click', close);
    document.getElementById('kcSendBtn')?.addEventListener('click', () => _sendMessage());
    document.getElementById('kcInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });
    // Suggested-question chips
    document.getElementById('kcSuggestionGrid')?.addEventListener('click', e => {
      const chip = e.target.closest('.kc-suggestion-chip');
      if (!chip) return;
      _sendMessage(chip.dataset.q);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _drawer()?.classList.contains('kc-open')) close();
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { openLoading, open, close };
})();
