// layers/nws.js — NWS active alerts as severity-keyed polygons.
// Pattern matches existing layers: enable(viewer) returns Promise; disable(viewer) is sync.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.nws = (function () {
  var ds = null;
  var refreshTimer = null;
  var enabled = false;

  var COLOR = {
    Extreme:  Cesium.Color.fromCssColorString('rgba(255,60,60,0.45)'),
    Severe:   Cesium.Color.fromCssColorString('rgba(255,140,40,0.40)'),
    Moderate: Cesium.Color.fromCssColorString('rgba(255,210,60,0.35)'),
    Minor:    Cesium.Color.fromCssColorString('rgba(120,200,255,0.30)'),
    Unknown:  Cesium.Color.fromCssColorString('rgba(200,200,200,0.25)'),
  };

  function flat(coords) {
    var out = [];
    for (var i = 0; i < coords.length; i++) out.push(coords[i][0], coords[i][1]);
    return out;
  }

  function describe(props) {
    var lines = [
      props.event || '',
      props.headline || '',
      '',
      props.description || '',
    ];
    return lines.join('\n');
  }

  function _addPolygon(viewer, ring, props) {
    var sev = props.severity || 'Unknown';
    return ds.entities.add({
      name: props.headline || props.event || 'NWS alert',
      description: describe(props),
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat(ring)),
        material: COLOR[sev] || COLOR.Unknown,
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.55),
        height: 0,
        extrudedHeight: 0,
      },
    });
  }

  function render(viewer, geojson) {
    if (!ds) return;
    ds.entities.removeAll();
    var n = 0;
    (geojson.features || []).forEach(function (f) {
      var props = f.properties || {};
      if (!f.geometry) return;
      if (f.geometry.type === 'Polygon') {
        _addPolygon(viewer, f.geometry.coordinates[0], props);
        n++;
      } else if (f.geometry.type === 'MultiPolygon') {
        f.geometry.coordinates.forEach(function (poly) {
          _addPolygon(viewer, poly[0], props);
          n++;
        });
      }
    });
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('nws', n);
    viewer.scene.requestRender();
  }

  function refresh(viewer) {
    return WV.fetch('nws').then(function (gj) { render(viewer, gj); }).catch(function (e) {
      console.warn('[nws] refresh failed', e);
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    if (!ds) {
      ds = new Cesium.CustomDataSource('nws');
      viewer.dataSources.add(ds);
    }
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.nws.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ds) ds.entities.removeAll();
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('nws', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
