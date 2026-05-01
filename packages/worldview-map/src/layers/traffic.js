// layers/traffic.js — Real-time traffic flow via TomTom Traffic API
//
// Overlays color-coded road speed tiles on the globe:
//   Green  = free flow
//   Yellow = moderate congestion
//   Red    = heavy congestion / standstill
//
// Requires TOMTOM_KEY in config.js (free at developer.tomtom.com, 2500 req/day)
//
// Note: tile fetches are handled by Cesium.UrlTemplateImageryProvider (not raw
// fetch). Source health is wired via WV.sourceState.tomtom on layer build/refresh.

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.traffic = (function () {

  var imageryLayer = null;
  var refreshTimer = null;
  var REFRESH_MS   = 120000; // refresh tiles every 2 min

  function _buildLayer(viewer) {
    var key = (WV.config || {}).TOMTOM_KEY;
    if (!key) {
      WV.Controls.setStatus('TRAFFIC: TOMTOM_KEY not set in config.js');
      return null;
    }

    var provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png'
        + '?key=' + encodeURIComponent(key)
        + '&thickness=6',
      minimumLevel: 6,
      maximumLevel: 18,
      credit: 'TomTom Traffic',
    });

    var il = viewer.imageryLayers.addImageryProvider(provider);
    il.alpha = 0.85;
    // Record that the layer was built successfully (tiles fetched by Cesium internally)
    if (WV.sourceState && WV.sourceState.tomtom) {
      WV.sourceState.tomtom.last_success_ts = Date.now();
      WV.sourceState.tomtom.last_error = null;
    }
    return il;
  }

  function _refresh(viewer) {
    // Remove and re-add to force tile reload (TomTom tiles update every ~2 min)
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); }
    imageryLayer = _buildLayer(viewer);
    viewer.scene.requestRender();
  }

  function enable(viewer) {
    imageryLayer = _buildLayer(viewer);
    if (!imageryLayer) return Promise.resolve();

    WV.Controls.setStatus('TRAFFIC: Live flow overlay active');
    WV.Controls.updateCount('traffic', 'LIVE');
    viewer.scene.requestRender();

    refreshTimer = setInterval(function () { _refresh(viewer); }, REFRESH_MS);
    return Promise.resolve();
  }

  function disable(viewer) {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); imageryLayer = null; }
    WV.Controls.updateCount('traffic', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
