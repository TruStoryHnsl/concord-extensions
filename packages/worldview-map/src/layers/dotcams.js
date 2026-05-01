// layers/dotcams.js — DOT camera aggregator (5 state DOTs)
// Merges Caltrans, Oregon DOT, WSDOT, 511NY, and MassDOT into one PointPrimitiveCollection.
// Each point carries _wvType:'cctv' so the existing CCTV PiP grid handles clicks identically.
window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.dotcams = (function () {
  var pc = null;             // Cesium.PointPrimitiveCollection
  var refreshTimer = null;
  var enabled = false;

  function _addCamPoint(viewer, cam) {
    if (!pc) return;
    var pt = pc.add({
      position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat),
      color: Cesium.Color.fromCssColorString('#5fd97f').withAlpha(0.85),
      pixelSize: 5,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
      outlineWidth: 1,
    });
    pt.id = {
      _wvType: 'cctv',
      _wvName: cam.name,
      _wvCity: cam.city || cam.state || '',
      _wvLat: cam.lat,
      _wvLon: cam.lon,
      _wvImg: cam.stream_url || '',
      _wvStreamUrl: cam.stream_url || '',
      _wvMeta: [
        { key: 'NAME', val: cam.name },
        { key: 'STATE', val: cam.state || '' },
        { key: '_CAM_IMG', val: cam.stream_url || '' },
      ],
    };
  }

  function _loadCaltrans(viewer) {
    return WV.fetch('dotcams_caltrans', 'https://cwwp2.dot.ca.gov/data/d3/cctv/cctvStatusD3.json')
      .then(function (j) {
        (j.data || []).forEach(function (item) {
          var c = item.cctv || {};
          var loc = c.location || {};
          var lat = parseFloat(loc.latitude || c.latitude);
          var lon = parseFloat(loc.longitude || c.longitude);
          if (isNaN(lat) || isNaN(lon)) return;
          var imgData = c.imageData || {};
          var streamUrl = imgData.streamingVideoURL ||
            (imgData.static && imgData.static.currentImageURL) || '';
          _addCamPoint(viewer, {
            name: c.locationName || c.cctvIdentifier || 'Caltrans cam',
            state: 'CA',
            lat: lat,
            lon: lon,
            stream_url: streamUrl,
          });
        });
      })
      .catch(function (e) { console.warn('[dotcams_caltrans]', e); });
  }

  function _loadOregon(viewer) {
    return WV.fetch('dotcams_oregondot', 'https://api.odot.state.or.us/tripcheck/Cameras/CCTVInventory')
      .then(function (j) {
        var arr = Array.isArray(j) ? j : (j.cameras || j.Items || []);
        arr.forEach(function (cam) {
          var lat = parseFloat(cam.Latitude || cam.latitude);
          var lon = parseFloat(cam.Longitude || cam.longitude);
          if (isNaN(lat) || isNaN(lon)) return;
          _addCamPoint(viewer, {
            name: cam.Name || cam.name || cam.Description || 'Oregon cam',
            state: 'OR',
            lat: lat,
            lon: lon,
            stream_url: cam.SnapshotURL || cam.snapshot_url || cam.URL || cam.url || '',
          });
        });
      })
      .catch(function (e) { console.warn('[dotcams_oregondot]', e); });
  }

  function _loadWsdot(viewer) {
    var key = (WV.config || {}).WSDOT_KEY;
    if (!key) return Promise.resolve();
    return WV.fetch('dotcams_wsdot',
      'https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson?AccessCode=' + encodeURIComponent(key))
      .then(function (arr) {
        (arr || []).forEach(function (cam) {
          if (!cam.CameraLocation) return;
          var lat = parseFloat(cam.CameraLocation.Latitude);
          var lon = parseFloat(cam.CameraLocation.Longitude);
          if (isNaN(lat) || isNaN(lon)) return;
          _addCamPoint(viewer, {
            name: cam.Title || ('WA-' + cam.CameraID),
            state: 'WA',
            lat: lat,
            lon: lon,
            stream_url: cam.ImageURL || '',
          });
        });
      })
      .catch(function (e) { console.warn('[dotcams_wsdot]', e); });
  }

  function _load511ny(viewer) {
    var key = (WV.config || {}).NY511_KEY;
    if (!key) return Promise.resolve();
    return WV.fetch('dotcams_511ny',
      'https://511ny.org/api/getcameras?key=' + encodeURIComponent(key) + '&format=json')
      .then(function (arr) {
        (arr || []).forEach(function (cam) {
          var lat = parseFloat(cam.Latitude);
          var lon = parseFloat(cam.Longitude);
          if (isNaN(lat) || isNaN(lon)) return;
          _addCamPoint(viewer, {
            name: cam.Name || ('NY-' + cam.ID),
            state: 'NY',
            lat: lat,
            lon: lon,
            stream_url: cam.Url || '',
          });
        });
      })
      .catch(function (e) { console.warn('[dotcams_511ny]', e); });
  }

  function _loadMassdot(viewer) {
    var key = (WV.config || {}).MASSDOT_KEY;
    if (!key) return Promise.resolve();
    return WV.fetch('dotcams_massdot',
      'https://mass511.com/api/getcameras?key=' + encodeURIComponent(key) + '&format=json')
      .then(function (arr) {
        (arr || []).forEach(function (cam) {
          var lat = parseFloat(cam.Latitude);
          var lon = parseFloat(cam.Longitude);
          if (isNaN(lat) || isNaN(lon)) return;
          _addCamPoint(viewer, {
            name: cam.Name || ('MA-' + cam.ID),
            state: 'MA',
            lat: lat,
            lon: lon,
            stream_url: cam.Url || '',
          });
        });
      })
      .catch(function (e) { console.warn('[dotcams_massdot]', e); });
  }

  function refresh(viewer) {
    if (!pc) pc = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    pc.removeAll();
    return Promise.all([
      _loadCaltrans(viewer),
      _loadOregon(viewer),
      _loadWsdot(viewer),
      _load511ny(viewer),
      _loadMassdot(viewer),
    ]).then(function () {
      if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('dotcams', pc.length);
      viewer.scene.requestRender();
    });
  }

  function enable(viewer) {
    if (enabled) return Promise.resolve();
    enabled = true;
    var p = refresh(viewer);
    refreshTimer = setInterval(function () { refresh(viewer); }, 600000);
    return p;
  }

  function disable(viewer) {
    enabled = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (pc) {
      viewer.scene.primitives.remove(pc);
      pc = null;
    }
    if (WV.Controls && WV.Controls.updateCount) WV.Controls.updateCount('dotcams', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };
})();
