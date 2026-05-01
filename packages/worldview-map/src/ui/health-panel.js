// ui/health-panel.js — bottom-bar widget, status per registered source.
// All DOM via createElement + textContent — no innerHTML assignments.
window.WV = window.WV || {};

WV.HealthPanel = (function () {
  var ROOT_ID = 'wv-health';
  var POLL_MS = 60000;
  var root = null;

  function statusOf(src) {
    var def = WV.sources[src];
    var s = WV.sourceState[src];
    if (!s || !def) return 'unknown';
    if (s.last_error) {
      if (/401|403|unauthor/i.test(s.last_error)) return 'auth-fail';
      return 'red';
    }
    if (def.daily_cap && s.daily_count >= def.daily_cap * 0.80) return 'amber';
    if (s.latency_ms != null && s.latency_ms > 2000) return 'amber';
    if (def.refresh_ms && (Date.now() - s.last_success_ts) > def.refresh_ms * 3) return 'amber';
    if (!s.last_success_ts) return 'amber';
    return 'green';
  }

  function ageStr(ts) {
    if (!ts) return '—';
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    return Math.floor(sec / 3600) + 'h ago';
  }

  function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function makeRow(src) {
    var def = WV.sources[src];
    var s = WV.sourceState[src];
    var st = statusOf(src);

    var row = document.createElement('div');
    row.className = 'health-row';
    row.dataset.src = src;
    row.dataset.status = st;

    var dot = document.createElement('span');
    dot.className = 'dot dot-' + st;
    row.appendChild(dot);

    var lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = def.label;
    row.appendChild(lab);

    var age = document.createElement('span');
    age.className = 'age';
    age.textContent = ageStr(s.last_success_ts);
    row.appendChild(age);

    var lat = document.createElement('span');
    lat.className = 'lat';
    lat.textContent = (s.latency_ms != null) ? Math.round(s.latency_ms) + 'ms' : '—';
    row.appendChild(lat);

    row.addEventListener('click', function () { showDetails(src); });
    return row;
  }

  function render() {
    if (!root) return;
    clearChildren(root);
    var holder = document.createElement('div');
    holder.className = 'health-rows';
    Object.keys(WV.sources).forEach(function (src) { holder.appendChild(makeRow(src)); });
    root.appendChild(holder);
  }

  function showDetails(src) {
    var def = WV.sources[src];
    var s = WV.sourceState[src];
    var lines = [
      def.label,
      '',
      'URL: ' + (def.direct_url || (def.proxy_path ? 'proxy: ' + def.proxy_path : '—')),
      'Last success: ' + (s.last_success_ts ? new Date(s.last_success_ts).toISOString() : 'never'),
      'Last error: ' + (s.last_error || 'none'),
      'Latency: ' + (s.latency_ms != null ? Math.round(s.latency_ms) + ' ms' : '—'),
      'Daily count: ' + (s.daily_count || 0) + (def.daily_cap ? ' / ' + def.daily_cap : '')
    ];
    alert(lines.join('\n'));
  }

  function init() {
    root = document.getElementById(ROOT_ID);
    if (!root) { console.warn('[health-panel] missing #' + ROOT_ID); return; }
    render();
    setInterval(render, 5000);
    setInterval(function () {
      Object.keys(WV.sources).forEach(function (src) {
        if (WV.sources[src].transport === 'cesium-tileset') return;
        if (WV.sources[src].transport === 'websocket') return;
        if (WV.ping) WV.ping(src);
      });
    }, POLL_MS);
  }

  return { init: init, render: render };
}());
