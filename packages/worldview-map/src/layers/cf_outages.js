// layers/cf_outages.js — Cloudflare Radar internet outage annotations.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.cf_outages = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;

  var COUNTRY_CENTROIDS = {
    US: [39.8, -98.6],  CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9],
    GB: [55.4, -3.4],   DE: [51.2, 10.5],   FR: [46.6, 2.2],    IT: [41.9, 12.6],
    ES: [40.5, -3.7],   RU: [61.5, 105.3],  CN: [35.9, 104.2],  JP: [36.2, 138.3],
    IN: [20.6, 78.9],   AU: [-25.3, 133.8], NZ: [-41.0, 174.9], ZA: [-30.6, 22.9],
    NG: [9.1, 8.7],     EG: [26.8, 30.8],   TR: [38.9, 35.2],   IR: [32.4, 53.7],
    UA: [48.4, 31.2],   PK: [30.4, 69.3],   KR: [35.9, 127.8],  TH: [15.9, 100.9],
    VN: [14.1, 108.3],  ID: [-0.8, 113.9],  PH: [13.0, 122.0],  AR: [-38.4, -63.6],
    CL: [-35.7, -71.5], PE: [-9.2, -75.0],  CO: [4.6, -74.3],   VE: [6.4, -66.6],
    SA: [23.9, 45.1],   AE: [23.4, 53.8],   IL: [31.0, 34.9],   JO: [30.6, 36.2],
  };

  // Pulsing red circle
  var DOT_URL = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 16;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(8, 8, 1, 8, 8, 7);
    grad.addColorStop(0, 'rgba(255,30,30,1)');
    grad.addColorStop(0.5, 'rgba(255,30,30,0.7)');
    grad.addColorStop(1, 'rgba(255,30,30,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(8, 8, 7, 0, 2 * Math.PI);
    ctx.fill();
    return c.toDataURL();
  })();

  function describe(outage) {
    return [
      'Country: ' + (outage.locations && outage.locations.join(', ') || '?'),
      'Type:    ' + (outage.outageType || outage.type || '?'),
      'Scope:   ' + (outage.scope || '?'),
      'Start:   ' + (outage.startDate || outage.start_date || '?'),
    ].join('\n');
  }

  function render(viewer, data) {
    if (!ds) return;
    ds.entities.removeAll();
    var outages = (data.result && data.result.annotations) || data.annotations || [];
    var n = 0;
    for (var i = 0; i < outages.length; i++) {
      var outage = outages[i];
      var locs = outage.locations || (outage.location ? [outage.location] : []);
      for (var j = 0; j < locs.length; j++) {
        var code = (locs[j] || '').toUpperCase().trim();
        var centroid = COUNTRY_CENTROIDS[code] || [0, 0];
        var lat = centroid[0];
        var lon = centroid[1];
        ds.entities.add({
          name: 'Net Outage: ' + (code || '?'),
          description: describe(outage),
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          billboard: {
            image: DOT_URL,
            width: 16,
            height: 16,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        n++;
      }
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('cf_outages', n);
    viewer.scene.requestRender();
  }

  function refresh(viewer) {
    var token = WV.config && WV.config.CLOUDFLARE_RADAR_TOKEN;
    if (!token) {
      WV.sourceState.cf_outages.last_error = 'no CLOUDFLARE_RADAR_TOKEN';
      return Promise.resolve();
    }
    var url = WV.sources.cf_outages.direct_url;
    return WV.fetch('cf_outages', url, {
      headers: { Authorization: 'Bearer ' + token },
    }).then(function (data) {
      render(viewer, data);
    }).catch(function (e) {
      console.warn('[cf_outages] refresh failed', e);
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    var token = WV.config && WV.config.CLOUDFLARE_RADAR_TOKEN;
    if (!token) {
      WV.sourceState.cf_outages.last_error = 'no CLOUDFLARE_RADAR_TOKEN';
      console.warn('[cf_outages] no CLOUDFLARE_RADAR_TOKEN configured');
      return Promise.resolve();
    }
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('cf_outages');
      viewer.dataSources.add(ds);
    }
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.cf_outages.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('cf_outages', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
