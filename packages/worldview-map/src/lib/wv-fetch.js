// lib/wv-fetch.js — single egress: rate cap, daily quota, in-memory cache, health.
window.WV = window.WV || {};

(function () {
  var BUCKETS = {};
  var CACHE = {};
  var IN_FLIGHT = {};
  // Build rewrites '/proxy/<src>/' to '/api/ext-proxy/com.concord.worldview-map/<src>/' at packaging.
  var PROXY_BASE = '/proxy';
  var DEFAULT_CACHE_TTL_MS = 5000;

  function now() { return Date.now(); }

  function bucket(src) {
    if (!BUCKETS[src]) {
      var rate = (WV.sources[src] || {}).rate_per_sec || 1;
      BUCKETS[src] = { capacity: rate * 5, tokens: rate * 5, refill_per_sec: rate, last: now() };
    }
    var b = BUCKETS[src];
    var dt = (now() - b.last) / 1000;
    b.tokens = Math.min(b.capacity, b.tokens + dt * b.refill_per_sec);
    b.last = now();
    return b;
  }

  function take(src) {
    var b = bucket(src);
    if (b.tokens >= 1) { b.tokens -= 1; return true; }
    return false;
  }

  function quotaOk(src) {
    var s = WV.sourceState[src];
    var def = WV.sources[src];
    if (!def || def.daily_cap == null) return true;
    if (now() - s.daily_reset_ts > 86400000) { s.daily_count = 0; s.daily_reset_ts = now(); }
    return s.daily_count < def.daily_cap * 0.80;
  }

  function record(src, ok, latency, err) {
    var s = WV.sourceState[src];
    if (!s) return;
    if (ok) {
      s.last_success_ts = now();
      s.latency_ms = latency;
      s.last_error = null;
      s.daily_count = (s.daily_count || 0) + 1;
    } else {
      s.last_error = String(err || 'error');
      s.latency_ms = latency;
    }
  }

  WV.fetch = function (sourceId, urlOrPath, opts) {
    opts = opts || {};
    var def = WV.sources[sourceId];
    if (!def) return Promise.reject(new Error('unknown source: ' + sourceId));

    if (!quotaOk(sourceId)) { var e1 = new Error('daily quota reached'); record(sourceId, false, 0, e1); return Promise.reject(e1); }
    if (!take(sourceId))    { var e2 = new Error('rate-limited');         record(sourceId, false, 0, e2); return Promise.reject(e2); }

    var url = def.proxy_path
      ? PROXY_BASE + def.proxy_path + (String(urlOrPath || '').startsWith('/') ? urlOrPath : '/' + (urlOrPath || ''))
      : (urlOrPath || def.direct_url);

    var ttl = (opts.cache_ttl_ms != null) ? opts.cache_ttl_ms : DEFAULT_CACHE_TTL_MS;
    if (ttl > 0 && CACHE[url] && (now() - CACHE[url].ts) < ttl) {
      record(sourceId, true, 0, null);
      return Promise.resolve(CACHE[url].body);
    }
    if (IN_FLIGHT[url]) return IN_FLIGHT[url];

    var headers = opts.headers || {};
    if (def.user_agent && !headers['User-Agent']) headers['User-Agent'] = def.user_agent;

    var t0 = now();
    var p = fetch(url, { headers: headers, signal: opts.signal })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
        return opts.as === 'text' ? r.text() : r.json();
      })
      .then(function (body) {
        record(sourceId, true, now() - t0, null);
        if (ttl > 0) CACHE[url] = { ts: now(), body: body };
        delete IN_FLIGHT[url];
        return body;
      })
      .catch(function (err) {
        record(sourceId, false, now() - t0, err);
        delete IN_FLIGHT[url];
        throw err;
      });
    IN_FLIGHT[url] = p;
    return p;
  };

  // Health probe — does NOT consume daily quota or rate budget.
  WV.ping = function (sourceId) {
    var def = WV.sources[sourceId];
    if (!def) return Promise.resolve(false);
    var url = def.proxy_path ? PROXY_BASE + '/__healthz/' + sourceId : def.direct_url;
    if (!url) return Promise.resolve(false);
    var t0 = now();
    return fetch(url, { method: 'HEAD' })
      .then(function (r) { record(sourceId, r.ok, now() - t0, r.ok ? null : 'HTTP ' + r.status); return r.ok; })
      .catch(function (e) { record(sourceId, false, now() - t0, e); return false; });
  };
})();
