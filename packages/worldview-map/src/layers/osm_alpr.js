// layers/osm_alpr.js — OSM Overpass ALPR (Flock/license-plate reader) cameras.
// Uses PointPrimitiveCollection for performance with potentially 50k+ nodes.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.osm_alpr = (function () {
  var pc = null;          // PointPrimitiveCollection
  var allNodes = [];      // cached full node list
  var refreshTimer = null;
  var enabled = false;
  var POINT_COLOR = new Cesium.Color(1.0, 0.533, 0.0, 1.0); // #ff8800

  function tagsDesc(tags) {
    var keys = ['manufacturer', 'operator', 'surveillance:zone', 'direction'];
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      if (tags[keys[i]]) parts.push(keys[i] + ': ' + tags[keys[i]]);
    }
    return parts.join('\n') || '(no tag data)';
  }

  function renderPoints(viewer) {
    if (!pc) return;
    pc.removeAll();
    var nodes = allNodes;
    var useFilter = nodes.length > 5000;
    var rect = useFilter ? viewer.camera.computeViewRectangle() : null;
    var n = 0;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var lat = node.lat;
      var lon = node.lon;
      if (useFilter && rect) {
        var latR = Cesium.Math.toRadians(lat);
        var lonR = Cesium.Math.toRadians(lon);
        if (latR < rect.south || latR > rect.north ||
            lonR < rect.west  || lonR > rect.east) continue;
      }
      pc.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        color: POINT_COLOR,
        pixelSize: 4,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      n++;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('osm_alpr', allNodes.length);
    viewer.scene.requestRender();
    return n;
  }

  function refresh(viewer) {
    var url = WV.sources.osm_alpr.direct_url;
    var body = 'data=' + encodeURIComponent(
      '[out:json][timeout:25];node["man_made"="surveillance"]["surveillance:type"="ALPR"];out;'
    );
    return WV.fetch('osm_alpr', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
      cache_ttl_ms: 3600000,
    }).then(function (data) {
      allNodes = data.elements || [];
      renderPoints(viewer);
    }).catch(function (e) {
      console.warn('[osm_alpr] refresh failed', e);
    });
  }

  function onCameraChange(viewer) {
    if (!enabled || !pc) return;
    renderPoints(viewer);
  }

  var _cameraHandler = null;

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    if (!pc) {
      pc = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    }
    // Re-render on camera move when in filtered mode
    _cameraHandler = viewer.camera.changed.addEventListener(function () {
      if (allNodes.length > 5000) renderPoints(viewer);
    });
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, WV.sources.osm_alpr.refresh_ms);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (_cameraHandler) { _cameraHandler(); _cameraHandler = null; }
    if (pc) {
      viewer.scene.primitives.remove(pc);
      pc = null;
    }
    allNodes = [];
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('osm_alpr', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
