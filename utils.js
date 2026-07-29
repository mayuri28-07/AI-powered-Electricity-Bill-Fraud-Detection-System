'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are ElectroGuard, an expert Electricity Fraud Detection AI assistant.
Your specialisation is detecting electricity theft, billing fraud, meter tampering, and consumption anomalies.

For EVERY analysis you MUST provide all of the following sections:
1. **Summary** — Brief 2-3 sentence overview of findings
2. **Detected Issues** — Numbered list of every anomaly or fraud indicator found
3. **Risk Score** — A single integer 0-100 (format: "Risk Score: XX/100")
4. **Reason** — Detailed explanation of WHY each issue is flagged
5. **Confidence** — Percentage confidence per finding (e.g. 87%)
6. **Recommendation** — Specific, actionable next steps

Risk Score Guide:
- 🟢 LOW      0-25   Normal usage, no action needed
- 🟡 MEDIUM  26-50   Minor anomalies, monitor closely
- 🟠 HIGH    51-75   Significant irregularities, investigate
- 🔴 CRITICAL 76-100  Strong fraud evidence, immediate action

Fraud Detection Checklist (apply all):
✓ Sudden consumption drop >40% month-over-month
✓ Sudden consumption spike >60% month-over-month
✓ Zero consumption on active account
✓ Negative consumption or billing values
✓ Meter reading reversal
✓ Duplicate billing periods
✓ Missing monthly readings
✓ Billing amount inconsistent with kWh consumed
✓ Abnormal night-time load profile
✓ Seasonal pattern violations
✓ Statistical outliers (Z-score > 2.5sigma)

Always use markdown formatting with tables where appropriate.
Never make unsupported accusations — cite specific data patterns.
Be thorough, evidence-based, and provide actionable insights.`;

/* ═══════════════════════════════════════════════════════════════
   APPLICATION STATE  (shared across all modules)
═══════════════════════════════════════════════════════════════ */
const S = {
  apiKey:        '',
  model:         'llama-3.3-70b-versatile',
  temperature:   0.7,
  streaming:     true,
  voiceEnabled:  true,
  ttsEnabled:    false,
  autoScroll:    true,
  showChips:     true,
  currentChatId: null,
  chats:         {},
  currentView:   'chat',
  isGenerating:  false,
  uploadedFile:  null,
  uploadedText:  null,
  recognition:   null,
  isListening:   false,
  tokenCount:    0,
  reports:       [],
  chartsInited:  { dashboard: false, analytics: false }
};

/* ═══════════════════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════════════════ */
function _val(id)       { const e = document.getElementById(id); return e ? e.value : ''; }
function _set(id, v, txt) { const e = document.getElementById(id); if (e) { txt ? e.textContent = v : e.value = v; } }
function _chk(id, v)    { const e = document.getElementById(id); if (e) e.checked = !!v; }
function _checked(id)   { const e = document.getElementById(id); return e ? e.checked : false; }

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* ═══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'inf', ms = 3400) {
  const wrap  = document.getElementById('toast-wrap');
  const icons = { ok: '✓', err: '✕', warn: '⚠', inf: 'ℹ' };
  const t     = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="font-weight:700">${icons[type] || 'ℹ'}</span> ${escHtml(msg)}`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.animation = 't-in .28s ease reverse forwards';
    setTimeout(() => t.remove(), 290);
  }, ms);
}

/* ═══════════════════════════════════════════════════════════════
   LIVE CLOCK
═══════════════════════════════════════════════════════════════ */
function startClock() {
  const el = document.getElementById('live-clock');
  const tick = () => {
    const n  = new Date();
    const hh = String(n.getHours()).padStart(2, '0');
    const mm = String(n.getMinutes()).padStart(2, '0');
    const ss = String(n.getSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE / MOBILE SIDEBAR
═══════════════════════════════════════════════════════════════ */
function checkResponsive() {
  const btn = document.getElementById('mob-menu-btn');
  if (window.innerWidth <= 768) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
    closeMobSidebar();
  }
}

function openMobSidebar() {
  document.getElementById('sidebar').classList.add('mob-open');
  document.getElementById('mob-overlay').classList.add('on');
}

function closeMobSidebar() {
  document.getElementById('sidebar').classList.remove('mob-open');
  document.getElementById('mob-overlay').classList.remove('on');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  localStorage.setItem('eg_sb_collapsed', sb.classList.contains('collapsed') ? '1' : '0');
}

function restoreSidebarState() {
  if (localStorage.getItem('eg_sb_collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONNECTION STATUS
═══════════════════════════════════════════════════════════════ */
function updateConnStatus() {
  const dot = document.querySelector('.conn-dot');
  const txt = document.getElementById('conn-txt');
  if (!dot || !txt) return;
  if (S.apiKey && S.apiKey.startsWith('gsk_')) {
    dot.style.background = 'var(--green)';
    txt.textContent = 'API Ready';
  } else {
    dot.style.background = 'var(--yellow)';
    txt.textContent = 'No API Key';
  }
}

function startConnCheck() {
  const check = async () => {
    if (!S.apiKey) return;
    const dot = document.querySelector('.conn-dot');
    const txt = document.getElementById('conn-txt');
    if (!dot || !txt) return;
    try {
      await fetch('https://api.groq.com/', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      dot.style.background = 'var(--green)';
      txt.textContent = 'API Ready';
    } catch (_) {
      dot.style.background = 'var(--red)';
      txt.textContent = 'Offline';
    }
  };
  setTimeout(check, 3000);
  setInterval(check, 45000);
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS — LOAD / SAVE / RESET / TEST
═══════════════════════════════════════════════════════════════ */
function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem('eg_settings') || '{}');
    S.apiKey       = d.apiKey       || '';
    S.model        = d.model        || 'llama-3.3-70b-versatile';
    S.temperature  = d.temperature  !== undefined ? d.temperature : 0.7;
    S.streaming    = d.streaming    !== false;
    S.voiceEnabled = d.voiceEnabled !== false;
    S.ttsEnabled   = d.ttsEnabled   || false;
    S.autoScroll   = d.autoScroll   !== false;
    S.showChips    = d.showChips    !== false;

    _set('s-api-key',    S.apiKey);
    _set('s-model',      S.model);
    _set('s-temp',       S.temperature);
    _set('s-temp-val',   S.temperature, true);
    _chk('s-stream',     S.streaming);
    _chk('s-voice',      S.voiceEnabled);
    _chk('s-tts',        S.ttsEnabled);
    _chk('s-autoscroll', S.autoScroll);
    _chk('s-chips',      S.showChips);

    const rangeEl = document.getElementById('s-temp');
    if (rangeEl) updateRangeStyle(rangeEl);
    updateConnStatus();
  } catch (e) { console.warn('Settings load error', e); }
}

function saveSettings() {
  S.apiKey       = _val('s-api-key').trim();
  S.model        = _val('s-model');
  S.temperature  = parseFloat(_val('s-temp'));
  S.streaming    = _checked('s-stream');
  S.voiceEnabled = _checked('s-voice');
  S.ttsEnabled   = _checked('s-tts');
  S.autoScroll   = _checked('s-autoscroll');
  S.showChips    = _checked('s-chips');

  localStorage.setItem('eg_settings', JSON.stringify({
    apiKey: S.apiKey, model: S.model, temperature: S.temperature,
    streaming: S.streaming, voiceEnabled: S.voiceEnabled,
    ttsEnabled: S.ttsEnabled, autoScroll: S.autoScroll, showChips: S.showChips
  }));

  if (S.currentView === 'chat') {
    document.getElementById('tb-sub').textContent = `Powered by Groq · ${S.model}`;
  }
  const qaChips = document.querySelector('.qa-chips');
  if (qaChips) qaChips.style.display = S.showChips ? 'flex' : 'none';
  updateConnStatus();
  showToast('Settings saved', 'ok');
}

function resetAllSettings() {
  if (!confirm('Reset all settings to defaults?')) return;
  localStorage.removeItem('eg_settings');
  location.reload();
}

async function testAPIKey() {
  const key = _val('s-api-key').trim();
  if (!key.startsWith('gsk_')) { showToast('Key must start with "gsk_"', 'err'); return; }
  showToast('Testing API key…', 'inf', 2000);
  try {
    const r = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
    });
    if (r.ok || r.status === 400) { showToast('✓ API key is valid', 'ok'); saveSettings(); }
    else if (r.status === 401)     showToast('✗ Invalid API key', 'err');
    else                            showToast(`Status ${r.status} — key may still be valid`, 'warn');
  } catch (_) { showToast('Network error — cannot validate', 'warn'); }
}

function updateRangeStyle(el) {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--val', pct + '%');
}

/* ═══════════════════════════════════════════════════════════════
   INPUT HELPERS
═══════════════════════════════════════════════════════════════ */
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
}

function handleInputChange(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 138) + 'px';
  const len = el.value.length;
  _set('char-cnt', len + ' chars', true);
  _set('tok-cnt', '~' + Math.ceil(len / 4) + ' tokens', true);
}

function scrollToBottom() {
  const c = document.getElementById('chat-msgs');
  if (c && S.autoScroll) c.scrollTop = c.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   VOICE INPUT / TTS
═══════════════════════════════════════════════════════════════ */
function toggleVoice() {
  if (!S.voiceEnabled) { showToast('Voice input disabled — enable in Settings', 'warn'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Speech recognition not supported in this browser', 'err'); return; }
  if (S.isListening && S.recognition) { S.recognition.stop(); return; }

  const rec = new SR();
  rec.continuous = false; rec.interimResults = true;
  rec.lang = 'en-US'; rec.maxAlternatives = 1;
  S.recognition = rec;

  rec.onstart = () => {
    S.isListening = true;
    document.getElementById('voice-ind-top').classList.add('on');
    document.getElementById('voice-ind-inp').classList.add('on');
    document.getElementById('mic-btn').style.color = 'var(--red)';
  };
  rec.onresult = e => {
    const t = Array.from(e.results).map(r => r[0].transcript).join('');
    const inp = document.getElementById('chat-input');
    inp.value = t; handleInputChange(inp);
  };
  rec.onspeechend = () => rec.stop();
  rec.onend = () => {
    S.isListening = false;
    document.getElementById('voice-ind-top').classList.remove('on');
    document.getElementById('voice-ind-inp').classList.remove('on');
    document.getElementById('mic-btn').style.color = '';
    S.recognition = null;
  };
  rec.onerror = e => {
    S.isListening = false;
    document.getElementById('voice-ind-top').classList.remove('on');
    document.getElementById('voice-ind-inp').classList.remove('on');
    document.getElementById('mic-btn').style.color = '';
    S.recognition = null;
    if (e.error !== 'aborted' && e.error !== 'no-speech') showToast('Voice error: ' + e.error, 'err');
  };
  try { rec.start(); } catch (err) { showToast('Could not start microphone: ' + err.message, 'err'); }
}

function speakText(text) {
  if (!window.speechSynthesis || !S.ttsEnabled) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95; utt.pitch = 1.0; utt.volume = 1.0; utt.lang = 'en-US';
  const voices  = window.speechSynthesis.getVoices();
  const pref    = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('natural'))
                || voices.find(v => v.lang.startsWith('en'));
  if (pref) utt.voice = pref;
  window.speechSynthesis.speak(utt);
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'k') { e.preventDefault(); if (S.currentView !== 'chat') showView('chat'); document.getElementById('chat-input').focus(); }
  if (mod && e.key === 'n') { e.preventDefault(); startNewChat(); }
  if (mod && e.key === 'd') { e.preventDefault(); showView('dashboard'); }
  if (mod && e.key === 'r') { e.preventDefault(); showView('reports'); }
  if (mod && e.key === ',') { e.preventDefault(); showView('settings'); }
  if (e.key === 'Escape') {
    closeMobSidebar();
    if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (S.isListening && S.recognition) S.recognition.stop();
  }
});

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD STATS REFRESH (every 60 s)
═══════════════════════════════════════════════════════════════ */
function refreshDashStats() {
  const fl  = (b, p) => Math.round(b * (1 + (Math.random() - 0.5) * p));
  const tot = fl(1248, 0.02), sus = fl(47, 0.12), avg = fl(284, 0.06), alt = fl(12, 0.35);
  const pct = ((sus / tot) * 100).toFixed(1);
  _set('sw-consumers',   tot.toLocaleString(), true);
  _set('sw-suspicious',  sus,                  true);
  _set('sw-fraud-pct',   pct + '%',            true);
  _set('sw-avg-kwh',     avg + ' kWh',         true);
  _set('sw-alerts',      alt,                  true);
  _set('kpi-consumers',  tot.toLocaleString(), true);
  _set('kpi-suspicious', sus,                  true);
  _set('kpi-fraud-pct',  pct + '%',            true);
  _set('kpi-avg-kwh',    avg,                  true);
  _set('kpi-alerts',     alt,                  true);
}
setInterval(refreshDashStats, 60000);

/* ═══════════════════════════════════════════════════════════════
   PREVENT ACCIDENTAL NAVIGATION DURING GENERATION
═══════════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', e => {
  if (S.isGenerating) { e.preventDefault(); e.returnValue = 'AI is still generating. Leave anyway?'; }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateConnStatus();
});
