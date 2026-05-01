// ui/budget-guard.js — non-blocking toast at 80% of any source's daily cap
window.WV = window.WV || {};

WV.BudgetGuard = (function () {
  var WARNED = {};
  var TOAST_ID = 'wv-toast-host';

  function ensureHost() {
    var host = document.getElementById(TOAST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = TOAST_ID;
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(msg) {
    var host = ensureHost();
    var t = document.createElement('div');
    t.className = 'wv-toast';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 8000);
  }

  function check() {
    Object.keys(WV.sources).forEach(function (src) {
      var def = WV.sources[src];
      var s = WV.sourceState[src];
      if (!def.daily_cap || !s) return;
      var pct = s.daily_count / def.daily_cap;
      if (pct >= 0.80 && !WARNED[src]) {
        toast('⚠ ' + def.label + ' at ' + Math.round(pct * 100) + '% of daily cap (' + s.daily_count + '/' + def.daily_cap + '). Refresh cadence will halve.');
        WARNED[src] = true;
        if (def.refresh_ms) def.refresh_ms = def.refresh_ms * 2;
      }
    });
  }

  function init() { setInterval(check, 30000); }

  return { init: init, check: check, toast: toast };
}());
