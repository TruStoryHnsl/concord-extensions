// layers/seismic.js — USGS real-time earthquake feed

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.seismic = (function () {

  var entities = [];
  var enabled  = false;

  function enable(viewer) {
    enabled = true;
    return new Promise(function (resolve, reject) {
      WV.fetch('usgs')
        .then(function (data) {
          if (!enabled) { resolve(); return; } // disabled while fetching

          var features = data.features || [];
          features.forEach(function (f) {
            var coords = f.geometry.coordinates; // [lon, lat, depth]
            var mag    = f.properties.mag || 0;
            var place  = f.properties.place || 'Unknown';

            var size = Math.max(4, mag * 4);
            var entity = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1]),
              ellipse: {
                semiMinorAxis: size * 15000,
                semiMajorAxis: size * 15000,
                material: new Cesium.ColorMaterialProperty(
                  Cesium.Color.fromCssColorString('#ff3300').withAlpha(0.55)
                ),
                outline:      true,
                outlineColor: Cesium.Color.fromCssColorString('#ff6600').withAlpha(0.9),
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              _wvType: 'seismic',
              _wvLat:  coords[1],
              _wvLon:  coords[0],
              _wvMeta: [
                { key: 'TYPE',     val: 'SEISMIC' },
                { key: 'MAG',      val: 'M' + mag.toFixed(1) },
                { key: 'LOCATION', val: place },
                { key: 'DEPTH',    val: coords[2] + ' km' },
              ],
            });
            entities.push(entity);
          });

          WV.Controls.updateCount('seismic', entities.length);
          WV.Controls.setStatus('SEISMIC: ' + entities.length + ' events (24h)');
          viewer.scene.requestRender();
          resolve();
        })
        .catch(reject);
    });
  }

  function disable(viewer) {
    enabled = false;
    entities.forEach(function (e) { viewer.entities.remove(e); });
    entities = [];
    WV.Controls.updateCount('seismic', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
