'use strict';

/* ═══════════════════════════════════════════════════════════════
   VIEW NAVIGATION
═══════════════════════════════════════════════════════════════ */
const VIEW_CFG = {
  chat:      { viewId: 'view-chat',      navId: 'nav-chat',      title: 'Electricity Fraud Detection AI', sub: 'Powered by Groq · llama-3.3-70b-versatile' },
  dashboard: { viewId: 'view-dashboard', navId: 'nav-dash',      title: 'Fraud Detection Dashboard',      sub: 'Live monitoring & analytics' },
  analytics: { viewId: 'view-analytics', navId: 'nav-analytics', title: 'Analytics',                      sub: 'Deep consumption pattern analysis' },
  reports:   { viewId: 'view-reports',   navId: 'nav-reports',   title: 'Fraud Reports',                  sub: 'Generated detection reports & audit logs' },
  settings:  { viewId: 'view-settings',  navId: 'nav-settings',  title: 'Settings',                       sub: 'Configure API and preferences' }
};

function showView(name) {
  const cfg = VIEW_CFG[name] || VIEW_CFG.chat;
  S.currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const vEl = document.getElementById(cfg.viewId);
  const nEl = document.getElementById(cfg.navId);
  if (vEl) vEl.classList.add('active');
  if (nEl) nEl.classList.add('active');
  document.getElementById('tb-title').textContent = cfg.title;
  document.getElementById('tb-sub').textContent   = name === 'chat' ? `Powered by Groq · ${S.model}` : cfg.sub;
  if (name === 'dashboard' && !S.chartsInited.dashboard) { S.chartsInited.dashboard = true; setTimeout(initDashboardCharts, 80); }
  if (name === 'analytics' && !S.chartsInited.analytics) { S.chartsInited.analytics = true; setTimeout(initAnalyticsCharts, 80); }
  if (window.innerWidth <= 768) closeMobSidebar();
}

/* Floating orb cycles views */
let _orbIdx = 0;
const _orbViews = ['chat', 'dashboard', 'analytics', 'reports'];

/* ═══════════════════════════════════════════════════════════════
   CHAT HISTORY — LOAD / SAVE / RENDER / FILTER
═══════════════════════════════════════════════════════════════ */
function loadChats() {
  try { const raw = localStorage.getItem('eg_chats'); S.chats = raw ? JSON.parse(raw) : {}; }
  catch (_) { S.chats = {}; }
}

function saveChats() { localStorage.setItem('eg_chats', JSON.stringify(S.chats)); }

function renderChatHistory() {
  const el   = document.getElementById('chat-hist-list');
  if (!el) return;
  const list = Object.values(S.chats).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40);
  if (list.length === 0) { el.innerHTML = `<div style="padding:10px 16px;font-size:12px;color:var(--text-dim)">No chats yet</div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="ch-item ${c.id === S.currentChatId ? 'active' : ''}" onclick="loadChat('${c.id}')">
      <div class="ch-dot" style="${c.pinned ? 'background:var(--accent)' : ''}"></div>
      <span class="ch-text">${escHtml(c.title || 'Untitled Chat')}</span>
    </div>`).join('');
}

function filterChats(q) {
  const el   = document.getElementById('chat-hist-list');
  if (!el) return;
  const lq   = q.toLowerCase();
  const list = Object.values(S.chats).filter(c => (c.title || '').toLowerCase().includes(lq)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
  el.innerHTML = list.length
    ? list.map(c => `<div class="ch-item ${c.id === S.currentChatId ? 'active' : ''}" onclick="loadChat('${c.id}')"><div class="ch-dot"></div><span class="ch-text">${escHtml(c.title || 'Untitled Chat')}</span></div>`).join('')
    : `<div style="padding:10px 16px;font-size:12px;color:var(--text-dim)">No results</div>`;
}

function loadChat(id) {
  const chat = S.chats[id];
  if (!chat) return;
  S.currentChatId = id;
  showView('chat');
  renderMessages(chat.messages || []);
  renderChatHistory();
}

/* ═══════════════════════════════════════════════════════════════
   NEW CHAT
═══════════════════════════════════════════════════════════════ */
function startNewChat() {
  const id = 'chat_' + Date.now();
  S.chats[id] = { id, title: 'New Chat', messages: [], createdAt: Date.now(), pinned: false };
  S.currentChatId = id;
  saveChats(); renderChatHistory();
  showView('chat'); showWelcome();
  document.getElementById('chat-input').focus();
}

function ensureChat() {
  if (!S.currentChatId || !S.chats[S.currentChatId]) startNewChat();
}

function showWelcome() {
  document.getElementById('welcome').style.display   = 'flex';
  document.getElementById('chat-msgs').style.display = 'none';
  document.getElementById('chat-msgs').innerHTML     = '';
}

function showMessages() {
  document.getElementById('welcome').style.display   = 'none';
  document.getElementById('chat-msgs').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT / IMPORT
═══════════════════════════════════════════════════════════════ */
function exportChat() {
  const chat    = S.chats[S.currentChatId];
  const payload = chat
    ? { type: 'single', chat,          exportedAt: new Date().toISOString() }
    : { type: 'all',    chats: S.chats, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `electroguard-${Date.now()}.json` });
  a.click(); URL.revokeObjectURL(url);
  showToast('Chat exported', 'ok');
}

function importChat() { document.getElementById('import-input').click(); }

function handleImportChat(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.type === 'single' && d.chat) {
        S.chats[d.chat.id] = d.chat; S.currentChatId = d.chat.id;
        saveChats(); renderChatHistory(); renderMessages(d.chat.messages || []);
        showToast('Chat imported', 'ok');
      } else if (d.type === 'all' && d.chats) {
        Object.assign(S.chats, d.chats); saveChats(); renderChatHistory();
        showToast(`Imported ${Object.keys(d.chats).length} chats`, 'ok');
      } else { showToast('Unrecognised format', 'err'); }
    } catch (_) { showToast('Invalid JSON file', 'err'); }
  };
  r.readAsText(file); e.target.value = '';
}

function clearAllHistory() {
  if (!confirm('Delete ALL chat history? This cannot be undone.')) return;
  S.chats = {}; S.currentChatId = null;
  saveChats(); renderChatHistory(); showView('chat'); showWelcome();
  showToast('Chat history cleared', 'ok');
}

/* ═══════════════════════════════════════════════════════════════
   RENDER ALL MESSAGES
═══════════════════════════════════════════════════════════════ */
function renderMessages(messages) {
  const c = document.getElementById('chat-msgs');
  c.innerHTML = ''; showMessages();
  messages.forEach(m => appendMsg(m, false));
  scrollToBottom();
}

/* ═══════════════════════════════════════════════════════════════
   APPEND SINGLE MESSAGE
═══════════════════════════════════════════════════════════════ */
function appendMsg(msg, animate = true) {
  showMessages();
  const c   = document.getElementById('chat-msgs');
  const row = document.createElement('div');
  row.className  = `msg-row ${msg.role}`;
  row.dataset.id = msg.id;
  if (!animate) row.style.animation = 'none';

  const isUser = msg.role === 'user';
  const av     = isUser
    ? `<div class="msg-av user">U</div>`
    : `<div class="msg-av ai"><svg viewBox="0 0 24 24" fill="#fff"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>`;

  const bubbleContent = isUser ? escHtml(msg.content) : renderMarkdown(msg.content);

  const actions = isUser
    ? `<div class="msg-acts"><button class="m-act-btn" onclick="editMsg('${msg.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button></div>`
    : `<div class="msg-acts">
         <button class="m-act-btn" onclick="copyMsg('${msg.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
         <button class="m-act-btn" onclick="regenMsg('${msg.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Regenerate</button>
         ${S.ttsEnabled ? `<button class="m-act-btn" onclick="speakMsg('${msg.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak</button>` : ''}
       </div>`;

  row.innerHTML = `${isUser ? '' : av}<div class="msg-bwrap"><div class="msg-bubble" id="bbl-${msg.id}">${bubbleContent}</div>${actions}</div>${isUser ? av : ''}`;
  c.appendChild(row);
  addCodeCopyBtns(row);
  scrollToBottom();
  return row;
}

/* ═══════════════════════════════════════════════════════════════
   MARKDOWN RENDERER
═══════════════════════════════════════════════════════════════ */
function renderMarkdown(raw) {
  if (!raw) return '';
  let t = escHtml(raw);
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><button class="cc-btn" onclick="copyCode(this)">Copy</button><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`);
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  t = t.replace(/__(.+?)__/g,         '<strong>$1</strong>');
  t = t.replace(/\*([^*\n]+)\*/g,     '<em>$1</em>');
  t = t.replace(/_([^_\n]+)_/g,       '<em>$1</em>');
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  t = t.replace(/^-{3,}$/gm, '<hr>');
  t = t.replace(/((?:\|.+\|\n?)+)/g, block => {
    const rows = block.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return block;
    const isSep    = r => /^\|[\s\-:|]+\|$/.test(r.trim());
    const mkCells  = (row, tag) => row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => `<${tag}>${c.trim()}</${tag}>`).join('');
    const thead    = `<thead><tr>${mkCells(rows[0], 'th')}</tr></thead>`;
    const tbody    = rows.slice(2).filter(r => !isSep(r)).map(r => `<tr>${mkCells(r, 'td')}</tr>`).join('');
    return `<table>${thead}<tbody>${tbody}</tbody></table>`;
  });
  t = t.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  t = t.replace(/^[\*\-\+] (.+)$/gm, '<li>$1</li>');
  t = t.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  t = t.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  t = t.replace(/(<oli>[\s\S]*?<\/oli>\n?)+/g, m => `<ol>${m.replace(/<\/?oli>/g, x => x === '<oli>' ? '<li>' : '</li>')}</ol>`);
  t = t.replace(/🟢\s*LOW/gi,      '<span class="rbadge low">🟢 LOW</span>');
  t = t.replace(/🟡\s*MEDIUM/gi,   '<span class="rbadge med">🟡 MEDIUM</span>');
  t = t.replace(/🟠\s*HIGH/gi,     '<span class="rbadge high">🟠 HIGH</span>');
  t = t.replace(/🔴\s*CRITICAL/gi, '<span class="rbadge crit">🔴 CRITICAL</span>');
  t = t.replace(/^(?!<[huptbol\|]).+$/gm, ln => ln.trim() ? `<p>${ln}</p>` : '');
  return t;
}

function addCodeCopyBtns(rowEl) {
  rowEl.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.cc-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'cc-btn'; btn.textContent = 'Copy';
    btn.onclick = () => copyCode(btn);
    pre.insertBefore(btn, pre.firstChild);
  });
}

function copyCode(btn) {
  const code = btn.parentElement.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.innerText).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); });
}

/* ═══════════════════════════════════════════════════════════════
   TYPING INDICATOR
═══════════════════════════════════════════════════════════════ */
function showTyping() {
  showMessages();
  const c   = document.getElementById('chat-msgs');
  const row = document.createElement('div');
  row.className = 'msg-row assistant'; row.id = 'typing-row';
  row.innerHTML = `<div class="msg-av ai"><svg viewBox="0 0 24 24" fill="#fff"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div><div class="msg-bwrap"><div class="msg-bubble"><div class="typing-ind"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div></div></div>`;
  c.appendChild(row); scrollToBottom(); return row;
}

/* ═══════════════════════════════════════════════════════════════
   SEND HANDLER
═══════════════════════════════════════════════════════════════ */
function handleSend() {
  const inp  = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text && !S.uploadedText) return;
  if (S.isGenerating) return;
  ensureChat();
  let content = text;
  if (S.uploadedText && S.uploadedFile) {
    content = (text || 'Analyze this electricity data for fraud.') + '\n\n' + prepareFileCtx(S.uploadedText, S.uploadedFile.name);
    removeFile();
  }
  sendMessage(content);
  inp.value = ''; inp.style.height = 'auto';
  _set('char-cnt', '0 chars', true); _set('tok-cnt', '~0 tokens', true);
}

function sendSuggestion(text) { ensureChat(); showView('chat'); sendMessage(text); }

/* ═══════════════════════════════════════════════════════════════
   CORE sendMessage
═══════════════════════════════════════════════════════════════ */
async function sendMessage(content) {
  if (!content.trim()) return;
  ensureChat();
  const chat = S.chats[S.currentChatId];
  const uMsg = { id: 'u_' + Date.now(), role: 'user', content, timestamp: Date.now() };
  chat.messages.push(uMsg);
  if (chat.messages.filter(m => m.role === 'user').length === 1) {
    chat.title = content.replace(/\n/g, ' ').slice(0, 52) + (content.length > 52 ? '…' : '');
  }
  saveChats(); renderChatHistory(); appendMsg(uMsg);

  if (!S.apiKey || !S.apiKey.startsWith('gsk_')) {
    const warn = { id: 'a_' + Date.now(), role: 'assistant', timestamp: Date.now(), content: '⚠️ **No API Key configured.**\n\nGo to **Settings** and paste your Groq API key.\n\nGet a free key at https://console.groq.com' };
    chat.messages.push(warn); saveChats(); appendMsg(warn); return;
  }

  const apiMsgs = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...chat.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20).map(m => ({ role: m.role, content: m.content }))
  ];

  const typingRow = showTyping();
  S.isGenerating  = true;
  document.getElementById('send-btn').disabled = true;

  try {
    const aId  = 'a_' + (Date.now() + 1);
    const aMsg = { id: aId, role: 'assistant', content: '', timestamp: Date.now() };
    chat.messages.push(aMsg);

    if (S.streaming) {
      typingRow.remove();
      const row    = appendMsg(aMsg);
      const bubble = document.getElementById('bbl-' + aId);
      bubble.classList.add('s-cursor'); bubble.innerHTML = '';
      await streamGroq(apiMsgs, chunk => {
        aMsg.content += chunk;
        bubble.innerHTML = renderMarkdown(aMsg.content);
        bubble.classList.add('s-cursor');
        addCodeCopyBtns(row); scrollToBottom();
      });
      bubble.classList.remove('s-cursor');
      bubble.innerHTML = renderMarkdown(aMsg.content);
      addCodeCopyBtns(row);
    } else {
      aMsg.content = await fetchGroq(apiMsgs);
      typingRow.remove(); appendMsg(aMsg);
    }

    saveChats(); autoSaveReport(aMsg.content);
    if (S.ttsEnabled && aMsg.content) speakText(aMsg.content.replace(/[#*`>|]/g, '').slice(0, 500));
  } catch (err) {
    typingRow.remove();
    const errMsg = { id: 'err_' + Date.now(), role: 'assistant', timestamp: Date.now(), content: `❌ **Error:** ${err.message || 'Request failed. Check your API key and connection.'}` };
    chat.messages.push(errMsg); saveChats(); appendMsg(errMsg);
    showToast('API error: ' + (err.message || 'unknown'), 'err');
  } finally {
    S.isGenerating = false;
    document.getElementById('send-btn').disabled = false;
    scrollToBottom();
  }
}

/* ═══════════════════════════════════════════════════════════════
   MESSAGE ACTIONS
═══════════════════════════════════════════════════════════════ */
function copyMsg(id) {
  const chat = S.chats[S.currentChatId]; if (!chat) return;
  const m = chat.messages.find(x => x.id === id); if (!m) return;
  navigator.clipboard.writeText(m.content).then(() => showToast('Copied to clipboard', 'ok'));
}

function regenMsg(id) {
  const chat = S.chats[S.currentChatId]; if (!chat) return;
  const idx  = chat.messages.findIndex(x => x.id === id); if (idx < 0) return;
  let userMsg = null;
  for (let i = idx - 1; i >= 0; i--) { if (chat.messages[i].role === 'user') { userMsg = chat.messages[i]; break; } }
  if (!userMsg) return;
  chat.messages.splice(idx); saveChats(); renderMessages(chat.messages); sendMessage(userMsg.content);
}

function editMsg(id) {
  const chat = S.chats[S.currentChatId]; if (!chat) return;
  const m    = chat.messages.find(x => x.id === id); if (!m) return;
  const inp  = document.getElementById('chat-input');
  inp.value  = m.content; inp.focus(); handleInputChange(inp);
  const idx  = chat.messages.findIndex(x => x.id === id);
  chat.messages.splice(idx); saveChats(); renderMessages(chat.messages);
  showToast('Edit the message and press Enter to resend', 'inf');
}

function speakMsg(id) {
  const chat = S.chats[S.currentChatId]; if (!chat) return;
  const m    = chat.messages.find(x => x.id === id); if (!m) return;
  speakText(m.content.replace(/[#*`>|]/g, '').slice(0, 800));
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-SAVE REPORT FROM AI RESPONSE
═══════════════════════════════════════════════════════════════ */
function autoSaveReport(content) {
  const m = content.match(/risk\s*score[:\s]*(\d+)/i); if (!m) return;
  const score = Math.min(100, parseInt(m[1]));
  const level = score >= 76 ? 'critical' : score >= 51 ? 'high' : score >= 26 ? 'medium' : 'low';
  const titleMatch = content.match(/consumer[:\s#]*([A-Z0-9\-]+)/i);
  const title = titleMatch ? `Consumer #${titleMatch[1]} — AI Analysis` : `AI Fraud Analysis — ${new Date().toLocaleDateString()}`;
  const rpt = { id: 'rpt_' + Date.now(), title, date: new Date().toLocaleDateString(), riskScore: score, level, summary: content.replace(/[#*`]/g, '').trim().slice(0, 130) + '…', reasons: ['Detected via AI analysis — see chat for full details'] };
  S.reports.unshift(rpt);
  if (S.reports.length > 50) S.reports.pop();
  saveReports(); renderReports();
}

/* ═══════════════════════════════════════════════════════════════
   PASTE DETECTION
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  inp.addEventListener('paste', e => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text/plain');
    const lineCount  = (pasted.match(/\n/g) || []).length;
    const commaCount = (pasted.match(/,/g)  || []).length;
    if (lineCount >= 3 && commaCount >= lineCount) {
      setTimeout(() => {
        S.uploadedText = pasted.slice(0, 14000);
        S.uploadedFile = { name: 'pasted_data.csv' };
        document.getElementById('fp-name').textContent = 'pasted_data.csv';
        document.getElementById('fp-size').textContent = fmtBytes(new Blob([pasted]).size);
        document.getElementById('file-prev').classList.add('vis');
        inp.value = ''; handleInputChange(inp);
        showToast('CSV data detected — ready to analyze', 'inf', 3500);
      }, 50);
    }
  });

  /* Drag and drop */
  const chatView = document.getElementById('view-chat');
  if (chatView) {
    chatView.addEventListener('dragover',  e => { e.preventDefault(); chatView.style.outline = '2px dashed rgba(99,102,241,0.5)'; });
    chatView.addEventListener('dragleave', () => { chatView.style.outline = ''; });
    chatView.addEventListener('drop',      e => {
      e.preventDefault(); chatView.style.outline = '';
      const file = e.dataTransfer?.files?.[0]; if (!file) return;
      const dt = new DataTransfer(); dt.items.add(file);
      const fi = document.getElementById('file-input'); fi.files = dt.files;
      handleFileUpload({ target: fi });
    });
  }

  /* Floating orb */
  const orb = document.getElementById('float-orb');
  if (orb) orb.addEventListener('click', () => { _orbIdx = (_orbIdx + 1) % _orbViews.length; showView(_orbViews[_orbIdx]); });
});

/* ═══════════════════════════════════════════════════════════════
   FINAL INIT
═══════════════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  loadSettings();
  loadChats();
  loadReports();
  startClock();
  checkResponsive();
  renderChatHistory();
  renderReports();
  restoreSidebarState();
  startConnCheck();
  window.addEventListener('resize', checkResponsive);

  if (Object.keys(S.chats).length === 0) {
    startNewChat();
  } else {
    const last = Object.values(S.chats).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (last) {
      S.currentChatId = last.id;
      if (last.messages && last.messages.length > 0) renderMessages(last.messages);
      else showWelcome();
      renderChatHistory();
    }
  }

  const qaChips = document.querySelector('.qa-chips');
  if (qaChips) qaChips.style.display = S.showChips ? 'flex' : 'none';

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  updateConnStatus();
  console.log('%c⚡ ElectroGuard AI — ready', 'color:#a5b4fc;font-weight:700;font-size:14px');
  console.log('%cPowered by Groq · llama-3.3-70b-versatile', 'color:#7a8299;font-size:11px');
});
