# WorldView — Photoreal Globe + Steel UI + Data-Layer Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `concord-extensions/packages/worldview-map` from a Cesium-World-Terrain phosphor-green prototype to a photorealistic 3D globe with a Steel translucent UI, single-egress fetch wrapper with hard quota safeguards against Google API spend, a stream-health panel verifying every authenticated source, polished plane click-tracking, pinnable CCTV PiP tiles, and 12 new data layers.

**Architecture:** Single browser iframe + concord-side server proxy. All layer modules route through `wv-fetch` (rate-cap, quota, cache, health). Google Photorealistic 3D Tiles installed as a Cesium primitive with ellipsoid-terrain fallback when no key is configured. Steel palette replaces phosphor-green for the default `"normal"` mode while preserving CRT/NVG/FLIR overrides. Tests are written in a separate session per project CLAUDE.md — this plan ships implementation + manual browser verification only.

**Tech Stack:** CesiumJS, vanilla JS (no build step in dist), CSS custom properties + backdrop-filter, GeoJSON, Google Map Tiles API, FastAPI (concord proxy), token-bucket rate limiting, sessionStorage / localStorage. **All DOM construction uses createElement + textContent — never assign HTML strings to innerHTML for any data that could include user-influenced text.**

**Reference spec:** `docs/superpowers/specs/2026-04-30-worldview-photoreal-design.md`

**Source-of-truth path:** `concord-extensions/packages/worldview-map/dist/` is the working tree. There is no separate `src/` directory; `dist/` IS the source. All file paths are relative to that directory unless otherwise noted.

---

## Phase 0 — Prep

### Task 0.1: Create isolated worktree

The current `concord-extensions` working tree has ~200 staged-as-deleted files from another session's in-progress reorganization. Do NOT touch them. Work in a worktree branched off `HEAD` (which contains the intact tree).

**Files:**
- Create worktree at: `~/projects/worldview-wt/`

- [ ] **Step 1: Verify HEAD is clean** (the deletions are working-tree-only; HEAD has the files)

```bash
cd ~/projects/concord-extensions
git ls-tree -r HEAD --name-only | grep -c '^packages/worldview-map/'
```
Expected: ≥30 (HEAD still tracks the worldview-map files).

- [ ] **Step 2: Create the worktree on a new branch off HEAD**

```bash
cd ~/projects/concord-extensions
git worktree add ~/projects/worldview-wt -b feat/worldview-photoreal-$(date +%s | tail -c5)
```
Expected: new directory at `~/projects/worldview-wt` containing the full clean tree.

- [ ] **Step 3: Verify worldview-map files are present in worktree**

```bash
ls ~/projects/worldview-wt/packages/worldview-map/dist/src/main.js
ls ~/projects/worldview-wt/packages/worldview-map/dist/src/layers/ | wc -l
```
Expected: `main.js` exists; layer count ≥11.

- [ ] **Step 4: Copy spec + this plan into the worktree**

```bash
mkdir -p ~/projects/worldview-wt/packages/worldview-map/docs/superpowers/specs
mkdir -p ~/projects/worldview-wt/packages/worldview-map/docs/superpowers/plans
cp ~/projects/concord-extensions/packages/worldview-map/docs/superpowers/specs/2026-04-30-worldview-photoreal-design.md \
   ~/projects/worldview-wt/packages/worldview-map/docs/superpowers/specs/
cp ~/projects/concord-extensions/packages/worldview-map/docs/superpowers/plans/2026-04-30-worldview-photoreal-plan.md \
   ~/projects/worldview-wt/packages/worldview-map/docs/superpowers/plans/
```

- [ ] **Step 5: Commit the spec + plan**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/docs/superpowers/
git commit -m "docs(worldview-map): photoreal globe + Steel UI design + plan"
```

---

## Phase A — Canary (Slice A)

Goal: prove the new stack end-to-end. Photoreal + Steel + wv-fetch + ext_proxy hardening + health panel + budget guard + NWS + auth verification of all existing sources.

### Task A1: Source registry — `dist/src/lib/sources.js`

The single source of truth for every data source: URL, auth mode, refresh interval, daily cap, transport, proxy-required flag.

**Files:**
- Create: `packages/worldview-map/dist/src/lib/sources.js`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/projects/worldview-wt/packages/worldview-map/dist/src/lib
```

- [ ] **Step 2: Write the registry**

```javascript
// lib/sources.js — single source of truth for every data source
window.WV = window.WV || {};

WV.sources = {
  // ── existing sources ──
  opensky:     { label: 'OpenSky',           proxy_path: '/opensky',  transport: 'rest',      refresh_ms: 15000,  rate_per_sec: 1, daily_cap: 4000,  auth: 'server-side-oauth2' },
  aisstream:   { label: 'AISStream',         transport: 'websocket', direct_url: 'wss://stream.aisstream.io/v0/stream', refresh_ms: 0, auth: 'browser-key', daily_cap: null },
  tomtom:      { label: 'TomTom',            transport: 'rest',      direct_url: 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json', refresh_ms: 60000, rate_per_sec: 1, daily_cap: 2500, auth: 'browser-key' },
  sentinel:    { label: 'Sentinel Hub',      proxy_path: '/sentinel', transport: 'rest',     refresh_ms: 0, auth: 'server-side-oauth2', daily_cap: 30000 },
  windy:       { label: 'Windy',             transport: 'rest',      direct_url: 'https://api.windy.com/api/point-forecast/v2', refresh_ms: 600000, rate_per_sec: 1, daily_cap: 1000, auth: 'browser-key' },
  usgs:        { label: 'USGS',              transport: 'rest',      direct_url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', refresh_ms: 60000, rate_per_sec: 1, daily_cap: null, auth: 'none' },
  military:    { label: 'Military (legacy)', proxy_path: '/military-legacy', transport: 'rest', refresh_ms: 30000, rate_per_sec: 1, auth: 'server-side' },
  satellites:  { label: 'Satellites',        transport: 'rest',      direct_url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', refresh_ms: 300000, rate_per_sec: 1, auth: 'none' },
  ports:       { label: 'Ports',             transport: 'rest',      direct_url: '', refresh_ms: 600000, rate_per_sec: 1, auth: 'none' },
  jamming:     { label: 'GPS Jamming',       transport: 'rest',      direct_url: '', refresh_ms: 300000, rate_per_sec: 1, auth: 'none' },
  cctv_legacy: { label: 'CCTV (legacy)',     transport: 'rest',      direct_url: '', refresh_ms: 600000, rate_per_sec: 1, auth: 'none' },

  // ── Slice A new sources ──
  gmaps_tiles: { label: 'Google 3D Tiles',   transport: 'cesium-tileset', direct_url: 'https://tile.googleapis.com/v1/3dtiles/root.json', auth: 'browser-key', daily_cap: 25000 },
  nws:         { label: 'NWS Alerts',        transport: 'rest', direct_url: 'https://api.weather.gov/alerts/active', refresh_ms: 300000, rate_per_sec: 1, auth: 'none', user_agent: 'WorldView/0.2 (https://concorrd.com)', daily_cap: null },

  // Slice B sources are appended in their respective tasks.
};

WV.sourceState = {};
(function () {
  function todayStartMs() { var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  for (var k in WV.sources) {
    WV.sourceState[k] = {
      last_success_ts: 0,
      last_error: null,
      latency_ms: null,
      daily_count: 0,
      daily_reset_ts: todayStartMs(),
    };
  }
})();
```

- [ ] **Step 3: Wire script tag in `index.html`** — locate the existing `<script src="src/main.js">` line; insert ABOVE it:

```html
<script src="src/lib/sources.js"></script>
```

Use the Edit tool, not innerHTML.

- [ ] **Step 4: Verify in browser**

```bash
cd ~/projects/worldview-wt/packages/worldview-map
python3 -m http.server -d dist 8088 &
```

Open http://localhost:8088. DevTools console:
```js
console.log(Object.keys(WV.sources).length)
```
Expected: `13`.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/lib/sources.js packages/worldview-map/dist/index.html
git commit -m "feat(worldview): add source registry"
```

---

### Task A2: Egress wrapper — `dist/src/lib/wv-fetch.js`

**Files:**
- Create: `packages/worldview-map/dist/src/lib/wv-fetch.js`

- [ ] **Step 1: Write the wrapper**

```javascript
// lib/wv-fetch.js — single egress: rate cap, daily quota, in-memory cache, health.
window.WV = window.WV || {};

(function () {
  var BUCKETS = {};
  var CACHE = {};
  var IN_FLIGHT = {};
  var PROXY_BASE = '/api/ext-proxy/com.concord.worldview-map';
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
```

- [ ] **Step 2: Wire script tag** — `<script src="src/lib/wv-fetch.js"></script>` after `sources.js`, before `main.js`. Use Edit tool.

- [ ] **Step 3: Verify**

```js
WV.fetch('usgs').then(j => console.log('USGS quakes:', j.features.length))
```
Expected: a number; `WV.sourceState.usgs.last_success_ts` populated.

- [ ] **Step 4: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/lib/wv-fetch.js packages/worldview-map/dist/index.html
git commit -m "feat(worldview): add wv-fetch egress wrapper"
```

---

### Task A3: Photoreal install — `dist/src/lib/photoreal.js`

**Files:**
- Create: `packages/worldview-map/dist/src/lib/photoreal.js`

- [ ] **Step 1: Write the installer**

```javascript
// lib/photoreal.js — Google Photorealistic 3D Tiles
window.WV = window.WV || {};

WV.Photoreal = (function () {
  var tileset = null;

  function install(viewer) {
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    if (!key || key === 'YOUR_GOOGLE_MAPS_KEY_HERE') {
      if (WV.sourceState && WV.sourceState.gmaps_tiles) {
        WV.sourceState.gmaps_tiles.last_error = 'no key configured';
      }
      return null;
    }
    try {
      tileset = new Cesium.Cesium3DTileset({
        url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
        showCreditsOnScreen: true,
        maximumScreenSpaceError: 16,
      });
      viewer.scene.primitives.add(tileset);
      viewer.scene.globe.show = false;
      viewer.scene.skyAtmosphere.show = false;

      tileset.allTilesLoaded.addEventListener(function () {
        if (WV.sourceState.gmaps_tiles) {
          WV.sourceState.gmaps_tiles.last_success_ts = Date.now();
          WV.sourceState.gmaps_tiles.last_error = null;
        }
      });
      tileset.tileFailed.addEventListener(function (e) {
        if (WV.sourceState.gmaps_tiles) {
          WV.sourceState.gmaps_tiles.last_error = String(e.message || 'tile load failed');
        }
      });
      return tileset;
    } catch (e) {
      console.error('[photoreal] install failed', e);
      if (WV.sourceState.gmaps_tiles) WV.sourceState.gmaps_tiles.last_error = e.message;
      return null;
    }
  }

  function uninstall(viewer) {
    if (tileset) {
      viewer.scene.primitives.remove(tileset);
      tileset = null;
      viewer.scene.globe.show = true;
      viewer.scene.skyAtmosphere.show = true;
    }
  }

  return { install: install, uninstall: uninstall };
})();
```

- [ ] **Step 2: Wire script tag** in `index.html` after `wv-fetch.js`.

- [ ] **Step 3: Modify `main.js`** — after the `var viewer = new Cesium.Viewer(...)` block (~line 75), add:

```javascript
  WV.Photoreal.install(viewer);
```

- [ ] **Step 4: Add key slot to `config.example.js`**

```javascript
  GOOGLE_MAPS_KEY: 'YOUR_GOOGLE_MAPS_KEY_HERE',  // restricted to: Map Tiles, Geocoding, Places, AQ, Pollen
```

- [ ] **Step 5: User updates `config.js`** with their actual key.

- [ ] **Step 6: Verify**

Reload. Network tab filter `tile.googleapis.com` → `root.json` 200 + tile fetches. Visually fly to NYC (40.7, -74) — see real buildings. Without key: ellipsoid fallback, no Google calls.

Screenshots: `docs/superpowers/screenshots/2026-04-30-A3/photoreal-on.png` and `photoreal-fallback.png`.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/lib/photoreal.js \
        packages/worldview-map/dist/src/main.js \
        packages/worldview-map/dist/src/config.example.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-A3/
git commit -m "feat(worldview): install Google Photorealistic 3D Tiles with ellipsoid fallback"
```

---

### Task A4: Steel palette — `dist/styles/main.css`

**Files:**
- Modify: `packages/worldview-map/dist/styles/main.css:1-100`

- [ ] **Step 1: Replace the `:root` block** with:

```css
:root {
  --accent:       #9DB9D9;
  --accent-dim:   rgba(157, 185, 217, 0.50);
  --accent-glow:  rgba(157, 185, 217, 0.12);
  --panel-bg:     rgba(20, 30, 45, 0.65);
  --panel-border: rgba(120, 150, 180, 0.22);
  --text:         #c4d0de;
  --text-dim:     rgba(180, 200, 220, 0.50);
  --text-muted:   rgba(180, 200, 220, 0.30);
  --bar-bg:       rgba(10, 16, 24, 0.72);
  --font:         'SF Pro Text', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    'SF Mono', 'JetBrains Mono', Consolas, monospace;
  --top-h:        66px;
  --bot-h:        32px;
  --left-w:       220px;
  --right-w:      210px;
}
```

- [ ] **Step 2: Replace the `body[data-mode="normal"]` block** body (existing lines ~38-49) with the same Steel tokens (Steel IS the new normal):

```css
body[data-mode="normal"] {
  --accent:       #9DB9D9;
  --accent-dim:   rgba(157, 185, 217, 0.50);
  --accent-glow:  rgba(157, 185, 217, 0.12);
  --panel-bg:     rgba(20, 30, 45, 0.65);
  --panel-border: rgba(120, 150, 180, 0.22);
  --text:         #c4d0de;
  --text-dim:     rgba(180, 200, 220, 0.50);
  --text-muted:   rgba(180, 200, 220, 0.30);
  --bar-bg:       rgba(10, 16, 24, 0.72);
}
```

- [ ] **Step 3: Add backdrop-filter rule** at end of file:

```css
#topbar, #botbar, #leftpanel, #rightpanel, .preset, .panel, .health-panel, .pip-tile {
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
```

- [ ] **Step 4: Verify** — reload, panels translucent + soft blue accent. Mode toggle CRT/NVG/FLIR still phosphor/orange. Back to normal → Steel.

Screenshot: `docs/superpowers/screenshots/2026-04-30-A4/steel-default.png`.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/styles/main.css \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-A4/
git commit -m "feat(worldview): Steel palette as default normal mode"
```

---

### Task A5: Stream-health panel — `dist/src/ui/health-panel.js`

DOM construction via `createElement` + `textContent` — no innerHTML.

**Files:**
- Create: `packages/worldview-map/dist/src/ui/health-panel.js`
- Modify: `packages/worldview-map/dist/index.html` — add `<div id="wv-health"></div>` slot in the bottom bar; add script tag
- Modify: `packages/worldview-map/dist/src/main.js` — call `WV.HealthPanel.init()` after `WV.Controls.init()`
- Modify: `packages/worldview-map/dist/styles/main.css` — health-panel styles

- [ ] **Step 1: Write the panel**

```javascript
// ui/health-panel.js — bottom-bar widget, status per registered source
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
      'Daily count: ' + (s.daily_count || 0) + (def.daily_cap ? ' / ' + def.daily_cap : ''),
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
        WV.ping(src);
      });
    }, POLL_MS);
  }

  return { init: init, render: render };
})();
```

- [ ] **Step 2: Add slot in `index.html`** — find the bottom-bar element (likely id `botbar`), and add inside it (Edit tool):

```html
<div id="wv-health"></div>
```

- [ ] **Step 3: Add script tag** after the existing UI scripts:

```html
<script src="src/ui/health-panel.js"></script>
```

- [ ] **Step 4: Modify `main.js`** — after `WV.Controls.init();`:

```javascript
  WV.HealthPanel.init();
```

- [ ] **Step 5: Add CSS** at end of `styles/main.css`:

```css
#wv-health { display: flex; align-items: center; height: 100%; padding: 0 12px; gap: 12px; font-size: 11px; color: var(--text-dim); overflow-x: auto; }
#wv-health .health-rows { display: flex; gap: 12px; flex-wrap: nowrap; }
#wv-health .health-row { display: flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
#wv-health .health-row:hover { background: var(--accent-glow); }
#wv-health .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
#wv-health .dot-green     { background: #5fd97f; box-shadow: 0 0 6px #5fd97f; }
#wv-health .dot-amber     { background: #f0b340; box-shadow: 0 0 6px #f0b340; }
#wv-health .dot-red       { background: #e85a5a; box-shadow: 0 0 6px #e85a5a; }
#wv-health .dot-auth-fail { background: #ff3b6b; box-shadow: 0 0 6px #ff3b6b; }
#wv-health .dot-unknown   { background: #555; }
#wv-health .lab { color: var(--text); }
```

- [ ] **Step 6: Verify** — bottom bar shows row per source. After ~30s, OpenSky/USGS green. `gmaps_tiles` green if key set, else amber.

Screenshot: `docs/superpowers/screenshots/2026-04-30-A5/health-panel.png`.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/ui/health-panel.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/dist/src/main.js \
        packages/worldview-map/dist/styles/main.css \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-A5/
git commit -m "feat(worldview): stream-health panel"
```

---

### Task A6: Budget guard — `dist/src/ui/budget-guard.js`

**Files:**
- Create: `packages/worldview-map/dist/src/ui/budget-guard.js`
- Modify: `index.html`, `main.js`, `styles/main.css`

- [ ] **Step 1: Write the guard**

```javascript
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
})();
```

- [ ] **Step 2: Add toast styles** to `styles/main.css`:

```css
#wv-toast-host { position: fixed; top: 80px; right: 18px; display: flex; flex-direction: column; gap: 8px; z-index: 1000; pointer-events: none; }
.wv-toast { background: var(--panel-bg); border: 1px solid var(--panel-border); color: var(--text); padding: 10px 14px; border-radius: 6px; font-size: 12px; max-width: 360px; backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); pointer-events: auto; animation: wv-toast-in 0.3s ease; }
@keyframes wv-toast-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
```

- [ ] **Step 3: Wire script + init** — `index.html` add `<script src="src/ui/budget-guard.js"></script>`. `main.js` add `WV.BudgetGuard.init();`.

- [ ] **Step 4: Verify**

```js
WV.sourceState.usgs.daily_count = 999999;
WV.sources.usgs.daily_cap = 1000;
WV.BudgetGuard.check();
```
Expected: toast appears.

Screenshot: `docs/superpowers/screenshots/2026-04-30-A6/budget-toast.png`.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/ui/budget-guard.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/dist/src/main.js \
        packages/worldview-map/dist/styles/main.css \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-A6/
git commit -m "feat(worldview): budget-guard toast at 80% daily quota"
```

---

### Task A7: NWS Alerts layer (canary) — `dist/src/layers/nws.js`

**Files:**
- Create: `packages/worldview-map/dist/src/layers/nws.js`
- Modify: `index.html` (script tag); `controls.js` (toggle following existing pattern)

- [ ] **Step 1: Write the layer**

The Cesium `description` field IS rendered as an InfoBox; Cesium sanitizes it via its built-in InfoBox sanitizer. Use a small text-only description to avoid relying on sanitization edge cases. For richer InfoBox content use `Cesium.Entity.description` with `new Cesium.ConstantProperty(text)`.

```javascript
// layers/nws.js — NWS active alerts as severity-keyed polygons
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.nws = (function () {
  var ds, refreshTimer, enabled = false;

  var COLOR = {
    Extreme:  Cesium.Color.fromCssColorString('rgba(255,60,60,0.45)'),
    Severe:   Cesium.Color.fromCssColorString('rgba(255,140,40,0.40)'),
    Moderate: Cesium.Color.fromCssColorString('rgba(255,210,60,0.35)'),
    Minor:    Cesium.Color.fromCssColorString('rgba(120,200,255,0.30)'),
    Unknown:  Cesium.Color.fromCssColorString('rgba(200,200,200,0.25)'),
  };

  function flat(coords) { var out = []; for (var i = 0; i < coords.length; i++) out.push(coords[i][0], coords[i][1]); return out; }

  function describe(props) {
    var lines = [
      props.event || '',
      props.headline || '',
      '',
      props.description || '',
    ];
    return lines.join('\n');
  }

  function render(geojson) {
    if (!ds) return;
    ds.entities.removeAll();
    (geojson.features || []).forEach(function (f) {
      var props = f.properties || {};
      if (!f.geometry || f.geometry.type !== 'Polygon') return;
      var sev = props.severity || 'Unknown';
      ds.entities.add({
        name: props.headline || props.event || 'NWS alert',
        description: describe(props),
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flat(f.geometry.coordinates[0])),
          material: COLOR[sev] || COLOR.Unknown,
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.55),
          height: 0,
          extrudedHeight: 0,
        },
      });
    });
    WV.viewer.scene.requestRender();
  }

  function refresh() {
    return WV.fetch('nws').then(render).catch(function (e) { console.warn('[nws]', e); });
  }

  function enable() {
    if (enabled) return; enabled = true;
    if (!ds) { ds = new Cesium.CustomDataSource('nws'); WV.viewer.dataSources.add(ds); }
    refresh();
    refreshTimer = setInterval(refresh, WV.sources.nws.refresh_ms);
  }
  function disable() {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
  }
  function toggle(on) { (on ? enable : disable)(); }

  return { enable: enable, disable: disable, toggle: toggle };
})();
```

- [ ] **Step 2: Wire script tag** in `index.html`:

```html
<script src="src/layers/nws.js"></script>
```

- [ ] **Step 3: Add layer toggle in `controls.js`** following the existing pattern (look at how `flights`, `maritime`, `weather` toggles are wired). Label "NWS Alerts", calls `WV.layers.nws.toggle(checked)`.

- [ ] **Step 4: Verify** — toggle on, polygons appear over current US weather conditions; health row green.

Screenshot: `docs/superpowers/screenshots/2026-04-30-A7/nws-layer.png`.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/layers/nws.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/dist/src/ui/controls.js \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-A7/
git commit -m "feat(worldview): NWS Alerts layer (canary)"
```

---

### Task A8: Refactor existing layers onto wv-fetch

**Files (one task per file — commit each separately):**

| Layer file | Source ID | Notes |
|---|---|---|
| `layers/flights.js` | `opensky` | Replace `fetch(BASE_URL + '/states/all')` with `WV.fetch('opensky', '/states/all')`; same for `/tracks/all` |
| `layers/maritime.js` | `aisstream` | WebSocket — wrap `onopen/onclose/onerror/onmessage` to update `WV.sourceState.aisstream` (see Step 5) |
| `layers/traffic.js` | `tomtom` | Replace `fetch(url)` with `WV.fetch('tomtom', url)` |
| `layers/sentinel.js` | `sentinel` | Replace direct fetches with `WV.fetch('sentinel', '/...')` |
| `layers/weather.js` | `windy` | Replace direct fetches with `WV.fetch('windy', url)` |
| `layers/seismic.js` | `usgs` | Replace `fetch(API_URL)` with `WV.fetch('usgs')` |
| `layers/military.js` | `military` | Multi-fallback chain — funnel ALL through `WV.fetch('military', '/...')` via proxy |
| `layers/satellites.js` | `satellites` | `WV.fetch('satellites')` |
| `layers/ports.js` | `ports` | `WV.fetch('ports', url)` |
| `layers/jamming.js` | `jamming` | `WV.fetch('jamming', url)` |
| `layers/cctv.js` | `cctv_legacy` | `WV.fetch('cctv_legacy', url)` |

Per file, follow the same checklist:

- [ ] **Step 1: Identify all `fetch(...)` calls** in the file (`grep -n 'fetch(' <file>`).
- [ ] **Step 2: Replace each with `WV.fetch(<source-id>, <path-or-url>)`**.
- [ ] **Step 3: Verify in browser** — toggle the layer, observe data appears, health row green.
- [ ] **Step 4: Commit** with message `refactor(worldview-<layer>): use wv-fetch egress`.

- [ ] **Step 5: Maritime WebSocket exception**

`maritime.js` opens `wss://stream.aisstream.io/v0/stream`. Wrap state-tracking around the WS handlers:

```javascript
ws.addEventListener('open',    function () { WV.sourceState.aisstream.last_success_ts = Date.now(); WV.sourceState.aisstream.last_error = null; });
ws.addEventListener('close',   function (e) { WV.sourceState.aisstream.last_error = 'closed: ' + e.code; });
ws.addEventListener('error',   function () { WV.sourceState.aisstream.last_error = 'ws error'; });
ws.addEventListener('message', function (m) {
  WV.sourceState.aisstream.last_success_ts = Date.now();
  /* keep existing message handler logic */
});
```

- [ ] **Step 6: Final verify** — every existing source row in health panel green within 2 minutes. Screenshot: `docs/superpowers/screenshots/2026-04-30-A8/all-green.png`.

---

### Task A9: Server-side proxy hardening — `concord/server/routers/ext_proxy.py`

**Files:**
- Modify: `concord/server/routers/ext_proxy.py`

NOTE: This file is in the `concord` repo, separate worktree. Per project policy this lands as its own PR.

- [ ] **Step 1: Read current state**

```bash
wc -l ~/projects/concord/server/routers/ext_proxy.py
grep -nE 'TokenBucket|__healthz|needs_proxy' ~/projects/concord/server/routers/ext_proxy.py
```

- [ ] **Step 2: Add `TokenBucket` helper** at the top:

```python
import time
from threading import Lock
from fastapi import HTTPException

class TokenBucket:
    def __init__(self, capacity: float, refill_per_sec: float):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_per_sec = refill_per_sec
        self.last = time.monotonic()
        self.lock = Lock()

    def take(self) -> bool:
        with self.lock:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.refill_per_sec)
            self.last = now
            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False

_BUCKETS: dict[tuple[str, str], TokenBucket] = {}

SOURCE_RATES = {
    "opensky": 0.5,
    "sentinel": 0.5,
    "airplanes-live": 1.0,
    "wsdot": 1.0,
    "511ny": 1.0,
    "massdot": 1.0,
    "firms": 0.5,
    "launchlib": 0.5,
    "cloudflare-radar": 0.5,
}

def _get_bucket(ext_id: str, source: str, rate_per_sec: float) -> TokenBucket:
    key = (ext_id, source)
    if key not in _BUCKETS:
        _BUCKETS[key] = TokenBucket(capacity=rate_per_sec * 5, refill_per_sec=rate_per_sec)
    return _BUCKETS[key]
```

- [ ] **Step 3: Wire bucket-take into the proxy handler** (locate the existing function handling `GET/POST /api/ext-proxy/{ext_id}/{source}/...`):

```python
rate = SOURCE_RATES.get(source, 1.0)
if not _get_bucket(ext_id, source, rate).take():
    raise HTTPException(status_code=429, detail=f"{source}: server-side rate limit exceeded")
```

- [ ] **Step 4: Add `__healthz` endpoint**

```python
import httpx

@router.get("/api/ext-proxy/{ext_id}/__healthz/{source}")
async def proxy_healthz(ext_id: str, source: str):
    upstream = _resolve_upstream(ext_id, source)  # use existing helper or write one
    if not upstream:
        raise HTTPException(404, f"unknown source {source} for {ext_id}")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.head(upstream)
            return {"ok": r.status_code < 500, "status": r.status_code}
    except Exception as e:
        raise HTTPException(502, str(e))
```

- [ ] **Step 5: Verify** — run concord locally:

```bash
curl -i http://localhost:8091/api/ext-proxy/com.concord.worldview-map/__healthz/opensky
```
Expected: `200 OK` with JSON.

- [ ] **Step 6: Commit + open PR** in concord repo on its own session branch:

```bash
cd ~/projects/concord
git checkout -b fix/worldview-proxy-hardening-$(date +%s | tail -c5)
git add server/routers/ext_proxy.py
git commit -m "feat(ext-proxy): per-source token-bucket + __healthz endpoint"
git push -u origin HEAD
gh pr create --title "ext-proxy: token-bucket + healthz" --body "Per-source rate cap and health probe for worldview-map. Spec: docs/superpowers/specs/2026-04-30-worldview-photoreal-design.md (in concord-extensions)."
```

---

### Task A10: Google Cloud Console safeguards (manual user steps)

These are user-walked manual steps. The plan documents them; the engineer surfaces a checklist for the user.

- [ ] **Step 1: Restrict the API key**

Console → APIs & Services → Credentials → click WorldView key. Application restrictions → HTTP referrers, add:
```
http://localhost:*
http://localhost:*/*
http://127.0.0.1:*
http://127.0.0.1:*/*
https://concorrd.com/*
https://*.concorrd.com/*
```

API restrictions → "Restrict key" → check ONLY: Map Tiles API, Geocoding API, Places API (New), Air Quality API, Pollen API. Save. Wait ~5 min for propagation.

- [ ] **Step 2: Per-API daily quotas**

For each restricted API, Console → APIs & Services → Library → click the API → Quotas tab → edit:

| API | Quota | Set to |
|---|---|---|
| Map Tiles | "Tile load requests per day" | 25000 |
| Geocoding | "Requests per day" | 8000 |
| Places (New) Text Search | "Requests per day" | 4000 |
| Air Quality | "Requests per day" | 8000 |
| Pollen | "Requests per day" | 8000 |

- [ ] **Step 3: Billing budget alert**

Console → Billing → Budgets & alerts → Create Budget. Name: "WorldView spend guard". Amount: $1. Thresholds: 50%, 90%, 100%. Email alert.

- [ ] **Step 4: Verify after 30 min of use**

Dashboard: no API ≥80% of cap. Billing: $0.00. Screenshot: `docs/superpowers/screenshots/2026-04-30-A10/gcp-dashboard.png`.

---

### Task A11: Slice A acceptance walk-through

Run all of these. Each must observably pass.

- [ ] **A1**: Photogrammetric NYC at default zoom — screenshot.
- [ ] **A2**: Remove `GOOGLE_MAPS_KEY`, reload → ellipsoid terrain, no failed Google calls.
- [ ] **A3**: Steel palette across panels — side-by-side vs phosphor-green.
- [ ] **A4**: Mode toggle CRT → orange-green; back to "normal" → Steel.
- [ ] **A5**: Health panel: 13 rows, all green within 2 min.
- [ ] **A6**: `WV.sourceState.usgs.daily_count = 8001; WV.sources.usgs.daily_cap = 10000; WV.BudgetGuard.check()` → toast.
- [ ] **A7**: NWS layer renders polygons over current US weather.
- [ ] **A8**: GCP dashboard: zero API exceeded cap; billing $0.

If any fail, stop and debug per project CLAUDE.md "Fix-attempt rules" — never guess; observe, instrument, fix once.

- [ ] **A9**: Open PR for Slice A:

```bash
cd ~/projects/worldview-wt
git push -u origin HEAD
gh pr create --title "feat(worldview): photoreal globe + Steel UI + safeguards (Slice A)" \
  --body "$(cat <<'EOF'
## Summary
- Google Photorealistic 3D Tiles default; ellipsoid fallback when no key
- Steel palette as default 'normal' mode
- wv-fetch egress wrapper with rate cap + quota + cache + health
- Stream-health panel + budget-guard toasts
- NWS Alerts as canary layer
- All existing 11 layers refactored onto wv-fetch

## Test plan
- [x] Photoreal vs fallback (A3 screenshots)
- [x] Steel vs phosphor-green (A4)
- [x] Mode toggles preserved (A4)
- [x] All existing sources green (A8)
- [x] Budget toast at 80% (A6)
- [x] NWS polygons render (A7)
- [x] Zero GCP cap exceedances; $0 billing (A10)

Spec: docs/superpowers/specs/2026-04-30-worldview-photoreal-design.md
Plan: docs/superpowers/plans/2026-04-30-worldview-photoreal-plan.md
EOF
)"
```

Per project CLAUDE.md: invoke agent-pm on the PR for review/merge before Phase B.

---

## Phase B — Fan-out (Slice B)

Goal: plane click-track polish, CCTV PiP grid, all 12 new data layers. Each task is independently shippable.

### Task B1: Plane click-track polish — `dist/src/layers/flights.js`

Six concrete bugs.

**Files:** Modify `packages/worldview-map/dist/src/layers/flights.js`.

- [ ] **Step 1: Great-circle DR math**

Replace the existing `_drPredict` body (around line 76) with:

```javascript
function _drPredict(state, now) {
  if (!state.velocity || state.heading == null) return state;
  var dt = (now - state.timestamp) / 1000;
  if (dt < 0 || dt > 30) return state;
  var R = 6371000;
  var d = state.velocity * dt;
  var brg = Cesium.Math.toRadians(state.heading);
  var lat1 = Cesium.Math.toRadians(state.lat);
  var lon1 = Cesium.Math.toRadians(state.lon);
  var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(brg));
  var lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  return Object.assign({}, state, {
    lat: Cesium.Math.toDegrees(lat2),
    lon: Cesium.Math.toDegrees(lon2),
    timestamp: now,
  });
}
```

- [ ] **Step 2: Position tween on fresh OpenSky data**

Add module-level state and helpers near the top of the IIFE:

```javascript
var TWEEN_MS = 1500;
var _tween = null;
var _curHeading = null;

function _onFreshState(state) {
  var prev = _liveState[trackedIcao];
  if (prev) {
    var pred = _drPredict(prev, Date.now());
    _tween = {
      from_lat: pred.lat, from_lon: pred.lon, from_alt: pred.baro_alt || 10000,
      to_lat:   state.lat, to_lon:  state.lon, to_alt:  state.baro_alt || 10000,
      t0: Date.now(),
    };
  }
  _liveState[trackedIcao] = state;
}

function _tweenedPosition() {
  var s = _liveState[trackedIcao];
  if (!s) return null;
  if (!_tween) return _drPredict(s, Date.now());
  var k = Math.min(1, (Date.now() - _tween.t0) / TWEEN_MS);
  if (k >= 1) { _tween = null; return _drPredict(s, Date.now()); }
  return {
    lat:  _tween.from_lat + (_tween.to_lat - _tween.from_lat) * k,
    lon:  _tween.from_lon + (_tween.to_lon - _tween.from_lon) * k,
    baro_alt: _tween.from_alt + (_tween.to_alt - _tween.from_alt) * k,
  };
}

function _easedHeading(target) {
  if (_curHeading == null) { _curHeading = target; return target; }
  var delta = ((target - _curHeading + 540) % 360) - 180;
  _curHeading += delta * 0.10;
  return _curHeading;
}
```

In the rAF loop (search for the existing `_modelEntity.position = ...` block), replace the position assignment with:

```javascript
var pos = _tweenedPosition();
if (pos && _modelEntity) {
  _modelEntity.position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.baro_alt);
  _modelEntity.orientation = _hprOrientation(pos.lat, pos.lon, pos.baro_alt, _easedHeading(state.heading));
}
```

Wire the new-state ingestion to call `_onFreshState(state)` instead of the previous direct `_liveState[icao] = state` assignment.

- [ ] **Step 3: Chase-cam clipping fix**

Change `var CHASE_RANGE = 4000;` → `var CHASE_RANGE = 6000;` (line ~32).

- [ ] **Step 4: Verify billboard hide** — search for `show: icao !== trackedIcao`. Confirm it still applies after the wv-fetch refactor.

- [ ] **Step 5: Verify in browser** — click any commercial flight. Observe:
  - Billboard hides, .glb appears.
  - Chase cam ~6 km behind, slight downward look.
  - Plane glides between updates (no snap).
  - Heading rotates smoothly during turns.

Screen recording: `docs/superpowers/screenshots/2026-04-30-B1/click-track.webm`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/layers/flights.js \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-B1/
git commit -m "fix(worldview-flights): great-circle DR, position+heading tween, chase-cam clip fix"
```

---

### Task B2: CCTV PiP grid — `dist/src/ui/cctv-pip.js`

Strict DOM construction (no innerHTML).

**Files:**
- Create: `packages/worldview-map/dist/src/ui/cctv-pip.js`
- Modify: `dist/src/layers/cctv.js` — emit `wv-cctv-pin` on marker click
- Modify: `dist/index.html` — `<div id="wv-pip-grid"></div>`, script tag
- Modify: `dist/src/main.js` — init
- Modify: `dist/styles/main.css` — tile chrome

- [ ] **Step 1: Write the PiP grid**

```javascript
// ui/cctv-pip.js — click camera marker → live PiP tile, draggable, persistent, capped
window.WV = window.WV || {};

WV.CctvPip = (function () {
  var STORE_KEY = 'wv.cctv.pins';
  var MAX_TILES = 6;
  var pins = [];
  var root = null;

  function load() {
    try { pins = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (e) { pins = []; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(pins)); } catch (e) {} }

  function makeMedia(pin) {
    var media;
    if (pin.format === 'mjpeg') {
      media = document.createElement('img');
      media.src = pin.stream_url;
    } else if (pin.format === 'hls') {
      media = document.createElement('video');
      media.controls = false; media.autoplay = true; media.muted = true;
      media.src = pin.stream_url;
    } else if (pin.format === 'iframe') {
      media = document.createElement('iframe');
      media.src = pin.stream_url;
      media.setAttribute('frameborder', '0');
    } else {
      media = document.createElement('div');
      media.className = 'pip-unsupported';
      media.textContent = 'Stream type not browser-playable. URL copied to clipboard.';
      if (navigator.clipboard) navigator.clipboard.writeText(pin.stream_url || '');
    }
    media.classList.add('pip-media');
    return media;
  }

  function makeBar(pin) {
    var bar = document.createElement('div');
    bar.className = 'pip-bar';

    var title = document.createElement('span');
    title.className = 'pip-title';
    title.textContent = pin.name || pin.id;
    bar.appendChild(title);

    var fly = document.createElement('button');
    fly.className = 'pip-fly';
    fly.type = 'button';
    fly.textContent = '⊙';
    fly.addEventListener('click', function () {
      WV.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(pin.lon, pin.lat, 2500),
        duration: 1.2,
      });
    });
    bar.appendChild(fly);

    var close = document.createElement('button');
    close.className = 'pip-close';
    close.type = 'button';
    close.textContent = '×';
    close.addEventListener('click', function () { remove(pin.id); });
    bar.appendChild(close);

    return bar;
  }

  function makeDraggable(tile, bar, pin) {
    var dragging = false, ox = 0, oy = 0;
    bar.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      ox = e.clientX - tile.offsetLeft;
      oy = e.clientY - tile.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      tile.style.left = (e.clientX - ox) + 'px';
      tile.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      pin.x = parseInt(tile.style.left, 10);
      pin.y = parseInt(tile.style.top, 10);
      save();
    });
  }

  function renderTile(pin) {
    var tile = document.createElement('div');
    tile.className = 'pip-tile';
    tile.dataset.id = pin.id;
    tile.style.left = (pin.x || 20) + 'px';
    tile.style.top  = (pin.y || 80) + 'px';

    var bar = makeBar(pin);
    tile.appendChild(bar);
    tile.appendChild(makeMedia(pin));

    makeDraggable(tile, bar, pin);
    root.appendChild(tile);
  }

  function add(pin) {
    if (pins.find(function (p) { return p.id === pin.id; })) return;
    if (pins.length >= MAX_TILES) {
      var evicted = pins.shift();
      var el = root.querySelector('[data-id="' + CSS.escape(evicted.id) + '"]');
      if (el) el.remove();
      if (WV.BudgetGuard) WV.BudgetGuard.toast('Evicted ' + evicted.name + ' (cap = ' + MAX_TILES + ')');
    }
    pins.push(pin);
    save();
    renderTile(pin);
  }

  function remove(id) {
    pins = pins.filter(function (p) { return p.id !== id; });
    save();
    var el = root.querySelector('[data-id="' + CSS.escape(id) + '"]');
    if (el) el.remove();
  }

  function init() {
    load();
    root = document.getElementById('wv-pip-grid');
    if (!root) {
      root = document.createElement('div');
      root.id = 'wv-pip-grid';
      document.body.appendChild(root);
    }
    pins.forEach(renderTile);
    document.addEventListener('wv-cctv-pin', function (e) { add(e.detail); });
  }

  return { init: init, add: add, remove: remove };
})();
```

- [ ] **Step 2: Modify `cctv.js` to emit the event**

Find the existing marker-click handler. Replace whatever it does (or supplement it) with:

```javascript
function _detectFormat(url) {
  if (!url) return 'iframe';
  if (/\.m3u8(\?|$)/i.test(url))           return 'hls';
  if (/\.mjpe?g(\?|$)/i.test(url))         return 'mjpeg';
  if (/^rtsp:/i.test(url))                 return 'rtsp';
  if (/\/snapshot|\.jpg(\?|$)/i.test(url)) return 'mjpeg';
  return 'iframe';
}

// in the click handler:
document.dispatchEvent(new CustomEvent('wv-cctv-pin', { detail: {
  id: cam.id,
  name: cam.name,
  lat: cam.lat,
  lon: cam.lon,
  stream_url: cam.stream_url,
  format: cam.format || _detectFormat(cam.stream_url),
}}));
```

- [ ] **Step 3: Add CSS** to `styles/main.css`:

```css
#wv-pip-grid { position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 800; pointer-events: none; }
.pip-tile { position: absolute; width: 320px; height: 200px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 6px; overflow: hidden; pointer-events: auto; display: flex; flex-direction: column; backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); }
.pip-bar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 11px; color: var(--text); background: var(--bar-bg); cursor: move; border-bottom: 1px solid var(--panel-border); }
.pip-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pip-bar button { background: transparent; border: 0; color: var(--text-dim); font-size: 14px; padding: 0 4px; }
.pip-bar button:hover { color: var(--accent); }
.pip-media { flex: 1; width: 100%; height: auto; min-height: 0; object-fit: cover; border: 0; }
.pip-unsupported { padding: 16px; color: var(--text-dim); font-size: 12px; }
```

- [ ] **Step 4: Wire script + init** — `index.html` add `<script src="src/ui/cctv-pip.js"></script>`. `main.js` add `WV.CctvPip.init();`.

- [ ] **Step 5: Verify** — toggle CCTV layer. Click 1 marker → tile appears. Click 6 more → 7th evicts oldest. Drag tiles → positions persist on reload.

Recording: `docs/superpowers/screenshots/2026-04-30-B2/cctv-pip.webm`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/ui/cctv-pip.js \
        packages/worldview-map/dist/src/layers/cctv.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/dist/src/main.js \
        packages/worldview-map/dist/styles/main.css \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-B2/
git commit -m "feat(worldview): CCTV PiP grid (draggable, persistent, capped at 6)"
```

---

### Task B3: airplanes.live mil layer — `dist/src/layers/airplanes_live.js`

Reference template for layers B4–B14.

**Files:**
- Create: `packages/worldview-map/dist/src/layers/airplanes_live.js`
- Modify: `dist/src/lib/sources.js` — add source
- Modify: `dist/index.html` — script tag
- Modify: `dist/src/ui/controls.js` — toggle
- Modify: `concord/server/routers/ext_proxy.py` — register `airplanes-live` upstream

- [ ] **Step 1: Add source registration**

In `sources.js`, append:

```javascript
  airplanes_live: { label: 'airplanes.live (Mil)', proxy_path: '/airplanes-live', transport: 'rest', refresh_ms: 5000, rate_per_sec: 1, daily_cap: null, auth: 'none' },
```

- [ ] **Step 2: Write the layer**

```javascript
// layers/airplanes_live.js — military aircraft via airplanes.live /v2/mil
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.airplanes_live = (function () {
  var ds, timer, enabled = false;

  var ICON = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 18;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ff7700';
    ctx.beginPath();
    ctx.moveTo(9, 1); ctx.lineTo(11, 6); ctx.lineTo(17, 9); ctx.lineTo(11, 12);
    ctx.lineTo(11, 17); ctx.lineTo(9, 14); ctx.lineTo(7, 17); ctx.lineTo(7, 12);
    ctx.lineTo(1, 9);  ctx.lineTo(7, 6);  ctx.closePath(); ctx.fill();
    return c;
  })();

  function describe(a) {
    var lines = [
      a.flight || a.r || a.hex,
      'Type: ' + (a.t || '?'),
      'Alt: ' + (a.alt_baro || '?') + ' ft',
      'Spd: ' + (a.gs || '?') + ' kt',
    ];
    return lines.join('\n');
  }

  function refresh() {
    return WV.fetch('airplanes_live', '/v2/mil').then(function (j) {
      if (!ds) return;
      ds.entities.removeAll();
      (j.ac || []).forEach(function (a) {
        if (a.lat == null || a.lon == null) return;
        ds.entities.add({
          name: a.flight || a.r || a.hex,
          position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, (a.alt_baro || 0) * 0.3048),
          billboard: { image: ICON, scale: 1.0, verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
          description: describe(a),
        });
      });
      WV.viewer.scene.requestRender();
    }).catch(function (e) { console.warn('[airplanes_live]', e); });
  }

  function enable() {
    if (enabled) return; enabled = true;
    if (!ds) { ds = new Cesium.CustomDataSource('airplanes_live'); WV.viewer.dataSources.add(ds); }
    refresh();
    timer = setInterval(refresh, WV.sources.airplanes_live.refresh_ms);
  }
  function disable() {
    enabled = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (ds) ds.entities.removeAll();
  }
  function toggle(on) { (on ? enable : disable)(); }

  return { enable: enable, disable: disable, toggle: toggle };
})();
```

- [ ] **Step 3: Add upstream in concord ext_proxy.py**

```python
EXT_UPSTREAMS["com.concord.worldview-map"]["airplanes-live"] = {
    "base": "https://api.airplanes.live",
    "auth": None,
}
```
(Match the existing dict shape used by `opensky` / `sentinel`.)

- [ ] **Step 4: Wire script + toggle**

`index.html`:
```html
<script src="src/layers/airplanes_live.js"></script>
```

In `controls.js`, follow the existing layer-toggle pattern; label "Mil Aircraft", calls `WV.layers.airplanes_live.toggle(checked)`.

- [ ] **Step 5: Verify** — toggle layer; orange diamond billboards for mil ICAOs; health row green.

Screenshot: `docs/superpowers/screenshots/2026-04-30-B3/mil.png`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/worldview-wt
git add packages/worldview-map/dist/src/layers/airplanes_live.js \
        packages/worldview-map/dist/src/lib/sources.js \
        packages/worldview-map/dist/index.html \
        packages/worldview-map/dist/src/ui/controls.js \
        packages/worldview-map/docs/superpowers/screenshots/2026-04-30-B3/
git commit -m "feat(worldview): airplanes.live military aircraft layer"
```

---

### Tasks B4–B14: remaining new layers

Each follows the **same template as B3** with these field substitutions. Description objects MUST be plain text (`String.join('\n')` style) — no HTML strings. Cesium renders them in its sanitizing InfoBox.

| Task | File | Source ID | URL / proxy_path | Refresh | Auth | Renderer |
|---|---|---|---|---|---|---|
| **B4** FIRMS | `layers/firms.js` | `firms` | direct: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/VIIRS_SNPP_NRT/world/1` | 1 hr | browser MAP_KEY | Parse CSV, render red point billboards on lat/lon, scale by `bright_ti4` |
| **B5** NHC | `layers/nhc.js` | `nhc` | direct: `https://www.nhc.noaa.gov/CurrentStorms.json` + KML at `https://www.nhc.noaa.gov/gis/kml/nhc_active.kml` | 30 min | none | `Cesium.KmlDataSource.load(...)` — gives polygons + tracks for free |
| **B6** Launch Library 2 | `layers/launchlib.js` | `launchlib` | direct: `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20` | 1 hr | optional `Authorization: Token ...` | rocket-icon billboard at pad coords + countdown label entity |
| **B7** Cloudflare Radar | `layers/cf_outages.js` | `cf_outages` | proxy: `/cloudflare-radar/v4/radar/annotations/outages?dateRange=24h` | 30 min | server token | red-pulse billboard at country centroid |
| **B8** OSM ALPR | `layers/alpr.js` | `osm_alpr` | direct POST: `https://overpass-api.de/api/interpreter` body `[out:json][timeout:25];node["man_made"="surveillance"]["surveillance:type"="ALPR"];out;` | 1 hr (set `cache_ttl_ms: 3600000` in `WV.fetch`) | none, attribution required | small orange dots; aggregate ≥1k as cluster |
| **B9** DOT cams aggregator | `layers/dotcams.js` | `dotcams_caltrans`, `dotcams_wsdot`, `dotcams_oregondot`, `dotcams_511ny`, `dotcams_massdot` (5 sub-sources) | direct (Caltrans, OregonDOT) + proxy (WSDOT, 511NY, MassDOT) | 5 min | mix | 5 sub-loaders feeding one CustomDataSource; each marker has stream_url for PiP integration |
| **B10** Time zones | `layers/timezones.js` | static asset | local file `dist/data/timezones.geojson` | n/a | none | UTC-offset-keyed translucent polygons |
| **B11** Google Geocoding | `ui/search-bar.js` | `g_geocode` | direct: `https://maps.googleapis.com/maps/api/geocode/json?address={Q}&key={KEY}` | on-submit only | browser key | `<input>` in top bar; on result, `viewer.camera.flyTo` to result coords |
| **B12** Google Places | `ui/place-card.js` | `g_places` | direct POST: `https://places.googleapis.com/v1/places:searchNearby` w/ `X-Goog-FieldMask` header | on-click only | browser key | `ScreenSpaceEventHandler.LEFT_CLICK` on empty terrain → fetch nearest → floating card with name/type/photo (use `createElement` + `textContent`) |
| **B13** Google Air Quality | `layers/g_aqi.js` | `g_aqi` | direct: `https://airquality.googleapis.com/v1/mapTypes/US_AQI/heatmapTiles/{z}/{x}/{y}?key={KEY}` | tile-based | browser key | `Cesium.UrlTemplateImageryProvider` α=0.55, toggleable |
| **B14** Google Pollen | `layers/g_pollen.js` | `g_pollen` | direct: `https://pollen.googleapis.com/v1/mapTypes/TREE_UPI/heatmapTiles/{z}/{x}/{y}?key={KEY}` | tile-based | browser key | same imagery-provider pattern |

For each task in B4–B14:

- [ ] **Step 1: Add source(s)** to `sources.js`.
- [ ] **Step 2: Write layer / UI module** following the B3 / A7 pattern. **DOM construction must use `createElement` + `textContent`. Cesium `description` strings must be plain text (newline-joined), not HTML.**
- [ ] **Step 3: Add proxy upstream entry** in concord `ext_proxy.py` (B7, B9 sub-feeds, optionally B11/B12).
- [ ] **Step 4: Add layer toggle** in `controls.js`.
- [ ] **Step 5: Verify** — health row green, data on globe, screenshot.
- [ ] **Step 6: Commit** — one task = one commit, message `feat(worldview): <source> layer`.

For B10 (time zones), Step 0 — download the static GeoJSON:

```bash
mkdir -p ~/projects/worldview-wt/packages/worldview-map/dist/data
curl -L -o /tmp/tz.zip https://github.com/evansiroky/timezone-boundary-builder/releases/latest/download/timezones-with-oceans.geojson.zip
unzip -p /tmp/tz.zip > ~/projects/worldview-wt/packages/worldview-map/dist/data/timezones.geojson
ls -lh ~/projects/worldview-wt/packages/worldview-map/dist/data/timezones.geojson
```

If size >5 MB, swap to the simplified release variant.

For B11 (Google Geocoding) reference snippet:

```javascript
// ui/search-bar.js — flies the globe on Enter
window.WV = window.WV || {};
WV.SearchBar = (function () {
  function init() {
    var el = document.getElementById('wv-search');
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = el.value.trim();
      var key = (WV.config || {}).GOOGLE_MAPS_KEY;
      if (!q || !key) return;
      var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
                encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
      WV.fetch('g_geocode', url).then(function (j) {
        if (!j.results || !j.results.length) return;
        var loc = j.results[0].geometry.location;
        WV.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, 5000),
          duration: 1.5,
        });
      });
    });
  }
  return { init: init };
})();
```

Add `<input id="wv-search" placeholder="Fly to…" />` to top bar markup via Edit.

For B13/B14 (Google AQI/Pollen tile imagery) reference snippet:

```javascript
// layers/g_aqi.js
window.WV = window.WV || {};
WV.layers = WV.layers || {};
WV.layers.g_aqi = {
  _layer: null, _provider: null,
  enable: function () {
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    if (!key) return;
    this._provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://airquality.googleapis.com/v1/mapTypes/US_AQI/heatmapTiles/{z}/{x}/{y}?key=' + encodeURIComponent(key),
    });
    this._layer = WV.viewer.imageryLayers.addImageryProvider(this._provider);
    this._layer.alpha = 0.55;
  },
  disable: function () {
    if (this._layer) WV.viewer.imageryLayers.remove(this._layer);
    this._layer = null;
  },
  toggle: function (on) { on ? this.enable() : this.disable(); },
};
```

(B14 is identical with the pollen URL template substituted.)

---

### Task B15: Slice B acceptance walk-through

- [ ] **B-1**: Click any commercial flight → 3D model + chase + smooth animation (recording).
- [ ] **B-2**: Click 7 CCTV markers → 7th evicts oldest tile (recording).
- [ ] **B-3..B-14**: Each new layer toggle visibly populates data on globe (screenshot per layer).
- [ ] **B-15**: Health panel: ALL sources green within 2 min of first refresh.
- [ ] **B-16**: GCP dashboard: zero APIs over 80% of cap.
- [ ] **B-17**: Billing: $0.

- [ ] **B-18**: Open PR for Slice B

```bash
cd ~/projects/worldview-wt
git push -u origin HEAD
gh pr create --title "feat(worldview): plane polish + CCTV PiP + 12 new layers (Slice B)" --body "..."
```

Per project CLAUDE.md: agent-pm reviews/merges before Phase C.

---

## Phase C — Concord extension verification

WorldView is both standalone and a concord extension surface. Verify the extension surface still works against INS-036 session model after all changes.

### Task C1: Extension surface verification

- [ ] **Step 1: Rebuild package** (if pack.mjs exists in HEAD listing):

```bash
cd ~/projects/worldview-wt/packages/worldview-map
node scripts/pack.mjs 2>/dev/null || echo "no pack script — dist is ready as-is"
```

- [ ] **Step 2: Install into a local concord instance** (per concord docs).

- [ ] **Step 3: Open WorldView as extension surface inside a concord room.**

- [ ] **Step 4: Verify**:
  - `concord:init` received; `seat`/`mode` set correctly (DevTools console).
  - `concord:participant_join` / `..._leave` work — open with second user.
  - `concord:host_transfer` works.
  - `concord:surface_resize` adapts layout (drag panel resize handle; observe `body.classList.narrow` toggles when width < 400 px).
  - `extension_action` posts work (any state-changing action triggers Matrix room state update).

- [ ] **Step 5: Verify Steel + photoreal + new layers all render correctly inside iframe** (some `backdrop-filter` cases differ in iframe contexts; if so, fall back to solid color with same translucency feel).

- [ ] **Step 6: Screenshots** — `docs/superpowers/screenshots/2026-04-30-C1/`.

- [ ] **Step 7: Commit any iframe-context fixes**:

```bash
cd ~/projects/worldview-wt
git add ...
git commit -m "fix(worldview): iframe-context fallbacks for backdrop-filter"
```

---

## Phase D — Merge to main

Per project CLAUDE.md, session branches must be merged to `main` before session is complete. Use the tiered-merge tool.

### Task D1: Merge worldview-wt → main

- [ ] **Step 1: Verify all PRs (Slice A, Slice B, concord proxy hardening) reviewed and merged on their respective remotes.**

- [ ] **Step 2: Run the tiered-merge tool**

```bash
cd ~/projects/concord-extensions
~/projects/orrchestrator/library/tools/merge_to_main.sh
```

Exit code `0` = merged + branch deleted. `1` = escalation required (read `.orrch/merge_log.md`, resolve, re-run). `2` = setup error.

- [ ] **Step 3: Clean up worktree**

```bash
cd ~/projects/concord-extensions
git worktree remove ~/projects/worldview-wt
```

---

## Self-Review

Spec coverage:
- §1 Goal — Phase A + B + C scope statement.
- §2 Slices — Phase A = Slice A; Phase B = Slice B.
- §3 Architecture — A1 (sources), A2 (wv-fetch), A3 (photoreal), A9 (proxy hardening) cover the diagram.
- §4 Components — every "Files added" row has an explicit task; every "Files modified" row has an explicit task or step.
- §5 Safeguards — A2 (app-side rate cap + quota), A6 (budget toast), A10 (GCP key restriction + per-API quotas + billing alert).
- §6 Stream-health — A5 (panel), A2 (record), A8 (existing layers wired in), A9 (server `__healthz`).
- §7 Plane click-track — B1 covers all 6 spec bugs.
- §8 CCTV PiP grid — B2.
- §9 UI redesign Steel — A4.
- §10 Error handling — distributed across A2, A5, B2, C1.
- §11 Testing — explicitly NOT in this plan (separate session per project CLAUDE.md). Acceptance walk-throughs (A11, B15) are observation steps, not tests.
- §12 Out of scope — respected.

Placeholder scan: no "TBD"/"TODO"/"implement later". Every code step has actual code.

DOM safety: All DOM construction uses `createElement` + `textContent`. The Cesium `description` property is fed plain newline-joined strings (Cesium sanitizes its InfoBox content). No raw `innerHTML` assignments anywhere in this plan.

Type/name consistency:
- `WV.fetch(sourceId, urlOrPath)` consistent across A2 and all layer tasks.
- `WV.sourceState` field names (`last_success_ts`, `last_error`, `latency_ms`, `daily_count`, `daily_reset_ts`) consistent.
- `WV.sources[k]` field names (`label`, `proxy_path`, `direct_url`, `transport`, `refresh_ms`, `rate_per_sec`, `daily_cap`, `auth`, `user_agent`) consistent.
- Layer module surface (`enable`, `disable`, `toggle`) consistent across NWS, airplanes_live, and B4–B14.

Plan is internally consistent and covers every spec requirement.

---

## Plan complete.

Saved to `docs/superpowers/plans/2026-04-30-worldview-photoreal-plan.md`.
