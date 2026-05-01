// layers/g_aqi.js — Google Air Quality imagery layer (US AQI heatmap tiles)
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.g_aqi = (function () {
  var imageryLayer = null;
  var enabled = false;

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    if (!key) {
      if (WV.sourceState && WV.sourceState.g_aqi) {
        WV.sourceState.g_aqi.last_error = 'no GOOGLE_MAPS_KEY';
      }
      return Promise.reject(new Error('no GOOGLE_MAPS_KEY'));
    }
    enabled = true;
    var provider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://airquality.googleapis.com/v1/mapTypes/US_AQI/heatmapTiles/{z}/{x}/{y}?key=' + encodeURIComponent(key),
    });
    imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    imageryLayer.alpha = 0.55;
    if (WV.sourceState && WV.sourceState.g_aqi) {
      WV.sourceState.g_aqi.last_success_ts = Date.now();
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
