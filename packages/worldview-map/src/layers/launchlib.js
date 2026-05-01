// layers/launchlib.js — Launch Library 2 upcoming launches.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.launchlib = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;

  // Orange triangle (rocket silhouette)
  var ICON_URL = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 20;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(10, 1);
    ctx.lineTo(19, 19);
    ctx.lineTo(10, 15);
    ctx.lineTo(1, 19);
    ctx.closePath();
    ctx.fill();
    return c.toDataURL();
  })();

  function describe(launch) {
    var pad = launch.pad || {};
    var loc = pad.location || pad;
    return [
      'Name:    ' + (launch.name || ''),
      'Mission: ' + (launch.mission && launch.mission.name || '?'),
      'Status:  ' + (launch.status && (launch.status.abbrev || launch.status.name) || '?'),
      'NET:     ' + (launch.net || '?'),
      'Pad:     ' + (pad.name || '?'),
      'Vehicle: ' + (launch.rocket && launch.rocket.configuration && launch.rocket.configuration.name || '?'),
    ].join('\n');
  }

  function render(viewer, data) {
    if (!ds) return;
    ds.entities.removeAll();
    var launches = data.results || [];
    var n = 0;
    for (var i = 0; i < launches.length; i++) {
      var launch = launches[i];
      var pad = launch.pad || {};
      var loc = pad.location || {};
      // API 2.3.0 uses pad.latitude / pad.longitude directly
      var lat = parseFloat(pad.latitude || loc.latitude);
      var lon = parseFloat(pad.longitude || loc.longitude);
      if (isNaN(lat) || isNaN(lon)) continue;
      ds.entities.add({
        name: launch.name || 'Launch',
        description: describe(launch),
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        billboard: {
          image: ICON_URL,
          width: 20,
          height: 20,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      n++;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('launchlib', n);
    viewer.scene.requestRender();
  }

  function refresh(viewer) {
    var url = WV.sources.launchlib.direct_url;
    var opts = {};
    var token = WV.config && WV.config.LAUNCHLIB_TOKEN;
    if (token) opts.headers = { Authorization: 'Token ' + token };
    return WV.fetch('launchlib', url, opts).then(function (data) {
      render(viewer, data);
    }).catch(function (e) {
      console.warn('[launchlib] refresh failed', e);
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('launchlib');
      viewer.dataSources.add(ds);
    }
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.launchlib.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('launchlib', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
