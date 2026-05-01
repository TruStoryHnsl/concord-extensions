// main.js — WorldView entry point

(function () {
  'use strict';

  // ── TOKEN ─────────────────────────────────────────────────
  // Only assign Ion token if the user has configured one. Setting it to an
  // empty string still triggers Ion asset fetches (with blank token → 401 on
  // every World Terrain / base imagery tile request, which then breaks the
  // entire viewer init). When no token is set, we skip terrain entirely and
  // rely on either Photoreal 3D Tiles (if GOOGLE_MAPS_KEY is set) or the
  // default ellipsoid surface as a graceful fallback.
  var _hasCesiumToken = !!(WV.config.CESIUM_TOKEN || '').trim();
  if (_hasCesiumToken) {
    Cesium.Ion.defaultAccessToken = WV.config.CESIUM_TOKEN;
  }

  // ── STAR BACKGROUND ──────────────────────────────────────
  // Procedurally generated star canvas injected behind the WebGL canvas.
  // Requires WebGL alpha:true (transparent) so the star canvas shows through.
  (function buildStarfield() {
    var W = window.innerWidth;
    var H = window.innerHeight;
    var cvs = document.createElement('canvas');
    cvs.width  = W;
    cvs.height = H;
    cvs.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    var ctx = cvs.getContext('2d');

    // Deep space background
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, W, H);

    // 3000 white stars — varied size + brightness
    for (var i = 0; i < 3000; i++) {
      var x = Math.random() * W;
      var y = Math.random() * H;
      var r = Math.random() < 0.92 ? Math.random() * 0.8 : 0.8 + Math.random() * 0.8;
      var a = 0.35 + Math.random() * 0.65;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ctx.fill();
    }

    // ~200 tinted stars (blue giants, orange dwarfs — realistic distribution)
    var tints = ['rgba(180,200,255,', 'rgba(255,240,210,', 'rgba(255,200,130,'];
    for (var j = 0; j < 200; j++) {
      var x = Math.random() * W;
      var y = Math.random() * H;
      var r = 0.4 + Math.random() * 1.0;
      var col = tints[Math.floor(Math.random() * tints.length)];
      var a = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = col + a.toFixed(2) + ')';
      ctx.fill();
    }

    var container = document.getElementById('cesiumContainer');
    container.insertBefore(cvs, container.firstChild);
  }());

  // ── VIEWER ────────────────────────────────────────────────
  // World Terrain requires a Cesium Ion token (asset 1). Skip the terrain
  // arg entirely when the user hasn't configured a token; the viewer falls
  // back to a smooth ellipsoid, which Photoreal 3D Tiles will replace anyway
  // when GOOGLE_MAPS_KEY is set.
  var _viewerOpts = {
    animation:                       false,
    baseLayerPicker:                 false,
    fullscreenButton:                false,
    geocoder:                        false,
    homeButton:                      false,
    infoBox:                         false,
    sceneModePicker:                 false,
    selectionIndicator:              false,
    timeline:                        false,
    navigationHelpButton:            false,
    creditContainer:                 document.createElement('div'),
    skyAtmosphere:                   new Cesium.SkyAtmosphere(),
    // Transparent WebGL lets the star canvas show through
    contextOptions: { webgl: { alpha: true } },
    // Only render when scene actually changes — biggest CPU win
    requestRenderMode:               true,
    maximumRenderTimeChange:         Infinity,
  };
  if (_hasCesiumToken) {
    _viewerOpts.terrain = Cesium.Terrain.fromWorldTerrain();
  } else {
    // Cesium's built-in default Ion token (baked into Cesium.js) still 401s
    // when the user hasn't set their own. Suppress the default base imagery
    // layer so we don't get console errors. The Carto dark-labels layer
    // below provides place-name imagery and Photoreal 3D Tiles (when the
    // Google key is set) provides the surface — neither needs Ion.
    _viewerOpts.baseLayer = false;
  }
  var viewer = new Cesium.Viewer('cesiumContainer', _viewerOpts);

  // Hide the low-res default skybox — replaced by our star canvas
  viewer.scene.skyBox.show        = false;
  viewer.scene.backgroundColor    = new Cesium.Color(0, 0, 0, 0);

  // City / place name labels overlay — Carto dark labels only, no key needed
  // Shows city names, country names, ocean labels at appropriate zoom levels
  viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url:          'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
      subdomains:   ['a', 'b', 'c', 'd'],
      minimumLevel: 0,
      maximumLevel: 18,
      credit:       '',
    })
  );

  // Globe settings — keep minimal to reduce CPU load
  viewer.scene.globe.enableLighting          = true;
  viewer.scene.globe.atmosphereLightIntensity = 18.0;
  viewer.scene.globe.showGroundAtmosphere     = true;
  viewer.scene.fog.enabled                   = false; // fog adds CPU cost

  // Install Google Photorealistic 3D Tiles (silent fallback to ellipsoid if no key)
  WV.Photoreal.install(viewer);

  // Default 30fps for idle — bumped to 60 when tracking
  viewer.targetFrameRate = 30;

  // Expose globally so layer modules can access
  window.WV      = window.WV || {};
  window.WV.viewer = viewer;

  // ── UI INIT ───────────────────────────────────────────────
  WV.Controls.init();
  WV.Presets.init(viewer);
  WV.HealthPanel.init();
  WV.BudgetGuard.init();

  // ── 2D / 3D SCENE TOGGLE ─────────────────────────────────
  var starCanvas = document.querySelector('#cesiumContainer canvas[style*="z-index:0"]');

  function setSceneMode(mode) {
    var btn3d = document.getElementById('btn-scene-3d');
    var btn2d = document.getElementById('btn-scene-2d');
    if (mode === '2d') {
      viewer.scene.morphTo2D(1.0);
      if (btn3d) btn3d.classList.remove('active');
      if (btn2d) btn2d.classList.add('active');
      // Hide starfield — looks wrong on flat map
      if (starCanvas) starCanvas.style.display = 'none';
      viewer.scene.backgroundColor = new Cesium.Color(0.05, 0.05, 0.08, 1);
      // After transition completes, fit full world so map isn't squished
      setTimeout(function () {
        viewer.camera.setView({
          destination: Cesium.Rectangle.fromDegrees(-180, -85, 180, 85),
        });
        viewer.scene.requestRender();
      }, 1150);
    } else {
      viewer.scene.morphTo3D(1.0);
      if (btn3d) btn3d.classList.add('active');
      if (btn2d) btn2d.classList.remove('active');
      if (starCanvas) starCanvas.style.display = '';
      viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 0);
    }
  }

  // Defer button binding one tick so DOM is ready
  setTimeout(function () {
    var btn3d = document.getElementById('btn-scene-3d');
    var btn2d = document.getElementById('btn-scene-2d');
    if (btn3d) btn3d.addEventListener('click', function () { setSceneMode('3d'); });
    if (btn2d) btn2d.addEventListener('click', function () { setSceneMode('2d'); });
  }, 0);

  // Default view: full globe
  WV.Presets.flyTo(viewer, 'globe');

  // ── CLOCK ─────────────────────────────────────────────────
  function updateClock() {
    var now = new Date();
    var h   = String(now.getUTCHours()).padStart(2, '0');
    var m   = String(now.getUTCMinutes()).padStart(2, '0');
    var s   = String(now.getUTCSeconds()).padStart(2, '0');
    var el  = document.getElementById('clock');
    if (el) el.textContent = h + ':' + m + ':' + s + ' UTC';
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ── WORLD CLOCKS ──────────────────────────────────────
  function updateWorldClocks() {
    var now = new Date();
    document.querySelectorAll('#tz-strip .tz-item').forEach(function (el) {
      var tz = el.dataset.tz;
      var t  = now.toLocaleTimeString('en-GB', {
        timeZone: tz,
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
      });
      var timeEl = el.querySelector('.tz-time');
      if (timeEl) timeEl.textContent = t;
    });
  }
  setInterval(updateWorldClocks, 1000);
  updateWorldClocks();

  // ── COORDINATE DISPLAY ────────────────────────────────────
  // Throttled to 4fps max — postRender fires at 60fps otherwise
  // and DOM manipulation on every frame is what spikes CPU
  var lastCoordUpdate = 0;
  viewer.scene.postRender.addEventListener(function () {
    var now = Date.now();
    if (now - lastCoordUpdate < 250) return; // max 4 updates/sec
    lastCoordUpdate = now;

    var cart = viewer.camera.positionCartographic;
    if (!cart) return;

    var lat = Cesium.Math.toDegrees(cart.latitude).toFixed(3);
    var lon = Cesium.Math.toDegrees(cart.longitude).toFixed(3);
    var alt = Math.round(cart.height / 1000);

    var elLat = document.getElementById('coord-lat');
    var elLon = document.getElementById('coord-lon');
    var elAlt = document.getElementById('coord-alt');

    if (elLat) elLat.textContent = lat;
    if (elLon) elLon.textContent = lon;
    if (elAlt) elAlt.textContent = alt;
  });

  // ── LAYER EVENT ROUTER ───────────────────────────────────
  // When a layer is toggled, call its enable/disable method
  window.addEventListener('wv:layerToggle', function (e) {
    var layer  = e.detail.layer;
    var active = e.detail.active;
    var mod    = WV.layers && WV.layers[layer];
    if (!mod) return;

    if (active) {
      WV.Controls.setStatus('LOADING ' + layer.toUpperCase() + '...');
      mod.enable(viewer).then(function () {
        WV.Controls.setStatus('LIVE');
      }).catch(function (err) {
        console.error(layer, err);
        WV.Controls.setStatus('ERROR: ' + layer.toUpperCase());
      });
    } else {
      mod.disable(viewer);
      WV.Controls.setStatus('SYSTEM READY');
    }
  });

  // ── CLICK TO INSPECT ─────────────────────────────────────
  // Handles both Entity picks (picked.id = entity) and
  // PointPrimitive picks (picked.id = our custom id object)
  var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(function (click) {
    var picked = viewer.scene.pick(click.position);
    if (!Cesium.defined(picked)) {
      WV.Controls.clearIntel();
      if (WV.layers.flights)    WV.layers.flights.clearTracking();
      if (WV.layers.military)   WV.layers.military.clearTracking();
      if (WV.layers.satellites) WV.layers.satellites.clearTracking();
      if (WV.layers.maritime)   WV.layers.maritime.clearTracking();
      return;
    }

    var idObj = null;

    // Entity click (seismic, jamming, maritime)
    if (picked.id && picked.id._wvMeta) {
      idObj = picked.id;
    }
    // PointPrimitive click (flights, military, satellites, cctv)
    else if (picked.primitive && picked.id && picked.id._wvMeta) {
      idObj = picked.id;
    }

    if (idObj) {
      WV.Controls.showIntel(idObj._wvMeta);

      // Auto-track flights: lock camera on clicked aircraft + show path
      if (idObj._wvType === 'flight' && idObj._wvIcao && WV.layers.flights) {
        WV.layers.flights.select(idObj._wvIcao);
      }
      // Auto-track military: same behaviour with in-memory path trail
      if (idObj._wvType === 'military' && idObj._wvHex && WV.layers.military) {
        WV.layers.military.select(idObj._wvHex);
      }
      // Auto-track satellites: fly to position + draw predicted orbital path
      if (idObj._wvType === 'satellite' && idObj._wvIdx !== undefined && WV.layers.satellites) {
        WV.layers.satellites.select(idObj._wvIdx);
      }
      // Auto-track vessels: fly to position + show accumulated track trail
      if (idObj._wvType === 'vessel' && idObj._wvMmsi && WV.layers.maritime) {
        WV.layers.maritime.select(idObj._wvMmsi);
      }
      // Seismic: zoom to epicenter
      if (idObj._wvType === 'seismic' && idObj._wvLat !== undefined) {
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(idObj._wvLon, idObj._wvLat, 0), 0),
          { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 400000), duration: 1.8 }
        );
      }
      // GPS Jamming: zoom to zone center
      if (idObj._wvType === 'jamming' && idObj._wvLat !== undefined) {
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(idObj._wvLon, idObj._wvLat, 0), 0),
          { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 1200000), duration: 1.8 }
        );
      }
      // Port: zoom to harbor
      if (idObj._wvType === 'port' && idObj._wvLat !== undefined) {
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(idObj._wvLon, idObj._wvLat, 0), 0),
          { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 80000), duration: 1.8 }
        );
      }
    } else {
      WV.Controls.clearIntel();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // ── COLLAPSIBLE SIDEBARS ────────────────────────────────
  document.getElementById('collapse-left').addEventListener('click', function () {
    var panel = document.getElementById('panel-layers');
    var collapsed = panel.classList.toggle('collapsed');
    this.classList.toggle('collapsed', collapsed);
    this.textContent = collapsed ? '\u203A' : '\u2039';
  });
  document.getElementById('collapse-right').addEventListener('click', function () {
    var panel = document.getElementById('panel-right');
    var collapsed = panel.classList.toggle('collapsed');
    this.classList.toggle('collapsed', collapsed);
    this.textContent = collapsed ? '\u2039' : '\u203A';
    var compass = document.getElementById('compass');
    if (compass) compass.classList.toggle('panel-collapsed', collapsed);
  });

  // ── COMPASS ─────────────────────────────────────────────
  var compassEl = document.getElementById('compass');
  if (compassEl) {
    var compassSvg = compassEl.querySelector('svg');

    // Rotate compass to match camera heading
    viewer.scene.postRender.addEventListener(function () {
      var heading = viewer.camera.heading;
      if (compassSvg) {
        compassSvg.style.transform = 'rotate(' + (-Cesium.Math.toDegrees(heading)) + 'deg)';
      }
    });

    // Click to orient north
    compassEl.addEventListener('click', function () {
      var camera = viewer.camera;
      viewer.camera.flyTo({
        destination: camera.positionWC.clone(),
        orientation: {
          heading: 0,
          pitch:   camera.pitch,
          roll:    0,
        },
        duration: 0.8,
      });
    });
  }

  WV.Controls.setStatus('SYSTEM READY');

}());
