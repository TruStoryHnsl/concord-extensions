// layers/maritime.js — Real-time AIS vessel tracking
//
// Primary:  aisstream.io WebSocket (global coverage, free key)
// Fallback: Digitraffic.fi REST polling (Baltic/Nordic, no key needed)
//
// SETUP: Get a free API key at https://aisstream.io (no credit card, 30-second signup)
// Then add to src/config.js:  AISSTREAM_KEY: 'your_key_here'

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.maritime = (function () {

  var billboardCollection = null;
  var labelCollection     = null;
  var socket          = null;
  var vessels         = {};   // MMSI → {lat, lon, name, sog, heading, cog, status}
  var posHistory      = {};   // MMSI → [{lat, lon}, ...]
  var renderTimer     = null;
  var retryTimer      = null;
  var enabled         = false;
  var wsRetries       = 0;
  var restSourceIdx   = 0;
  var trackedMmsi     = null;
  var pathEntity      = null;
  var MAX_VESSELS     = 2000;
  var MAX_WS_RETRIES  = 3;
  var REFRESH_MS      = 30000;
  var MAX_HIST        = 20;
  var FOLLOW_ALT      = 150000;  // 150 km — lower than aircraft since ships are at sea level

  var WS_URL = 'wss://stream.aisstream.io/v0/stream';

  // REST fallback — Finland/Baltic open government AIS data, CORS-enabled, no key needed
  var REST_SOURCES = [
    'https://meri.digitraffic.fi/api/ais/v1/locations',
    'https://corsproxy.io/?' + encodeURIComponent('https://meri.digitraffic.fi/api/ais/v1/locations'),
  ];

  var NAV_STATUS = ['UNDERWAY', 'ANCHORED', 'NOT COMMANDED', 'RESTRICTED', 'CONSTRAINED',
                    'MOORED', 'AGROUND', 'FISHING', 'SAILING', '---', '---', 'TOWING',
                    'TOWING', 'WAITING', 'AIS-SART'];

  function fetchWithTimeout(url, ms) {
    var ctrl = new AbortController();
    var tid  = setTimeout(function () { ctrl.abort(); }, ms);
    return WV.fetch('aisstream', url, { signal: ctrl.signal })
      .then(function (data) { clearTimeout(tid); return data; })
      .catch(function (e)   { clearTimeout(tid); throw e; });
  }

  // ── SHIP ICON ─────────────────────────────────────────────
  // Top-down hull: pointed bow (top / north at 0°), wider amidships, flat stern
  function _makeShipIcon(color, sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx,             sz * 0.05);  // bow
    ctx.quadraticCurveTo(mx + sz * 0.30, sz * 0.30, mx + sz * 0.22, sz * 0.70);
    ctx.lineTo(mx + sz * 0.18, sz * 0.92);  // stern right
    ctx.lineTo(mx - sz * 0.18, sz * 0.92);  // stern left
    ctx.lineTo(mx - sz * 0.22, sz * 0.70);
    ctx.quadraticCurveTo(mx - sz * 0.30, sz * 0.30, mx, sz * 0.05);
    ctx.closePath();
    ctx.fill();
    return c;
  }

  var _shipImg        = _makeShipIcon('rgba(0,170,255,0.85)', 18);
  var _shipImgTracked = _makeShipIcon('#ffffff', 24);

  // ── PATH DRAWING ──────────────────────────────────────────
  function drawPath(viewer, points) {
    if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
    if (!points || points.length < 2) return;
    pathEntity = viewer.entities.add({
      polyline: {
        positions: points.map(function (p) {
          return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 5);
        }),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color:      Cesium.Color.fromCssColorString('#00aaff').withAlpha(0.80),
          dashLength: 16,
          gapColor:   Cesium.Color.TRANSPARENT,
        }),
      },
    });
    viewer.scene.requestRender();
  }

  // ── SELECT / TRACK ────────────────────────────────────────
  function select(mmsi) {
    trackedMmsi = mmsi;
    var v = WV.viewer;
    if (!v) return;

    var hist = posHistory[mmsi];
    if (hist && hist.length > 0) {
      var p = hist[hist.length - 1];
      v.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0), 0),
        { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), FOLLOW_ALT), duration: 1.8 }
      );
      drawPath(v, hist);
    }
    var vd   = vessels[mmsi];
    var name = vd ? (vd.name || mmsi) : mmsi;
    WV.Controls.setStatus('TRACKING: ' + name + ' — CLICK GLOBE TO RELEASE');
  }

  function clearTracking() {
    trackedMmsi = null;
    if (pathEntity && WV.viewer) { WV.viewer.entities.remove(pathEntity); pathEntity = null; }
  }

  // ── VESSEL RENDERING ──────────────────────────────────────
  function buildBillboards(viewer) {
    if (billboardCollection) viewer.scene.primitives.remove(billboardCollection);
    if (labelCollection)     viewer.scene.primitives.remove(labelCollection);
    billboardCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    labelCollection     = viewer.scene.primitives.add(new Cesium.LabelCollection());

    var keys = Object.keys(vessels).slice(0, MAX_VESSELS);
    keys.forEach(function (mmsi) {
      var v         = vessels[mmsi];
      var isTracked = (mmsi === trackedMmsi);
      var hdg       = v.heading !== null ? v.heading : v.cog; // prefer heading, fall back to COG

      billboardCollection.add({
        position: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 10),
        image:    isTracked ? _shipImgTracked : _shipImg,
        rotation: hdg !== null ? -Cesium.Math.toRadians(hdg) : 0,
        scale:    1.0,
        id: {
          _wvType: 'vessel',
          _wvMmsi: mmsi,
          _wvMeta: [
            { key: 'TYPE',    val: 'VESSEL' },
            { key: 'NAME',    val: v.name || 'UNKNOWN' },
            { key: 'MMSI',    val: mmsi },
            { key: 'SPEED',   val: v.sog     !== null ? v.sog.toFixed(1) + ' kt' : '---' },
            { key: 'HEADING', val: v.heading !== null ? v.heading + '°'   : '---' },
            { key: 'STATUS',  val: NAV_STATUS[v.status] || '---' },
          ],
        },
      });
      labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 10),
        text:     v.name || mmsi,
        font:     '9px "Courier New"',
        fillColor:    Cesium.Color.fromCssColorString('#00aaff').withAlpha(0.92),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
        outlineWidth: 2,
        style:              Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset:        new Cesium.Cartesian2(10, -6),
        horizontalOrigin:   Cesium.HorizontalOrigin.LEFT,
        verticalOrigin:     Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance:        new Cesium.NearFarScalar(50000, 1.0, 1500000, 0.0),
        translucencyByDistance: new Cesium.NearFarScalar(50000, 1.0, 1200000, 0.0),
      });
    });

    WV.Controls.updateCount('maritime', keys.length);

    // Keep camera on tracked vessel and refresh path
    if (trackedMmsi && posHistory[trackedMmsi]) {
      var hist = posHistory[trackedMmsi];
      var p    = hist[hist.length - 1];
      if (p) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, FOLLOW_ALT),
          duration: 3.5,
        });
        drawPath(viewer, hist);
      }
    }

    if (WV.viewer) WV.viewer.scene.requestRender();
  }

  // ── WEBSOCKET (aisstream.io) ──────────────────────────────
  function connectWS(viewer) {
    var key = WV.config && WV.config.AISSTREAM_KEY;
    if (!key) return;

    if (socket) { socket.close(); socket = null; }

    socket = new WebSocket(WS_URL);

    socket.onopen = function () {
      wsRetries = 0;
      WV.sourceState.aisstream.last_success_ts = Date.now();
      WV.sourceState.aisstream.last_error = null;
      socket.send(JSON.stringify({
        APIkey:             key,
        BoundingBoxes:      [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ['PositionReport'],
      }));
      WV.Controls.setStatus('MARITIME: AIS stream LIVE');
    };

    socket.onmessage = function (evt) {
      if (!enabled) return;
      WV.sourceState.aisstream.last_success_ts = Date.now();
      try {
        var msg = JSON.parse(evt.data);
        if (msg.MessageType !== 'PositionReport') return;

        var meta = msg.MetaData;
        var pos  = msg.Message && msg.Message.PositionReport;
        if (!meta || !pos) return;

        var mmsi = String(meta.MMSI);
        var lat  = pos.Latitude  || meta.latitude;
        var lon  = pos.Longitude || meta.longitude;
        if (lat === undefined || lon === undefined) return;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;

        vessels[mmsi] = {
          lat:     lat,
          lon:     lon,
          name:    (meta.ShipName || '').trim() || 'MMSI ' + mmsi,
          sog:     pos.Sog !== undefined ? pos.Sog : null,
          heading: pos.TrueHeading !== undefined && pos.TrueHeading !== 511 ? pos.TrueHeading : null,
          cog:     pos.Cog !== undefined ? pos.Cog : null,
          status:  pos.NavigationalStatus || 0,
        };

        if (!posHistory[mmsi]) posHistory[mmsi] = [];
        posHistory[mmsi].push({ lat: lat, lon: lon });
        if (posHistory[mmsi].length > MAX_HIST) posHistory[mmsi].shift();
      } catch (e) { /* ignore malformed */ }
    };

    socket.onerror = function () {
      WV.sourceState.aisstream.last_error = 'ws error';
    };

    socket.onclose = function (evt) {
      WV.sourceState.aisstream.last_error = 'closed: ' + evt.code;
      if (renderTimer) { clearInterval(renderTimer); renderTimer = null; }
      console.warn('maritime WS closed — code:', evt.code, 'reason:', evt.reason || '(none)');
      if (!enabled) return;

      // 1006 = connection failed — REST is already running so nothing more needed
      if (evt.code === 1006 || evt.code === 4001) return;

      wsRetries++;
      if (wsRetries <= MAX_WS_RETRIES) {
        retryTimer = setTimeout(function () { if (enabled) connectWS(viewer); }, wsRetries * 3000);
      }
    };
  }

  // ── REST POLLING (digitraffic.fi) ─────────────────────────
  function parseDigitraffic(data) {
    // GeoJSON FeatureCollection — coordinates: [lon, lat]
    if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      return data.features.filter(function (f) {
        return f.geometry && Array.isArray(f.geometry.coordinates) &&
               f.geometry.coordinates.length >= 2;
      }).map(function (f) {
        var c = f.geometry.coordinates;
        var p = f.properties || {};
        return {
          mmsi:    String(p.mmsi || 0),
          lat:     c[1],
          lon:     c[0],
          name:    p.name || ('MMSI ' + p.mmsi),
          sog:     p.sog !== undefined ? p.sog : null,
          heading: (p.heading !== undefined && p.heading !== 511) ? p.heading : null,
          cog:     p.cog !== undefined ? p.cog : null,
          status:  p.navStat || 0,
        };
      }).filter(function (v) {
        return Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180;
      });
    }

    // Plain array — handles both {x, y} and {longitude, latitude} field names
    var arr = Array.isArray(data) ? data
            : (data.vessels || data.data || data.results || []);
    return arr.filter(function (v) {
      var lat = v.y !== undefined ? v.y : v.latitude;
      var lon = v.x !== undefined ? v.x : v.longitude;
      return lat !== undefined && lon !== undefined &&
             Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    }).map(function (v) {
      var lat = v.y !== undefined ? v.y : v.latitude;
      var lon = v.x !== undefined ? v.x : v.longitude;
      return {
        mmsi:    String(v.mmsi || 0),
        lat:     lat,
        lon:     lon,
        name:    v.name || ('MMSI ' + v.mmsi),
        sog:     v.sog     !== undefined ? v.sog     : null,
        heading: (v.heading !== undefined && v.heading !== 511) ? v.heading : null,
        cog:     v.cog !== undefined ? v.cog : null,
        status:  v.navStat || 0,
      };
    });
  }

  function fetchREST(viewer) {
    if (restSourceIdx >= REST_SOURCES.length) {
      WV.Controls.setStatus('MARITIME: all sources failed — no vessel data available');
      return;
    }

    var url = REST_SOURCES[restSourceIdx];
    fetchWithTimeout(url, 15000)
      .then(function (data) {
        var parsed = parseDigitraffic(data);
        if (parsed.length === 0) throw new Error('no vessels in response');

        // Merge into vessels dict and accumulate position history
        parsed.forEach(function (v) {
          vessels[v.mmsi] = v;
          if (!posHistory[v.mmsi]) posHistory[v.mmsi] = [];
          posHistory[v.mmsi].push({ lat: v.lat, lon: v.lon });
          if (posHistory[v.mmsi].length > MAX_HIST) posHistory[v.mmsi].shift();
        });

        buildBillboards(viewer);
        WV.Controls.setStatus('MARITIME (REST): ' + parsed.length + ' vessels — Baltic/Nordic');
      })
      .catch(function (err) {
        console.warn('maritime REST[' + restSourceIdx + '] failed:', err.message);
        restSourceIdx++;
        fetchREST(viewer);
      });
  }

  function startREST(viewer) {
    restSourceIdx = 0;
    WV.Controls.setStatus('MARITIME: connecting REST feed...');
    fetchREST(viewer);
    renderTimer = setInterval(function () {
      if (enabled) fetchREST(viewer);
    }, REFRESH_MS);
  }

  // ── ENABLE / DISABLE ──────────────────────────────────────
  function enable(viewer) {
    enabled       = true;
    wsRetries     = 0;
    restSourceIdx = 0;
    // Start REST immediately — vessels appear fast regardless of WebSocket status
    startREST(viewer);
    // WebSocket (aisstream.io) disabled — uncomment if key is working:
    // if (WV.config && WV.config.AISSTREAM_KEY) { connectWS(viewer); }
    return Promise.resolve();
  }

  function disable(viewer) {
    enabled = false;
    clearTracking();
    if (retryTimer)          { clearTimeout(retryTimer);     retryTimer      = null; }
    if (renderTimer)         { clearInterval(renderTimer);   renderTimer     = null; }
    if (socket)              { socket.close();               socket          = null; }
    if (billboardCollection) { viewer.scene.primitives.remove(billboardCollection); billboardCollection = null; }
    if (labelCollection)     { viewer.scene.primitives.remove(labelCollection);     labelCollection     = null; }
    vessels    = {};
    posHistory = {};
    WV.Controls.updateCount('maritime', 0);
  }

  return { enable: enable, disable: disable, select: select, clearTracking: clearTracking };

}());
