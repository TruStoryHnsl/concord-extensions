// layers/firms.js — NASA FIRMS VIIRS wildfire hotspots.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.firms = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;

  var DOT_URL = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 12;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(6, 6, 5, 0, 2 * Math.PI);
    ctx.fill();
    return c.toDataURL();
  })();

  function describe(row, headers) {
    function col(name) {
      var i = headers.indexOf(name);
      return i >= 0 ? row[i] : '';
    }
    return [
      'Lat/Lon:    ' + col('latitude') + ', ' + col('longitude'),
      'Brightness: ' + col('bright_ti4') + ' K',
      'Confidence: ' + col('confidence'),
      'Satellite:  ' + col('satellite'),
      'Date:       ' + col('acq_date') + ' ' + col('acq_time'),
    ].join('\n');
  }

  function render(viewer, csv) {
    if (!ds) return;
    ds.entities.removeAll();
    var lines = csv.split('\n');
    if (lines.length < 2) return;
    var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
    var latIdx  = headers.indexOf('latitude');
    var lonIdx  = headers.indexOf('longitude');
    var briIdx  = headers.indexOf('bright_ti4');
    var confIdx = headers.indexOf('confidence');
    var n = 0;
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',');
      if (cols[confIdx] === 'l' || cols[confIdx] === '"l"') continue; // skip low confidence
      var lat = parseFloat(cols[latIdx]);
      var lon = parseFloat(cols[lonIdx]);
      if (isNaN(lat) || isNaN(lon)) continue;
      var brightness = parseFloat(cols[briIdx]) || 300;
      // Scale: 300K → size 8, 400K → size 24 (clamped)
      var size = Math.min(24, Math.max(8, ((brightness - 300) / 100) * 16 + 8));
      ds.entities.add({
        name: 'Wildfire @ ' + lat.toFixed(3) + ', ' + lon.toFixed(3),
        description: describe(cols, headers),
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        billboard: {
          image: DOT_URL,
          width: size,
          height: size,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      n++;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('firms', n);
    viewer.scene.requestRender();
  }

  function refresh(viewer) {
    var key = WV.config && WV.config.FIRMS_MAP_KEY;
    if (!key) {
      WV.sourceState.firms.last_error = 'no FIRMS_MAP_KEY';
      return Promise.resolve();
    }
    var url = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/' + key + '/VIIRS_SNPP_NRT/world/1';
    return WV.fetch('firms', url, { as: 'text' }).then(function (csv) {
      render(viewer, csv);
    }).catch(function (e) {
      console.warn('[firms] refresh failed', e);
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    var key = WV.config && WV.config.FIRMS_MAP_KEY;
    if (!key) {
      WV.sourceState.firms.last_error = 'no FIRMS_MAP_KEY';
      console.warn('[firms] no FIRMS_MAP_KEY configured');
      return Promise.resolve();
    }
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('firms');
      viewer.dataSources.add(ds);
    }
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.firms.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('firms', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
