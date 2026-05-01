// ui/place-card.js — Google Places click-card
// On empty-terrain click, queries Places Nearby and shows a floating card
// with the nearest place's name and type. Auto-dismisses after 6s.
// Adds a SECONDARY handler — does not replace the main.js click handler.
window.WV = window.WV || {};

WV.PlaceCard = (function () {
  var _card = null;
  var _dismissTimer = null;

  function _dismiss() {
    if (_dismissTimer) { clearTimeout(_dismissTimer); _dismissTimer = null; }
    if (_card) {
      _card.style.opacity = '0';
      var c = _card;
      setTimeout(function () { if (c && c.parentNode) c.parentNode.removeChild(c); }, 300);
      _card = null;
    }
  }

  function _show(x, y, name, type) {
    _dismiss();
    var card = document.createElement('div');
    card.className = 'wv-place-card';
    card.style.left = (x + 12) + 'px';
    card.style.top  = (y - 20) + 'px';

    var nameEl = document.createElement('div');
    nameEl.className = 'wv-place-name';
    nameEl.textContent = name;

    var typeEl = document.createElement('div');
    typeEl.className = 'wv-place-type';
    typeEl.textContent = (type || '').replace(/_/g, ' ').toLowerCase();

    var closeBtn = document.createElement('button');
    closeBtn.className = 'wv-place-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', _dismiss);

    card.appendChild(closeBtn);
    card.appendChild(nameEl);
    card.appendChild(typeEl);
    document.body.appendChild(card);
    _card = card;

    // Fade in
    requestAnimationFrame(function () { card.style.opacity = '1'; });

    _dismissTimer = setTimeout(_dismiss, 6000);
  }

  function init(viewer) {
    var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(function (click) {
      var picked = viewer.scene.pick(click.position);
      // Only fire on empty terrain (no entity/primitive picked)
      if (Cesium.defined(picked)) return;

      var key = (WV.config || {}).GOOGLE_MAPS_KEY;
      if (!key) return;

      // Convert screen position to globe cartographic
      var ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      var cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return;
      var carto = Cesium.Cartographic.fromCartesian(cartesian);
      if (!carto) return;
      var lat = Cesium.Math.toDegrees(carto.latitude);
      var lon = Cesium.Math.toDegrees(carto.longitude);

      var url = 'https://places.googleapis.com/v1/places:searchNearby?key=' + encodeURIComponent(key);
      var body = JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: 100.0,
          },
        },
        maxResultCount: 1,
      });

      WV.fetch('g_places', url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.location,places.photos',
        },
        body: body,
      }).then(function (j) {
        var places = j.places || [];
        if (!places.length) return;
        var p = places[0];
        var name = (p.displayName && p.displayName.text) || 'Unknown place';
        var type = p.primaryType || '';
        _show(click.position.x, click.position.y, name, type);
      }).catch(function (e) { console.warn('[places]', e); });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  return { init: init };
})();
