// layers/military.js — Military flight tracking via adsb.lol
// Free public API, no key required: https://api.adsb.lol/v2/mil

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.military = (function () {

  var pointCollection = null;
  var labelCollection = null;
  var updateTimer     = null;
  var enabled         = false;
  var REFRESH_MS      = 30000; // 30 seconds

  var posHistory  = {};   // hex → [{lat, lon, alt}, ...]
  var trackedHex  = null;
  var pathEntity  = null;
  var MAX_HIST    = 20;
  var FOLLOW_ALT  = 280000;

  var API_URL        = 'https://api.adsb.lol/v2/mil';
  var API_URL_PROXY1 = 'https://corsproxy.io/?' + encodeURIComponent(API_URL);
  var API_URL_PROXY2 = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(API_URL);
  var API_URL_PROXY3 = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(API_URL);

  // ── PLANE ICON ───────────────────────────────────────────────
  // Amber top-down aircraft silhouette matching comm flights shape
  function _makePlane(color, sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx,             sz * 0.05);  // nose
    ctx.lineTo(mx + sz * 0.12, sz * 0.38);  // right fuselage
    ctx.lineTo(sz * 0.92,      sz * 0.50);  // right wingtip
    ctx.lineTo(mx + sz * 0.12, sz * 0.62);  // right wing–tail join
    ctx.lineTo(mx + sz * 0.18, sz * 0.92);  // right tail tip
    ctx.lineTo(mx,             sz * 0.78);  // center tail
    ctx.lineTo(mx - sz * 0.18, sz * 0.92);  // left tail tip
    ctx.lineTo(mx - sz * 0.12, sz * 0.62);  // left wing–tail join
    ctx.lineTo(sz * 0.08,      sz * 0.50);  // left wingtip
    ctx.lineTo(mx - sz * 0.12, sz * 0.38);  // left fuselage
    ctx.closePath();
    ctx.fill();
    return c;
  }

  var _planeImg        = _makePlane('rgba(255,170,0,0.90)', 16);
  var _planeImgTracked = _makePlane('#ffffff', 22);

  // ── PATH DRAWING ──────────────────────────────────────────────
  function drawPath(viewer, points) {
    if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
    if (!points || points.length < 2) return;
    pathEntity = viewer.entities.add({
      polyline: {
        positions: points.map(function (p) {
          return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt || 0) + 200);
        }),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color:     Cesium.Color.fromCssColorString('#ffaa00').withAlpha(0.80),
          dashLength: 16,
          gapColor:  Cesium.Color.TRANSPARENT,
        }),
      },
    });
    viewer.scene.requestRender();
  }

  // ── SELECT / TRACK ────────────────────────────────────────────
  function select(hex) {
    trackedHex = hex;
    var v = WV.viewer;
    if (!v) return;

    var hist = posHistory[hex];
    if (hist && hist.length > 0) {
      var p = hist[hist.length - 1];
      v.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt || 0), 0),
        { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), FOLLOW_ALT), duration: 1.8 }
      );
      drawPath(v, hist);
    }
    WV.Controls.setStatus('TRACKING MIL: ' + hex.toUpperCase() + ' — CLICK GLOBE TO RELEASE');
  }

  function clearTracking() {
    trackedHex = null;
    if (pathEntity && WV.viewer) { WV.viewer.entities.remove(pathEntity); pathEntity = null; }
  }

  // ── FETCH + RENDER ────────────────────────────────────────────
  function fetchAndRender(viewer) {
    if (!enabled) return Promise.resolve();

    var fetchData = fetch(API_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('adsb.lol error: ' + r.status);
        return r.json();
      })
      .catch(function (err) {
        console.warn('military direct failed (' + err.message + '), trying corsproxy...');
        return fetch(API_URL_PROXY1)
          .then(function (r) {
            if (!r.ok) throw new Error('corsproxy error: ' + r.status);
            return r.json();
          })
          .catch(function (err2) {
            console.warn('military corsproxy failed (' + err2.message + '), trying codetabs...');
            return fetch(API_URL_PROXY2)
              .then(function (r) { return r.json(); })
              .catch(function (err3) {
                console.warn('military codetabs failed (' + err3.message + '), trying allorigins...');
                return fetch(API_URL_PROXY3).then(function (r) { return r.json(); });
              });
          });
      });

    return fetchData
      .then(function (data) {
        if (!enabled) return;

        var aircraft = (data.ac || []).filter(function (a) {
          return a.lat !== undefined && a.lon !== undefined;
        });

        // Build position history for path trails
        aircraft.forEach(function (a) {
          if (!a.hex) return;
          var alt = a.alt_baro && a.alt_baro !== 'ground'
            ? parseFloat(a.alt_baro) * 0.3048 : 1000;
          if (!posHistory[a.hex]) posHistory[a.hex] = [];
          posHistory[a.hex].push({ lon: a.lon, lat: a.lat, alt: alt });
          if (posHistory[a.hex].length > MAX_HIST) posHistory[a.hex].shift();
        });

        if (pointCollection) viewer.scene.primitives.remove(pointCollection);
        if (labelCollection) viewer.scene.primitives.remove(labelCollection);
        pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
        labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

        aircraft.forEach(function (a) {
          var alt = a.alt_baro && a.alt_baro !== 'ground'
            ? parseFloat(a.alt_baro) * 0.3048 : 1000;
          var isTracked = (a.hex === trackedHex);
          var hdg = a.track;

          pointCollection.add({
            position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, alt + 100),
            image:    isTracked ? _planeImgTracked : _planeImg,
            rotation: hdg !== undefined && hdg !== null ? -Cesium.Math.toRadians(hdg) : 0,
            scale:    1.0,
            id: {
              _wvType: 'military',
              _wvHex:  a.hex,
              _wvMeta: [
                { key: 'TYPE',     val: 'MILITARY' },
                { key: 'CALLSIGN', val: (a.flight || a.hex || '---').trim() },
                { key: 'REG',      val: a.r || '---' },
                { key: 'AIRCRAFT', val: a.t || '---' },
                { key: 'ALT',      val: Math.round(alt) + ' m' },
                { key: 'SPEED',    val: a.gs ? Math.round(a.gs) + ' kt' : '---' },
                { key: 'HEADING',  val: a.track ? Math.round(a.track) + '°' : '---' },
                { key: 'SQUAWK',   val: a.squawk || '---' },
              ],
            },
          });
          var callsign = (a.flight || a.hex || '').trim();
          labelCollection.add({
            position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, alt + 100),
            text:     callsign,
            font:     '9px "Courier New"',
            fillColor:    Cesium.Color.fromCssColorString('#ffaa00').withAlpha(0.92),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 2,
            style:              Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset:        new Cesium.Cartesian2(10, -6),
            horizontalOrigin:   Cesium.HorizontalOrigin.LEFT,
            verticalOrigin:     Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance:        new Cesium.NearFarScalar(150000, 1.0, 3000000, 0.0),
            translucencyByDistance: new Cesium.NearFarScalar(150000, 1.0, 2500000, 0.0),
          });
        });

        // Follow tracked aircraft
        if (trackedHex && posHistory[trackedHex]) {
          var hist = posHistory[trackedHex];
          var p = hist[hist.length - 1];
          if (p) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, FOLLOW_ALT),
              duration: 3.5,
            });
            drawPath(viewer, hist);
          }
        }

        WV.Controls.updateCount('military', aircraft.length);
        WV.Controls.setStatus('MIL: ' + aircraft.length + ' aircraft tracked');
        if (WV.viewer) WV.viewer.scene.requestRender();
      })
      .catch(function (err) {
        console.error('military layer:', err);
        WV.Controls.setStatus('MIL FLIGHTS: fetch error');
      });
  }

  function enable(viewer) {
    enabled = true;
    WV.Controls.setStatus('FETCHING MILITARY FLIGHTS...');
    return fetchAndRender(viewer).then(function () {
      if (enabled) {
        updateTimer = setInterval(function () { fetchAndRender(viewer); }, REFRESH_MS);
      }
    });
  }

  function disable(viewer) {
    enabled = false;
    clearTracking();
    if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
    if (labelCollection) { viewer.scene.primitives.remove(labelCollection); labelCollection = null; }
    if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
    posHistory = {};
    WV.Controls.updateCount('military', 0);
  }

  return { enable: enable, disable: disable, select: select, clearTracking: clearTracking };

}());
