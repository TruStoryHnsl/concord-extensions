// layers/cctv.js — Public CCTV camera feeds
//
// Sources:
//   TfL JamCam  — ~900 London traffic cameras (no key, CORS OK)
//   NYC DOT     — ~960 New York traffic cameras (proxied, no CORS)
//   Caltrans    — ~3000+ California highway cameras across 12 districts (CORS OK)
//
// Click any camera pin → live snapshot loads in the INTEL FEED panel

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.cctv = (function () {

  var pointCollection = null;

  // ── Data sources ──────────────────────────────────────────
  var TFL_API     = 'https://api.tfl.gov.uk/Place/Type/JamCam';
  var NYCDOT_API  = '/proxy/nycdot/cameras';
  var CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  function caltransUrl(d) {
    var dd = d < 10 ? '0' + d : '' + d;
    return 'https://cwwp2.dot.ca.gov/data/d' + d + '/cctv/cctvStatusD' + dd + '.json';
  }

  // ── Parsers ───────────────────────────────────────────────
  function parseTfl(data) {
    return data
      .filter(function (c) { return c.lat && c.lon; })
      .map(function (c) {
        var imgUrl = '';
        var props = c.additionalProperties || [];
        for (var i = 0; i < props.length; i++) {
          if (props[i].key === 'imageUrl') { imgUrl = props[i].value; break; }
        }
        return { name: c.commonName || c.id, lat: c.lat, lon: c.lon, city: 'London', img: imgUrl };
      })
      .filter(function (c) { return c.img; });
  }

  function parseNycdot(data) {
    return data
      .filter(function (c) { return c.latitude && c.longitude && c.isOnline !== false; })
      .map(function (c) {
        return {
          name: c.name || c.id,
          lat:  c.latitude,
          lon:  c.longitude,
          city: 'New York',
          img:  '/proxy/nycdot/cameras/' + c.id + '/image',
        };
      });
  }

  function parseCaltrans(data) {
    var cams = [];
    var list = Array.isArray(data) ? data : (data && data.data ? data.data : []);
    list.forEach(function (entry) {
      var c = entry.cctv || entry;
      var loc = c.location || {};
      var imgData = c.imageData || {};
      var staticImg = (imgData.static || {}).currentImageURL;
      var lat = parseFloat(loc.latitude);
      var lon = parseFloat(loc.longitude);
      if (!staticImg || isNaN(lat) || isNaN(lon)) return;
      if (c.inService === 'false') return;
      cams.push({
        name: loc.locationName || 'CA CAM',
        lat:  lat,
        lon:  lon,
        city: 'California',
        img:  staticImg,
      });
    });
    return cams;
  }

  // ── Fetch helpers ─────────────────────────────────────────
  function fetchJson(url) {
    return WV.fetch('cctv_legacy', url);
  }

  function fetchTfl() {
    return fetchJson(TFL_API).then(parseTfl).catch(function () { return []; });
  }

  function fetchNycdot() {
    return fetchJson(NYCDOT_API).then(parseNycdot).catch(function () { return []; });
  }

  function fetchCaltrans() {
    var promises = CALTRANS_DISTRICTS.map(function (d) {
      return fetchJson(caltransUrl(d)).then(parseCaltrans).catch(function () { return []; });
    });
    return Promise.all(promises).then(function (results) {
      var all = [];
      results.forEach(function (r) { all = all.concat(r); });
      return all;
    });
  }

  // ── Render ────────────────────────────────────────────────
  function buildCollection(viewer, cameras) {
    if (pointCollection) viewer.scene.primitives.remove(pointCollection);
    pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

    cameras.forEach(function (cam) {
      pointCollection.add({
        position:  Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 30),
        color:     Cesium.Color.fromCssColorString('#00ff41').withAlpha(0.9),
        pixelSize: 5,
        id: {
          _wvType: 'cctv',
          _wvImg:  cam.img,
          _wvMeta: [
            { key: 'TYPE',  val: 'CCTV CAMERA' },
            { key: 'NAME',  val: cam.name },
            { key: 'CITY',  val: cam.city },
            { key: '_CAM_IMG', val: cam.img },
          ],
        },
      });
    });

    WV.Controls.updateCount('cctv', cameras.length);
    WV.Controls.setStatus('CCTV: ' + cameras.length + ' feeds — click pin for live snapshot');
    viewer.scene.requestRender();
  }

  // ── Layer interface ───────────────────────────────────────
  function enable(viewer) {
    WV.Controls.setStatus('CCTV: Fetching camera directories...');

    return Promise.all([fetchTfl(), fetchNycdot(), fetchCaltrans()])
      .then(function (results) {
        var cameras = results[0].concat(results[1]).concat(results[2]);
        buildCollection(viewer, cameras);
      });
  }

  function disable(viewer) {
    if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
    WV.Controls.updateCount('cctv', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
