// Worldview-map per-user settings overlay.
//
// Surfaces a Settings button in the topbar and a Steel-palette modal that
// collects every browser-direct key the app uses. Auto-pops on cold start
// when neither a Cesium Ion token nor a Google Maps key is set, since
// either one is required to render a globe.
//
// The OAuth-client-secret-bearing keys (OpenSky, Sentinel) live server-side
// in concord-api and are configured by the operator. Those layers route
// through /api/ext-proxy/<ext_id>/* so users never touch them.
//
// Storage: localStorage under
// `concord.ext.com.concord.worldview-map.config`. The bridge in dist/index.html
// (injected by build.mjs) reads from that key on load and populates
// window.WV.config before main.js runs.
//
// Self-contained IIFE — no module imports. Pure DOM APIs (createElement,
// textContent) — no innerHTML assignments anywhere.

(function () {
  'use strict';

  var STORAGE_KEY = 'concord.ext.com.concord.worldview-map.config';

  var SECTIONS = [
    {
      title: 'Globe',
      blurb: 'At least one of these is required for a globe to render.',
      fields: [
        { key: 'cesium_token', label: 'Cesium Ion token',
          help: 'Default 3D globe + World Terrain. Free tier at https://cesium.com/ion/.',
          placeholder: 'eyJhbGc…' },
        { key: 'google_maps_key', label: 'Google Maps API key',
          help: 'Photorealistic 3D Tiles + Geocoding + Places + Air Quality + Pollen. ' +
                'Restrict to those APIs only. Free tier covers normal use.',
          placeholder: 'AIza…' },
      ],
    },
    {
      title: 'Maritime · Traffic · Weather',
      blurb: 'Live-stream data for ships, traffic flow, and weather forecast pins.',
      fields: [
        { key: 'aisstream_key', label: 'AISStream key',
          help: 'Live AIS ship positions. Free at https://aisstream.io.',
          placeholder: 'aisstream key' },
        { key: 'tomtom_key', label: 'TomTom key',
          help: 'Traffic flow + incidents. Free at https://developer.tomtom.com.',
          placeholder: 'tomtom key' },
        { key: 'windy_key', label: 'Windy key',
          help: 'Point-forecast weather. Free at https://api.windy.com.',
          placeholder: 'windy key' },
      ],
    },
    {
      title: 'Wildfire · Storm · Spaceflight',
      blurb: 'NASA, NOAA, and aerospace public feeds. All free with low-friction signup.',
      fields: [
        { key: 'firms_map_key', label: 'NASA FIRMS MAP_KEY',
          help: 'Global wildfire hotspots (VIIRS NRT). Free at ' +
                'https://firms.modaps.eosdis.nasa.gov/api/area/.',
          placeholder: 'firms map key' },
        { key: 'launchlib_token', label: 'Launch Library 2 token (optional)',
          help: 'Upcoming rocket launches. Free anonymous quota is small; create a free ' +
                'account at https://thespacedevs.com/llapi for 1k/day.',
          placeholder: 'launchlib token' },
      ],
    },
    {
      title: 'Internet · Outages',
      blurb: 'Network and infrastructure observability feeds.',
      fields: [
        { key: 'cloudflare_radar_token', label: 'Cloudflare Radar API token',
          help: 'Verified internet outages worldwide. Free Cloudflare account required ' +
                'at https://dash.cloudflare.com → My Profile → API Tokens.',
          placeholder: 'cloudflare token' },
      ],
    },
    {
      title: 'DOT camera networks',
      blurb: 'Live highway / surface-road CCTV from US state DOTs. Caltrans, OregonDOT ' +
             'are key-free; the rest require a free agreement and key.',
      fields: [
        { key: 'wsdot_key', label: 'WSDOT key (Washington)',
          help: 'Free email-issued at https://wsdot.wa.gov/traffic/api/.',
          placeholder: 'wsdot key' },
        { key: 'ny511_key', label: '511NY key (New York)',
          help: 'Requires a Developer Access Agreement at https://511ny.org/developers.',
          placeholder: '511ny key' },
        { key: 'massdot_key', label: 'MassDOT key',
          help: 'Open511 vendor key. Free at https://mass511.com/developers/doc.',
          placeholder: 'massdot key' },
      ],
    },
  ];

  // ── STORAGE ──────────────────────────────────────────────────────────────

  function readConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeConfig(values) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      return true;
    } catch (e) {
      console.warn('worldview settings: localStorage write failed', e);
      return false;
    }
  }

  // ── STEEL-PALETTE STYLES ─────────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById('wv-settings-styles')) return;
    var style = document.createElement('style');
    style.id = 'wv-settings-styles';
    style.textContent = [
      '#wv-settings-trigger {',
      '  position: fixed; top: 12px; right: 16px; z-index: 9000;',
      '  padding: 6px 12px; font: 11px/1 var(--font, system-ui);',
      '  letter-spacing: 0.10em; text-transform: uppercase;',
      '  background: var(--panel-bg); color: var(--accent);',
      '  border: 1px solid var(--panel-border); border-radius: 4px;',
      '  cursor: pointer;',
      '  backdrop-filter: blur(14px) saturate(140%);',
      '  -webkit-backdrop-filter: blur(14px) saturate(140%);',
      '}',
      '#wv-settings-trigger:hover { background: var(--accent-glow); border-color: var(--accent-dim); }',
      '#wv-settings-modal {',
      '  position: fixed; inset: 0; z-index: 9100;',
      '  background: rgba(4, 8, 14, 0.55);',
      '  backdrop-filter: blur(8px) saturate(120%);',
      '  -webkit-backdrop-filter: blur(8px) saturate(120%);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px; font-family: var(--font, system-ui);',
      '  animation: wv-settings-fade 0.18s ease;',
      '}',
      '@keyframes wv-settings-fade { from { opacity: 0; } to { opacity: 1; } }',
      '#wv-settings-modal .wv-panel {',
      '  background: var(--panel-bg); border: 1px solid var(--panel-border);',
      '  backdrop-filter: blur(14px) saturate(140%);',
      '  -webkit-backdrop-filter: blur(14px) saturate(140%);',
      '  border-radius: 6px; padding: 22px 26px 18px;',
      '  min-width: 520px; max-width: 640px; width: 100%;',
      '  max-height: 88vh; overflow-y: auto;',
      '  color: var(--text);',
      '  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--panel-border);',
      '}',
      '#wv-settings-modal h2 {',
      '  margin: 0 0 6px; color: var(--accent); font-size: 13px;',
      '  text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600;',
      '}',
      '#wv-settings-modal .preamble {',
      '  margin: 0 0 18px; color: var(--text-dim);',
      '  font-size: 11px; line-height: 1.55;',
      '}',
      '#wv-settings-modal .section { margin-top: 18px; padding-top: 14px;',
      '  border-top: 1px solid var(--panel-border); }',
      '#wv-settings-modal .section:first-of-type { border-top: 0; padding-top: 0; }',
      '#wv-settings-modal .section-title {',
      '  font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em;',
      '  color: var(--accent); margin-bottom: 4px;',
      '}',
      '#wv-settings-modal .section-blurb {',
      '  font-size: 10px; color: var(--text-muted); margin-bottom: 10px; line-height: 1.5;',
      '}',
      '#wv-settings-modal label {',
      '  display: block; margin-top: 10px; font-size: 11px;',
      '  color: var(--text); letter-spacing: 0.04em;',
      '}',
      '#wv-settings-modal label .help {',
      '  display: block; margin: 3px 0 6px; font-size: 10px;',
      '  color: var(--text-dim); text-transform: none;',
      '  letter-spacing: 0; line-height: 1.45;',
      '}',
      '#wv-settings-modal label .badge {',
      '  display: inline-block; margin-left: 8px; padding: 1px 6px;',
      '  font-size: 9px; letter-spacing: 0.08em; border-radius: 3px;',
      '  text-transform: uppercase;',
      '}',
      '#wv-settings-modal label .badge-ok {',
      '  color: #5fd97f; border: 1px solid rgba(95, 217, 127, 0.40);',
      '  background: rgba(95, 217, 127, 0.08);',
      '}',
      '#wv-settings-modal label .badge-empty {',
      '  color: var(--text-muted); border: 1px solid var(--panel-border);',
      '}',
      '#wv-settings-modal input {',
      '  width: 100%; box-sizing: border-box; padding: 8px 10px;',
      '  background: rgba(0, 0, 0, 0.30);',
      '  border: 1px solid var(--panel-border); border-radius: 3px;',
      '  color: var(--text); font: 12px var(--font-mono, monospace);',
      '}',
      '#wv-settings-modal input:focus {',
      '  outline: none; border-color: var(--accent-dim);',
      '  box-shadow: 0 0 0 2px var(--accent-glow);',
      '}',
      '#wv-settings-modal .actions {',
      '  margin-top: 22px; display: flex; gap: 8px; justify-content: flex-end;',
      '  align-items: center;',
      '}',
      '#wv-settings-modal .saved-indicator {',
      '  flex: 1; font-size: 11px; color: var(--accent);',
      '  min-height: 14px;',
      '}',
      '#wv-settings-modal button {',
      '  padding: 7px 16px;',
      '  background: var(--accent-glow); color: var(--accent);',
      '  border: 1px solid var(--accent-dim); border-radius: 4px;',
      '  cursor: pointer;',
      '  font: 11px var(--font, system-ui); text-transform: uppercase;',
      '  letter-spacing: 0.10em;',
      '}',
      '#wv-settings-modal button:hover { background: var(--accent-dim); color: #fff; }',
      '#wv-settings-modal button.cancel {',
      '  background: transparent; color: var(--text-dim);',
      '  border-color: var(--panel-border);',
      '}',
      '#wv-settings-modal button.cancel:hover { color: var(--text); border-color: var(--text-dim); }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── MODAL CONSTRUCTION ───────────────────────────────────────────────────

  function makeBadge(filled) {
    var b = document.createElement('span');
    b.className = 'badge ' + (filled ? 'badge-ok' : 'badge-empty');
    b.textContent = filled ? 'set' : 'unset';
    return b;
  }

  function makeField(field, stored) {
    var label = document.createElement('label');

    var labelRow = document.createElement('span');
    labelRow.textContent = field.label;
    label.appendChild(labelRow);

    var current = (stored[field.key] || stored[field.key.toUpperCase()] || '').toString();
    label.appendChild(makeBadge(!!current.trim()));

    var help = document.createElement('span');
    help.className = 'help';
    help.textContent = field.help;
    label.appendChild(help);

    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = field.placeholder || '';
    input.value = current;
    input.dataset.fieldKey = field.key;
    label.appendChild(input);

    return { label: label, input: input };
  }

  function makeSection(section, stored, inputCollector) {
    var wrap = document.createElement('div');
    wrap.className = 'section';

    var t = document.createElement('div');
    t.className = 'section-title';
    t.textContent = section.title;
    wrap.appendChild(t);

    var b = document.createElement('div');
    b.className = 'section-blurb';
    b.textContent = section.blurb;
    wrap.appendChild(b);

    section.fields.forEach(function (f) {
      var built = makeField(f, stored);
      inputCollector[f.key] = built.input;
      wrap.appendChild(built.label);
    });
    return wrap;
  }

  function openModal() {
    if (document.getElementById('wv-settings-modal')) return;
    var stored = readConfig();
    var inputs = {};

    var modal = document.createElement('div');
    modal.id = 'wv-settings-modal';

    var panel = document.createElement('div');
    panel.className = 'wv-panel';

    var title = document.createElement('h2');
    title.textContent = 'WorldView · API keys';
    panel.appendChild(title);

    var preamble = document.createElement('p');
    preamble.className = 'preamble';
    preamble.textContent =
      "Browser-direct keys for the data layers that don't go through Concord's server proxy. " +
      "Stored in this browser only — they never reach the server. " +
      "Operator-managed keys (OpenSky, Sentinel) are configured by the instance admin.";
    panel.appendChild(preamble);

    SECTIONS.forEach(function (section) {
      panel.appendChild(makeSection(section, stored, inputs));
    });

    var savedIndicator = document.createElement('div');
    savedIndicator.className = 'saved-indicator';

    var actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(savedIndicator);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', function () { closeModal(modal); });
    actions.appendChild(cancel);

    var save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save & reload';
    save.addEventListener('click', function () {
      var next = Object.assign({}, stored);
      Object.keys(inputs).forEach(function (k) {
        var v = (inputs[k].value || '').trim();
        if (v) next[k] = v;
        else delete next[k];
      });
      if (writeConfig(next)) {
        savedIndicator.textContent = 'Saved. Reloading…';
        setTimeout(function () { window.location.reload(); }, 350);
      } else {
        savedIndicator.textContent = 'Save failed (localStorage unavailable).';
      }
    });
    actions.appendChild(save);

    panel.appendChild(actions);
    modal.appendChild(panel);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal(modal);
    });

    function escListener(e) {
      if (e.key === 'Escape' && document.getElementById('wv-settings-modal')) {
        closeModal(modal);
        document.removeEventListener('keydown', escListener);
      }
    }
    document.addEventListener('keydown', escListener);

    document.body.appendChild(modal);
  }

  function closeModal(modal) {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  function mountTrigger() {
    if (document.getElementById('wv-settings-trigger')) return;
    var btn = document.createElement('button');
    btn.id = 'wv-settings-trigger';
    btn.type = 'button';
    btn.textContent = '⚙ Settings';
    btn.title = 'Configure API keys';
    btn.addEventListener('click', openModal);
    document.body.appendChild(btn);
  }

  function init() {
    ensureStyles();
    mountTrigger();
    // Auto-open if no globe-source key is configured. Either Cesium Ion or
    // Google Maps key is enough to render a globe; if both are empty the
    // app shows nothing useful, so prompt the user up front.
    var stored = readConfig();
    var hasCesium = ((stored.cesium_token || stored.CESIUM_TOKEN) || '').trim().length > 0;
    var hasGoogle = ((stored.google_maps_key || stored.GOOGLE_MAPS_KEY) || '').trim().length > 0;
    if (!hasCesium && !hasGoogle) {
      setTimeout(openModal, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
