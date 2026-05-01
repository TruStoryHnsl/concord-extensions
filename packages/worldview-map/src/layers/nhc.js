// layers/nhc.js — NOAA NHC active tropical storms via KML.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.nhc = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;
  var url = 'https://www.nhc.noaa.gov/gis/kml/nhc_active.kml';

  function load(viewer) {
    var t0 = Date.now();
    Cesium.KmlDataSource.load(url, { camera: viewer.camera, canvas: viewer.canvas })
      .then(function (kml) {
        if (!enabled) return; // disabled while loading
        ds = kml;
        viewer.dataSources.add(kml);
        WV.sourceState.nhc.last_success_ts = Date.now();
        WV.sourceState.nhc.latency_ms = Date.now() - t0;
        WV.sourceState.nhc.last_error = null;
        WV.sourceState.nhc.daily_count = (WV.sourceState.nhc.daily_count || 0) + 1;
        WV.Controls.updateCount('nhc', kml.entities.values.length);
        viewer.scene.requestRender();
      })
      .catch(function (e) {
        WV.sourceState.nhc.last_error = String(e && e.message ? e.message : e);
        console.warn('[nhc] KML load failed', e);
      });
  }

  function reload(viewer) {
    // Remove old datasource before loading fresh one
    if (ds) {
      viewer.dataSources.remove(ds, true);
      ds = null;
    }
    load(viewer);
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    load(viewer);
    refreshTimer = setInterval(function () { reload(viewer); }, WV.sources.nhc.refresh_ms);
    return Promise.resolve();
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) {
      viewer.dataSources.remove(ds, true);
      ds = null;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('nhc', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
