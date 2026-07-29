'use strict';

const _CH = {};
function destroyChart(id) { if (_CH[id]) { try { _CH[id].destroy(); } catch (_) {} delete _CH[id]; } }

function applyChartDefaults() {
  if (!window.Chart) return;
  const D = Chart.defaults;
  D.color = '#7a8299'; D.borderColor = 'rgba(255,255,255,0.06)';
  D.font.family = "'Inter',system-ui,sans-serif"; D.font.size = 11.5;
  D.plugins.legend.labels.color    = '#7a8299';
  D.plugins.legend.labels.boxWidth = 10;
  D.plugins.legend.labels.padding  = 14;
  D.plugins.tooltip.backgroundColor = '#1a1f2e';
  D.plugins.tooltip.borderColor     = 'rgba(255,255,255,0.12)';
  D.plugins.tooltip.borderWidth      = 1;
  D.plugins.tooltip.padding          = 10;
  D.plugins.tooltip.titleColor       = '#e8eaf0';
  D.plugins.tooltip.bodyColor        = '#7a8299';
  D.plugins.tooltip.cornerRadius     = 8;
  D.animation.duration = 550;
  D.animation.easing   = 'easeInOutQuart';
}

function mkGrad(canvas, top, bot) {
  try { const ctx = canvas.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 190); g.addColorStop(0, top); g.addColorStop(1, bot); return g; }
  catch (_) { return top; }
}

/* ═══════════════════════ DASHBOARD CHARTS ═══════════════════════ */
function initDashboardCharts() {
  if (!window.Chart) { setTimeout(initDashboardCharts, 250); return; }
  applyChartDefaults();
  buildConsumptionChart(); buildFraudDistChart(); buildRiskDistChart(); buildDailyPatternChart();
}

function buildConsumptionChart() {
  destroyChart('cons');
  const canvas = document.getElementById('ch-consumption'); if (!canvas) return;
  const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const expected = [310,295,320,280,285,290,340,375,310,285,295,305];
  const actual   = [310,295,320,280,55, 290,340,375,310,285,295,305];
  _CH['cons'] = new Chart(canvas, { type: 'line', data: { labels: months, datasets: [
    { label: 'Expected (kWh)', data: expected, borderColor: 'rgba(99,102,241,0.5)', backgroundColor: 'transparent', borderWidth: 1.8, borderDash: [5,4], pointRadius: 2, tension: 0.4, fill: false },
    { label: 'Actual (kWh)',   data: actual,   borderColor: '#6366f1', backgroundColor: mkGrad(canvas,'rgba(99,102,241,0.22)','rgba(99,102,241,0.01)'), borderWidth: 2.2,
      pointRadius: actual.map((v,i) => Math.abs(v-expected[i])>100?6:4),
      pointBackgroundColor: actual.map((v,i) => Math.abs(v-expected[i])>100?'#ef4444':'#6366f1'),
      pointBorderColor: 'transparent', tension: 0.4, fill: true }
  ]}, options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    scales: { x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#4a526b'}}, y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a526b',callback:v=>v+' kWh'}} },
    plugins: { legend:{position:'top'}, tooltip:{callbacks:{afterBody(items){const act=items.find(i=>i.dataset.label.includes('Actual'));const exp=items.find(i=>i.dataset.label.includes('Expected'));if(act&&exp){const d=((act.raw-exp.raw)/exp.raw*100).toFixed(1);if(d<-20)return[`⚠️ Drop: ${d}%`];if(d>20)return[`🚨 Spike: +${d}%`];}return[];}}}}
  }});
}

function buildFraudDistChart() {
  destroyChart('fdist');
  const canvas = document.getElementById('ch-fraud-dist'); if (!canvas) return;
  _CH['fdist'] = new Chart(canvas, { type: 'doughnut', data: {
    labels: ['Meter Tampering','Zero Consumption','Billing Anomaly','Sudden Drop','Sudden Spike','Duplicate Bill','Other'],
    datasets: [{ data: [18,12,24,15,10,9,12],
      backgroundColor: ['rgba(239,68,68,0.72)','rgba(249,115,22,0.72)','rgba(245,158,11,0.72)','rgba(99,102,241,0.72)','rgba(139,92,246,0.72)','rgba(6,182,212,0.72)','rgba(74,82,107,0.72)'],
      borderColor: '#0B0F19', borderWidth: 3, hoverOffset: 10 }]},
    options: { responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins: { legend:{position:'right',labels:{boxWidth:10,padding:11}},
        tooltip:{callbacks:{label(ctx){const tot=ctx.dataset.data.reduce((a,b)=>a+b,0);const pct=((ctx.raw/tot)*100).toFixed(1);return ` ${ctx.label}: ${ctx.raw} cases (${pct}%)`;}}}}
    }});
}

function buildRiskDistChart() {
  destroyChart('rdist');
  const canvas = document.getElementById('ch-risk-dist'); if (!canvas) return;
  _CH['rdist'] = new Chart(canvas, { type: 'bar', data: {
    labels: ['Low (0-25)','Medium (26-50)','High (51-75)','Critical (76-100)'],
    datasets: [{ label:'Consumers', data:[1082,89,54,23],
      backgroundColor: ['rgba(16,185,129,0.55)','rgba(245,158,11,0.55)','rgba(249,115,22,0.55)','rgba(239,68,68,0.55)'],
      borderColor: ['#10b981','#f59e0b','#f97316','#ef4444'], borderWidth:1.5, borderRadius:6, barThickness:26 }]},
    options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales: { x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a526b'}}, y:{grid:{display:false},ticks:{color:'#7a8299'}} },
      plugins: { legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.raw.toLocaleString()} consumers`}}}
    }});
}

function buildDailyPatternChart() {
  destroyChart('daily');
  const canvas = document.getElementById('ch-daily'); if (!canvas) return;
  const hours   = Array.from({length:24},(_,i)=>i===0?'12am':i<12?`${i}am`:i===12?'12pm':`${i-12}pm`);
  const normal  = [2.1,1.8,1.6,1.5,1.6,2.0,3.2,4.8,5.1,4.6,4.2,4.0,4.5,4.3,4.1,4.4,5.2,6.8,7.2,6.5,5.4,4.2,3.1,2.4];
  const suspect = [2.1,1.8,9.4,9.1,8.7,2.0,3.2,4.8,5.1,4.6,4.2,4.0,4.5,4.3,4.1,4.4,5.2,6.8,7.2,6.5,5.4,4.2,3.1,2.4];
  _CH['daily'] = new Chart(canvas, { type:'line', data:{ labels:hours, datasets:[
    { label:'Normal Profile',   data:normal,  borderColor:'rgba(16,185,129,0.65)', backgroundColor:'transparent', borderWidth:1.8, borderDash:[4,3], pointRadius:0, tension:0.4, fill:false },
    { label:'Suspect Consumer', data:suspect, borderColor:'#ef4444', backgroundColor:mkGrad(canvas,'rgba(239,68,68,0.18)','rgba(239,68,68,0.01)'), borderWidth:2,
      pointRadius:suspect.map(v=>v>8?5:0), pointBackgroundColor:'#ef4444', tension:0.4, fill:true }
  ]}, options:{ responsive:true, maintainAspectRatio:false,
    scales:{ x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#4a526b',maxTicksLimit:8}}, y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a526b',callback:v=>v+' kW'}} },
    plugins:{ legend:{position:'top'}, tooltip:{callbacks:{afterBody(items){const s=items.find(i=>i.dataset.label==='Suspect Consumer');if(s?.raw>8)return['🚨 Abnormal night-load!'];return [];}}}}
  }});
}

/* ═══════════════════════ ANALYTICS CHARTS ═══════════════════════ */
function initAnalyticsCharts() {
  if (!window.Chart) { setTimeout(initAnalyticsCharts, 250); return; }
  applyChartDefaults();
  buildComboChart(); buildZScoreChart(); buildRiskPieChart();
}

function buildComboChart() {
  destroyChart('combo');
  const canvas = document.getElementById('ch-combo'); if (!canvas) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const kwh    = [310,295,320,280,55,290,340,375,310,285,295,305];
  const bill   = [3720,3540,3840,3360,3900,3480,4080,4500,3720,3420,3540,3660];
  _CH['combo'] = new Chart(canvas, { type:'bar', data:{ labels:months, datasets:[
    { type:'bar',  label:'Consumption (kWh)', data:kwh,
      backgroundColor:kwh.map(v=>v<120?'rgba(239,68,68,0.62)':'rgba(99,102,241,0.52)'),
      borderColor:kwh.map(v=>v<120?'#ef4444':'#6366f1'), borderWidth:1.5, borderRadius:5, yAxisID:'yL' },
    { type:'line', label:'Bill Amount (₹)', data:bill, borderColor:'#f59e0b', backgroundColor:'transparent', borderWidth:2.2,
      pointRadius:4, pointBackgroundColor:bill.map((v,i)=>kwh[i]<120&&v>3000?'#ef4444':'#f59e0b'), tension:0.4, yAxisID:'yR' }
  ]}, options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    scales:{ x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#4a526b'}},
      yL:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a526b',callback:v=>v+' kWh'}},
      yR:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#f59e0b',callback:v=>'₹'+v.toLocaleString()}} },
    plugins:{ legend:{position:'top'}, tooltip:{callbacks:{afterBody(items){const k=items.find(i=>i.dataset.label.includes('kWh'));const b=items.find(i=>i.dataset.label.includes('Bill'));if(k&&b&&k.raw>0){const rate=(b.raw/k.raw).toFixed(2);const flag=k.raw<120&&b.raw>3000?['🚨 LOW consumption but HIGH billing!']:[];return[`Rate: ₹${rate}/kWh`,...flag];}return[];}}}}
  }});
}

function buildZScoreChart() {
  destroyChart('zscore');
  const canvas = document.getElementById('ch-zscore'); if (!canvas) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const kwh    = [310,295,320,280,55,290,340,375,310,285,295,305];
  const mean   = kwh.reduce((a,b)=>a+b,0)/kwh.length;
  const std    = Math.sqrt(kwh.reduce((a,v)=>a+Math.pow(v-mean,2),0)/kwh.length);
  const zs     = kwh.map(v=>+((v-mean)/std).toFixed(2));
  const threshPlugin = { id:'threshLines', afterDraw(chart) {
    const {ctx:c, scales:{y}} = chart; if (!y) return;
    [2.5,-2.5].forEach(t=>{
      const yp=y.getPixelForValue(t);
      c.save();c.beginPath();c.moveTo(chart.chartArea.left,yp);c.lineTo(chart.chartArea.right,yp);
      c.strokeStyle=t>0?'rgba(249,115,22,0.65)':'rgba(239,68,68,0.65)';c.lineWidth=1.5;c.setLineDash([6,4]);c.stroke();
      c.fillStyle=t>0?'#f97316':'#ef4444';c.font='10px Inter';
      c.fillText(t>0?'+2.5\u03C3 threshold':'\u22122.5\u03C3 threshold',chart.chartArea.left+4,yp-4);
      c.restore();
    });
  }};
  _CH['zscore'] = new Chart(canvas, { type:'bar', plugins:[threshPlugin], data:{ labels:months, datasets:[{
    label:'Z-Score', data:zs,
    backgroundColor:zs.map(z=>z<-2.5?'rgba(239,68,68,0.72)':z>2.5?'rgba(249,115,22,0.72)':z<-1.5?'rgba(245,158,11,0.50)':'rgba(99,102,241,0.45)'),
    borderColor:zs.map(z=>z<-2.5?'#ef4444':z>2.5?'#f97316':z<-1.5?'#f59e0b':'#6366f1'),
    borderWidth:1.5, borderRadius:4 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#4a526b'}}, y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#4a526b'},title:{display:true,text:'Z-Score',color:'#4a526b'}} },
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label(ctx){const z=ctx.raw;const tag=Math.abs(z)>2.5?' 🚨 OUTLIER':Math.abs(z)>1.5?' ⚠️ Monitor':' ✓ Normal';return ` Z-Score: ${z}${tag}`;}}}}
    }});
}

function buildRiskPieChart() {
  destroyChart('rpie');
  const canvas = document.getElementById('ch-risk-pie'); if (!canvas) return;
  _CH['rpie'] = new Chart(canvas, { type:'pie', data:{
    labels:['Safe — Green (0-25)','Monitor — Yellow (26-50)','Investigate — Orange (51-75)','Action — Red (76-100)'],
    datasets:[{ data:[86.7,7.1,4.3,1.9],
      backgroundColor:['rgba(16,185,129,0.62)','rgba(245,158,11,0.62)','rgba(249,115,22,0.62)','rgba(239,68,68,0.62)'],
      borderColor:'#0B0F19', borderWidth:3, hoverOffset:10 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom',labels:{padding:13}}, tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}% of consumers`}}}
    }});
}
