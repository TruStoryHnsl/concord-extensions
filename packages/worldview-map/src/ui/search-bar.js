// ui/search-bar.js — Google Geocoding search bar
// Flies the camera to a typed place name on Enter.
window.WV = window.WV || {};

WV.SearchBar = (function () {
  var input = null;

  function _onSubmit() {
    var key = (WV.config || {}).GOOGLE_MAPS_KEY;
    var q = (input.value || '').trim();
    if (!q || !key) return;
    var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
              encodeURIComponent(q) + '&key=' + encodeURIComponent(key);
    WV.fetch('g_geocode', url, { cache_ttl_ms: 60000 }).then(function (j) {
      if (!j.results || !j.results.length || !WV.viewer) return;
      var loc = j.results[0].geometry.location;
      WV.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(loc.lng, loc.lat, 8000),
        duration: 1.5,
      });
    }).catch(function (e) { console.warn('[geocode]', e); });
  }

  function init() {
    input = document.getElementById('wv-search');
    if (!input) return;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _onSubmit();
    });
  }

  return { init: init };
})();
