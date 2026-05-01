// layers/flights.js — OpenSky Network live commercial flights
// Auth handled server-side by server.py proxy (avoids CORS).

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.flights = (function () {

  var pointCollection = null;
  var labelCollection = null;
  var updateTimer     = null;
  var animFrame       = null;
  var enabled         = false;

  var posHistory  = {};
  var trackedIcao = null;
  var pathEntity  = null;
  var MAX_HIST    = 30;
  var FOLLOW_ALT  = 280000;

  var REFRESH_MS = 15000;

  // Dead-reckoning state: keyed by icao24
  var _liveState    = {};
  var _trackEntity  = null;  // invisible entity the camera follows
  var _modelEntity  = null;  // 3D model for tracked plane

  // Tween + heading-easing state
  var TWEEN_MS    = 1500;
  var _tween      = null;
  var _curHeading = null;

  var MODEL_URI     = 'src/models/plane.glb';
  var MODEL_SCALE   = 30;
  var MODEL_MIN_PX  = 16;
  var CHASE_RANGE   = 6000;    // camera distance in meters for chase view
  var CHASE_PITCH   = -20;     // degrees — slight downward look

  var IDX = {
    icao24: 0, callsign: 1, origin: 2,
    lon: 5, lat: 6, baro_alt: 7, on_ground: 8,
    velocity: 9, heading: 10, squawk: 14,
  };

  // ── PLANE BILLBOARD ICON ─────────────────────────────────
  function _makePlane(color, sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx,             sz * 0.05);
    ctx.lineTo(mx + sz * 0.12, sz * 0.38);
    ctx.lineTo(sz * 0.92,      sz * 0.50);
    ctx.lineTo(mx + sz * 0.12, sz * 0.62);
    ctx.lineTo(mx + sz * 0.18, sz * 0.92);
    ctx.lineTo(mx,             sz * 0.78);
    ctx.lineTo(mx - sz * 0.18, sz * 0.92);
    ctx.lineTo(mx - sz * 0.12, sz * 0.62);
    ctx.lineTo(sz * 0.08,      sz * 0.50);
    ctx.lineTo(mx - sz * 0.12, sz * 0.38);
    ctx.closePath();
    ctx.fill();
    return c;
  }

  var _planeImg = _makePlane('rgba(255,255,255,0.85)', 16);

  // ── ORIENTATION HELPER ────────────────────────────────────
  // Cesium Air model faces east (+X) at heading 0, so subtract 90° to align nose with north=0°
  function _hprOrientation(lat, lon, alt, heading) {
    var pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
    var hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians((heading || 0) - 90), 0, 0
    );
    return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
  }

  // ── DEAD RECKONING ───────────────────────────────────────
  function _drPredict(state, now) {
    if (!state.velocity || state.heading == null) return state;
    var dt = (now - state.timestamp) / 1000;
    if (dt < 0 || dt > 30) return state;
    var R    = 6371000;
    var d    = state.velocity * dt;
    var brg  = Cesium.Math.toRadians(state.heading);
    var lat1 = Cesium.Math.toRadians(state.lat);
    var lon1 = Cesium.Math.toRadians(state.lon);
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) +
                         Math.cos(lat1) * Math.sin(d / R) * Math.cos(brg));
    var lon2 = lon1 + Math.atan2(
      Math.sin(brg) * Math.sin(d / R) * Math.cos(lat1),
      Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
    );
    return Object.assign({}, state, {
      lat:       Cesium.Math.toDegrees(lat2),
      lon:       Cesium.Math.toDegrees(lon2),
      timestamp: now,
    });
  }

  // ── HEADING EASING ───────────────────────────────────────
  function _easedHeading(target) {
    if (_curHeading == null) { _curHeading = target; return target; }
    var delta = ((target - _curHeading + 540) % 360) - 180;
    _curHeading += delta * 0.10;
    return _curHeading;
  }

  // ── TWEEN HELPERS ────────────────────────────────────────
  function _onFreshState(state) {
    var prev = _liveState[trackedIcao];
    if (prev) {
      var pred = _drPredict(prev, Date.now());
      _tween = {
        from_lat: pred.lat, from_lon: pred.lon, from_alt: pred.baro_alt || 10000,
        to_lat:   state.lat, to_lon:  state.lon, to_alt:  state.baro_alt || 10000,
        t0: Date.now(),
      };
    }
    _liveState[trackedIcao] = state;
  }

  function _tweenedPosition() {
    var s = _liveState[trackedIcao];
    if (!s) return null;
    if (!_tween) return _drPredict(s, Date.now());
    var k = Math.min(1, (Date.now() - _tween.t0) / TWEEN_MS);
    if (k >= 1) { _tween = null; return _drPredict(s, Date.now()); }
    return {
      lat:      _tween.from_lat + (_tween.to_lat  - _tween.from_lat) * k,
      lon:      _tween.from_lon + (_tween.to_lon  - _tween.from_lon) * k,
      baro_alt: _tween.from_alt + (_tween.to_alt  - _tween.from_alt) * k,
      heading:  s.heading,
    };
  }

  // ── 3D MODEL FOR TRACKED PLANE ────────────────────────────
  function _createModelEntity(viewer, state) {
    var alt = (state.baro_alt || state.alt || 10000) + 100;
    _modelEntity = viewer.entities.add({
      position:    Cesium.Cartesian3.fromDegrees(state.lon, state.lat, alt),
      orientation: _hprOrientation(state.lat, state.lon, alt, state.heading),
      model: {
        uri:              MODEL_URI,
        scale:            MODEL_SCALE,
        minimumPixelSize: MODEL_MIN_PX,
        silhouetteColor:  Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.5),
        silhouetteSize:   1.5,
      },
    });
  }

  function _removeModelEntity(viewer) {
    if (_modelEntity) { viewer.entities.remove(_modelEntity); _modelEntity = null; }
  }

  // ── TRACKING LOOP ────────────────────────────────────────
  function _startDRLoop() {
    if (animFrame) return;
    var viewer = WV.viewer;
    if (!viewer) return;

    viewer.targetFrameRate = 60;
    viewer.requestRenderMode = false;

    function tick() {
      if (!trackedIcao || !enabled) { _stopTracking(); return; }

      var state = _liveState[trackedIcao];
      if (state) {
        var pos = _tweenedPosition();
        var alt = (pos ? (pos.baro_alt || 10000) : 10000);

        // Move the invisible anchor — camera follows via trackedEntity
        if (_trackEntity && pos) {
          _trackEntity.position = Cesium.Cartesian3.fromDegrees(
            pos.lon, pos.lat, alt
          );
        }

        // Update 3D model position + orientation
        if (_modelEntity && pos) {
          _modelEntity.position = Cesium.Cartesian3.fromDegrees(
            pos.lon, pos.lat, alt
          );
          _modelEntity.orientation = _hprOrientation(
            pos.lat, pos.lon, alt, _easedHeading(state.heading)
          );
        }

        // Hide the tracked plane's billboard
        if (pointCollection) {
          var count = pointCollection.length;
          for (var i = 0; i < count; i++) {
            var bb = pointCollection.get(i);
            if (bb.id && bb.id._wvIcao === trackedIcao) {
              bb.show = false;
              break;
            }
          }
        }
      }

      animFrame = requestAnimationFrame(tick);
    }

    animFrame = requestAnimationFrame(tick);
  }

  function _stopTracking() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    var viewer = WV.viewer;
    if (viewer) {
      viewer.trackedEntity = undefined;
      _removeModelEntity(viewer);
      viewer.targetFrameRate = 30;
      viewer.requestRenderMode = true;
      viewer.scene.requestRender();
    }
  }

  // ── PATH DRAWING ─────────────────────────────────────────
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
          color:     Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.80),
          dashLength: 16,
          gapColor:  Cesium.Color.TRANSPARENT,
        }),
      },
    });
    viewer.scene.requestRender();
  }

  // ── OPENSKY TRACK ENDPOINT ────────────────────────────────
  function fetchTrack(icao24) {
    return WV.fetch('opensky', '/tracks/all?icao24=' + icao24 + '&time=0')
      .then(function (data) {
        if (!data || !data.path || data.path.length < 2) return null;
        return data.path
          .filter(function (wp) { return wp[1] && wp[2]; })
          .map(function (wp) { return { lat: wp[1], lon: wp[2], alt: wp[3] || 0 }; });
      });
  }

  // ── SELECT / TRACK ────────────────────────────────────────
  function select(icao24) {
    trackedIcao = icao24;
    _tween      = null;
    _curHeading = null;
    var v = WV.viewer;
    if (!v) return;

    var state = _liveState[icao24];
    var hist  = posHistory[icao24];
    var p     = state || (hist && hist.length > 0 ? hist[hist.length - 1] : null);
    if (!p) return;

    var alt = p.alt || 10000;
    var hdg = (p.heading || 0);

    // 1) Set up invisible camera anchor at the plane's position
    if (_trackEntity) { v.entities.remove(_trackEntity); }
    _trackEntity = v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, alt),
      point:    { pixelSize: 0, color: Cesium.Color.TRANSPARENT },
    });

    // 2) Create 3D model
    _removeModelEntity(v);
    _createModelEntity(v, p);

    // 3) Start the dead-reckoning loop immediately (moves model + anchor smoothly)
    _startDRLoop();

    // 4) Bind camera to the anchor and fly in with a chase-cam offset
    //    Camera approaches from behind the plane at a comfortable distance
    v.trackedEntity = _trackEntity;
    v.flyTo(_trackEntity, {
      duration: 2.0,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(hdg),
        Cesium.Math.toRadians(CHASE_PITCH),
        CHASE_RANGE
      ),
    });

    // 5) Fetch and draw the flight path trail
    WV.Controls.setStatus('TRACKING: ' + icao24.toUpperCase());
    fetchTrack(icao24)
      .then(function (track) {
        var points = (track && track.length >= 2) ? track : (posHistory[icao24] || []);
        drawPath(v, points);
        WV.Controls.setStatus('TRACKING: ' + icao24.toUpperCase() + ' — CLICK GLOBE TO RELEASE');
      })
      .catch(function () {
        drawPath(v, posHistory[icao24] || []);
        WV.Controls.setStatus('TRACKING: ' + icao24.toUpperCase() + ' — CLICK GLOBE TO RELEASE');
      });
  }

  function clearTracking() {
    trackedIcao  = null;
    _tween       = null;
    _curHeading  = null;
    _stopTracking();
    if (pathEntity && WV.viewer)  { WV.viewer.entities.remove(pathEntity);  pathEntity  = null; }
    if (_trackEntity && WV.viewer) { WV.viewer.entities.remove(_trackEntity); _trackEntity = null; }
  }

  // ── FETCH + RENDER ─────────────────────────────────────────
  function fetchAndRender(viewer) {
    if (!enabled) return Promise.resolve();

    return WV.fetch('opensky', '/states/all')
      .then(function (data) {
        if (!enabled) return;

        var states = (data.states || []).filter(function (s) {
          return s[IDX.lon] !== null && s[IDX.lat] !== null &&
                 s[IDX.baro_alt] !== null && !s[IDX.on_ground];
        });

        var now = Date.now();
        states.forEach(function (s) {
          var icao = s[IDX.icao24];
          if (!icao) return;
          if (!posHistory[icao]) posHistory[icao] = [];
          posHistory[icao].push({ lon: s[IDX.lon], lat: s[IDX.lat], alt: s[IDX.baro_alt] || 0 });
          if (posHistory[icao].length > MAX_HIST) posHistory[icao].shift();

          var freshState = {
            lat:       s[IDX.lat],
            lon:       s[IDX.lon],
            baro_alt:  s[IDX.baro_alt] || 0,
            heading:   s[IDX.heading],
            velocity:  s[IDX.velocity],
            timestamp: now,
          };
          if (icao === trackedIcao) {
            _onFreshState(freshState);
          } else {
            _liveState[icao] = freshState;
          }
        });

        // Billboards for all planes
        if (pointCollection) viewer.scene.primitives.remove(pointCollection);
        if (labelCollection) viewer.scene.primitives.remove(labelCollection);
        pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
        labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

        states.forEach(function (s) {
          var icao = s[IDX.icao24];
          var hdg  = s[IDX.heading];
          pointCollection.add({
            position: Cesium.Cartesian3.fromDegrees(s[IDX.lon], s[IDX.lat], (s[IDX.baro_alt] || 0) + 100),
            image:    _planeImg,
            rotation: hdg !== null ? -Cesium.Math.toRadians(hdg) : 0,
            scale:    1.0,
            show:     icao !== trackedIcao,  // hide billboard for tracked plane (3D model shown instead)
            id: {
              _wvType: 'flight',
              _wvIcao: icao,
              _wvMeta: [
                { key: 'TYPE',     val: 'COMM FLIGHT' },
                { key: 'CALLSIGN', val: (s[IDX.callsign] || '').trim() || icao },
                { key: 'ICAO24',   val: icao },
                { key: 'ORIGIN',   val: s[IDX.origin] || '---' },
                { key: 'ALT',      val: Math.round(s[IDX.baro_alt] || 0) + ' m' },
                { key: 'SPEED',    val: s[IDX.velocity] ? Math.round(s[IDX.velocity]) + ' m/s' : '---' },
                { key: 'HEADING',  val: s[IDX.heading]  ? Math.round(s[IDX.heading])  + '°'   : '---' },
                { key: 'SQUAWK',   val: s[IDX.squawk] || '---' },
              ],
            },
          });
          var callsign = (s[IDX.callsign] || '').trim() || s[IDX.icao24];
          labelCollection.add({
            position: Cesium.Cartesian3.fromDegrees(s[IDX.lon], s[IDX.lat], (s[IDX.baro_alt] || 0) + 100),
            text:     callsign,
            font:     '9px "Courier New"',
            fillColor:    Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.92),
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

        WV.Controls.updateCount('flights', states.length);
        if (!trackedIcao) {
          WV.Controls.setStatus('LIVE: ' + states.length + ' flights tracked');
        }

        viewer.scene.requestRender();
      })
      .catch(function (err) {
        console.error('flights:', err);
        WV.Controls.setStatus('FLIGHTS: OpenSky unreachable — retrying in 20s');
      });
  }

  function enable(viewer) {
    enabled = true;
    WV.Controls.setStatus('FETCHING FLIGHT DATA...');
    return fetchAndRender(viewer).then(function () {
      if (enabled) updateTimer = setInterval(function () { fetchAndRender(viewer); }, REFRESH_MS);
    });
  }

  function disable(viewer) {
    enabled = false;
    clearTracking();
    if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
    if (labelCollection) { viewer.scene.primitives.remove(labelCollection); labelCollection = null; }
    if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
    posHistory = {};
    _liveState = {};
    WV.Controls.updateCount('flights', 0);
  }

  return { enable: enable, disable: disable, select: select, clearTracking: clearTracking };

}());
