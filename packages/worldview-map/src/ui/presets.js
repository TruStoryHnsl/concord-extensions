// ui/presets.js — Camera landmark presets

window.WV = window.WV || {};

WV.Presets = (function () {

  // lon, lat, altitude (meters), heading (deg), pitch (deg)
  const LOCATIONS = {
    // ── REGIONAL OVERVIEWS ──────────────────────────────────────────────
    'globe':        { lon:   0,      lat:  20,     alt: 22000000, heading: 0, pitch: -90 },
    'middle-east':  { lon:  51,      lat:  28,     alt:  3800000, heading: 0, pitch: -75 },
    'us':           { lon: -97,      lat:  38,     alt:  5500000, heading: 0, pitch: -75 },
    'europe':       { lon:  13,      lat:  51,     alt:  4000000, heading: 0, pitch: -75 },
    'china':        { lon: 104,      lat:  34,     alt:  4500000, heading: 0, pitch: -75 },
    'russia':       { lon:  60,      lat:  60,     alt:  7000000, heading: 0, pitch: -75 },
    'hormuz':           { lon:  56.5,    lat:  26.4,   alt:   750000, heading: 0, pitch: -65 },
    'little-st-james':  { lon: -64.827, lat:  18.288, alt:     2000, heading: 0, pitch: -65 },

    // ── CITIES — AMERICAS ───────────────────────────────────────────────
    'new-york':     { lon: -74.01,   lat:  40.71,  alt:   180000, heading: 0, pitch: -72 },
    'washington':   { lon: -77.04,   lat:  38.89,  alt:   130000, heading: 0, pitch: -72 },
    'chicago':      { lon: -87.63,   lat:  41.88,  alt:   160000, heading: 0, pitch: -72 },
    'miami':        { lon: -80.19,   lat:  25.77,  alt:   140000, heading: 0, pitch: -72 },
    'los-angeles':  { lon: -118.24,  lat:  34.05,  alt:   200000, heading: 0, pitch: -72 },

    // ── CITIES — EUROPE ─────────────────────────────────────────────────
    'london':       { lon:  -0.13,   lat:  51.51,  alt:   160000, heading: 0, pitch: -72 },
    'paris':        { lon:   2.35,   lat:  48.86,  alt:   150000, heading: 0, pitch: -72 },
    'berlin':       { lon:  13.41,   lat:  52.52,  alt:   150000, heading: 0, pitch: -72 },
    'kyiv':         { lon:  30.52,   lat:  50.45,  alt:   160000, heading: 0, pitch: -72 },
    'moscow':       { lon:  37.62,   lat:  55.75,  alt:   200000, heading: 0, pitch: -72 },
    'istanbul':     { lon:  28.98,   lat:  41.01,  alt:   160000, heading: 0, pitch: -72 },

    // ── CITIES — MIDDLE EAST / AFRICA ───────────────────────────────────
    'tel-aviv':     { lon:  34.77,   lat:  31.77,  alt:   160000, heading: 0, pitch: -72 },
    'tehran':       { lon:  51.39,   lat:  35.69,  alt:   160000, heading: 0, pitch: -72 },
    'baghdad':      { lon:  44.40,   lat:  33.34,  alt:   160000, heading: 0, pitch: -72 },
    'riyadh':       { lon:  46.72,   lat:  24.69,  alt:   160000, heading: 0, pitch: -72 },
    'dubai':        { lon:  55.27,   lat:  25.20,  alt:   120000, heading: 0, pitch: -72 },
    'cairo':        { lon:  31.24,   lat:  30.04,  alt:   160000, heading: 0, pitch: -72 },

    // ── CITIES — ASIA / PACIFIC ─────────────────────────────────────────
    'moscow-east':  { lon: 104.93,   lat:  52.29,  alt:  6000000, heading: 0, pitch: -75 }, // Siberia overview
    'beijing':      { lon: 116.39,   lat:  39.91,  alt:   200000, heading: 0, pitch: -72 },
    'pyongyang':    { lon: 125.75,   lat:  39.02,  alt:   160000, heading: 0, pitch: -72 },
    'seoul':        { lon: 126.98,   lat:  37.57,  alt:   160000, heading: 0, pitch: -72 },
    'tokyo':        { lon: 139.69,   lat:  35.68,  alt:   180000, heading: 0, pitch: -72 },
    'taipei':       { lon: 121.56,   lat:  25.04,  alt:   120000, heading: 0, pitch: -72 },
    'singapore':    { lon: 103.82,   lat:   1.35,  alt:   100000, heading: 0, pitch: -72 },
    'mumbai':       { lon:  72.88,   lat:  19.08,  alt:   200000, heading: 0, pitch: -72 },
    'sydney':       { lon: 151.21,   lat: -33.87,  alt:   160000, heading: 0, pitch: -72 },
  };

  function init(viewer) {
    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        flyTo(viewer, btn.dataset.preset);
      });
    });
  }

  function flyTo(viewer, name) {
    var loc = LOCATIONS[name];
    if (!loc) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, loc.alt),
      orientation: {
        heading: Cesium.Math.toRadians(loc.heading),
        pitch:   Cesium.Math.toRadians(loc.pitch),
        roll:    0,
      },
      duration: 2.2,
    });

    // Update active button
    document.querySelectorAll('.preset-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.preset === name);
    });
  }

  return { init: init, flyTo: flyTo };

}());
