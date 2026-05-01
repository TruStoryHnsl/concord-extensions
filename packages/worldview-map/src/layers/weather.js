// layers/weather.js — US NEXRAD radar overlay
// Source: Iowa State Mesonet WMS — no key required
//
// Note: tile fetches are handled by Cesium.WebMapServiceImageryProvider (not raw
// fetch). Source health is wired via WV.sourceState.windy on layer enable.

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.weather = (function () {

  var nexradLayer = null;

  function enable(viewer) {
    try {
      var p = new Cesium.WebMapServiceImageryProvider({
        url:        'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi',
        layers:     'nexrad-n0r',
        parameters: { transparent: 'true', format: 'image/png' },
        credit:     'Iowa State Mesonet NEXRAD',
      });
      nexradLayer       = viewer.imageryLayers.addImageryProvider(p);
      nexradLayer.alpha = 0.7;
      // Record that imagery was queued successfully (tiles fetched by Cesium internally)
      if (WV.sourceState && WV.sourceState.windy) {
        WV.sourceState.windy.last_success_ts = Date.now();
        WV.sourceState.windy.last_error = null;
      }
      WV.Controls.setStatus('WEATHER: NEXRAD radar active (US coverage)');
    } catch (e) {
      console.warn('NEXRAD provider failed:', e);
      WV.Controls.setStatus('WEATHER: NEXRAD unavailable');
    }
    viewer.scene.requestRender();
    return Promise.resolve();
  }

  function disable(viewer) {
    if (nexradLayer) { viewer.imageryLayers.remove(nexradLayer, true); nexradLayer = null; }
    WV.Controls.setStatus('SYSTEM READY');
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
