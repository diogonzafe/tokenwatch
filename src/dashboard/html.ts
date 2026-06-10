export function getHtml(_port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tokenwatch — Overview</title>
<style>
  :root{
    --bg:#0d1117; --surface:#161b22; --surface2:#1c2128;
    --border:#30363d; --border-muted:#21262d;
    --text:#e6edf3; --muted:#7d8590; --dim:#484f58;
    --accent:#58a6ff; --green:#3fb950; --yellow:#d29922; --red:#f85149;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);
    font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;
    font-variant-numeric:tabular-nums}
  h1,h2,h3{margin:0;font-weight:600}
  a{color:inherit;text-decoration:none}
  kbd{font-family:var(--sans);font-size:10px;color:var(--muted);
    background:#22272e;border:1px solid var(--border);border-radius:4px;
    padding:1px 5px;line-height:1.4}
  .tw-root{max-width:1440px;margin:0 auto;min-height:100vh;
    border-left:1px solid var(--border-muted);border-right:1px solid var(--border-muted)}
  .num,.tw-kpi-value,.tw-cost,.tw-num-cell,.tw-fc-value{font-variant-numeric:tabular-nums}
  .tw-header{position:sticky;top:0;z-index:40;height:54px;display:flex;
    align-items:center;justify-content:space-between;gap:16px;padding:0 18px;
    background:rgba(13,17,23,.86);backdrop-filter:blur(10px);
    border-bottom:1px solid var(--border)}
  .tw-hgroup{display:flex;align-items:center;gap:14px}
  .tw-logo{font-size:15px;font-weight:700;letter-spacing:-.01em}
  .tw-logo span{color:var(--accent)}
  .tw-ws{position:relative;display:flex;align-items:center;gap:7px;height:30px;
    padding:0 9px;background:var(--surface);border:1px solid var(--border);
    border-radius:7px;color:var(--text);font-size:12.5px;font-weight:500;cursor:pointer}
  .tw-ws:hover{border-color:#444c56}
  .tw-ws-dot{width:7px;height:7px;border-radius:50%;background:var(--green);
    box-shadow:0 0 0 3px rgba(63,185,80,.15)}
  .tw-ws-env{font-size:10px;color:var(--muted);background:#22272e;
    border-radius:4px;padding:1px 5px;text-transform:uppercase;letter-spacing:.03em}
  .tw-ws-menu{position:absolute;top:36px;left:0;width:230px;background:var(--surface2);
    border:1px solid var(--border);border-radius:9px;padding:5px;z-index:50;
    box-shadow:0 12px 32px rgba(0,0,0,.5)}
  .tw-ws-item{padding:7px 9px;border-radius:6px;font-size:12.5px;cursor:pointer;color:var(--text)}
  .tw-ws-item:hover{background:#22272e}
  .tw-ws-item.on{color:var(--accent)}
  .tw-ws-item.muted{color:var(--muted)}
  .tw-ws-sep{height:1px;background:var(--border);margin:5px 0}
  .tw-nav{display:flex;gap:2px;margin-left:6px}
  .tw-nav a{padding:6px 10px;border-radius:6px;font-size:13px;color:var(--muted);font-weight:500}
  .tw-nav a:hover{color:var(--text);background:var(--surface)}
  .tw-nav a.on{color:var(--text);background:var(--surface);box-shadow:inset 0 -2px 0 var(--accent)}
  .tw-search{display:flex;align-items:center;gap:8px;height:30px;padding:0 9px;
    width:200px;background:var(--surface);border:1px solid var(--border);
    border-radius:7px;color:var(--muted);font-size:12.5px;cursor:text}
  .tw-search:hover{border-color:#444c56}
  .tw-search span{flex:1;text-align:left}
  .tw-btn-2{display:flex;align-items:center;gap:6px;height:30px;padding:0 11px;
    background:var(--surface);border:1px solid var(--border);border-radius:7px;
    color:var(--text);font-size:12.5px;font-weight:500;cursor:pointer}
  .tw-btn-2:hover{border-color:#444c56;background:#1b2128}
  .tw-user{display:flex;align-items:center;gap:8px;margin-left:2px}
  .tw-plan{font-size:10px;font-weight:600;color:var(--accent);
    border:1px solid rgba(88,166,255,.4);background:rgba(88,166,255,.1);
    border-radius:5px;padding:2px 6px;text-transform:uppercase;letter-spacing:.04em}
  .tw-avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
    font-size:11px;font-weight:600;color:#fff;
    background:linear-gradient(135deg,#bc8cff,#58a6ff)}
  .tw-main{padding:16px 18px 64px;display:flex;flex-direction:column;gap:14px}
  .tw-budget{background:var(--surface);border:1px solid var(--border);
    border-radius:10px;padding:13px 16px}
  .tw-budget-top{display:flex;align-items:center;gap:16px;margin-bottom:10px}
  .tw-budget-label{display:flex;align-items:baseline;gap:10px}
  .tw-bud-strong{font-weight:600;font-size:13px}
  .tw-bud-nums{color:var(--muted);font-size:12.5px}
  .tw-bud-nums b{color:var(--text)}
  .tw-bud-alert{display:flex;align-items:center;gap:6px;font-size:12px;
    padding:3px 9px;border-radius:6px;color:var(--green);
    background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.25)}
  .tw-bud-alert b{color:var(--text)}
  .tw-budget-days{margin-left:auto;color:var(--muted);font-size:12px}
  .tw-bar{position:relative;height:9px;background:var(--border-muted);
    border-radius:5px;overflow:visible}
  .tw-bar-fill{height:100%;border-radius:5px;transition:width .5s}
  .tw-bar-proj{position:absolute;top:0;height:100%;
    background:repeating-linear-gradient(45deg,rgba(125,133,144,.35),rgba(125,133,144,.35) 4px,transparent 4px,transparent 8px);
    border-radius:0 5px 5px 0}
  .tw-bar-marker{position:absolute;top:-3px;width:2px;height:15px;background:var(--text);border-radius:2px}
  .tw-bar-marker::after{content:attr(data-tip);position:absolute;top:-18px;left:50%;
    transform:translateX(-50%);font-size:9.5px;color:var(--muted);white-space:nowrap}
  .tw-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
  .tw-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;
    padding:12px 14px;display:flex;flex-direction:column;gap:7px;min-width:0}
  .tw-kpi-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .tw-kpi-main{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}
  .tw-kpi-value{font-size:21px;font-weight:600;letter-spacing:-.01em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tw-kpi-foot{display:flex;align-items:center;gap:8px;font-size:11.5px;min-height:15px}
  .tw-delta{font-weight:600}
  .tw-kpi-sub{color:var(--muted)}
  .tw-timefilter{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px}
  .tw-tabs{display:flex;gap:2px;background:var(--surface);border:1px solid var(--border);
    border-radius:8px;padding:3px}
  .tw-tab{height:26px;padding:0 13px;border:0;background:transparent;color:var(--muted);
    font-size:12.5px;font-weight:600;font-family:var(--sans);border-radius:6px;cursor:pointer}
  .tw-tab:hover{color:var(--text)}
  .tw-tab.on{background:var(--accent);color:#0d1117}
  .tw-compare{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px;cursor:pointer}
  .tw-toggle-sm{position:relative;width:30px;height:17px;border:0;border-radius:999px;
    background:#30363d;cursor:pointer;padding:0;transition:background .15s}
  .tw-toggle-sm[data-on="1"]{background:var(--accent)}
  .tw-toggle-sm i{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;
    background:#fff;transition:transform .15s}
  .tw-toggle-sm[data-on="1"] i{transform:translateX(13px)}
  .tw-card,.tw-section{background:var(--surface);border:1px solid var(--border);border-radius:10px}
  .tw-section{padding:0}
  .tw-card{padding:14px 16px}
  .tw-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
    padding:13px 16px 11px}
  .tw-card .tw-sec-head{padding:0 0 10px}
  .tw-sec-head h3{font-size:13.5px}
  .tw-sec-sub{color:var(--muted);font-size:11.5px;font-weight:400}
  .tw-charts{display:grid;grid-template-columns:2fr 1fr;gap:14px}
  .tw-chart-main,.tw-chart-side{min-width:0}
  .tw-chart-legend{display:flex;align-items:center;gap:12px;font-size:11.5px;color:var(--muted)}
  .tw-chart-legend span{display:flex;align-items:center;gap:5px}
  .tw-chart-legend i{width:14px;height:3px;border-radius:2px;background:var(--accent)}
  .tw-chart-legend i.dash{background:repeating-linear-gradient(90deg,#6e7681,#6e7681 3px,transparent 3px,transparent 6px)}
  .tw-chart-legend .muted i{background:#6e7681}
  .tw-draw-line{stroke-dasharray:2600;stroke-dashoffset:2600;animation:tw-draw 1.1s cubic-bezier(.4,0,.2,1) forwards}
  .tw-draw-area{opacity:0;animation:tw-fade .9s ease .25s forwards}
  @keyframes tw-draw{to{stroke-dashoffset:0}}
  @keyframes tw-fade{to{opacity:1}}
  .tw-doughnut-wrap{display:grid;place-items:center;padding:6px 0 10px}
  .tw-legend{display:flex;flex-direction:column;gap:1px}
  .tw-legend-row{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:6px;cursor:pointer}
  .tw-legend-row:hover,.tw-legend-row.on{background:#1b2128}
  .tw-legend-name{flex:1;font-size:12px;font-family:var(--mono);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tw-legend-val{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
  .tw-legend-pct{font-size:11px;color:var(--dim);width:30px;text-align:right;font-variant-numeric:tabular-nums}
  .tw-model-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
  .tw-model-dot.lg{width:11px;height:11px;border-radius:3px}
  .tw-table-wrap{overflow-x:auto}
  .tw-table{width:100%;border-collapse:collapse;font-size:12.5px}
  .tw-table thead th{position:sticky;top:0;text-align:left;padding:8px 16px;
    font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;
    letter-spacing:.04em;border-bottom:1px solid var(--border);user-select:none;
    background:var(--surface)}
  .tw-th-inner{display:flex;align-items:center;gap:4px}
  .tw-th-inner:hover{color:var(--text)}
  .tw-sort{color:var(--accent);font-size:10px}
  .tw-row{border-bottom:1px solid var(--border-muted);cursor:pointer;transition:background .1s}
  .tw-row:last-child{border-bottom:0}
  .tw-row td{padding:10px 16px;vertical-align:middle}
  .tw-table.compact .tw-row td{padding:6px 16px}
  .tw-table.compact thead th{padding:6px 16px}
  .tw-row:hover{background:#1b2128}
  .tw-row.example{background:rgba(88,166,255,.07);box-shadow:inset 2px 0 0 var(--accent)}
  .tw-row.example:hover{background:rgba(88,166,255,.11)}
  .tw-model-cell{display:flex;align-items:center;gap:9px}
  .tw-model-name{font-family:var(--mono);font-size:12.5px;color:var(--text)}
  .tw-model-prov{font-size:10px;color:var(--muted);background:#22272e;border-radius:4px;padding:1px 5px}
  .tw-num-cell{text-align:right;font-variant-numeric:tabular-nums;color:var(--text);white-space:nowrap}
  .tw-cost{font-weight:600}
  .tw-row-actions{display:flex;gap:6px;justify-content:flex-end}
  .tw-row-actions button{height:24px;padding:0 9px;border:1px solid var(--border);
    background:var(--surface2);color:var(--text);border-radius:6px;font-size:11px;
    font-weight:500;cursor:pointer;font-family:var(--sans)}
  .tw-row-actions button:hover{border-color:var(--accent);color:var(--accent)}
  .tw-forecast{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:0 16px 16px}
  .tw-fc{background:var(--surface2);border:1px solid var(--border);border-radius:9px;
    padding:12px 14px;display:flex;flex-direction:column;gap:6px}
  .tw-fc.flag{border-color:rgba(248,81,73,.5);background:rgba(248,81,73,.07)}
  .tw-fc-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
  .tw-fc-value{font-size:20px;font-weight:600;letter-spacing:-.01em}
  .tw-fc-sub{font-size:11.5px;color:var(--muted)}
  .tw-act-title{display:flex;align-items:center;gap:9px}
  .tw-collapse{border:0;background:transparent;color:var(--muted);cursor:pointer;
    display:grid;place-items:center;padding:2px;transition:transform .15s}
  .tw-live-dot{width:8px;height:8px;border-radius:50%;background:var(--dim)}
  .tw-live-dot.on{background:var(--green);animation:tw-pulse 1.6s ease-in-out infinite}
  @keyframes tw-pulse{0%,100%{box-shadow:0 0 0 0 rgba(63,185,80,.5)}50%{box-shadow:0 0 0 5px rgba(63,185,80,0)}}
  .tw-act-controls{display:flex;align-items:center;gap:10px}
  .tw-seg-sm{display:flex;gap:1px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:2px}
  .tw-seg-sm button{height:22px;padding:0 9px;border:0;background:transparent;color:var(--muted);
    font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;font-family:var(--sans)}
  .tw-seg-sm button.on{background:var(--border);color:var(--text)}
  .tw-act-pause{height:26px;padding:0 10px;border:1px solid var(--border);background:var(--surface2);
    color:var(--muted);border-radius:6px;font-size:11.5px;cursor:pointer;font-family:var(--sans)}
  .tw-act-pause:hover{color:var(--text);border-color:#444c56}
  .tw-feed{padding:0 6px 8px}
  .tw-feed-head,.tw-feed-row{display:grid;grid-template-columns:72px 1.4fr 1fr 1fr 96px;gap:12px;align-items:center}
  .tw-feed-head{padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);border-bottom:1px solid var(--border-muted)}
  .tw-feed-body{display:flex;flex-direction:column}
  .tw-feed-row{padding:7px 10px;font-size:12px;border-bottom:1px solid var(--border-muted)}
  .tw-feed-row:last-child{border-bottom:0}
  .tw-feed-row.fresh{animation:tw-flash 1.4s ease}
  .tw-feed-row.err{background:rgba(248,81,73,.05)}
  @keyframes tw-flash{0%{background:rgba(88,166,255,.16)}100%{background:transparent}}
  .tw-feed-time{color:var(--muted);font-variant-numeric:tabular-nums}
  .tw-feed-model{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11.5px;color:var(--text);overflow:hidden}
  .tw-feed-sess{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
  .tw-feed-cost{text-align:right;font-variant-numeric:tabular-nums;color:var(--text);font-weight:500;display:flex;align-items:center;justify-content:flex-end;gap:6px}
  .tw-feed-flag{font-size:9px;color:var(--red);border:1px solid rgba(248,81,73,.4);border-radius:4px;padding:0 4px;text-transform:uppercase}
  .tw-feed-flag.slow{color:var(--yellow);border-color:rgba(210,153,34,.4)}
  .tw-feat{font-size:10.5px;font-family:var(--mono);border:1px solid;border-radius:5px;padding:1px 6px;white-space:nowrap}
  .tw-feat.sm{font-size:10px;padding:0 5px}
  .tw-scrim{position:fixed;inset:0;background:rgba(1,4,9,.6);opacity:0;pointer-events:none;
    transition:opacity .25s;z-index:60}
  .tw-scrim.open{opacity:1;pointer-events:auto}
  .tw-slideover{position:fixed;top:0;right:0;height:100vh;width:400px;background:var(--surface);
    border-left:1px solid var(--border);transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);
    z-index:61;box-shadow:-16px 0 40px rgba(0,0,0,.4);overflow-y:auto}
  .tw-slideover.open{transform:translateX(0)}
  .tw-so-inner{padding:18px}
  .tw-so-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:16px}
  .tw-so-title{display:flex;align-items:center;gap:10px}
  .tw-so-name{font-family:var(--mono);font-size:15px;font-weight:600}
  .tw-so-prov{font-size:11.5px;color:var(--muted);margin-top:2px}
  .tw-so-close{width:28px;height:28px;border:1px solid var(--border);background:var(--surface2);
    color:var(--muted);border-radius:7px;cursor:pointer;font-size:13px}
  .tw-so-close:hover{color:var(--text);border-color:#444c56}
  .tw-so-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .tw-so-stat{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px}
  .tw-so-stat-l{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px}
  .tw-so-stat-v{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
  .tw-so-metarow{display:flex;justify-content:space-between;padding:11px 12px;background:var(--surface2);
    border:1px solid var(--border);border-radius:8px;margin-bottom:16px}
  .tw-so-metarow>div{display:flex;flex-direction:column;gap:3px}
  .tw-so-meta-l{font-size:10.5px;color:var(--muted)}
  .tw-so-meta-v{font-size:12.5px;font-weight:500;font-variant-numeric:tabular-nums}
  .tw-so-section-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
  .tw-so-calls{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}
  .tw-so-call{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 11px}
  .tw-so-call-top{display:flex;align-items:center;gap:9px;margin-bottom:5px}
  .tw-so-call-time{font-size:11px;color:var(--muted);flex:1}
  .tw-so-call-cost{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
  .tw-so-call-bot{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .tw-so-viewall{width:100%;height:36px;border:1px solid var(--border);background:var(--surface2);
    color:var(--accent);border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:var(--sans);
    display:flex;align-items:center;justify-content:center;gap:6px}
  .tw-so-viewall:hover{border-color:var(--accent);background:rgba(88,166,255,.08)}
  .tw-cmdk-scrim{position:fixed;inset:0;background:rgba(1,4,9,.55);z-index:80;
    display:flex;justify-content:center;align-items:flex-start;padding-top:14vh;
    animation:tw-fade .15s ease}
  .tw-cmdk{width:560px;max-width:92vw;background:var(--surface2);border:1px solid var(--border);
    border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden}
  .tw-cmdk-input{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--border)}
  .tw-cmdk-input input{flex:1;background:transparent;border:0;outline:none;color:var(--text);
    font-size:14px;font-family:var(--sans)}
  .tw-cmdk-list{max-height:360px;overflow-y:auto;padding:6px}
  .tw-cmdk-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:7px;cursor:pointer}
  .tw-cmdk-item:hover{background:#22272e}
  .tw-cmdk-g{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);width:62px}
  .tw-cmdk-l{flex:1;font-size:13px}
  .tw-cmdk-empty{padding:18px;text-align:center;color:var(--muted);font-size:12.5px}
  .tw-skel-wrap{display:flex;flex-direction:column;gap:14px}
  .tw-skel{background:linear-gradient(90deg,var(--surface) 25%,#1b2128 50%,var(--surface) 75%);
    background-size:200% 100%;border:1px solid var(--border);border-radius:10px;
    animation:tw-shim 1.4s linear infinite}
  @keyframes tw-shim{to{background-position:-200% 0}}
  .tw-empty{display:flex;flex-direction:column;align-items:center;gap:12px;
    padding:80px 20px;text-align:center}
  .tw-empty-art{width:96px;height:96px;display:grid;place-items:center;
    background:var(--surface);border:1px solid var(--border);border-radius:20px}
  .tw-empty h2{font-size:18px}
  .tw-empty p{max-width:420px;color:var(--muted);font-size:13px;margin:0}
  .tw-empty-actions{display:flex;gap:10px;margin-top:6px}
  .tw-btn-primary{display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;
    background:var(--accent);color:#0d1117;border:0;border-radius:8px;font-size:13px;
    font-weight:600;cursor:pointer;font-family:var(--sans)}
  .tw-btn-primary:hover{filter:brightness(1.08)}
  .tw-empty-snippet{margin-top:12px;font-family:var(--mono);font-size:12px;color:var(--muted);
    background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px}
  .tw-snip-c{color:#ff7b72}.tw-snip-s{color:var(--green)}
  .tw-so-call-lat{font-variant-numeric:tabular-nums}
  @media(prefers-reduced-motion:reduce){*{animation-duration:.001s!important}}

  /* tweaks panel */
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px}
  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);transition:transform .12s}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;display:flex;flex-direction:column}
  .twk-chip>span>i{flex:1}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px}
  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;background:transparent}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
</style>
</head>
<body>
<div id="root"></div>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>

<script type="text/babel">
// tweaks-panel — without runtime style injection (CSS is in the main style block)
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current; if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    offsetRef.current = {
      x: Math.min(Math.max(PAD, window.innerWidth - w - PAD), Math.max(PAD, offsetRef.current.x)),
      y: Math.min(Math.max(PAD, window.innerHeight - h - PAD), Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e && e.data && e.data.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => { setOpen(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); };
  const onDragStart = (e) => {
    const panel = dragRef.current; if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right, startBottom = window.innerHeight - r.bottom;
    const move = (ev) => { offsetRef.current = { x: startRight - (ev.clientX - sx), y: startBottom - (ev.clientY - sy) }; clampToViewport(); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return (
    <div ref={dragRef} className="twk-panel" style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
      <div className="twk-hd" onMouseDown={onDragStart}>
        <b>{title}</b>
        <button className="twk-x" onMouseDown={(e) => e.stopPropagation()} onClick={dismiss}>&#x2715;</button>
      </div>
      <div className="twk-body">{children}</div>
    </div>
  );
}
function TweakSection({ label }) { return <div className="twk-sect">{label}</div>; }
function TweakRow({ label, value, children, inline }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl"><span>{label}</span>{value != null && <span className="twk-val">{value}</span>}</div>
      {children}
    </div>
  );
}
function TweakSlider({ label, value, min=0, max=100, step=1, unit='', onChange }) {
  return (
    <TweakRow label={label} value={value + unit}>
      <input type="range" className="twk-slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}
function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'} onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}
function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o; return <option key={v} value={v}>{l}</option>; })}
      </select>
    </TweakRow>
  );
}
function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const valueRef = React.useRef(value); valueRef.current = value;
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] || 0);
  if (!fitsAsSegments) {
    const resolve = (s) => { const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s); return m === undefined ? s : typeof m === 'object' ? m.value : m; };
    return <TweakSelect label={label} value={value} options={options} onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;
  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left - 2) / (r.width - 4)) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX); if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => { if (!trackRef.current) return; const v = segAt(ev.clientX); if (v !== valueRef.current) onChange(v); };
    const up = () => { setDragging(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown} className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb" style={{ left: 'calc(2px + ' + idx + ' * (100% - 4px) / ' + n + ')', width: 'calc((100% - 4px) / ' + n + ')' }} />
        {opts.map((o) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>{o.label}</button>)}
      </div>
    </TweakRow>
  );
}
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio" data-on={on ? '1' : '0'} style={{ background: hero }} onClick={() => onChange(o)}>
              {sup.length > 0 && <span>{sup.map((c, j) => <i key={j} style={{ background: c }} />)}</span>}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}
Object.assign(window, { useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider, TweakToggle, TweakRadio, TweakSelect, TweakColor });
</script>

<script type="text/babel">
// tw-charts.jsx
const { useRef, useState, useEffect, useLayoutEffect } = React;
function useMeasure() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function useCountUp(target, { duration = 700, enabled = true, decimals = 0 } = {}) {
  const [val, setVal] = useState(enabled ? 0 : target);
  const fromRef = useRef(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setVal(target); return; }
    const from = fromRef.current, start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration]);
  return val;
}
function LineChart({ current, previous, n, color = '#58a6ff', compare = false, animate = true, fmt }) {
  const [ref, w] = useMeasure();
  const [hover, setHover] = useState(null);
  const H = 248, padT = 16, padB = 26, padL = 8, padR = 8;
  const innerW = Math.max(1, w - padL - padR), innerH = H - padT - padB;
  const series = compare && previous ? [...current, ...previous] : current;
  const max = Math.max(...series, 0.0001) * 1.18;
  const X = (i) => padL + (i / Math.max(n - 1, 1)) * innerW;
  const Y = (v) => padT + innerH - (v / max) * innerH;
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const area = (arr) => path(arr) + ' L' + X(n - 1).toFixed(1) + ' ' + (padT + innerH).toFixed(1) + ' L' + padL.toFixed(1) + ' ' + (padT + innerH).toFixed(1) + ' Z';
  const gid = 'lg' + color.replace('#', '');
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - padL;
    const i = Math.max(0, Math.min(n - 1, Math.round((x / innerW) * (n - 1))));
    setHover(i);
  };
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {w > 0 && (
        <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', cursor: 'crosshair' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g, i) => (
            <line key={i} x1={padL} x2={w - padR} y1={padT + innerH * g} y2={padT + innerH * g} stroke="#21262d" strokeWidth="1" />
          ))}
          {current.length > 1 && <path d={area(current)} fill={'url(#' + gid + ')'} className={animate ? 'tw-draw-area' : ''} />}
          {compare && previous && previous.length > 1 && (
            <path d={path(previous)} fill="none" stroke="#6e7681" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.85" />
          )}
          {current.length > 1 && <path d={path(current)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className={animate ? 'tw-draw-line' : ''} />}
          {hover != null && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={padT} y2={padT + innerH} stroke="#484f58" strokeWidth="1" strokeDasharray="3 3" />
              {compare && previous && previous[hover] != null && <circle cx={X(hover)} cy={Y(previous[hover])} r="3.5" fill="#21262d" stroke="#6e7681" strokeWidth="1.6" />}
              <circle cx={X(hover)} cy={Y(current[hover])} r="4.5" fill="#0d1117" stroke={color} strokeWidth="2.2" />
            </g>
          )}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div style={{ position: 'absolute', top: 6, pointerEvents: 'none', left: Math.min(Math.max(X(hover) - 70, 4), w - 144), width: 140, background: '#1c2128', border: '1px solid #30363d', borderRadius: 6, padding: '6px 8px', fontSize: 11, boxShadow: '0 6px 20px rgba(0,0,0,.5)' }}>
          <div style={{ color: '#7d8590', marginBottom: 3 }}>point {hover + 1}/{n}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color }}>&#9679; current</span><b>{fmt ? fmt(current[hover]) : current[hover].toFixed(4)}</b>
          </div>
          {compare && previous && previous[hover] != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              <span>&#9675; previous</span><span>{fmt ? fmt(previous[hover]) : previous[hover].toFixed(4)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function Doughnut({ data, total, fmt, active, onHover }) {
  const size = 188, stroke = 26, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  const safeTotal = total || 0.0001;
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}>
      <g transform={'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'}>
        {data.map((d) => {
          const frac = d.cost / safeTotal;
          const dash = frac * c;
          const seg = (
            <circle key={d.id} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color} strokeWidth={active === d.id ? stroke + 5 : stroke}
              strokeDasharray={dash + ' ' + (c - dash)} strokeDashoffset={-acc}
              opacity={active && active !== d.id ? 0.32 : 1}
              style={{ transition: 'opacity .15s, stroke-width .15s', cursor: 'pointer' }}
              onMouseEnter={() => onHover && onHover(d.id)} onMouseLeave={() => onHover && onHover(null)} />
          );
          acc += dash;
          return seg;
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" fill="#7d8590" fontSize="11" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {active ? ((data.find((d) => d.id === active) || {}).id || 'total') : 'total'}
      </text>
      <text x="50%" y="58%" textAnchor="middle" fill="#e6edf3" fontSize="20" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {active ? fmt(((data.find((d) => d.id === active) || {}).cost) || 0) : fmt(total)}
      </text>
    </svg>
  );
}
function Sparkline({ data, color = '#58a6ff', w = 92, h = 30 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 0.0001), min = Math.min(...data);
  const X = (i) => (i / (data.length - 1)) * w;
  const Y = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const d = data.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <path d={d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z'} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
function ShareBar({ frac, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
        <div style={{ width: (frac * 100).toFixed(1) + '%', height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <span style={{ color: '#7d8590', fontSize: 11, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(frac * 100).toFixed(1)}%</span>
    </div>
  );
}
Object.assign(window, { useMeasure, useCountUp, LineChart, Doughnut, Sparkline, ShareBar });
</script>

<script type="text/babel">
// tw-cards.jsx
const { useState: useStateC } = React;
const Ico = {
  chevron: (p) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  search: (p) => <svg width="14" height="14" viewBox="0 0 14 14" {...p}><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9.2 9.2 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  download: (p) => <svg width="13" height="13" viewBox="0 0 14 14" {...p}><path d="M7 1.5v7m0 0 2.6-2.6M7 8.5 4.4 5.9M2 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  bolt: (p) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}><path d="M7 1 2.5 7H5l-.5 4L9 5H6.5z" fill="currentColor" /></svg>,
  arrow: (p) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}><path d="M2.5 6h7m0 0L7 3.5M9.5 6 7 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  warn: (p) => <svg width="13" height="13" viewBox="0 0 14 14" {...p}><path d="M7 1.5 13 12H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M7 5.5v3M7 10.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  check: (p) => <svg width="13" height="13" viewBox="0 0 14 14" {...p}><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};
function Header({ t, onOpenPalette }) {
  const [wsOpen, setWsOpen] = useStateC(false);
  const nav = ['Overview', 'Sessions', 'Users', 'Features', 'Settings'];
  return (
    <header className="tw-header">
      <div className="tw-hgroup">
        <div className="tw-logo">token<span>watch</span></div>
        <button className="tw-ws" onClick={() => setWsOpen((v) => !v)}>
          <span className="tw-ws-dot" />
          <span>tokenwatch</span>
          <span className="tw-ws-env">local</span>
          <Ico.chevron style={{ color: '#7d8590' }} />
        </button>
        <nav className="tw-nav">
          {nav.map((n, i) => <a key={n} className={i === 0 ? 'on' : ''} href="#" onClick={(e) => e.preventDefault()}>{n}</a>)}
        </nav>
      </div>
      <div className="tw-hgroup">
        {t.commandPalette && (
          <button className="tw-search" onClick={onOpenPalette}>
            <Ico.search style={{ color: '#7d8590' }} />
            <span>Search</span>
            <kbd>&#8984;K</kbd>
          </button>
        )}
        <button className="tw-btn-2"><Ico.download /> Export CSV</button>
      </div>
    </header>
  );
}
function BudgetBar({ t }) {
  const { BUDGET, fmtMoney } = window.TW;
  const { used, limit, daysLeft, cycleDays } = BUDGET;
  const pct = Math.min(used / Math.max(limit, 0.0001), 1);
  const elapsed = cycleDays - daysLeft;
  const barColor = pct < 0.5 ? '#3fb950' : pct < 0.8 ? '#d29922' : '#f85149';
  const projectedDaily = used / Math.max(elapsed, 1);
  const projected = used + projectedDaily * daysLeft;
  const projPct = Math.min(projected / Math.max(limit, 0.0001), 1);
  return (
    <div className="tw-budget">
      <div className="tw-budget-top">
        <div className="tw-budget-label">
          <span className="tw-bud-strong">Monthly budget</span>
          <span className="tw-bud-nums"><b>{fmtMoney(used)}</b> used of {fmtMoney(limit)}</span>
        </div>
        {t.budgetAlerts && (
          <div className="tw-bud-alert ok">
            <Ico.check style={{ color: '#3fb950' }} />
            Projected <b>{fmtMoney(projected)}</b> by cycle end
          </div>
        )}
        <div className="tw-budget-days">{daysLeft} days left &middot; day {elapsed}/{cycleDays}</div>
      </div>
      <div className="tw-bar">
        <div className="tw-bar-fill" style={{ width: (pct * 100) + '%', background: barColor }} />
        {t.budgetAlerts && <div className="tw-bar-proj" style={{ left: (pct * 100) + '%', width: ((projPct - pct) * 100) + '%' }} />}
        {t.budgetAlerts && <div className="tw-bar-marker" style={{ left: (projPct * 100) + '%' }} data-tip={'proj ' + fmtMoney(projected)} />}
      </div>
    </div>
  );
}
function KpiCard({ label, value, sub, delta, deltaColor, spark, sparkColor, t }) {
  return (
    <div className="tw-kpi">
      <div className="tw-kpi-label">{label}</div>
      <div className="tw-kpi-main">
        <div className="tw-kpi-value">{value}</div>
        {t.kpiSparklines && spark && spark.length >= 2 && <Sparkline data={spark} color={sparkColor} w={84} h={28} />}
      </div>
      <div className="tw-kpi-foot">
        {delta && <span className="tw-delta" style={{ color: t.smartHighlight ? deltaColor : '#7d8590' }}>{delta}</span>}
        {sub && <span className="tw-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}
function KpiRow({ kpis, range, t }) {
  const { fmtUSD, fmtInt, seriesForRange } = window.TW;
  const s = seriesForRange(range).current;
  const callsSeries = s.map((v, i) => 6 + Math.abs(Math.sin(i * 1.7)) * 14);
  return (
    <div className="tw-kpis">
      <KpiCard t={t} label="Total cost" value={fmtUSD(kpis.cost)} delta="&#x2191; 12% vs last week" deltaColor="#f85149" spark={s} sparkColor="#58a6ff" />
      <KpiCard t={t} label="Input tokens" value={fmtInt(kpis.inTok)} sub="tokens in" spark={s} sparkColor="#3fb950" />
      <KpiCard t={t} label="Output tokens" value={fmtInt(kpis.outTok)} sub="tokens out" spark={s.map((v) => v * 0.9)} sparkColor="#bc8cff" />
      <KpiCard t={t} label="Total calls" value={fmtInt(kpis.calls)} delta="&#x2193; 5% vs last week" deltaColor="#3fb950" spark={callsSeries} sparkColor="#56d4dd" />
      <KpiCard t={t} label="Burn rate" value={fmtUSD(kpis.burnHr, 4) + '/hr'} sub={'proj ' + fmtUSD(kpis.burnHr * 24, 2) + '/day'} spark={s.map((v) => v * 1.05)} sparkColor="#e3b341" />
    </div>
  );
}
function TimeFilter({ range, setRange, t, setTweak }) {
  const ranges = ['1h', '24h', '7d', '30d', 'All'];
  return (
    <div className="tw-timefilter">
      <div className="tw-tabs">
        {ranges.map((r) => (
          <button key={r} className={'tw-tab' + (r === range ? ' on' : '')} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>
      <label className="tw-compare">
        <button className="tw-toggle-sm" data-on={t.compareMode ? '1' : '0'} onClick={() => setTweak('compareMode', !t.compareMode)}><i /></button>
        Compare to previous period
      </label>
    </div>
  );
}
function ForecastCard({ label, value, sub, accent, flag }) {
  return (
    <div className={'tw-fc' + (flag ? ' flag' : '')}>
      <div className="tw-fc-label">{label}</div>
      <div className="tw-fc-value" style={accent ? { color: accent } : null}>{value}</div>
      {sub && <div className="tw-fc-sub">{sub}</div>}
    </div>
  );
}
function ForecastSection({ t }) {
  const { fmtUSD, fmtMoney, BUDGET } = window.TW;
  const daily = BUDGET.daily != null ? BUDGET.daily : 0.8473;
  const burnHr = daily / 24;
  const remaining = daily * BUDGET.daysLeft;
  const projCycle = BUDGET.used + remaining;
  const g = t.forecastScenario / 100;
  const scenarioCycle = BUDGET.used + remaining * (1 + g);
  const over = scenarioCycle > BUDGET.limit;
  return (
    <section className="tw-section">
      <div className="tw-sec-head"><h3>Cost forecast</h3><span className="tw-sec-sub">based on current run-rate</span></div>
      <div className="tw-forecast">
        <ForecastCard label="Projected daily" value={fmtUSD(daily, 2)} sub="next 24h at this rate" />
        <ForecastCard label="Projected this cycle" value={fmtMoney(projCycle)} sub={'of ' + fmtMoney(BUDGET.limit) + ' budget'} />
        <ForecastCard label="Burn rate" value={fmtUSD(burnHr, 4)} sub="per hour" accent="#e3b341" />
        <ForecastCard label={'If usage grows ' + t.forecastScenario + '%'} value={fmtMoney(scenarioCycle)} sub={over ? 'over budget ⚠' : fmtMoney(BUDGET.limit - scenarioCycle) + ' headroom'} accent={over ? '#f85149' : '#58a6ff'} flag={over} />
      </div>
    </section>
  );
}
Object.assign(window, { Ico, Header, BudgetBar, KpiCard, KpiRow, TimeFilter, ForecastCard, ForecastSection });
</script>

<script type="text/babel">
// tw-table.jsx
const { useState: useStateT } = React;
function ModelTable({ models, total, t, onRowClick, exampleHover }) {
  const { fmtInt, fmtUSD, fmtCompact } = window.TW;
  const [sort, setSort] = useStateT({ key: 'cost', dir: -1 });
  const [hoverRow, setHoverRow] = useStateT(null);
  const cols = [
    { key: 'id', label: 'Model', align: 'left' },
    { key: 'calls', label: 'Calls', align: 'right' },
    { key: 'inTok', label: 'In tokens', align: 'right' },
    { key: 'outTok', label: 'Out tokens', align: 'right' },
    { key: 'cost', label: 'Cost', align: 'right' },
    { key: 'share', label: 'Share', align: 'left' },
    { key: 'avg', label: 'Avg / call', align: 'right' },
  ];
  const safeTotal = total || 0.0001;
  const rows = [...models].map((m) => ({ ...m, avg: m.cost / Math.max(m.calls, 1), share: m.cost / safeTotal }));
  if (t.tableSort) {
    rows.sort((a, b) => {
      const A = a[sort.key], B = b[sort.key];
      if (typeof A === 'string') return A.localeCompare(B) * sort.dir;
      return (A - B) * sort.dir;
    });
  }
  const clickHeader = (key) => {
    if (!t.tableSort) return;
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'id' ? 1 : -1 });
  };
  return (
    <section className="tw-section">
      <div className="tw-sec-head">
        <h3>Model breakdown</h3>
        <span className="tw-sec-sub">{models.length} models &middot; click a row for detail</span>
      </div>
      <div className="tw-table-wrap">
        <table className={'tw-table' + (t.density === 'compact' ? ' compact' : '')}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} style={{ textAlign: c.align, cursor: t.tableSort && c.key !== 'share' ? 'pointer' : 'default' }}
                    onClick={() => c.key !== 'share' && clickHeader(c.key)}>
                  <span className="tw-th-inner" style={{ justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }}>
                    {c.label}
                    {t.tableSort && sort.key === c.key && <span className="tw-sort">{sort.dir < 0 ? '▾' : '▴'}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isExample = exampleHover && m.id === 'claude-sonnet-4-6';
              return (
                <tr key={m.id} className={'tw-row' + (isExample ? ' example' : '')}
                    onMouseEnter={() => setHoverRow(m.id)} onMouseLeave={() => setHoverRow(null)}
                    onClick={() => onRowClick(m)}>
                  <td>
                    <div className="tw-model-cell">
                      <span className="tw-model-dot" style={{ background: m.color }} />
                      <span className="tw-model-name">{m.id}</span>
                      <span className="tw-model-prov">{m.provider}</span>
                    </div>
                  </td>
                  <td className="tw-num-cell">{fmtInt(m.calls)}</td>
                  <td className="tw-num-cell">{fmtCompact(m.inTok)}</td>
                  <td className="tw-num-cell">{fmtCompact(m.outTok)}</td>
                  <td className="tw-num-cell tw-cost">{fmtUSD(m.cost, 4)}</td>
                  <td style={{ minWidth: 140 }}><ShareBar frac={m.share} color={m.color} /></td>
                  <td className="tw-num-cell">
                    {hoverRow === m.id && t.tableSort ? (
                      <div className="tw-row-actions" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => onRowClick(m)}>Details</button>
                        <button>Alert</button>
                      </div>
                    ) : (
                      <span>{fmtUSD(m.avg, 4)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function MetaGroup({ label, rows, t }) {
  const [open, setOpen] = useStateT(true);
  const { fmtUSD, fmtInt } = window.TW;
  const total = rows.reduce(function(s, r) { return s + r[1].costUSD; }, 0);
  return (
    <section className="tw-section">
      <div className="tw-sec-head" style={{ cursor: 'pointer' }} onClick={() => setOpen(function(v) { return !v; })}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="tw-collapse" style={{ transform: open ? 'none' : 'rotate(-90deg)' }}><Ico.chevron /></button>
          {label}
        </h3>
        <span className="tw-sec-sub">{rows.length + ' values \xb7 ' + fmtUSD(total, 4)}</span>
      </div>
      {open && (
        <div className="tw-table-wrap">
          <table className={'tw-table' + (t.density === 'compact' ? ' compact' : '')}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Value</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Calls</th>
                <th style={{ textAlign: 'right' }}>Avg / call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                var val = r[0], stats = r[1];
                return (
                  <tr key={val} className="tw-row">
                    <td>{val}</td>
                    <td style={{ textAlign: 'right' }}>{fmtUSD(stats.costUSD, 4)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtInt(stats.calls)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtUSD(stats.costUSD / Math.max(stats.calls, 1), 4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MetadataSection({ byMetadata, t }) {
  var keys = Object.keys(byMetadata || {});
  if (keys.length === 0) return null;
  return (
    <div>
      {keys.map(function(key) {
        var group = byMetadata[key];
        var rows = Object.entries(group).sort(function(a, b) { return b[1].costUSD - a[1].costUSD; });
        return <MetaGroup key={key} label={key} rows={rows} t={t} />;
      })}
    </div>
  );
}

Object.assign(window, { ModelTable, MetaGroup, MetadataSection });
</script>

<script type="text/babel">
// tw-panel.jsx
const { useEffect: useEffectP } = React;
function SlideOver({ model, onClose, t }) {
  const { fmtInt, fmtUSD, callsForModel, fmtAgo } = window.TW;
  useEffectP(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const open = !!model;
  const m = model;
  const calls = m ? callsForModel(m.id, 5) : [];
  const totalIn = m ? m.inTok : 0, totalOut = m ? m.outTok : 0;
  return (
    <>
      <div className={'tw-scrim' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'tw-slideover' + (open ? ' open' : '')}>
        {m && (
          <div className="tw-so-inner">
            <div className="tw-so-head">
              <div className="tw-so-title">
                <span className="tw-model-dot lg" style={{ background: m.color }} />
                <div>
                  <div className="tw-so-name">{m.id}</div>
                  <div className="tw-so-prov">{m.provider} &middot; {fmtInt(m.calls)} calls in window</div>
                </div>
              </div>
              <button className="tw-so-close" onClick={onClose}>&#x2715;</button>
            </div>
            <div className="tw-so-stats">
              <div className="tw-so-stat"><div className="tw-so-stat-l">Total cost</div><div className="tw-so-stat-v">{fmtUSD(m.cost, 4)}</div></div>
              <div className="tw-so-stat"><div className="tw-so-stat-l">Calls</div><div className="tw-so-stat-v">{fmtInt(m.calls)}</div></div>
              <div className="tw-so-stat"><div className="tw-so-stat-l">Avg / call</div><div className="tw-so-stat-v">{fmtUSD(m.cost / Math.max(m.calls, 1), 4)}</div></div>
            </div>
            <div className="tw-so-metarow">
              <div><span className="tw-so-meta-l">In tokens</span><span className="tw-so-meta-v">{fmtInt(totalIn)}</span></div>
              <div><span className="tw-so-meta-l">Out tokens</span><span className="tw-so-meta-v">{fmtInt(totalOut)}</span></div>
              <div><span className="tw-so-meta-l">Cost / call</span><span className="tw-so-meta-v">{fmtUSD(m.cost / Math.max(m.calls, 1), 4)}</span></div>
            </div>
            <div className="tw-so-section-label">Last 5 calls (estimated)</div>
            <div className="tw-so-calls">
              {calls.map((c) => (
                <div key={c.id} className="tw-so-call">
                  <div className="tw-so-call-top">
                    <span className="tw-so-call-time">{fmtAgo(c.secondsAgo)}</span>
                    <span className="tw-feat" style={{ color: c.featureColor, borderColor: c.featureColor + '55' }}>{c.feature}</span>
                    <span className="tw-so-call-cost">{fmtUSD(c.cost, 4)}</span>
                  </div>
                  <div className="tw-so-call-bot">
                    <span>{fmtInt(c.inTok)} in &middot; {fmtInt(c.outTok)} out</span>
                    <span className="tw-so-call-lat">{c.latency}ms{c.status === 'slow' ? ' · slow' : c.status === 'error' ? ' · error' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="tw-so-viewall">View all {fmtInt(m.calls)} calls <Ico.arrow /></button>
          </div>
        )}
      </aside>
    </>
  );
}
Object.assign(window, { SlideOver });
</script>

<script type="text/babel">
// tw-activity.jsx
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;
function LiveActivity({ t }) {
  const { seedFeed, makeCall, fmtUSD, fmtInt, fmtAgo } = window.TW;
  const [feed, setFeed] = useStateA(() => {
    const rf = window.TW.recentFeed;
    return (rf && rf.length > 0) ? rf : seedFeed(14);
  });
  const [hasRealData, setHasRealData] = useStateA(() => {
    const rf = window.TW.recentFeed;
    return !!(rf && rf.length > 0);
  });
  const [now, setNow] = useStateA(Date.now());
  const [paused, setPaused] = useStateA(false);
  const [collapsed, setCollapsed] = useStateA(false);
  const [filter, setFilter] = useStateA('all');
  const seedRef = useRefA(5000);
  const streaming = !hasRealData && t.liveFeed && t.animLevel !== 'minimal' && !paused;
  useEffectA(() => {
    function onUpdate() {
      const rf = window.TW.recentFeed;
      if (rf && rf.length > 0) { setFeed(rf); setHasRealData(true); }
    }
    window.addEventListener('tw-data-update', onUpdate);
    return () => window.removeEventListener('tw-data-update', onUpdate);
  }, []);
  useEffectA(() => {
    if (!streaming) return;
    const iv = setInterval(() => {
      const c = makeCall(0, seedRef.current++);
      c.ts = Date.now(); c.fresh = true;
      setFeed((f) => [c, ...f].slice(0, 40));
    }, t.animLevel === 'subtle' ? 3600 : 2100);
    return () => clearInterval(iv);
  }, [streaming, t.animLevel]);
  useEffectA(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const shown = feed
    .map((c) => ({ ...c, secondsAgo: Math.max(0, Math.round((now - c.ts) / 1000)) }))
    .filter((c) => filter === 'all' ? true : filter === 'errors' ? c.status !== 'ok' : c.cost >= 0.001)
    .slice(0, 10);
  return (
    <section className="tw-section tw-activity">
      <div className="tw-sec-head">
        <div className="tw-act-title">
          <button className="tw-collapse" onClick={() => setCollapsed((v) => !v)} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}><Ico.chevron /></button>
          <span className={'tw-live-dot' + ((streaming || hasRealData) ? ' on' : '')} />
          <h3>Live activity</h3>
          <span className="tw-sec-sub">{hasRealData ? 'live' : streaming ? 'streaming' : t.liveFeed ? 'paused' : 'static'}</span>
        </div>
        <div className="tw-act-controls">
          <div className="tw-seg-sm">
            {[['all', 'All'], ['signal', 'Signal'], ['errors', 'Errors']].map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {t.liveFeed && !hasRealData && (
            <button className="tw-act-pause" onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="tw-feed">
          <div className="tw-feed-head">
            <span>Time</span><span>Model</span><span>Session</span><span>Feature</span><span style={{ textAlign: 'right' }}>Cost</span>
          </div>
          <div className="tw-feed-body">
            {shown.map((c) => (
              <div key={c.id} className={'tw-feed-row' + (c.fresh ? ' fresh' : '') + (c.status === 'error' ? ' err' : '')}>
                <span className="tw-feed-time">{c.secondsAgo === 0 ? 'now' : fmtAgo(c.secondsAgo)}</span>
                <span className="tw-feed-model"><span className="tw-model-dot" style={{ background: c.modelColor }} />{c.model}</span>
                <span className="tw-feed-sess">{c.session}</span>
                <span><span className="tw-feat sm" style={{ color: c.featureColor, borderColor: c.featureColor + '55' }}>{c.feature}</span></span>
                <span className="tw-feed-cost">{fmtUSD(c.cost, 4)}{c.status === 'error' && <span className="tw-feed-flag">err</span>}{c.status === 'slow' && <span className="tw-feed-flag slow">slow</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
function CommandPalette({ open, onClose, onAction }) {
  const [q, setQ] = useStateA('');
  const inputRef = useRefA(null);
  useEffectA(() => { if (open && inputRef.current) inputRef.current.focus(); if (open) setQ(''); }, [open]);
  useEffectA(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const items = [
    { g: 'Filter', label: 'Set range: Last 1h', act: { range: '1h' } },
    { g: 'Filter', label: 'Set range: Last 24h', act: { range: '24h' } },
    { g: 'Filter', label: 'Set range: Last 7 days', act: { range: '7d' } },
    { g: 'Filter', label: 'Set range: Last 30 days', act: { range: '30d' } },
    { g: 'Filter', label: 'Set range: All time', act: { range: 'All' } },
    { g: 'Action', label: 'Export CSV', hint: '⌘E' },
    { g: 'Action', label: 'Create budget alert' },
  ];
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  if (!open) return null;
  return (
    <div className="tw-cmdk-scrim" onClick={onClose}>
      <div className="tw-cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="tw-cmdk-input">
          <Ico.search style={{ color: '#7d8590' }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models, sessions, actions…" />
          <kbd>esc</kbd>
        </div>
        <div className="tw-cmdk-list">
          {filtered.length === 0 && <div className="tw-cmdk-empty">No results for "{q}"</div>}
          {filtered.map((i, idx) => (
            <div key={idx} className="tw-cmdk-item" onClick={() => { onAction(i.act); onClose(); }}>
              <span className="tw-cmdk-g">{i.g}</span>
              <span className="tw-cmdk-l">{i.label}</span>
              {i.hint && <kbd>{i.hint}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { LiveActivity, CommandPalette });
</script>

<script type="text/babel">
// tw-data.jsx — mock data + formatters (always-populated baseline)
const fmtUSD = (n, d = 4) =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = (n) =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Math.round(n || 0).toLocaleString('en-US');
const fmtCompact = (n) => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
};
const fmtAgo = (s) => {
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
const BASE_MODELS = [
  { id: 'gpt-5-mini',        provider: 'OpenAI',    color: '#3fb950', calls: 94, inTok: 1040000, outTok: 118000, cost: 0.2110, latency: 590  },
  { id: 'claude-sonnet-4-6', provider: 'Anthropic', color: '#bc8cff', calls: 58, inTok: 612000,  outTok: 84000,  cost: 0.3120, latency: 1840 },
  { id: 'gemini-2.5-flash',  provider: 'Google',    color: '#58a6ff', calls: 47, inTok: 430000,  outTok: 56000,  cost: 0.1190, latency: 510  },
  { id: 'claude-haiku-4-5',  provider: 'Anthropic', color: '#f778ba', calls: 38, inTok: 268100,  outTok: 38540,  cost: 0.1240, latency: 680  },
  { id: 'gpt-5.1',           provider: 'OpenAI',    color: '#e3b341', calls: 18, inTok: 88000,   outTok: 12000,  cost: 0.0613, latency: 2210 },
  { id: 'gemini-2.5-pro',    provider: 'Google',    color: '#56d4dd', calls: 8,  inTok: 42000,   outTok: 4000,   cost: 0.0200, latency: 1990 },
];
const RANGES = {
  '1h':  { factor: 0.052, points: 12, label: 'last hour',   step: '5 min' },
  '24h': { factor: 1,     points: 24, label: 'last 24h',    step: 'hour'  },
  '7d':  { factor: 6.4,   points: 28, label: 'last 7 days', step: '6h'   },
  '30d': { factor: 53.1,  points: 30, label: 'last 30 days',step: 'day'  },
  'All': { factor: 142,   points: 26, label: 'all time',    step: 'week' },
};
function modelsForRange(range) {
  const f = RANGES[range].factor;
  return BASE_MODELS.map((m) => ({
    ...m,
    calls: Math.max(1, Math.round(m.calls * f)),
    inTok: Math.round(m.inTok * f),
    outTok: Math.round(m.outTok * f),
    cost: m.cost * f,
  }));
}
function kpisForRange(range) {
  const ms = modelsForRange(range);
  const sum = (k) => ms.reduce((a, m) => a + m[k], 0);
  const cost = sum('cost'), calls = sum('calls');
  return {
    cost, calls,
    inTok: sum('inTok'), outTok: sum('outTok'),
    models: ms,
    burnHr: cost / ({ '1h': 1, '24h': 24, '7d': 168, '30d': 720, 'All': 3408 }[range]),
  };
}
const DAY_SHAPE = [0.2,0.15,0.12,0.1,0.1,0.15,0.3,0.6,1.0,1.4,1.7,1.8,1.6,1.5,1.9,2.0,1.7,1.3,1.0,0.8,0.6,0.45,0.35,0.25];
function shapeFor(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * DAY_SHAPE.length;
    const a = DAY_SHAPE[Math.floor(t) % DAY_SHAPE.length];
    const b = DAY_SHAPE[(Math.floor(t) + 1) % DAY_SHAPE.length];
    out.push(a + (b - a) * (t - Math.floor(t)));
  }
  return out;
}
function buildSeries(total, n, jitterSeed = 1) {
  const shape = shapeFor(n);
  const j = shape.map((v, i) => v * (0.82 + 0.36 * Math.abs(Math.sin(i * 12.9898 * jitterSeed))));
  const s = j.reduce((a, b) => a + b, 0);
  return j.map((v) => (v / s) * total);
}
function seriesForRange(range) {
  const { cost } = kpisForRange(range);
  const n = RANGES[range].points;
  return { current: buildSeries(cost, n, 1), previous: buildSeries(cost / 1.12, n, 1.7), n };
}
const FEATURES = ['chat', 'rag-search', 'summarize', 'classify', 'agent-loop', 'embeddings', 'code-review', 'extract'];
const FEATURE_COLOR = {
  'chat': '#58a6ff', 'rag-search': '#3fb950', 'summarize': '#bc8cff', 'classify': '#e3b341',
  'agent-loop': '#f778ba', 'embeddings': '#56d4dd', 'code-review': '#ff7b72', 'extract': '#7ee787',
};
let __callSeq = 48213;
function rng(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
function makeCall(secondsAgo, seed) {
  const m = BASE_MODELS[Math.floor(rng(seed) * BASE_MODELS.length)];
  const feat = FEATURES[Math.floor(rng(seed * 1.3) * FEATURES.length)];
  const inTok = Math.round(800 + rng(seed * 2.1) * 14000);
  const outTok = Math.round(60 + rng(seed * 3.7) * 2200);
  const cost = (inTok / 1e6) * 0.4 + (outTok / 1e6) * 3.2;
  const r = rng(seed * 5.9);
  const status = r > 0.965 ? 'error' : r > 0.9 ? 'slow' : 'ok';
  return {
    id: ++__callSeq, secondsAgo, ts: Date.now() - secondsAgo * 1000,
    model: m.id, modelColor: m.color,
    session: 'sess_' + (seed * 7919 % 1e6 | 0).toString(36).padStart(4, '0'),
    feature: feat, featureColor: FEATURE_COLOR[feat],
    inTok, outTok, cost, latency: Math.round(m.latency * (0.6 + rng(seed * 8.3) * 1.2)), status,
  };
}
function seedFeed(count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(makeCall(2 + i * 7 + Math.floor(rng(i * 3.3) * 6), 100 + i));
  return arr;
}
function callsForModel(modelId, count = 5) {
  const arr = [];
  let sa = 12;
  for (let i = 0; i < count; i++) {
    const c = makeCall(sa, 900 + i + modelId.length);
    c.model = modelId;
    c.modelColor = (BASE_MODELS.find((m) => m.id === modelId) || {}).color || '#58a6ff';
    arr.push(c);
    sa += 40 + Math.floor(rng(i * 2.2) * 220);
  }
  return arr;
}
const BUDGET = { used: 45.0, limit: 100.0, daysLeft: 18, cycleDays: 30 };

Object.assign(window, {
  TW: {
    fmtUSD, fmtMoney, fmtInt, fmtCompact, fmtAgo,
    BASE_MODELS, RANGES, modelsForRange, kpisForRange,
    seriesForRange, seedFeed, makeCall, callsForModel,
    FEATURES, FEATURE_COLOR, BUDGET, _buildSeries: buildSeries,
    byMetadata: {},
    recentFeed: [],
    _sseStatus: 'pending',
  },
});

// SSE overlay — patches window.TW functions when real data arrives
(function () {
  var MC = ['#bc8cff','#3fb950','#58a6ff','#f778ba','#e3b341','#56d4dd','#79c0ff','#ffa657','#ff7b72','#a5d6ff'];
  var _realId = 1000000;
  function modelColorFor(id) {
    var ci = 0;
    for (var i = 0; i < id.length; i++) ci = (ci * 31 + id.charCodeAt(i)) % MC.length;
    return MC[Math.abs(ci) % MC.length];
  }
  function entryToFeedItem(entry) {
    var feat = entry.feature || 'chat';
    var featureColor = (window.TW.FEATURE_COLOR || {})[feat] || '#58a6ff';
    var bm = (window.TW.BASE_MODELS || []).find(function(m) { return m.id === entry.model; });
    var mColor = bm ? bm.color : modelColorFor(entry.model);
    return {
      id: ++_realId,
      ts: new Date(entry.timestamp).getTime(),
      model: entry.model,
      modelColor: mColor,
      session: entry.sessionId || '—',
      feature: feat,
      featureColor: featureColor,
      inTok: entry.inputTokens || 0,
      outTok: entry.outputTokens || 0,
      cost: entry.costUSD || 0,
      latency: 0,
      status: 'ok',
      fresh: false,
    };
  }
  function guessProv(id) {
    if (/claude/i.test(id)) return 'Anthropic';
    if (/gpt|o1|o3|o4/i.test(id)) return 'OpenAI';
    if (/gemini/i.test(id)) return 'Google';
    return 'Other';
  }
  function buildRealModels(byModel) {
    return Object.entries(byModel).map(function(e, i) {
      var id = e[0], s = e[1];
      return { id: id, provider: guessProv(id), color: MC[i % MC.length],
        calls: s.calls || 0, inTok: (s.tokens && s.tokens.input) || 0,
        outTok: (s.tokens && s.tokens.output) || 0, cost: s.costUSD || 0, latency: 1200 };
    }).sort(function(a, b) { return b.cost - a.cost; });
  }
  function applySSEData(data) {
    var r = data.report, fc = data.forecast, ts = data.timeSeries || [];
    if (!r || !r.byModel || Object.keys(r.byModel).length === 0) {
      window.TW._sseStatus = 'empty';
      window.dispatchEvent(new CustomEvent('tw-data-update'));
      return;
    }
    var mods = buildRealModels(r.byModel);
    var totalCalls = mods.reduce(function(s, m) { return s + m.calls; }, 0);
    var totalCost = r.totalCostUSD || 0;
    var totalIn = 0, totalOut = 0;
    if (r.totalTokens) { totalIn = r.totalTokens.input || 0; totalOut = r.totalTokens.output || 0; }
    else { mods.forEach(function(m) { totalIn += m.inTok; totalOut += m.outTok; }); }
    var costs = ts.map(function(b) { return b.cost || 0; });
    window.TW.kpisForRange = function() {
      return { cost: totalCost, calls: totalCalls, inTok: totalIn, outTok: totalOut,
        models: mods, burnHr: (fc && fc.burnRatePerHour) || 0 };
    };
    if (costs.length >= 2) {
      window.TW.seriesForRange = function() {
        return { current: costs, previous: buildSeries(totalCost / 1.12, costs.length, 1.7), n: costs.length };
      };
    }
    if (fc && fc.projectedDailyCostUSD) window.TW.BUDGET.daily = fc.projectedDailyCostUSD;
    if (fc && fc.burnRatePerHour) {
      var elapsed = window.TW.BUDGET.cycleDays - window.TW.BUDGET.daysLeft;
      window.TW.BUDGET.used = fc.burnRatePerHour * 24 * Math.max(elapsed, 1);
    }
    if (r.byMetadata) window.TW.byMetadata = r.byMetadata;
    if (data.recentEntries && data.recentEntries.length > 0) {
      window.TW.recentFeed = data.recentEntries.map(entryToFeedItem);
    }
    window.TW._sseStatus = 'data';
    window.dispatchEvent(new CustomEvent('tw-data-update'));
  }
  var evtSource = null;
  function connect(filter) {
    if (evtSource) { try { evtSource.close(); } catch(e) {} }
    var f = filter === 'All' ? 'all' : filter;
    evtSource = new EventSource('/events?filter=' + encodeURIComponent(f));
    evtSource.onmessage = function(e) { try { applySSEData(JSON.parse(e.data)); } catch(_) {} };
    evtSource.onerror = function() {
      try { evtSource.close(); } catch(e) {}
      setTimeout(function() { connect(f); }, 5000);
    };
  }
  window.__twSSEConnect = connect;
  connect('24h');
})();
</script>

<script type="text/babel">
// tw-app.jsx
const { useState: useStateApp, useEffect: useEffectApp, useMemo: useMemoApp } = React;


function LoadingSkeleton() {
  return (
    <div className="tw-skel-wrap">
      <div className="tw-skel" style={{ height: 56 }} />
      <div className="tw-kpis">{[0,0,0,0,0].map((_,i) => <div key={i} className="tw-skel" style={{ height: 96 }} />)}</div>
      <div className="tw-charts">
        <div className="tw-skel tw-chart-main" style={{ height: 320 }} />
        <div className="tw-skel tw-chart-side" style={{ height: 320 }} />
      </div>
      <div className="tw-skel" style={{ height: 260 }} />
    </div>
  );
}
function EmptyState() {
  return (
    <div className="tw-empty">
      <div className="tw-empty-art">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="14" width="48" height="36" rx="4" stroke="#30363d" strokeWidth="2" />
          <path d="M16 40l8-9 7 6 9-13 8 10" stroke="#484f58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="31" r="2" fill="#484f58" />
        </svg>
      </div>
      <h2>No usage yet</h2>
      <p>Once your app starts making LLM calls through tokenwatch, cost &amp; token metrics show up here in real time.</p>
      <div className="tw-empty-actions">
        <button className="tw-btn-primary">View integration guide <Ico.arrow /></button>
        <button className="tw-btn-2">Copy API key</button>
      </div>
      <div className="tw-empty-snippet">
        <span className="tw-snip-c">import</span> TokenWatch <span className="tw-snip-c">from</span> <span className="tw-snip-s">'@diogonzafe/tokenwatch'</span>
      </div>
    </div>
  );
}
function ChartsRow({ range, models, kpis, series, t }) {
  const { fmtUSD, RANGES } = window.TW;
  const [activeSlice, setActiveSlice] = useStateApp(null);
  const animate = t.animLevel !== 'minimal';
  const rangeConfig = RANGES[range] || RANGES['24h'];
  const safeTotal = kpis.cost || 0.0001;
  return (
    <div className="tw-charts">
      <div className="tw-card tw-chart-main">
        <div className="tw-sec-head">
          <h3>Cost over time</h3>
          <div className="tw-chart-legend">
            <span><i style={{ background: t.accent }} /> current</span>
            {t.compareMode && series.previous && <span className="muted"><i className="dash" /> previous</span>}
            <span className="tw-sec-sub">&middot; per {rangeConfig.step}</span>
          </div>
        </div>
        <LineChart current={series.current} previous={t.compareMode ? series.previous : null}
          n={series.n} color={t.accent} compare={t.compareMode && !!series.previous}
          animate={animate} fmt={(v) => fmtUSD(v, 4)} />
      </div>
      <div className="tw-card tw-chart-side">
        <div className="tw-sec-head"><h3>By model</h3></div>
        <div className="tw-doughnut-wrap">
          <Doughnut data={models} total={safeTotal} fmt={(v) => fmtUSD(v, 4)} active={activeSlice} onHover={setActiveSlice} />
        </div>
        <div className="tw-legend">
          {[...models].sort((a, b) => b.cost - a.cost).map((m) => (
            <div key={m.id} className={'tw-legend-row' + (activeSlice === m.id ? ' on' : '')}
                 onMouseEnter={() => setActiveSlice(m.id)} onMouseLeave={() => setActiveSlice(null)}>
              <span className="tw-model-dot" style={{ background: m.color }} />
              <span className="tw-legend-name">{m.id}</span>
              <span className="tw-legend-val">{fmtUSD(m.cost, 4)}</span>
              <span className="tw-legend-pct">{((m.cost / safeTotal) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "compact",
  "kpiSparklines": true,
  "smartHighlight": true,
  "compareMode": false,
  "tableSort": true,
  "budgetAlerts": true,
  "forecastScenario": 20,
  "liveFeed": true,
  "animLevel": "lively",
  "commandPalette": true,
  "appState": "data",
  "accent": "#58a6ff"
}/*EDITMODE-END*/;
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [range, setRange] = useStateApp('24h');
  const [selModel, setSelModel] = useStateApp(null);
  const [paletteOpen, setPaletteOpen] = useStateApp(false);
  const [_sseV, setSseV] = useStateApp(0);

  useEffectApp(() => {
    const h = function() { setSseV(function(v) { return v + 1; }); };
    window.addEventListener('tw-data-update', h);
    return function() { window.removeEventListener('tw-data-update', h); };
  }, []);

  useEffectApp(() => {
    if (window.__twSSEConnect) window.__twSSEConnect(range);
  }, [range]);

  const kpis = useMemoApp(() => {
    const { kpisForRange } = window.TW;
    return kpisForRange(range);
  }, [range, _sseV]);

  const series = useMemoApp(() => {
    const { seriesForRange } = window.TW;
    return seriesForRange(range);
  }, [range, _sseV]);

  const models = kpis.models;

  const byMetadata = useMemoApp(() => {
    return window.TW.byMetadata || {};
  }, [_sseV]);

  const sseStatus = useMemoApp(() => {
    return window.TW._sseStatus || 'pending';
  }, [_sseV]);

  useEffectApp(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (t.commandPalette) setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t.commandPalette]);

  const handleAction = (act) => {
    if (!act) return;
    if (act.range) setRange(act.range);
    if (act.model) {
      const m = models.find((x) => x.id === act.model);
      if (m) setSelModel({ ...m, share: m.cost / Math.max(kpis.cost, 0.0001) });
    }
  };

  return (
    <div className="tw-root" style={{ '--accent': t.accent }}>
      <Header t={t} onOpenPalette={() => setPaletteOpen(true)} />
      {t.appState === 'loading' || sseStatus === 'pending' ? (
        <main className="tw-main"><LoadingSkeleton /></main>
      ) : t.appState === 'empty' || sseStatus === 'empty' ? (
        <main className="tw-main"><EmptyState /></main>
      ) : (
        <main className="tw-main">
          <BudgetBar t={t} />
          <KpiRow kpis={kpis} range={range} t={t} />
          <TimeFilter range={range} setRange={setRange} t={t} setTweak={setTweak} />
          <ChartsRow range={range} models={models} kpis={kpis} series={series} t={t} />
          <ModelTable models={models} total={kpis.cost} t={t} exampleHover={t.smartHighlight}
                      onRowClick={(m) => setSelModel({ ...m, share: m.cost / Math.max(kpis.cost, 0.0001) })} />
          <MetadataSection byMetadata={byMetadata} t={t} />
          <ForecastSection t={t} />
          <LiveActivity t={t} />
        </main>
      )}
      <SlideOver model={selModel} onClose={() => setSelModel(null)} t={t} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handleAction} />
      <TweaksPanel title="Tweaks \xb7 UX">
        <TweakSection label="Hierarquia &amp; densidade" />
        <TweakRadio label="Densidade" value={t.density} options={[{ value: 'compact', label: 'Compacto' }, { value: 'comfy', label: 'Confort.' }]} onChange={(v) => setTweak('density', v)} />
        <TweakToggle label="Sparklines nos KPIs" value={t.kpiSparklines} onChange={(v) => setTweak('kpiSparklines', v)} />
        <TweakToggle label="Smart highlight" value={t.smartHighlight} onChange={(v) => setTweak('smartHighlight', v)} />
        <TweakSection label="An\xe1lise" />
        <TweakToggle label="Comparar c/ per\xedodo anterior" value={t.compareMode} onChange={(v) => setTweak('compareMode', v)} />
        <TweakToggle label="Sorting + a\xe7\xf5es na tabela" value={t.tableSort} onChange={(v) => setTweak('tableSort', v)} />
        <TweakSection label="Custo proativo" />
        <TweakToggle label="Alertas de budget" value={t.budgetAlerts} onChange={(v) => setTweak('budgetAlerts', v)} />
        <TweakSlider label="Cen\xe1rio: crescimento" value={t.forecastScenario} min={0} max={300} step={5} unit="%" onChange={(v) => setTweak('forecastScenario', v)} />
        <TweakSection label="Tempo real" />
        <TweakToggle label="Live feed" value={t.liveFeed} onChange={(v) => setTweak('liveFeed', v)} />
        <TweakRadio label="Anima\xe7\xe3o" value={t.animLevel} options={[{ value: 'lively', label: 'Vivo' }, { value: 'subtle', label: 'Sutil' }, { value: 'minimal', label: 'M\xedn.' }]} onChange={(v) => setTweak('animLevel', v)} />
        <TweakSection label="Navega\xe7\xe3o &amp; estado" />
        <TweakToggle label="Command palette (⌘K)" value={t.commandPalette} onChange={(v) => setTweak('commandPalette', v)} />
        <TweakRadio label="Estado" value={t.appState} options={[{ value: 'data', label: 'Dados' }, { value: 'loading', label: 'Load' }, { value: 'empty', label: 'Vazio' }]} onChange={(v) => setTweak('appState', v)} />
        <TweakSection label="Visual" />
        <TweakColor label="Accent" value={t.accent} options={['#58a6ff', '#3fb950', '#bc8cff', '#f778ba']} onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script>
</body>
</html>`;
}
