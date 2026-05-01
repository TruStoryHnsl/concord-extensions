// ui/cctv-pip.js — click camera marker → live PiP tile, draggable, persistent, capped.
// All DOM via createElement + textContent (no innerHTML).
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

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(pins)); } catch (e) {}
  }

  function _detectFormat(url) {
    if (!url) return 'iframe';
    if (/\.m3u8(\?|$)/i.test(url))                             return 'hls';
    if (/\.mjpe?g(\?|$)/i.test(url))                           return 'mjpeg';
    if (/^rtsp:/i.test(url))                                    return 'rtsp';
    if (/\/snapshot|\.jpg(\?|$)|\.png(\?|$)/i.test(url))       return 'mjpeg';
    return 'iframe';
  }

  function makeMedia(pin) {
    var media;
    if (pin.format === 'mjpeg') {
      media = document.createElement('img');
      media.src = pin.stream_url;
    } else if (pin.format === 'hls') {
      media = document.createElement('video');
      media.controls = false;
      media.autoplay = true;
      media.muted    = true;
      media.src      = pin.stream_url;
    } else if (pin.format === 'iframe') {
      media = document.createElement('iframe');
      media.src = pin.stream_url;
      media.setAttribute('frameborder', '0');
      media.setAttribute('allow', 'autoplay');
    } else {
      // rtsp / unknown → static-text fallback, copy URL to clipboard
      media = document.createElement('div');
      media.className = 'pip-unsupported';
      media.textContent = 'Stream not browser-playable. URL copied to clipboard.';
      if (navigator.clipboard && pin.stream_url) {
        navigator.clipboard.writeText(pin.stream_url).catch(function () {});
      }
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
    fly.type = 'button';
    fly.className = 'pip-fly';
    fly.textContent = '⊙';
    fly.title = 'Fly camera here';
    fly.addEventListener('click', function (e) {
      e.stopPropagation();
      if (WV.viewer && pin.lat != null && pin.lon != null) {
        WV.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(pin.lon, pin.lat, 2500),
          duration: 1.2,
        });
      }
    });
    bar.appendChild(fly);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'pip-close';
    close.textContent = '\xd7';
    close.title = 'Unpin';
    close.addEventListener('click', function (e) {
      e.stopPropagation();
      remove(pin.id);
    });
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
      pin.y = parseInt(tile.style.top,  10);
      save();
    });
  }

  function renderTile(pin, indexHint) {
    var tile = document.createElement('div');
    tile.className  = 'pip-tile';
    tile.dataset.id = pin.id;
    var defaultX = 24 + (indexHint || 0) * 24;
    var defaultY = 80 + (indexHint || 0) * 24;
    tile.style.left = (pin.x != null ? pin.x : defaultX) + 'px';
    tile.style.top  = (pin.y != null ? pin.y : defaultY) + 'px';

    var bar = makeBar(pin);
    tile.appendChild(bar);
    tile.appendChild(makeMedia(pin));

    makeDraggable(tile, bar, pin);
    root.appendChild(tile);
  }

  function add(pin) {
    if (!pin || !pin.id) return;
    if (pins.find(function (p) { return p.id === pin.id; })) return; // dedupe

    if (pins.length >= MAX_TILES) {
      var evicted = pins.shift();
      var el = root.querySelector('[data-id="' + CSS.escape(evicted.id) + '"]');
      if (el) el.remove();
      if (WV.BudgetGuard && WV.BudgetGuard.toast) {
        WV.BudgetGuard.toast('Evicted ' + (evicted.name || evicted.id) + ' (cap = ' + MAX_TILES + ' tiles)');
      }
    }
    pins.push(pin);
    save();
    renderTile(pin, pins.length - 1);
  }

  function remove(id) {
    pins = pins.filter(function (p) { return p.id !== id; });
    save();
    var el = root.querySelector('[data-id="' + CSS.escape(id) + '"]');
    if (el) el.remove();
  }

  function clearAll() {
    pins = [];
    save();
    while (root && root.firstChild) root.removeChild(root.firstChild);
  }

  function init() {
    load();
    root = document.getElementById('wv-pip-grid');
    if (!root) {
      root = document.createElement('div');
      root.id = 'wv-pip-grid';
      document.body.appendChild(root);
    }
    pins.forEach(function (p, i) { renderTile(p, i); });
    document.addEventListener('wv-cctv-pin', function (e) {
      if (e && e.detail) add(e.detail);
    });
  }

  return { init: init, add: add, remove: remove, clearAll: clearAll, detectFormat: _detectFormat };
}());
