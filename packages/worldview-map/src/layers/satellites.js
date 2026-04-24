// layers/satellites.js — Real-time TLE satellite tracking via SGP4 orbit propagation
// Uses satellite.js for position propagation

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.satellites = (function () {

  var billboardCollection = null;
  var labelCollection     = null;
  var satrecs             = [];
  var updateTimer         = null;
  var trackedIdx          = null;
  var pathEntity          = null;
  var MAX_SATS            = 2000;

  // SatNOGS is the best free TLE source but has no CORS headers — route through proxies.
  // CelesTrak GP.php endpoint is 404; pub/TLE/ files return 403 for all proxy IPs.
  var _SATNOGS   = 'https://db.satnogs.org/api/tle/?format=json&page_size=2000';
  var _CELESTRAK = 'https://celestrak.org/pub/TLE/active.txt';

  var TLE_SOURCES = [
    // SatNOGS via corsproxy — SatNOGS doesn't block proxy IPs (unlike CelesTrak)
    { url: 'https://corsproxy.io/?' + encodeURIComponent(_SATNOGS),
      isJson: true,  parser: 'satnogs' },
    // SatNOGS via codetabs — second proxy pool
    { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(_SATNOGS),
      isJson: true,  parser: 'satnogs' },
    // CelesTrak text via codetabs — different IP pool, may not be on their blocklist
    { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(_CELESTRAK),
      isJson: false, parser: 'tle' },
    // CelesTrak text via allorigins — last resort (fails from localhost, works in prod)
    { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(_CELESTRAK),
      isJson: false, parser: 'tle' },
  ];

  function fetchWithTimeout(url, ms) {
    var ctrl = new AbortController();
    var tid  = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) { clearTimeout(tid); return r; })
      .catch(function (e) { clearTimeout(tid); throw e; });
  }

  // ── PARSERS ────────────────────────────────────────────────

  function parseTLE(text) {
    var lines  = text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var result = [];
    for (var i = 0; i + 2 < lines.length; i += 3) {
      var l1 = lines[i + 1];
      var l2 = lines[i + 2];
      if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
      try {
        var satrec = satellite.twoline2satrec(l1, l2);
        result.push({ name: lines[i].replace(/^0 /, ''), satrec: satrec });
      } catch (e) { /* skip bad TLE */ }
    }
    return result;
  }

  function parseCelesTrakJson(data) {
    var arr = Array.isArray(data) ? data : [];
    var result = [];
    arr.forEach(function (s) {
      if (s.TLE_LINE1 && s.TLE_LINE2) {
        try {
          var satrec = satellite.twoline2satrec(s.TLE_LINE1, s.TLE_LINE2);
          result.push({ name: s.OBJECT_NAME || 'UNKNOWN', satrec: satrec });
        } catch (e) { /* skip */ }
      }
    });
    return result;
  }

  function parseSatNogsJson(data) {
    var arr = data.results || data;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    var lines = [];
    arr.forEach(function (s) {
      if (s.tle1 && s.tle2) {
        lines.push((s.tle0 || s.name || 'UNKNOWN'), s.tle1, s.tle2);
      }
    });
    return parseTLE(lines.join('\n'));
  }

  // ── FETCH WITH SOURCE FALLBACK ─────────────────────────────
  function tryNext(sources, idx) {
    if (idx >= sources.length) return Promise.reject(new Error('all TLE sources failed'));
    var src = sources[idx];
    console.log('SAT: trying', src.url.substring(0, 70));
    return fetchWithTimeout(src.url, 20000)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return src.isJson ? r.json() : r.text();
      })
      .then(function (data) {
        var parsed;
        if      (src.parser === 'celestrak') parsed = parseCelesTrakJson(data);
        else if (src.parser === 'satnogs')   parsed = parseSatNogsJson(data);
        else                                 parsed = parseTLE(data);
        if (parsed.length === 0) throw new Error('no satellites parsed');
        console.log('SAT: got', parsed.length, 'satellites from source', idx);
        return parsed;
      })
      .catch(function (err) {
        console.warn('SAT source ' + idx + ' failed: ' + err.message);
        return tryNext(sources, idx + 1);
      });
  }

  // ── SATELLITE ICON ─────────────────────────────────────────
  // Canvas-drawn: rectangular body + two solar panel wings
  function _makeSatIcon(color, sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2, my = sz / 2;
    var bw  = sz * 0.26;   // body half-size

    ctx.fillStyle = color;

    // Body
    ctx.fillRect(mx - bw, my - bw, bw * 2, bw * 2);

    // Solar panels (horizontal, left + right of body)
    var pw = sz * 0.30, ph = sz * 0.14;
    ctx.fillRect(mx - bw - pw, my - ph / 2, pw, ph);
    ctx.fillRect(mx + bw,      my - ph / 2, pw, ph);

    return c;
  }

  var _satImg        = _makeSatIcon('rgba(0,255,136,0.82)', 18);
  var _satImgTracked = _makeSatIcon('#ffffff', 24);

  // ── POSITION PROPAGATION ───────────────────────────────────
  function getPos(satrec, date) {
    try {
      var pv = satellite.propagate(satrec, date);
      if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
      var gmst = satellite.gstime(date);
      var gd   = satellite.eciToGeodetic(pv.position, gmst);
      var alt  = gd.height * 1000; // km → metres
      if (alt < 0) return null;
      return {
        lon: satellite.degreesLong(gd.longitude),
        lat: satellite.degreesLat(gd.latitude),
        alt: alt,
      };
    } catch (e) { return null; }
  }

  // ── ORBITAL PATH ───────────────────────────────────────────
  // Propagate forward ~95 min (covers one full LEO orbit) in 1-min steps
  function drawOrbit(satrec) {
    var v = WV.viewer;
    if (!v) return;
    if (pathEntity) { v.entities.remove(pathEntity); pathEntity = null; }

    var now    = new Date();
    var points = [];
    for (var t = 0; t <= 95; t++) {
      var d   = new Date(now.getTime() + t * 60000);
      var pos = getPos(satrec, d);
      if (pos) {
        points.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt));
      }
    }
    if (points.length < 2) return;

    pathEntity = v.entities.add({
      polyline: {
        positions: points,
        width:     1.5,
        arcType:   Cesium.ArcType.NONE,   // straight Cartesian = correct for 3D orbital arc
        material:  new Cesium.PolylineDashMaterialProperty({
          color:      Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.55),
          dashLength: 14,
          gapColor:   Cesium.Color.TRANSPARENT,
        }),
      },
    });
    v.scene.requestRender();
  }

  // ── SELECT / TRACK ─────────────────────────────────────────
  function select(idx) {
    // Reset previous tracked icon
    if (trackedIdx !== null && billboardCollection && trackedIdx < billboardCollection.length) {
      billboardCollection.get(trackedIdx).image = _satImg;
    }
    trackedIdx = idx;

    var s = satrecs[idx];
    if (!s || !WV.viewer) return;

    // Highlight newly selected satellite
    if (billboardCollection && idx < billboardCollection.length) {
      billboardCollection.get(idx).image = _satImgTracked;
    }

    // Fly camera to satellite position
    var pos = getPos(s.satrec, new Date());
    if (pos) {
      WV.viewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt), 0),
        { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 2500000), duration: 1.8 }
      );
    }

    drawOrbit(s.satrec);
    WV.Controls.setStatus('TRACKING: ' + s.name + ' — CLICK GLOBE TO RELEASE');
    WV.viewer.scene.requestRender();
  }

  function clearTracking() {
    if (trackedIdx !== null && billboardCollection && trackedIdx < billboardCollection.length) {
      billboardCollection.get(trackedIdx).image = _satImg;
    }
    trackedIdx = null;
    if (pathEntity && WV.viewer) {
      WV.viewer.entities.remove(pathEntity);
      pathEntity = null;
    }
    if (WV.viewer) WV.viewer.scene.requestRender();
  }

  // ── POSITION REFRESH ──────────────────────────────────────
  function refreshPositions() {
    if (!billboardCollection || !WV.viewer) return;
    var date = new Date();
    for (var i = 0; i < satrecs.length; i++) {
      var bb  = billboardCollection.get(i);
      var lbl = labelCollection ? labelCollection.get(i) : null;
      var pos = getPos(satrecs[i].satrec, date);
      if (pos) {
        var cart = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
        bb.position  = cart;
        bb.show      = true;
        if (lbl) { lbl.position = cart; lbl.show = true; }
      } else {
        bb.show = false;
        if (lbl) lbl.show = false;
      }
    }
    WV.viewer.scene.requestRender();
  }

  // ── ENABLE ─────────────────────────────────────────────────
  function enable(viewer) {
    if (typeof satellite === 'undefined') {
      WV.Controls.setStatus('SAT ERROR: satellite.js failed to load');
      return Promise.reject(new Error('satellite.js not loaded'));
    }
    WV.Controls.setStatus('FETCHING SATELLITE TLE DATA...');

    return tryNext(TLE_SOURCES, 0)
      .then(function (all) {
        satrecs = all.slice(0, MAX_SATS);
        var date = new Date();

        billboardCollection = viewer.scene.primitives.add(
          new Cesium.BillboardCollection()
        );
        labelCollection = viewer.scene.primitives.add(
          new Cesium.LabelCollection()
        );

        satrecs.forEach(function (s, i) {
          var pos = getPos(s.satrec, date);
          var cartPos = pos
            ? Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt)
            : Cesium.Cartesian3.ZERO;
          billboardCollection.add({
            position: cartPos,
            image:    _satImg,
            scale:    1.0,
            show:     !!pos,
            id: {
              _wvType: 'satellite',
              _wvIdx:  i,
              _wvMeta: [
                { key: 'TYPE', val: 'SATELLITE' },
                { key: 'NAME', val: s.name },
              ],
            },
          });
          // Truncate long names (e.g. "STARLINK-1234" → keep as-is, "OBJECT..." → trim)
          var label = s.name.length > 16 ? s.name.substring(0, 14) + '..' : s.name;
          labelCollection.add({
            position: cartPos,
            text:     label,
            show:     !!pos,
            font:     '8px "Courier New"',
            fillColor:    Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.90),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 2,
            style:              Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset:        new Cesium.Cartesian2(10, -5),
            horizontalOrigin:   Cesium.HorizontalOrigin.LEFT,
            verticalOrigin:     Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance:        new Cesium.NearFarScalar(500000, 1.0, 8000000, 0.0),
            translucencyByDistance: new Cesium.NearFarScalar(500000, 1.0, 6000000, 0.0),
          });
        });

        WV.Controls.updateCount('satellites', satrecs.length);
        WV.Controls.setStatus('SATELLITES: ' + satrecs.length + ' tracked');
        viewer.scene.requestRender();

        updateTimer = setInterval(refreshPositions, 30000);
      })
      .catch(function (err) {
        console.error('satellites:', err);
        WV.Controls.setStatus('SAT: all data sources failed — check console');
      });
  }

  // ── DISABLE ────────────────────────────────────────────────
  function disable(viewer) {
    clearTracking();
    if (billboardCollection) {
      viewer.scene.primitives.remove(billboardCollection);
      billboardCollection = null;
    }
    if (labelCollection) {
      viewer.scene.primitives.remove(labelCollection);
      labelCollection = null;
    }
    if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
    satrecs = [];
    WV.Controls.updateCount('satellites', 0);
  }

  return { enable: enable, disable: disable, select: select, clearTracking: clearTracking };

}());
