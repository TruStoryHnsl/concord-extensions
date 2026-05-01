// layers/g_pollen.js — Google Pollen imagery layer (TREE_UPI heatmap tiles)
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.g_pollen = (function () {
  var imageryLayer = null;
  var enabled = false;

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    if (!key) {
      if (WV.sourceState && WV.sourceState.g_pollen) {
        WV.sourceState.g_pollen.last_error = 'no GOOGLE_MAPS_KEY';
      }
      return Promise.reject(new Error('no GOOGLE_MAPS_KEY'));
    }
    enabled = true;
    var provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://pollen.googleapis.com/v1/mapTypes/TREE_UPI/heatmapTiles/{z}/{x}/{y}?key=' + encodeURIComponent(key),
    });
    imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    imageryLayer.alpha = 0.55;
    if (WV.sourceState && WV.sourceState.g_pollen) {
      WV.sourceState.g_pollen.last_success_ts = Date.now();
    }
    viewer.scene.requestRender();
    return Promise.resolve();
  }

  function disable(viewer) {
    enabled = false;
    if (imageryLayer) {
      viewer.imageryLayers.remove(imageryLayer);
      imageryLayer = null;
    }
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
