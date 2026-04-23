export function getHtml(port: number): string {
  void port // port is used in the SSE URL in the JS below
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tokenwatch dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:      #0d1117;
  --surface: #161b22;
  --border:  #30363d;
  --text:    #e6edf3;
  --muted:   #8b949e;
  --accent:  #58a6ff;
  --green:   #3fb950;
  --yellow:  #d29922;
  --red:     #f85149;
  --r:       6px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  min-height: 100vh;
}

.container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }

/* ── Header ──────────────────────────────────────────────────── */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }
header h1 span { color: var(--accent); }

.live-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.live-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

/* ── Tabs ─────────────────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 4px;
  width: fit-content;
}
.tab {
  padding: 6px 14px;
  border-radius: calc(var(--r) - 2px);
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tab:hover { color: var(--text); background: rgba(255,255,255,0.05); }
.tab.active { background: var(--accent); color: #fff; }

/* ── Overview cards ───────────────────────────────────────────── */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
}
.card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 6px; }
.card-value { font-size: 22px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.card-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }

/* ── Chart section ────────────────────────────────────────────── */
.charts {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}
@media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 14px;
}
.chart-wrap { position: relative; height: 220px; }

/* ── Breakdown tables ─────────────────────────────────────────── */
.section { margin-bottom: 24px; }
.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  font-size: 13px;
}
thead { background: rgba(255,255,255,0.03); }
th {
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid var(--border);
}
th.num, td.num { text-align: right; }
td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(48,54,61,0.5);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: rgba(255,255,255,0.02); }

.bar-wrap { width: 80px; height: 6px; background: var(--border); border-radius: 3px; display: inline-block; vertical-align: middle; margin-left: 8px; }
.bar-fill { height: 100%; border-radius: 3px; background: var(--accent); }

/* ── Forecast ─────────────────────────────────────────────────── */
.forecast-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

/* ── Empty state ──────────────────────────────────────────────── */
.empty {
  color: var(--muted);
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}

/* ── Collapsible ─────────────────────────────────────────────── */
details summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 10px;
  user-select: none;
}
details summary::before { content: '▶'; font-size: 10px; transition: transform 0.15s; }
details[open] summary::before { transform: rotate(90deg); }

/* ── Last updated ─────────────────────────────────────────────── */
.footer {
  font-size: 11px;
  color: var(--muted);
  text-align: center;
  padding: 16px 0 0;
}
</style>
</head>
<body>
<div class="container">

  <header>
    <h1>token<span>watch</span></h1>
    <div class="live-badge">
      <div class="live-dot"></div>
      <span id="live-label">live</span>
    </div>
  </header>

  <div class="tabs">
    <button class="tab" data-filter="1h">1h</button>
    <button class="tab active" data-filter="24h">24h</button>
    <button class="tab" data-filter="7d">7d</button>
    <button class="tab" data-filter="30d">30d</button>
    <button class="tab" data-filter="all">All</button>
  </div>

  <div class="cards">
    <div class="card">
      <div class="card-label">Total Cost</div>
      <div class="card-value" id="card-cost">—</div>
      <div class="card-sub" id="card-period"></div>
    </div>
    <div class="card">
      <div class="card-label">Input Tokens</div>
      <div class="card-value" id="card-input">—</div>
    </div>
    <div class="card">
      <div class="card-label">Output Tokens</div>
      <div class="card-value" id="card-output">—</div>
    </div>
    <div class="card">
      <div class="card-label">Total Calls</div>
      <div class="card-value" id="card-calls">—</div>
    </div>
    <div class="card">
      <div class="card-label">Burn Rate</div>
      <div class="card-value" id="card-burn">—</div>
      <div class="card-sub">per hour</div>
    </div>
  </div>

  <div class="charts">
    <div class="panel">
      <div class="panel-title">Cost over time</div>
      <div class="chart-wrap">
        <canvas id="chart-line"></canvas>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">By model</div>
      <div class="chart-wrap">
        <canvas id="chart-doughnut"></canvas>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Model breakdown</div>
    <div id="model-table-wrap"></div>
  </div>

  <details id="users-section" style="margin-bottom:24px;">
    <summary>By user</summary>
    <div id="user-table-wrap"></div>
  </details>

  <details id="features-section" style="margin-bottom:24px;">
    <summary>By feature</summary>
    <div id="feature-table-wrap"></div>
  </details>

  <div class="section">
    <div class="section-title">Cost forecast</div>
    <div class="forecast-grid">
      <div class="card">
        <div class="card-label">Projected daily</div>
        <div class="card-value" id="fc-daily">—</div>
        <div class="card-sub" id="fc-window"></div>
      </div>
      <div class="card">
        <div class="card-label">Projected monthly</div>
        <div class="card-value" id="fc-monthly">—</div>
      </div>
      <div class="card">
        <div class="card-label">Burn rate / hr</div>
        <div class="card-value" id="fc-burn">—</div>
      </div>
    </div>
  </div>

  <div class="footer" id="footer-updated"></div>

</div><!-- /container -->

<script>
(function () {
  'use strict';

  // ── Palette ───────────────────────────────────────────────────────────
  const PALETTE = [
    '#58a6ff','#3fb950','#f78166','#d29922','#bc8cff',
    '#79c0ff','#56d364','#ffa657','#ff7b72','#a5d6ff',
  ];

  // ── State ─────────────────────────────────────────────────────────────
  let evtSource = null;
  let activeFilter = '24h';
  let lineChart = null;
  let doughnutChart = null;

  // ── Helpers ───────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtUSD(n) {
    if (n === 0) return '$0.00';
    if (n < 0.001) return '$' + n.toFixed(6);
    if (n < 1)     return '$' + n.toFixed(4);
    return '$' + n.toFixed(2);
  }

  function fmtNum(n) {
    return n.toLocaleString('en-US');
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function totalCalls(byModel) {
    return Object.values(byModel).reduce(function(s, m) { return s + m.calls; }, 0);
  }

  // ── Tab setup ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      reconnect();
    });
  });

  // ── SSE ───────────────────────────────────────────────────────────────
  function reconnect() {
    if (evtSource) { evtSource.close(); evtSource = null; }
    evtSource = new EventSource('/events?filter=' + encodeURIComponent(activeFilter));
    evtSource.onmessage = function(e) {
      try { updateUI(JSON.parse(e.data)); } catch (_) {}
    };
    evtSource.onerror = function() {
      document.getElementById('live-label').textContent = 'reconnecting…';
    };
    evtSource.onopen = function() {
      document.getElementById('live-label').textContent = 'live';
    };
  }

  // ── UI update ─────────────────────────────────────────────────────────
  function updateUI(data) {
    const r = data.report;
    const fc = data.forecast;
    const ts = data.timeSeries;

    // Cards
    document.getElementById('card-cost').textContent = fmtUSD(r.totalCostUSD);
    document.getElementById('card-input').textContent = fmtNum(r.totalTokens.input);
    document.getElementById('card-output').textContent = fmtNum(r.totalTokens.output);
    document.getElementById('card-calls').textContent = fmtNum(totalCalls(r.byModel));
    document.getElementById('card-burn').textContent = fmtUSD(fc.burnRatePerHour);
    document.getElementById('card-period').textContent =
      r.period.from !== r.period.to
        ? fmtDate(r.period.from) + ' – ' + fmtDate(r.period.to)
        : '';

    // Line chart
    const labels = ts.map(function(b) {
      try { return new Date(b.bucket).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
      catch { return b.bucket; }
    });
    const costs = ts.map(function(b) { return b.cost; });

    if (!lineChart) {
      const ctx = document.getElementById('chart-line').getContext('2d');
      lineChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Cost (USD)',
            data: costs,
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,0.08)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#58a6ff',
            fill: true,
            tension: 0.3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8b949e', maxTicksLimit: 8 }, grid: { color: '#21262d' } },
            y: {
              ticks: {
                color: '#8b949e',
                callback: function(v) { return '$' + Number(v).toFixed(4); },
              },
              grid: { color: '#21262d' },
            },
          },
        },
      });
    } else {
      lineChart.data.labels = labels;
      lineChart.data.datasets[0].data = costs;
      lineChart.update('none');
    }

    // Doughnut chart
    const modelEntries = Object.entries(r.byModel);
    const dLabels = modelEntries.map(function(x) { return x[0]; });
    const dData = modelEntries.map(function(x) { return x[1].costUSD; });
    const dColors = dLabels.map(function(_, i) { return PALETTE[i % PALETTE.length]; });

    if (!doughnutChart) {
      const ctx2 = document.getElementById('chart-doughnut').getContext('2d');
      doughnutChart = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: dLabels, datasets: [{ data: dData, backgroundColor: dColors, borderWidth: 0, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#8b949e', boxWidth: 10, padding: 12, font: { size: 11 } },
            },
          },
        },
      });
    } else {
      doughnutChart.data.labels = dLabels;
      doughnutChart.data.datasets[0].data = dData;
      doughnutChart.data.datasets[0].backgroundColor = dColors;
      doughnutChart.update('none');
    }

    // Model table
    const modelWrap = document.getElementById('model-table-wrap');
    if (modelEntries.length === 0) {
      modelWrap.innerHTML = '<p class="empty">No data for this period.</p>';
    } else {
      const totalCost = r.totalCostUSD || 1;
      let html = '<table><thead><tr>' +
        '<th>Model</th>' +
        '<th class="num">Calls</th>' +
        '<th class="num">In tokens</th>' +
        '<th class="num">Out tokens</th>' +
        '<th class="num">Cost</th>' +
        '<th class="num">Share</th>' +
        '</tr></thead><tbody>';
      const sorted = modelEntries.slice().sort(function(a, b) { return b[1].costUSD - a[1].costUSD; });
      sorted.forEach(function(entry) {
        const name = entry[0]; const m = entry[1];
        const pct = (m.costUSD / totalCost * 100).toFixed(1);
        const barW = Math.round(m.costUSD / totalCost * 80);
        html += '<tr>' +
          '<td>' + escHtml(name) + '</td>' +
          '<td class="num">' + fmtNum(m.calls) + '</td>' +
          '<td class="num">' + fmtNum(m.tokens.input) + '</td>' +
          '<td class="num">' + fmtNum(m.tokens.output) + '</td>' +
          '<td class="num">' + fmtUSD(m.costUSD) + '</td>' +
          '<td class="num">' + pct + '%' +
          '<span class="bar-wrap"><span class="bar-fill" style="width:' + barW + 'px"></span></span>' +
          '</td></tr>';
      });
      html += '</tbody></table>';
      modelWrap.innerHTML = html;
    }

    // User table
    const userEntries = Object.entries(r.byUser);
    const usersSection = document.getElementById('users-section');
    usersSection.style.display = userEntries.length === 0 ? 'none' : '';
    if (userEntries.length > 0) {
      let html = '<table><thead><tr><th>User</th><th class="num">Calls</th><th class="num">Cost</th></tr></thead><tbody>';
      userEntries.slice().sort(function(a,b) { return b[1].costUSD - a[1].costUSD; }).forEach(function(e) {
        html += '<tr><td>' + escHtml(e[0]) + '</td><td class="num">' + fmtNum(e[1].calls) + '</td><td class="num">' + fmtUSD(e[1].costUSD) + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('user-table-wrap').innerHTML = html;
    }

    // Feature table
    const featureEntries = Object.entries(r.byFeature);
    const featuresSection = document.getElementById('features-section');
    featuresSection.style.display = featureEntries.length === 0 ? 'none' : '';
    if (featureEntries.length > 0) {
      let html = '<table><thead><tr><th>Feature</th><th class="num">Calls</th><th class="num">Cost</th></tr></thead><tbody>';
      featureEntries.slice().sort(function(a,b) { return b[1].costUSD - a[1].costUSD; }).forEach(function(e) {
        html += '<tr><td>' + escHtml(e[0]) + '</td><td class="num">' + fmtNum(e[1].calls) + '</td><td class="num">' + fmtUSD(e[1].costUSD) + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('feature-table-wrap').innerHTML = html;
    }

    // Forecast
    document.getElementById('fc-daily').textContent = fmtUSD(fc.projectedDailyCostUSD);
    document.getElementById('fc-monthly').textContent = fmtUSD(fc.projectedMonthlyCostUSD);
    document.getElementById('fc-burn').textContent = fmtUSD(fc.burnRatePerHour);
    document.getElementById('fc-window').textContent =
      fc.basedOnHours > 0 ? 'based on ' + fc.basedOnHours.toFixed(1) + 'h of data' : 'insufficient data';

    // Footer
    document.getElementById('footer-updated').textContent =
      'Last updated: ' + fmtDate(data.lastUpdated);
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  reconnect();
})();
</script>
</body>
</html>`
}
