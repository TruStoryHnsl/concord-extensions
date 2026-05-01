// layers/timezones.js — IANA timezone polygons from static GeoJSON.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.timezones = (function () {
  var ds = null;
  var enabled = false;

  // Hash a UTC offset integer to a distinctive color.
  function offsetColor(offsetMin) {
    // offsetMin ranges roughly -720 to +840
    var hue = ((offsetMin + 720) / 1560 * 360) % 360;
    var h = hue / 360;
    var r, g, b;
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var q = 1 - f;
    switch (i % 6) {
      case 0: r = 1; g = f; b = 0; break;
      case 1: r = q; g = 1; b = 0; break;
      case 2: r = 0; g = 1; b = f; break;
      case 3: r = 0; g = q; b = 1; break;
      case 4: r = f; g = 0; b = 1; break;
      case 5: r = 1; g = 0; b = q; break;
    }
    return new Cesium.Color(r, g, b, 0.18);
  }

  function tzOffsetMin(tzid) {
    try {
      var now = new Date();
      var fmt = new Intl.DateTimeFormat('en', {
        timeZone: tzid,
        timeZoneName: 'shortOffset',
      });
      var parts = fmt.formatToParts(now);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') {
          var m = parts[i].value.match(/GMT([+-])(\d+)(?::(\d+))?/);
          if (m) {
            var sign = m[1] === '+' ? 1 : -1;
            return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
          }
        }
      }
    } catch (e) { /* ignore unknown tz */ }
    return 0;
  }

  function flat(coords) {
    var out = [];
    for (var i = 0; i < coords.length; i++) out.push(coords[i][0], coords[i][1]);
    return out;
  }

  function addPolygon(tzid, ring, color, outline) {
    ds.entities.add({
      name: tzid,
      description: 'Timezone: ' + tzid,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat(ring)),
        material: color,
        outline: true,
        outlineColor: outline,
        outlineWidth: 1,
        height: 0,
      },
    });
  }

  function render(viewer, geojson) {
    if (!ds) return;
    ds.entities.removeAll();
    var features = geojson.features || [];
    var n = 0;
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f.geometry) continue;
      var tzid = (f.properties && f.properties.tzid) || '';
      var offsetMin = tzOffsetMin(tzid);
      var fill = offsetColor(offsetMin);
      var outline = Cesium.Color.WHITE.withAlpha(0.20);
      if (f.geometry.type === 'Polygon') {
        addPolygon(tzid, f.geometry.coordinates[0], fill, outline);
        n++;
      } else if (f.geometry.type === 'MultiPolygon') {
        for (var j = 0; j < f.geometry.coordinates.length; j++) {
          addPolygon(tzid, f.geometry.coordinates[j][0], fill, outline);
          n++;
        }
      }
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('timezones', n);
    viewer.scene.requestRender();
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('timezones');
      viewer.dataSources.add(ds);
    }
    return WV.fetch('timezones', 'data/timezones.geojson').then(function (geojson) {
      render(viewer, geojson);
    }).catch(function (e) {
      console.warn('[timezones] load failed', e);
    });
  }

  function disable(viewer) {
    enabled = false;
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('timezones', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
