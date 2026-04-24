// layers/jamming.js — GPS jamming / interference zones
// Static OSINT data — sourced from GPSJam.org, EUROCONTROL NOTAMs,
// OSINTdefender, and open-source military analysis (2023-2025)

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.jamming = (function () {

  var entities = [];

  // Chronic GPS jamming zones — severity based on frequency + area of reported interference
  var ZONES = [
    // ── HIGH severity — persistent, multi-source confirmed ──────────────
    { name: 'IRAN / IRAQ',        lat:  33.0, lon:  45.0, rMin: 500000, rMaj: 800000, sev: 'HIGH' },
    { name: 'SYRIA / LEBANON',    lat:  34.5, lon:  37.5, rMin: 350000, rMaj: 520000, sev: 'HIGH' },
    { name: 'ISRAEL / GAZA',      lat:  31.8, lon:  34.9, rMin: 200000, rMaj: 360000, sev: 'HIGH' },
    { name: 'UKRAINE / E. FRONT', lat:  48.5, lon:  37.0, rMin: 420000, rMaj: 680000, sev: 'HIGH' },
    { name: 'BLACK SEA',          lat:  43.5, lon:  34.5, rMin: 380000, rMaj: 700000, sev: 'HIGH' },

    // ── MED severity — frequent, reported by multiple OSINT sources ─────
    { name: 'KALININGRAD',        lat:  54.7, lon:  20.5, rMin: 200000, rMaj: 370000, sev: 'MED'  },
    { name: 'ST. PETERSBURG',     lat:  60.0, lon:  30.3, rMin: 180000, rMaj: 300000, sev: 'MED'  },
    { name: 'RED SEA / YEMEN',    lat:  15.0, lon:  43.0, rMin: 350000, rMaj: 600000, sev: 'MED'  },
    { name: 'STRAIT OF HORMUZ',   lat:  26.6, lon:  56.2, rMin: 200000, rMaj: 420000, sev: 'MED'  },
    { name: 'CYPRUS / E. MED',    lat:  35.5, lon:  34.5, rMin: 250000, rMaj: 420000, sev: 'MED'  },
    { name: 'KOREA DMZ',          lat:  38.0, lon: 126.5, rMin: 200000, rMaj: 320000, sev: 'MED'  },

    // ── LOW severity — occasional / periodic reports ────────────────────
    { name: 'SINAI / EGYPT',      lat:  29.5, lon:  33.7, rMin: 150000, rMaj: 260000, sev: 'LOW'  },
    { name: 'AZERBAIJAN',         lat:  40.3, lon:  47.5, rMin: 150000, rMaj: 260000, sev: 'LOW'  },
    { name: 'LIBYA',              lat:  27.0, lon:  16.0, rMin: 200000, rMaj: 360000, sev: 'LOW'  },
  ];

  var COLOR = {
    HIGH: { fill: '#ff2200', alpha: 0.48, outline: '#ff5533', oAlpha: 0.85 },
    MED:  { fill: '#ff8800', alpha: 0.35, outline: '#ffaa44', oAlpha: 0.75 },
    LOW:  { fill: '#ffcc00', alpha: 0.25, outline: '#ffe066', oAlpha: 0.65 },
  };

  function enable(viewer) {
    return new Promise(function (resolve) {
      ZONES.forEach(function (z) {
        var c = COLOR[z.sev];

        // Jamming ellipse
        var ellipseEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat),
          ellipse: {
            semiMinorAxis: z.rMin,
            semiMajorAxis: z.rMaj,
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.fromCssColorString(c.fill).withAlpha(c.alpha)
            ),
            outline:        true,
            outlineColor:   Cesium.Color.fromCssColorString(c.outline).withAlpha(c.oAlpha),
            outlineWidth:   1.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          _wvType: 'jamming',
          _wvLat:  z.lat,
          _wvLon:  z.lon,
          _wvMeta: [
            { key: 'TYPE',     val: 'GPS JAMMING' },
            { key: 'ZONE',     val: z.name },
            { key: 'SEVERITY', val: z.sev },
            { key: 'SOURCE',   val: 'GPSJam / EUROCONTROL / OSINT' },
            { key: 'RADIUS',   val: Math.round(z.rMaj / 1000) + ' km' },
          ],
        });
        entities.push(ellipseEntity);

        // Zone label — visible from medium zoom, fades at globe level
        var labelEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat, 2000),
          label: {
            text:            z.name + '\n[JAM ' + z.sev + ']',
            font:            '10px monospace',
            fillColor:       Cesium.Color.fromCssColorString(c.outline).withAlpha(0.95),
            outlineColor:    Cesium.Color.BLACK.withAlpha(0.7),
            outlineWidth:    2,
            style:           Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin:  Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            pixelOffset:     new Cesium.Cartesian2(0, 0),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.4, 8000000, 0.0),
            translucencyByDistance: new Cesium.NearFarScalar(200000, 1.0, 5000000, 0.0),
          },
        });
        entities.push(labelEntity);
      });

      WV.Controls.updateCount('jamming', ZONES.length);
      WV.Controls.setStatus('GPS JAM: ' + ZONES.length + ' active interference zones');
      viewer.scene.requestRender();
      resolve();
    });
  }

  function disable(viewer) {
    entities.forEach(function (e) { viewer.entities.remove(e); });
    entities = [];
    WV.Controls.updateCount('jamming', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
