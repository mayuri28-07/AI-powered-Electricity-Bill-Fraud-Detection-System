'use strict';

/* ═══════════════════════════════════════════════════════════════
   GROQ API — STREAMING
═══════════════════════════════════════════════════════════════ */
async function streamGroq(messages, onChunk) {
  if (!S.apiKey) throw new Error('No API key configured');
  const trimmed = trimContext(messages);
  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
      body: JSON.stringify({ model: S.model, temperature: S.temperature, max_tokens: 4096, stream: true, messages: trimmed })
    });
  } catch (_) { throw new Error('Network error — check your internet connection'); }

  if (!response.ok) await handleGroqError(response);

  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText  = '';
  let buf       = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      const tl = line.trim();
      if (!tl.startsWith('data:')) continue;
      const data = tl.slice(5).trim();
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const delta  = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length) {
          fullText += delta;
          onChunk(delta);
        }
        const usage = parsed?.x_groq?.usage;
        if (usage?.completion_tokens) S.tokenCount += usage.completion_tokens;
      } catch (_) {}
    }
  }

  updateTokenDisplay();
  return fullText;
}

/* ═══════════════════════════════════════════════════════════════
   GROQ API — NON-STREAMING
═══════════════════════════════════════════════════════════════ */
async function fetchGroq(messages) {
  if (!S.apiKey) throw new Error('No API key configured');
  const trimmed = trimContext(messages);
  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
      body: JSON.stringify({ model: S.model, temperature: S.temperature, max_tokens: 4096, stream: false, messages: trimmed })
    });
  } catch (_) { throw new Error('Network error — check your internet connection'); }

  if (!response.ok) await handleGroqError(response);

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (json?.usage?.total_tokens) S.tokenCount += json.usage.total_tokens;
  updateTokenDisplay();
  return text;
}

/* ═══════════════════════════════════════════════════════════════
   HTTP ERROR HANDLER
═══════════════════════════════════════════════════════════════ */
async function handleGroqError(response) {
  let serverMsg = '';
  try { const j = await response.json(); serverMsg = j?.error?.message || ''; } catch (_) {}
  const STATUS_MAP = {
    400: 'Bad request — message may be malformed or too long.',
    401: '⚠️ Invalid API key — check your key in Settings.',
    403: 'Access forbidden — key may lack required permissions.',
    404: `Model "${S.model}" not found — try a different model in Settings.`,
    413: 'Request too large — shorten your message or uploaded data.',
    422: 'Unprocessable request — check message format.',
    429: '⏳ Rate limit reached — please wait a moment and retry.',
    500: 'Groq server error — please try again shortly.',
    502: 'Groq gateway error — try again in a few seconds.',
    503: 'Groq service unavailable — try again shortly.'
  };
  const friendly = STATUS_MAP[response.status] || serverMsg || `Unexpected API error (HTTP ${response.status})`;
  showToast(friendly, response.status >= 500 ? 'err' : 'warn', 5000);
  if (response.status === 401 || response.status === 403) setTimeout(() => showView('settings'), 1600);
  throw new Error(friendly);
}

/* ═══════════════════════════════════════════════════════════════
   CONTEXT WINDOW TRIMMER
═══════════════════════════════════════════════════════════════ */
function trimContext(messages, maxChars = 80000) {
  if (!messages || messages.length === 0) return messages;
  const [system, ...rest] = messages;
  let total = (system?.content || '').length;
  const kept = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const len = (rest[i]?.content || '').length;
    if (total + len > maxChars) break;
    total += len;
    kept.unshift(rest[i]);
  }
  return [system, ...kept];
}

/* ═══════════════════════════════════════════════════════════════
   TOKEN DISPLAY
═══════════════════════════════════════════════════════════════ */
function updateTokenDisplay() {
  if (S.currentView !== 'chat' || S.tokenCount === 0) return;
  const el = document.getElementById('tb-sub');
  if (el) el.textContent = `Powered by Groq · ${S.model} · ${S.tokenCount.toLocaleString()} tokens used`;
}
