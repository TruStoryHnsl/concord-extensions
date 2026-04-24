// Worldview-map per-user settings overlay.
//
// Surfaces a Settings button in the topbar (top-right corner). Clicking
// opens a modal with the four browser-direct API keys this app needs:
//
//   CESIUM_TOKEN     — Cesium Ion access token (for terrain + imagery)
//   AISSTREAM_KEY    — aisstream.io WebSocket key (maritime layer)
//   TOMTOM_KEY       — TomTom developer key (traffic flow + incidents)
//   WINDY_KEY        — Windy.com API key (radar overlays)
//
// The OAuth-client-secret-bearing keys (OpenSky, Sentinel) live
// server-side in concord-api's instance.json — see the admin
// "Integrations → worldview-map" panel. Those layers route through
// /api/ext-proxy/<ext_id>/* with operator credentials, so users never
// touch them.
//
// Storage: localStorage under
// ``concord.ext.com.concord.worldview-map.config``. The bridge in
// dist/index.html (injected by build.mjs) reads from that key on load
// and populates window.WV.config before main.js runs, so saving and
// reloading is enough to apply changes.
//
// Designed as a self-contained IIFE matching the rest of the legacy
// codebase — no module imports, pure DOM APIs. Uses textContent /
// createElement throughout to keep the static-bundle CSP-clean.

(function () {
  'use strict';

  var STORAGE_KEY = 'concord.ext.com.concord.worldview-map.config';
  var FIELDS = [
    {
      key: 'cesium_token',
      label: 'Cesium Ion token',
      help: 'Required for the 3D globe, terrain, and base imagery. Free at https://cesium.com/ion/.',
      placeholder: 'eyJhbGc…',
      type: 'secret'
    },
    {
      key: 'aisstream_key',
      label: 'AISStream key',
      help: 'Maritime AIS layer (live ship positions). Free at https://aisstream.io.',
      placeholder: '1234567890abcdef',
      type: 'secret'
    },
    {
      key: 'tomtom_key',
      label: 'TomTom key',
      help: 'Traffic flow + incidents layer. Free at https://developer.tomtom.com.',
      placeholder: 'TomTom developer key',
      type: 'secret'
    },
    {
      key: 'windy_key',
      label: 'Windy key',
      help: 'Weather radar layer. Free at https://api.windy.com.',
      placeholder: 'Windy API key',
      type: 'secret'
    }
  ];

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
      console.warn('worldview-map settings: failed to write localStorage', e);
      return false;
    }
  }

  function ensureStyles() {
    if (document.getElementById('wv-settings-styles')) return;
    var style = document.createElement('style');
    style.id = 'wv-settings-styles';
    style.textContent = [
      '#wv-settings-trigger {',
      '  position: fixed; top: 10px; right: 16px; z-index: 9000;',
      '  padding: 6px 10px; font: 11px/1 "Courier New", monospace;',
      '  letter-spacing: 0.08em; text-transform: uppercase;',
      '  background: rgba(0, 0, 0, 0.65); color: #00ff41;',
      '  border: 1px solid rgba(0, 255, 65, 0.35); border-radius: 3px;',
      '  cursor: pointer; backdrop-filter: blur(2px);',
      '}',
      '#wv-settings-trigger:hover { background: rgba(0, 255, 65, 0.15); }',
      '#wv-settings-modal {',
      '  position: fixed; inset: 0; z-index: 9100;',
      '  background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(4px);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px; font-family: "Courier New", monospace;',
      '}',
      '#wv-settings-modal .panel {',
      '  background: #04070b; border: 1px solid rgba(0, 255, 65, 0.35);',
      '  border-radius: 4px; padding: 22px 26px; min-width: 460px;',
      '  max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto;',
      '  color: #d6f5e0; box-shadow: 0 0 30px rgba(0, 255, 65, 0.15);',
      '}',
      '#wv-settings-modal h2 {',
      '  margin: 0 0 6px; color: #00ff41; font-size: 14px;',
      '  text-transform: uppercase; letter-spacing: 0.12em;',
      '}',
      '#wv-settings-modal .preamble {',
      '  margin: 0 0 18px; color: rgba(214, 245, 224, 0.7);',
      '  font-size: 11px; line-height: 1.55;',
      '}',
      '#wv-settings-modal label {',
      '  display: block; margin-top: 14px; font-size: 11px;',
      '  color: rgba(0, 255, 65, 0.85); letter-spacing: 0.06em;',
      '}',
      '#wv-settings-modal label .help {',
      '  display: block; margin: 3px 0 6px; font-size: 10px;',
      '  color: rgba(214, 245, 224, 0.55); text-transform: none;',
      '  letter-spacing: 0;',
      '}',
      '#wv-settings-modal input {',
      '  width: 100%; box-sizing: border-box; padding: 8px 10px;',
      '  background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(0, 255, 65, 0.25);',
      '  border-radius: 3px; color: #d6f5e0; font: 12px "Courier New", monospace;',
      '}',
      '#wv-settings-modal input:focus {',
      '  outline: none; border-color: rgba(0, 255, 65, 0.65);',
      '}',
      '#wv-settings-modal .actions {',
      '  margin-top: 22px; display: flex; gap: 8px; justify-content: flex-end;',
      '}',
      '#wv-settings-modal button {',
      '  padding: 7px 16px; background: rgba(0, 255, 65, 0.12);',
      '  color: #00ff41; border: 1px solid rgba(0, 255, 65, 0.4);',
      '  border-radius: 3px; cursor: pointer; font: 11px "Courier New", monospace;',
      '  text-transform: uppercase; letter-spacing: 0.08em;',
      '}',
      '#wv-settings-modal button:hover { background: rgba(0, 255, 65, 0.22); }',
      '#wv-settings-modal button.cancel {',
      '  background: rgba(120, 120, 120, 0.12);',
      '  border-color: rgba(180, 180, 180, 0.35);',
      '  color: rgba(214, 245, 224, 0.7);',
      '}',
      '#wv-settings-modal .saved-indicator {',
      '  margin-top: 8px; font-size: 11px; color: rgba(0, 255, 65, 0.85);',
      '  min-height: 14px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function openModal() {
    if (document.getElementById('wv-settings-modal')) return;
    var stored = readConfig();
    var modal = document.createElement('div');
    modal.id = 'wv-settings-modal';
    var panel = document.createElement('div');
    panel.className = 'panel';
    var title = document.createElement('h2');
    title.textContent = 'Worldview · API keys';
    panel.appendChild(title);
    var preamble = document.createElement('p');
    preamble.className = 'preamble';
    preamble.textContent =
      "Browser-direct keys for the data layers that don't go through Concord's server proxy. " +
      'Stored locally in this browser only — they never reach the server. ' +
      'Operator-managed keys (OpenSky, Sentinel) are configured by the instance admin.';
    panel.appendChild(preamble);

    var inputs = {};
    FIELDS.forEach(function (f) {
      var label = document.createElement('label');
      label.textContent = f.label;
      var help = document.createElement('span');
      help.className = 'help';
      help.textContent = f.help;
      label.appendChild(help);
      var input = document.createElement('input');
      input.type = f.type === 'secret' ? 'password' : 'text';
      input.placeholder = f.placeholder || '';
      input.value = stored[f.key] || stored[f.key.toUpperCase()] || '';
      label.appendChild(input);
      inputs[f.key] = input;
      panel.appendChild(label);
    });

    var savedIndicator = document.createElement('div');
    savedIndicator.className = 'saved-indicator';
    panel.appendChild(savedIndicator);

    var actions = document.createElement('div');
    actions.className = 'actions';
    var cancel = document.createElement('button');
    cancel.className = 'cancel';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', function () {
      document.body.removeChild(modal);
    });
    var save = document.createElement('button');
    save.textContent = 'Save & reload';
    save.addEventListener('click', function () {
      var next = {};
      FIELDS.forEach(function (f) {
        var v = inputs[f.key].value.trim();
        if (v) next[f.key] = v;
      });
      if (writeConfig(next)) {
        savedIndicator.textContent = 'Saved. Reloading…';
        setTimeout(function () {
          window.location.reload();
        }, 350);
      } else {
        savedIndicator.textContent = 'Save failed (localStorage unavailable).';
      }
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    panel.appendChild(actions);

    modal.appendChild(panel);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) document.body.removeChild(modal);
    });
    document.addEventListener('keydown', function escListener(e) {
      if (e.key === 'Escape') {
        if (document.getElementById('wv-settings-modal')) {
          document.body.removeChild(modal);
        }
        document.removeEventListener('keydown', escListener);
      }
    });
    document.body.appendChild(modal);
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
    // If no Cesium token is configured, the globe won't render — pop the
    // settings panel automatically so the user sees what they need to do.
    var stored = readConfig();
    var hasToken =
      (stored.cesium_token || stored.CESIUM_TOKEN || '').trim().length > 0;
    if (!hasToken) {
      // Wait one tick so the topbar is in place before stacking on top.
      setTimeout(openModal, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
