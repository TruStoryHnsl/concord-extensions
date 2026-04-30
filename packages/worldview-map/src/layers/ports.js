// layers/ports.js — Global port locations
// Sources tried in order:
//   1. ./data/ports.geojson  (local — download from HDX and place here for full dataset)
//   2. NGA World Port Index CSV via corsproxy
//   3. OSM Overpass — harbour=yes nodes (globally tagged, ~3000+ results)
//
// To get full 3700-port dataset:
//   Download: https://data.humdata.org/dataset/global-ports → ports.geojson
//   Place at: worldview/data/ports.geojson

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.ports = (function () {

  var billboardCollection = null;

  var SIZE_COLOR = {
    'L': '#00e5ff',
    'M': '#ffd600',
    'S': '#ff6d00',
    'V': '#b0bec5',
  };

  var NGA_CSV_URL = 'https://msi.nga.mil/api/publications/download?type=view&key=16694622/SFH00000/UpdatedPub150.csv';
  var NGA_PROXIED = 'https://corsproxy.io/?' + encodeURIComponent(NGA_CSV_URL);

  var OVERPASS_URL   = 'https://overpass-api.de/api/interpreter';
  // harbour=yes is widely used in OSM for actual port/harbour locations
  var OVERPASS_QUERY = '[out:json][timeout:30];node[\"harbour\"=\"yes\"][name];out body qt;';

  // ── ANCHOR ICON ───────────────────────────────────────────
  // White anchor on transparent background — tinted per size via Billboard color property
  function _makeAnchor(sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2;
    var lw  = Math.max(1.5, sz * 0.11);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle   = '#ffffff';
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'round';

    // Shackle (top ring)
    ctx.beginPath();
    ctx.arc(mx, sz * 0.17, sz * 0.09, 0, Math.PI * 2);
    ctx.stroke();

    // Stock (horizontal crossbar)
    ctx.beginPath();
    ctx.moveTo(sz * 0.14, sz * 0.31);
    ctx.lineTo(sz * 0.86, sz * 0.31);
    ctx.stroke();

    // Shaft (vertical line)
    ctx.beginPath();
    ctx.moveTo(mx, sz * 0.26);
    ctx.lineTo(mx, sz * 0.80);
    ctx.stroke();

    // Left fluke
    ctx.beginPath();
    ctx.moveTo(mx, sz * 0.80);
    ctx.quadraticCurveTo(sz * 0.10, sz * 0.76, sz * 0.14, sz * 0.60);
    ctx.stroke();

    // Right fluke
    ctx.beginPath();
    ctx.moveTo(mx, sz * 0.80);
    ctx.quadraticCurveTo(sz * 0.90, sz * 0.76, sz * 0.86, sz * 0.60);
    ctx.stroke();

    return c;
  }

  var _anchorImg = _makeAnchor(20);

  function fetchText(url) {
    return WV.fetch('ports', url, { as: 'text' });
  }
  function fetchJson(url) {
    return WV.fetch('ports', url);
  }
  // POST requests cannot go through WV.fetch (no method/body opts support).
  // Overpass uses HTTP POST — kept as raw fetch intentionally.
  function fetchJsonPost(url, opts) {
    return fetch(url, opts || {}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function parseNgaCsv(text) {
    var lines  = text.split('\n');
    if (!lines.length) return [];
    var header = lines[0].split(',').map(function (h) { return h.trim().replace(/"/g, '').toUpperCase(); });
    var iName  = header.indexOf('PORT_NAME');
    var iLat   = header.indexOf('LATITUDE');
    var iLon   = header.indexOf('LONGITUDE');
    var iCtry  = header.indexOf('COUNTRY_CODE');
    var iSize  = header.indexOf('HARBORSIZE');
    if (iLat === -1 || iLon === -1) return [];
    var ports = [];
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',');
      var lat  = parseFloat(cols[iLat]);
      var lon  = parseFloat(cols[iLon]);
      if (isNaN(lat) || isNaN(lon)) continue;
      ports.push({
        lat:     lat,
        lon:     lon,
        name:    iName !== -1 ? cols[iName].replace(/"/g, '').trim() : 'PORT',
        country: iCtry !== -1 ? cols[iCtry].replace(/"/g, '').trim() : 'N/A',
        size:    iSize !== -1 ? cols[iSize].replace(/"/g, '').trim().toUpperCase().charAt(0) : 'S',
        shelter: 'N/A',
      });
    }
    return ports;
  }

  function parseOverpass(data) {
    return (data.elements || [])
      .filter(function (el) { return el.type === 'node' && !isNaN(el.lat) && !isNaN(el.lon); })
      .map(function (el) {
        return {
          lat:     el.lat,
          lon:     el.lon,
          name:    (el.tags && (el.tags.name || el.tags['name:en'])) || 'HARBOUR',
          country: 'N/A',
          size:    'S',
          shelter: 'N/A',
        };
      });
  }

  function parseGeoJson(data) {
    return (data.features || []).map(function (f) {
      if (!f.geometry || !f.geometry.coordinates) return null;
      var p = f.properties || {};
      return {
        lat:     f.geometry.coordinates[1],
        lon:     f.geometry.coordinates[0],
        name:    p.port_name || p.name || p.PORT_NAME || 'PORT',
        country: p.country   || p.COUNTRY   || 'N/A',
        size:    (p.harborsize || p.HARBORSIZE || 'S').toUpperCase().charAt(0),
        shelter: p.shelter    || p.SHELTER    || 'N/A',
      };
    }).filter(Boolean);
  }

  function buildCollection(viewer, ports) {
    if (billboardCollection) viewer.scene.primitives.remove(billboardCollection);
    billboardCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());

    var count = 0;
    ports.forEach(function (p) {
      if (isNaN(p.lat) || isNaN(p.lon)) return;
      var size     = p.size;
      var hexColor = SIZE_COLOR[size] || SIZE_COLOR['S'];
      var px       = size === 'L' ? 14 : size === 'M' ? 11 : 9;
      billboardCollection.add({
        position:               Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 10),
        image:                  _anchorImg,
        color:                  Cesium.Color.fromCssColorString(hexColor).withAlpha(0.85),
        width:                  px,
        height:                 px,
        verticalOrigin:   Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        id: {
          _wvType: 'port',
          _wvLat:  p.lat,
          _wvLon:  p.lon,
          _wvMeta: [
            { key: 'TYPE',    val: 'PORT / HARBOR' },
            { key: 'NAME',    val: p.name },
            { key: 'COUNTRY', val: p.country },
            { key: 'SIZE',    val: size === 'L' ? 'LARGE' : size === 'M' ? 'MEDIUM' : size === 'V' ? 'VERY SMALL' : 'SMALL' },
            { key: 'SHELTER', val: p.shelter },
            { key: 'LAT',     val: p.lat.toFixed(4) },
            { key: 'LON',     val: p.lon.toFixed(4) },
          ],
        },
      });
      count++;
    });

    WV.Controls.updateCount('ports', count);
    WV.Controls.setStatus('PORTS: ' + count + ' facilities loaded');
    viewer.scene.requestRender();
  }

  function enable(viewer) {
    WV.Controls.setStatus('PORTS: Loading...');

    // 1. Local bundled file (download once from HDX for full dataset)
    return fetchText('./data/ports.geojson')
      .then(function (text) { return parseGeoJson(JSON.parse(text)); })

      // 2. NGA WPI via corsproxy
      .catch(function () {
        WV.Controls.setStatus('PORTS: Fetching NGA World Port Index...');
        return fetchText(NGA_PROXIED).then(parseNgaCsv);
      })

      // 3. OSM Overpass — harbour=yes (broad tag, good global coverage)
      .catch(function () {
        WV.Controls.setStatus('PORTS: Fetching from OpenStreetMap...');
        return fetchJsonPost(OVERPASS_URL, {
          method:  'POST',
          body:    'data=' + encodeURIComponent(OVERPASS_QUERY),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }).then(parseOverpass);
      })

      .then(function (ports) {
        if (!ports || !ports.length) throw new Error('No port data available');
        buildCollection(viewer, ports);
      });
  }

  function disable(viewer) {
    if (billboardCollection) {
      viewer.scene.primitives.remove(billboardCollection);
      billboardCollection = null;
    }
    WV.Controls.updateCount('ports', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());
