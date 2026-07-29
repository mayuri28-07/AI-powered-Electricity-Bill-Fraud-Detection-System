'use strict';

/* ═══════════════════════════════════════════════════════════════
   CSV PARSER
═══════════════════════════════════════════════════════════════ */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [], rowCount: 0 };
  const delim   = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows    = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj  = {};
    headers.forEach((h, i) => { const raw = vals[i] !== undefined ? vals[i] : ''; obj[h] = (raw !== '' && !isNaN(raw)) ? parseFloat(raw) : raw; });
    return obj;
  });
  return { headers, rows, rowCount: rows.length };
}

/* ═══════════════════════════════════════════════════════════════
   FILE CONTEXT BUILDER (for AI prompt)
═══════════════════════════════════════════════════════════════ */
function prepareFileCtx(rawText, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  let ctx = '';
  try {
    if (ext === 'csv') {
      const parsed = parseCSV(rawText);
      const flags  = localPrecheck(parsed.rows, parsed.headers);
      ctx  = `**Attached File:** \`${filename}\`\n`;
      ctx += `**Format:** CSV | **Records:** ${parsed.rows.length} | **Columns:** ${parsed.headers.join(', ')}\n\n`;
      ctx += `**Data (first 25 rows):**\n\`\`\`json\n${JSON.stringify(parsed.rows.slice(0, 25), null, 2)}\n\`\`\`\n`;
      if (flags.length) ctx += `\n**⚡ Pre-Analysis Flags:**\n${flags.map(f => '- ' + f).join('\n')}\n`;
    } else if (ext === 'json') {
      let parsed; try { parsed = JSON.parse(rawText); } catch (_) { parsed = rawText; }
      ctx = `**Attached File:** \`${filename}\`\n**Format:** JSON\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 8000)}\n\`\`\``;
    } else {
      ctx = `**Attached File:** \`${filename}\`\n\n\`\`\`\n${rawText.slice(0, 10000)}\n\`\`\``;
    }
  } catch (_) { ctx = `**Attached File:** \`${filename}\`\n\n\`\`\`\n${rawText.slice(0, 10000)}\n\`\`\``; }
  return ctx;
}

/* ═══════════════════════════════════════════════════════════════
   LOCAL PRE-CHECK (fast scan injected into AI prompt)
═══════════════════════════════════════════════════════════════ */
function localPrecheck(rows, headers) {
  const flags = [];
  if (!rows || rows.length === 0) return flags;
  const cCol = headers.find(h => /consump|kwh|unit|usage|reading|energy/i.test(h));
  const bCol = headers.find(h => /bill|amount|charge|cost|total|invoice/i.test(h));
  if (!cCol) return flags;
  const vals = rows.map(r => parseFloat(r[cCol])).filter(v => !isNaN(v));
  if (vals.length === 0) return flags;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length);
  flags.push(`📋 Stats: n=${vals.length}, μ=${mean.toFixed(1)}, σ=${std.toFixed(1)}, min=${Math.min(...vals)}, max=${Math.max(...vals)}`);
  const zeros = vals.filter(v => v === 0).length;
  if (zeros > 0) flags.push(`⚠️ ${zeros} record(s) with ZERO consumption`);
  const negs = vals.filter(v => v < 0).length;
  if (negs > 0) flags.push(`🚨 ${negs} NEGATIVE consumption value(s) — possible meter reversal`);
  if (std > 0) {
    const out = vals.filter(v => Math.abs((v - mean) / std) > 2.5);
    if (out.length > 0) flags.push(`📊 ${out.length} Z-score outlier(s) >2.5σ: ${out.map(v => v.toFixed(1)).join(', ')}`);
  }
  for (let i = 1; i < vals.length; i++) {
    if (vals[i - 1] > 0) {
      const pct = ((vals[i] - vals[i - 1]) / vals[i - 1]) * 100;
      if (pct <= -50) flags.push(`📉 Sudden DROP: record ${i + 1} (${vals[i - 1]}→${vals[i]}, ${pct.toFixed(1)}%)`);
      if (pct >= 100)  flags.push(`📈 Sudden SPIKE: record ${i + 1} (${vals[i - 1]}→${vals[i]}, +${pct.toFixed(1)}%)`);
    }
  }
  if (bCol) {
    const bills = rows.map(r => parseFloat(r[bCol])).filter(v => !isNaN(v));
    const negB  = bills.filter(v => v < 0).length;
    if (negB > 0) flags.push(`💰 ${negB} NEGATIVE billing amount(s) found`);
  }
  return flags;
}

/* ═══════════════════════════════════════════════════════════════
   FULL LOCAL FRAUD ENGINE (7 checks)
═══════════════════════════════════════════════════════════════ */
function runFraudEngine(csvText, filename) {
  const { rows, headers } = parseCSV(csvText);
  const report = { filename, at: new Date().toISOString(), totalRows: rows.length, issues: [], riskScore: 0, riskLevel: 'low', stats: {}, recs: [] };
  if (rows.length === 0) { report.issues.push({ type: 'Parse Error', sev: 'HIGH', reason: 'No data rows found.', conf: 100, records: [] }); report.riskScore = 10; report.riskLevel = 'medium'; return report; }

  const cCol = headers.find(h => /consump|kwh|unit|usage|reading|energy/i.test(h));
  const bCol = headers.find(h => /bill|amount|charge|cost|total|invoice/i.test(h));

  if (cCol) {
    const vals = rows.map(r => parseFloat(r[cCol])).filter(v => !isNaN(v));
    if (vals.length > 0) {
      const n = vals.length, mean = vals.reduce((a, b) => a + b, 0) / n;
      const min = Math.min(...vals), max = Math.max(...vals);
      const std = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / n);
      report.stats = { mean: +mean.toFixed(2), min, max, std: +std.toFixed(2), count: n };

      /* CHECK 1 — Zero */
      const zeroIdx = vals.map((v, i) => v === 0 ? i + 2 : -1).filter(i => i >= 0);
      if (zeroIdx.length) { report.issues.push({ type: 'Zero Consumption', sev: 'HIGH', reason: `${zeroIdx.length} record(s) show zero consumption. Active accounts must not show 0 kWh unless a genuine outage is documented.`, conf: 83, records: zeroIdx }); report.riskScore += 18; }

      /* CHECK 2 — Negative */
      const negIdx = vals.map((v, i) => v < 0 ? i + 2 : -1).filter(i => i >= 0);
      if (negIdx.length) { report.issues.push({ type: 'Negative Consumption', sev: 'CRITICAL', reason: `${negIdx.length} record(s) contain NEGATIVE values (${vals.filter(v => v < 0).map(v => v.toFixed(1)).join(', ')} kWh). Physically impossible — strong meter reversal indicator.`, conf: 97, records: negIdx }); report.riskScore += 35; }

      /* CHECK 3 — Z-score outliers */
      if (std > 0) {
        const outliers = vals.map((v, i) => ({ v, i: i + 2, z: (v - mean) / std })).filter(o => Math.abs(o.z) > 2.5);
        if (outliers.length) { report.issues.push({ type: 'Statistical Outlier', sev: outliers.some(o => Math.abs(o.z) > 3.5) ? 'HIGH' : 'MEDIUM', reason: `${outliers.length} value(s) exceed ±2.5σ from mean (μ=${mean.toFixed(1)}, σ=${std.toFixed(1)}). Outliers: ${outliers.map(o => `row ${o.i}: ${o.v.toFixed(1)} kWh (z=${o.z.toFixed(2)})`).join('; ')}.`, conf: 79, records: outliers.map(o => o.i) }); report.riskScore += Math.min(outliers.length * 8, 24); }
      }

      /* CHECK 4 — Sudden drop */
      const drops = [];
      for (let i = 1; i < vals.length; i++) { if (vals[i - 1] > 50) { const pct = ((vals[i] - vals[i - 1]) / vals[i - 1]) * 100; if (pct <= -50) drops.push({ row: i + 2, pct: pct.toFixed(1), from: vals[i - 1], to: vals[i] }); } }
      if (drops.length) { report.issues.push({ type: 'Sudden Consumption Drop', sev: drops.some(d => d.pct <= -70) ? 'CRITICAL' : 'HIGH', reason: drops.map(d => `Row ${d.row}: ${d.from}→${d.to} kWh (${d.pct}%)`).join('; '), conf: 86, records: drops.map(d => d.row) }); report.riskScore += Math.min(drops.length * 15, 30); }

      /* CHECK 5 — Sudden spike */
      const spikes = [];
      for (let i = 1; i < vals.length; i++) { if (vals[i - 1] > 0) { const pct = ((vals[i] - vals[i - 1]) / vals[i - 1]) * 100; if (pct >= 100) spikes.push({ row: i + 2, pct: pct.toFixed(1), from: vals[i - 1], to: vals[i] }); } }
      if (spikes.length) { report.issues.push({ type: 'Sudden Consumption Spike', sev: 'MEDIUM', reason: spikes.map(d => `Row ${d.row}: ${d.from}→${d.to} kWh (+${d.pct}%)`).join('; '), conf: 73, records: spikes.map(d => d.row) }); report.riskScore += Math.min(spikes.length * 8, 16); }

      /* CHECK 6 — Duplicates */
      const seen = new Map(), dupes = [];
      vals.forEach((v, i) => { if (v > 0) { if (seen.has(v)) dupes.push(i + 2); else seen.set(v, i + 2); } });
      if (dupes.length > 2) { report.issues.push({ type: 'Duplicate Readings', sev: 'MEDIUM', reason: `${dupes.length} records share identical consumption values with earlier records. May indicate copied/forged meter readings.`, conf: 66, records: dupes.slice(0, 10) }); report.riskScore += 10; }
    }
  }

  /* CHECK 7 — Billing inconsistency */
  if (cCol && bCol) {
    const pairs = rows.map(r => ({ kwh: parseFloat(r[cCol]), bill: parseFloat(r[bCol]) })).filter(p => !isNaN(p.kwh) && !isNaN(p.bill) && p.kwh > 0);
    if (pairs.length > 2) {
      const ratios = pairs.map((p, i) => ({ i: i + 2, r: p.bill / p.kwh }));
      const rMean  = ratios.reduce((a, b) => a + b.r, 0) / ratios.length;
      const rStd   = Math.sqrt(ratios.reduce((a, b) => a + Math.pow(b.r - rMean, 2), 0) / ratios.length);
      const bad    = ratios.filter(x => rStd > 0 && Math.abs((x.r - rMean) / rStd) > 2.5);
      if (bad.length) { report.issues.push({ type: 'Billing Inconsistency', sev: 'HIGH', reason: `${bad.length} record(s) have cost-per-kWh ratios deviating >2.5σ from average (avg ₹${rMean.toFixed(2)}/kWh). Values: ${bad.map(x => `row ${x.i}: ₹${x.r.toFixed(2)}/kWh`).join(', ')}.`, conf: 81, records: bad.map(x => x.i) }); report.riskScore += Math.min(bad.length * 12, 20); }
    }
  }

  report.riskScore = Math.min(100, Math.round(report.riskScore));
  report.riskLevel = report.riskScore >= 76 ? 'critical' : report.riskScore >= 51 ? 'high' : report.riskScore >= 26 ? 'medium' : 'low';
  if (report.riskScore >= 76)      report.recs = ['Dispatch a field inspector immediately to verify the physical meter.', 'Suspend account billing pending investigation outcome.', 'Preserve all records for potential legal proceedings.'];
  else if (report.riskScore >= 51) report.recs = ['Flag account for priority investigation within 7 days.', 'Cross-verify meter readings with photographic evidence.', 'Interview consumer about reported usage changes.'];
  else if (report.riskScore >= 26) report.recs = ['Monitor closely for the next 3 billing cycles.', 'Request consumer explanation for unusual consumption pattern.'];
  else                              report.recs = ['No immediate action required — continue routine monitoring.'];
  return report;
}

/* ═══════════════════════════════════════════════════════════════
   FRAUD ENGINE → MARKDOWN
═══════════════════════════════════════════════════════════════ */
function fraudReportToMd(r) {
  if (r.issues.length === 0 && r.riskScore === 0) return `## ✅ Local Pre-Analysis: No Issues Found\n**File:** \`${r.filename}\` | **Records:** ${r.totalRows}\n\nNo fraud indicators detected.\n\n*Send to AI for deeper contextual analysis.*`;
  const lvlEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
  let md = `## ⚡ Local Fraud Pre-Analysis\n**File:** \`${r.filename}\` | **Records:** ${r.totalRows} | **Scanned:** ${new Date(r.at).toLocaleString()}\n\n`;
  md += `### ${lvlEmoji[r.riskLevel] || '⚪'} Risk Score: ${r.riskScore}/100 — ${r.riskLevel.toUpperCase()}\n\n`;
  if (r.stats && r.stats.count) md += `### 📊 Statistics\n| Metric | Value |\n|---|---|\n| Mean | ${r.stats.mean} kWh |\n| Min | ${r.stats.min} kWh |\n| Max | ${r.stats.max} kWh |\n| Std Dev | ${r.stats.std} kWh |\n| Records | ${r.stats.count} |\n\n`;
  if (r.issues.length > 0) {
    md += `### 🚨 Detected Issues\n| # | Issue | Severity | Rows | Confidence |\n|---|---|---|---|---|\n`;
    r.issues.forEach((iss, i) => { const rows = iss.records.slice(0, 5).join(', ') + (iss.records.length > 5 ? '…' : ''); md += `| ${i + 1} | ${iss.type} | **${iss.sev}** | ${rows} | ${iss.conf}% |\n`; });
    md += '\n';
    r.issues.forEach((iss, i) => { md += `**Issue ${i + 1} — ${iss.type}** (${iss.sev}, ${iss.conf}% confidence)\n${iss.reason}\n\n`; });
  }
  md += `### 💡 Recommendations\n`;
  r.recs.forEach((rec, i) => { md += `${i + 1}. ${rec}\n`; });
  md += `\n---\n*This pre-analysis ran locally in your browser. Send to AI above for deeper contextual investigation.*`;
  return md;
}

/* ═══════════════════════════════════════════════════════════════
   FILE UPLOAD HANDLER
═══════════════════════════════════════════════════════════════ */
function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  if (file.size > 5 * 1024 * 1024) { showToast('File too large — max 5 MB', 'err'); return; }
  S.uploadedFile = file;
  document.getElementById('fp-name').textContent = file.name;
  document.getElementById('fp-size').textContent = fmtBytes(file.size);
  document.getElementById('file-prev').classList.add('vis');
  const ext = file.name.split('.').pop().toLowerCase();
  if (['csv', 'txt', 'json'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = ev => {
      const raw = ev.target.result.slice(0, 14000);
      S.uploadedText = raw;
      if (ext === 'csv') {
        const report = runFraudEngine(raw, file.name);
        const md     = fraudReportToMd(report);
        ensureChat();
        const chat = S.chats[S.currentChatId];
        chat.messages.push({ id: 'local_' + Date.now(), role: 'assistant', content: md, timestamp: Date.now() });
        saveChats(); showView('chat'); renderMessages(chat.messages);
        showToast(`CSV scanned — ${report.issues.length} issue(s) found`, report.riskScore > 50 ? 'warn' : 'ok', 4000);
        const inp = document.getElementById('chat-input');
        if (!inp.value.trim()) { inp.value = 'Please perform a deeper AI analysis on this electricity data and explain each fraud indicator in detail.'; handleInputChange(inp); }
      } else { showToast(`File ready: ${file.name}`, 'ok'); }
    };
    reader.readAsText(file);
  } else if (ext === 'pdf') {
    S.uploadedText = `[PDF attached: ${file.name} (${fmtBytes(file.size)}). Please copy and paste the bill text directly into the chat for analysis.]`;
    showToast('PDF attached — paste bill text for best results', 'inf', 5000);
  } else if (['xlsx', 'xls'].includes(ext)) {
    S.uploadedText = `[Excel file attached: ${file.name} (${fmtBytes(file.size)}). Please export the sheet as CSV and upload again for full fraud analysis.]`;
    showToast('Excel detected — export as CSV for full analysis', 'inf', 5000);
  } else {
    S.uploadedText = `[File attached: ${file.name} (${fmtBytes(file.size)})]`;
    showToast(`File attached: ${file.name}`, 'ok');
  }
}

function removeFile() {
  S.uploadedFile = null; S.uploadedText = null;
  document.getElementById('file-prev').classList.remove('vis');
}

/* ═══════════════════════════════════════════════════════════════
   SAMPLE CSV DOWNLOAD
═══════════════════════════════════════════════════════════════ */
function downloadSampleCSV() {
  const hdr  = 'Consumer_ID,Month,Year,Consumption_kWh,Bill_Amount,Meter_Start,Meter_End\n';
  const rows = [
    'C001,January,2024,312,3744,1000,1312','C001,February,2024,298,3576,1312,1610',
    'C001,March,2024,325,3900,1610,1935','C001,April,2024,0,3300,1935,1935',
    'C001,May,2024,289,3468,1935,2224','C001,June,2024,680,4080,2224,2904',
    'C001,July,2024,-18,3900,2904,2886','C001,August,2024,305,3660,2886,3191',
    'C001,September,2024,298,3576,3191,3489','C001,October,2024,311,3732,3489,3800',
    'C001,November,2024,302,3624,3800,4102','C001,December,2024,319,3828,4102,4421',
    'C002,January,2024,148,1776,500,648','C002,February,2024,151,1812,648,799',
    'C002,March,2024,145,1740,799,944','C002,April,2024,9,1850,944,953',
    'C002,May,2024,147,1764,953,1100','C002,June,2024,152,1824,1100,1252',
    'C002,July,2024,149,1788,1252,1401','C002,August,2024,155,1860,1401,1556',
    'C002,September,2024,143,1716,1556,1699','C002,October,2024,150,1800,1699,1849',
    'C003,January,2024,420,5040,3000,3420','C003,February,2024,398,4776,3420,3818',
    'C003,March,2024,435,5220,3818,4253','C003,April,2024,411,4932,4253,4664',
    'C003,May,2024,427,5124,4664,5091','C003,June,2024,445,5340,5091,5536',
    'C004,January,2024,265,3180,700,965','C004,February,2024,265,3180,965,1230',
    'C004,March,2024,265,3180,1230,1495','C004,April,2024,270,3240,1495,1765',
    'C004,May,2024,268,3216,1765,2033','C004,June,2024,265,3180,2033,2298'
  ].join('\n');
  const blob = new Blob([hdr + rows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'sample_electricity_data.csv' });
  a.click(); URL.revokeObjectURL(url);
  showToast('Sample CSV downloaded! Upload it to test fraud detection.', 'ok', 5000);
}
