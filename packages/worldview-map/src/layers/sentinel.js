// layers/sentinel.js — Satellite imagery via Copernicus Sentinel Hub WMS
//
// Source: Copernicus Data Space Ecosystem — Sentinel-2 L2A (10m resolution)
// Proxied through server.py to avoid CORS.
//
// Modes map to Sentinel Hub instance layer names (configurable in the SH Dashboard):
//   OPT   — TRUE-COLOR (RGB bands B04/B03/B02)
//   NIR   — FALSE-COLOR (B08/B04/B03 — vegetation = red)
//   SWIR  — SWIR (B12/B8A/B04 — fire/burn scars)
//   NDVI  — NDVI (vegetation index, green = healthy)

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.sentinel = (function () {

  var imageryLayer   = null;
  var buildingsTileset = null;
  var activeMode     = 'OPT';
  var activeDate     = null;   // null = auto (5 days ago — processing lag)
  var _controlsBound = false;
  var _enabled       = false;

  // Cesium OSM Buildings — free 3D building footprints via Ion (asset 96188)
  var BUILDINGS_ASSET_ID = 96188;

  // Proxied through server.py → Copernicus Sentinel Hub
  var WMS_URL = '/proxy/sentinel/wms';

  // Sentinel Hub layer names — must match instance configuration.
  // Available: AGRICULTURE, ATMOSPHERIC_PENETRATION, BATHYMETRIC,
  //   COLOR_INFRARED, COLOR_INFRARED__URBAN_, GEOLOGY,
  //   MOISTURE_INDEX, SWIR, TRUE_COLOR, VEGETATION_INDEX
  var MODES = {
    'OPT':  'TRUE_COLOR',
    'NIR':  'COLOR_INFRARED',
    'SWIR': 'SWIR',
    'NDVI': 'VEGETATION_INDEX',
  };

  function _dateStr(d) {
    return d.toISOString().slice(0, 10);
  }

  // Default to 5 days ago — Sentinel-2 revisit is ~5 days, plus processing lag
  function _getDefaultDate() {
    return _dateStr(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
  }

  function _buildLayer(viewer) {
    var date  = activeDate || _getDefaultDate();
    var layer = MODES[activeMode] || MODES['OPT'];

    var il = viewer.imageryLayers.addImageryProvider(
      new Cesium.WebMapServiceImageryProvider({
        url:    WMS_URL,
        layers: layer,
        parameters: {
          TIME:        date,
          FORMAT:      'image/png',
          TRANSPARENT: true,
          MAXCC:       20,    // max cloud cover 20%
          SHOWLOGO:    false,
        },
        tileWidth:    512,
        tileHeight:   512,
        minimumLevel: 6,    // S2L2A enforces ≤1500 m/px — zoom 6 = ~1223 m/px
        maximumLevel: 14,   // Sentinel-2 at 10m supports much higher zoom
        credit:       'Copernicus Sentinel-2',
      })
    );
    il.alpha = 0.92;
    return il;
  }

  function _rebuild(viewer) {
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); imageryLayer = null; }
    if (!_enabled) return;
    imageryLayer = _buildLayer(viewer);
    var date = activeDate || _getDefaultDate();
    WV.Controls.setStatus('IMINT: ' + activeMode + ' · ' + date);
    WV.Controls.updateCount('sentinel', activeMode);
    viewer.scene.requestRender();
  }

  function _bindControls(viewer) {
    if (_controlsBound) return;
    _controlsBound = true;

    var btns = document.querySelectorAll('.sen-mode-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeMode = btn.getAttribute('data-sen-mode');
        if (_enabled) _rebuild(viewer);
      });
    });

    var dateInput = document.getElementById('sen-date');
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        activeDate = dateInput.value || null;
        if (_enabled) _rebuild(viewer);
      });
    }

    var clearBtn = document.getElementById('sen-date-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (dateInput) dateInput.value = '';
        activeDate = null;
        if (_enabled) _rebuild(viewer);
      });
    }
  }

  function _showControls() {
    var el = document.getElementById('sentinel-controls');
    if (el) el.style.display = 'block';
  }

  function _hideControls() {
    var el = document.getElementById('sentinel-controls');
    if (el) el.style.display = 'none';
  }

  function enable(viewer) {
    _enabled = true;
    _bindControls(viewer);
    _showControls();
    imageryLayer = _buildLayer(viewer);
    var date = activeDate || _getDefaultDate();
    WV.Controls.setStatus('IMINT: ' + activeMode + ' · ' + date + ' · loading buildings…');
    WV.Controls.updateCount('sentinel', activeMode);

    // Enable terrain depth test so buildings sit on terrain properly
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Load 3D OSM Buildings
    return Cesium.Cesium3DTileset.fromIonAssetId(BUILDINGS_ASSET_ID).then(function (tileset) {
      if (!_enabled) return;  // user disabled while loading

      // Style buildings: height-based coloring, semi-transparent to let imagery show
      tileset.style = new Cesium.Cesium3DTileStyle({
        color: {
          conditions: [
            ['${feature["cesium#estimatedHeight"]} > 200', 'color("cyan", 0.6)'],
            ['${feature["cesium#estimatedHeight"]} > 100', 'color("#00aacc", 0.5)'],
            ['${feature["cesium#estimatedHeight"]} > 50',  'color("#006688", 0.45)'],
            ['${feature["cesium#estimatedHeight"]} > 20',  'color("#004466", 0.4)'],
            ['true', 'color("#003344", 0.35)'],
          ],
        },
      });

      buildingsTileset = viewer.scene.primitives.add(tileset);
      WV.Controls.setStatus('IMINT: ' + activeMode + ' · ' + date + ' · 3D buildings active');
      viewer.scene.requestRender();
    }).catch(function (err) {
      console.error('OSM Buildings:', err);
      WV.Controls.setStatus('IMINT: ' + activeMode + ' · ' + date);
    });
  }

  function disable(viewer) {
    _enabled = false;
    _hideControls();
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); imageryLayer = null; }
    if (buildingsTileset) { viewer.scene.primitives.remove(buildingsTileset); buildingsTileset = null; }
    viewer.scene.globe.depthTestAgainstTerrain = false;
    WV.Controls.updateCount('sentinel', '—');
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
