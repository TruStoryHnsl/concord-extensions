// lib/sources.js — single source of truth for every data source
window.WV = window.WV || {};

WV.sources = {
  // ── existing sources ──
  opensky:     { label: 'OpenSky',           proxy_path: '/opensky',  transport: 'rest',      refresh_ms: 15000,  rate_per_sec: 1, daily_cap: 4000,  auth: 'server-side-oauth2' },
  aisstream:   { label: 'AISStream',         transport: 'websocket', direct_url: 'wss://stream.aisstream.io/v0/stream', refresh_ms: 0, auth: 'browser-key', daily_cap: null },
  tomtom:      { label: 'TomTom',            transport: 'rest',      direct_url: 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json', refresh_ms: 60000, rate_per_sec: 1, daily_cap: 2500, auth: 'browser-key' },
  sentinel:    { label: 'Sentinel Hub',      proxy_path: '/sentinel', transport: 'rest',     refresh_ms: 0, auth: 'server-side-oauth2', daily_cap: 30000 },
  windy:       { label: 'Windy',             transport: 'rest',      direct_url: 'https://api.windy.com/api/point-forecast/v2', refresh_ms: 600000, rate_per_sec: 1, daily_cap: 1000, auth: 'browser-key' },
  usgs:        { label: 'USGS',              transport: 'rest',      direct_url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', refresh_ms: 60000, rate_per_sec: 1, daily_cap: null, auth: 'none' },
  military:    { label: 'Military (legacy)', proxy_path: '/military-legacy', transport: 'rest', refresh_ms: 30000, rate_per_sec: 1, auth: 'server-side' },
  satellites:  { label: 'Satellites',        transport: 'rest',      direct_url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', refresh_ms: 300000, rate_per_sec: 1, auth: 'none' },
  ports:       { label: 'Ports',             transport: 'rest',      direct_url: '', refresh_ms: 600000, rate_per_sec: 1, auth: 'none' },
  jamming:     { label: 'GPS Jamming',       transport: 'rest',      direct_url: '', refresh_ms: 300000, rate_per_sec: 1, auth: 'none' },
  cctv_legacy: { label: 'CCTV (legacy)',     transport: 'rest',      direct_url: '', refresh_ms: 600000, rate_per_sec: 1, auth: 'none' },

  // ── Slice A new sources ──
  gmaps_tiles: { label: 'Google 3D Tiles',   transport: 'cesium-tileset', direct_url: 'https://tile.googleapis.com/v1/3dtiles/root.json', auth: 'browser-key', daily_cap: 25000 },
  nws:         { label: 'NWS Alerts',        transport: 'rest', direct_url: 'https://api.weather.gov/alerts/active', refresh_ms: 300000, rate_per_sec: 1, auth: 'none', user_agent: 'WorldView/0.2 (https://concorrd.com)', daily_cap: null },

  // Slice B sources are appended in their respective tasks.
};

WV.sourceState = {};
(function () {
  function todayStartMs() { var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  for (var k in WV.sources) {
    WV.sourceState[k] = {
      last_success_ts: 0,
      last_error: null,
      latency_ms: null,
      daily_count: 0,
      daily_reset_ts: todayStartMs(),
    };
  }
})();
