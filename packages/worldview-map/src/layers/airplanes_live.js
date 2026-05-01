// layers/airplanes_live.js — airplanes.live military aircraft feed.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.airplanes_live = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;

  var ICON = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 18;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ff7700';
    ctx.beginPath();
    ctx.moveTo(9, 1);  ctx.lineTo(11, 6);  ctx.lineTo(17, 9); ctx.lineTo(11, 12);
    ctx.lineTo(11, 17); ctx.lineTo(9, 14); ctx.lineTo(7, 17); ctx.lineTo(7, 12);
    ctx.lineTo(1, 9);  ctx.lineTo(7, 6);   ctx.closePath();  ctx.fill();
    return c;
  })();

  var ICON_URL = ICON.toDataURL();

  function describe(ac) {
    return [
      'Callsign: ' + (ac.flight || ac.callsign || '(unknown)'),
      'Type:     ' + (ac.t || ac.type || '?'),
      'Alt:      ' + (ac.alt_baro != null ? Math.round(ac.alt_baro) + ' ft' : '?'),
      'Speed:    ' + (ac.gs != null ? Math.round(ac.gs) + ' kt' : '?'),
      'Hex:      ' + (ac.hex || ''),
    ].join('\n');
  }

  function render(viewer, data) {
    if (!ds) return;
    ds.entities.removeAll();
    var aircraft = data.ac || [];
    var n = 0;
    for (var i = 0; i < aircraft.length; i++) {
      var ac = aircraft[i];
      var lat = ac.lat;
      var lon = ac.lon;
      if (lat == null || lon == null) continue;
      var altM = (ac.alt_baro != null && isFinite(ac.alt_baro))
        ? ac.alt_baro * 0.3048
        : 0;
      ds.entities.add({
        name: ac.flight || ac.callsign || ac.hex || 'MIL',
        description: describe(ac),
        position: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
        billboard: {
          image: ICON_URL,
          width: 18,
          height: 18,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      n++;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('airplanes_live', n);
    viewer.scene.requestRender();
  }

  function refresh(viewer) {
    return WV.fetch('airplanes_live').then(function (data) {
      render(viewer, data);
    }).catch(function (e) {
      console.warn('[airplanes_live] refresh failed', e);
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('airplanes_live');
      viewer.dataSources.add(ds);
    }
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.airplanes_live.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('airplanes_live', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
