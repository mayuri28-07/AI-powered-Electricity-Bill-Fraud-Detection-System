'use strict';

/* ═══════════════════════════════════════════════════════════════
   REPORTS — LOAD / SAVE / DEFAULT / RENDER / DOWNLOAD
═══════════════════════════════════════════════════════════════ */
function loadReports() {
  try {
    const raw = localStorage.getItem('eg_reports');
    S.reports = raw ? JSON.parse(raw) : [];
    if (S.reports.length === 0) { S.reports = defaultReports(); saveReports(); }
  } catch (_) { S.reports = defaultReports(); }
}

function saveReports() { localStorage.setItem('eg_reports', JSON.stringify(S.reports)); }

function defaultReports() {
  return [
    { id: 'rpt_demo_1', title: 'Consumer #C001 — Meter Tampering Detected',   date: new Date(Date.now()-2*86400000).toLocaleDateString(), riskScore: 88, level: 'critical', summary: 'Strong meter bypass indicators: 73% consumption drop, negative reading, zero-period.', reasons: ['Consumption dropped 73% in April with no outage reported', 'Negative reading detected in July — meter reversal', 'Zero consumption for one month on active account'] },
    { id: 'rpt_demo_2', title: 'Consumer #C002 — Billing Anomaly',            date: new Date(Date.now()-5*86400000).toLocaleDateString(), riskScore: 63, level: 'high',     summary: 'Billing amount inconsistent with recorded consumption for April.', reasons: ['94% consumption drop in April with no field-confirmed outage', 'Bill amount remained high despite near-zero consumption'] },
    { id: 'rpt_demo_3', title: 'Consumer #C004 — Duplicate Readings',         date: new Date(Date.now()-8*86400000).toLocaleDateString(), riskScore: 38, level: 'medium',   summary: 'Identical meter readings recorded across three consecutive months.', reasons: ['Consumption value 265 kWh repeated in Jan, Feb, Mar, Jun', 'Pattern suggests manually copied readings'] }
  ];
}

function renderReports() {
  const el = document.getElementById('reports-list'); if (!el) return;
  if (S.reports.length === 0) {
    el.innerHTML = `<div class="empty-st"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h3>No reports yet</h3><p>Upload a CSV or chat with the AI to generate fraud reports.</p></div>`;
    document.getElementById('rpt-badge').textContent = '0'; return;
  }
  const LC = {
    critical: { bg: 'rgba(239,68,68,0.12)',  fg: '#ef4444' },
    high:     { bg: 'rgba(249,115,22,0.12)', fg: '#f97316' },
    medium:   { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b' },
    low:      { bg: 'rgba(16,185,129,0.12)', fg: '#10b981' }
  };
  el.innerHTML = S.reports.map(r => {
    const c = LC[r.level] || LC.low;
    return `<div class="rpt-card">
      <div class="rpt-icon" style="background:${c.bg}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.fg}" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="rpt-info">
        <div class="rpt-title">${escHtml(r.title)}</div>
        <div class="rpt-meta">${escHtml(r.date)} · Risk Score: <strong style="color:${c.fg}">${r.riskScore}/100</strong></div>
        <div class="rpt-meta" style="margin-top:3px">${escHtml(r.summary)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end;flex-shrink:0">
        <span style="font-size:10.5px;padding:2px 9px;border-radius:99px;font-weight:700;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33">${r.level.toUpperCase()}</span>
        <div style="display:flex;gap:6px">
          <button class="m-act-btn" onclick="dlReport('${r.id}','json')">JSON</button>
          <button class="m-act-btn" onclick="dlReport('${r.id}','csv')">CSV</button>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('rpt-badge').textContent = S.reports.length;
}

function generateFullReport() {
  showView('chat');
  sendSuggestion('Generate a comprehensive fraud detection report for all consumers. Include risk scores, detected anomalies, reasons, confidence levels, and specific recommendations for each flagged case. Format with clear sections and tables.');
}

function dlReport(id, fmt) {
  const r = S.reports.find(x => x.id === id); if (!r) return;
  let content, filename, mime;
  if (fmt === 'json') {
    content = JSON.stringify(r, null, 2); filename = `fraud-report-${id}.json`; mime = 'application/json';
  } else {
    const rows = ['Field,Value', `Title,"${r.title}"`, `Date,"${r.date}"`, `Risk Score,${r.riskScore}`, `Level,${r.level}`, `Summary,"${r.summary}"`, '', 'Reasons', ...r.reasons.map((rx, i) => `${i+1},"${rx}"`)];
    content = rows.join('\n'); filename = `fraud-report-${id}.csv`; mime = 'text/csv';
  }
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
  showToast(`Report downloaded as ${fmt.toUpperCase()}`, 'ok');
}
