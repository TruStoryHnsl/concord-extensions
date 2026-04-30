// lib/photoreal.js — Google Photorealistic 3D Tiles
window.WV = window.WV || {};

WV.Photoreal = (function () {
  var tileset = null;

  function install(viewer) {
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    if (!key || key === 'YOUR_GOOGLE_MAPS_KEY_HERE') {
      if (WV.sourceState && WV.sourceState.gmaps_tiles) {
        WV.sourceState.gmaps_tiles.last_error = 'no key configured';
      }
      return null;
    }
    try {
      tileset = new Cesium.Cesium3DTileset({
        url: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(key),
        showCreditsOnScreen: true,
        maximumScreenSpaceError: 16,
      });
      viewer.scene.primitives.add(tileset);
      viewer.scene.globe.show = false;
      viewer.scene.skyAtmosphere.show = false;

      tileset.allTilesLoaded.addEventListener(function () {
        if (WV.sourceState && WV.sourceState.gmaps_tiles) {
          WV.sourceState.gmaps_tiles.last_success_ts = Date.now();
          WV.sourceState.gmaps_tiles.last_error = null;
        }
      });
      tileset.tileFailed.addEventListener(function (e) {
        if (WV.sourceState && WV.sourceState.gmaps_tiles) {
          WV.sourceState.gmaps_tiles.last_error = String(e.message || 'tile load failed');
        }
      });
      return tileset;
    } catch (e) {
      console.error('[photoreal] install failed', e);
      if (WV.sourceState && WV.sourceState.gmaps_tiles) WV.sourceState.gmaps_tiles.last_error = e.message;
      return null;
    }
  }

  function uninstall(viewer) {
    if (tileset) {
      viewer.scene.primitives.remove(tileset);
      tileset = null;
      viewer.scene.globe.show = true;
      viewer.scene.skyAtmosphere.show = true;
    }
  }

  return { install: install, uninstall: uninstall };
})();
