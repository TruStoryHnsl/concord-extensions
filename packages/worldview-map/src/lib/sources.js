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

  // Slice B sources
  airplanes_live: { label: 'airplanes.live (Mil)', transport: 'rest', direct_url: 'https://api.airplanes.live/v2/mil', refresh_ms: 5000, rate_per_sec: 1, daily_cap: null, auth: 'none' },
  firms:          { label: 'FIRMS Wildfires',       transport: 'rest', refresh_ms: 3600000, rate_per_sec: 0.1, daily_cap: 720, auth: 'browser-key' },
  nhc:            { label: 'NHC Storms',            transport: 'rest', direct_url: 'https://www.nhc.noaa.gov/gis/kml/nhc_active.kml', refresh_ms: 1800000, rate_per_sec: 0.1, daily_cap: 100, auth: 'none' },
  launchlib:      { label: 'Upcoming Launches',     transport: 'rest', direct_url: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20', refresh_ms: 3600000, rate_per_sec: 0.1, daily_cap: 100, auth: 'browser-key' },
  cf_outages:     { label: 'Net Outages (CF)',      transport: 'rest', direct_url: 'https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=24h', refresh_ms: 1800000, rate_per_sec: 0.1, daily_cap: 100, auth: 'browser-key' },
  osm_alpr:       { label: 'ALPR Cameras',          transport: 'rest', direct_url: 'https://overpass-api.de/api/interpreter', refresh_ms: 3600000, rate_per_sec: 0.05, daily_cap: 50, auth: 'none' },
  timezones:      { label: 'Time Zones',            transport: 'static', refresh_ms: 0, rate_per_sec: 1, daily_cap: null, auth: 'none' },

  // Slice B Phase 2 sources
  dotcams_caltrans:  { label: 'DOT Cams · Caltrans', transport: 'rest', refresh_ms: 600000, rate_per_sec: 0.5, daily_cap: null, auth: 'none' },
  dotcams_oregondot: { label: 'DOT Cams · Oregon',   transport: 'rest', refresh_ms: 600000, rate_per_sec: 0.5, daily_cap: null, auth: 'none' },
  dotcams_wsdot:     { label: 'DOT Cams · WSDOT',    transport: 'rest', refresh_ms: 600000, rate_per_sec: 0.5, daily_cap: 1000, auth: 'browser-key' },
  dotcams_511ny:     { label: 'DOT Cams · 511NY',    transport: 'rest', refresh_ms: 600000, rate_per_sec: 0.5, daily_cap: 1000, auth: 'browser-key' },
  dotcams_massdot:   { label: 'DOT Cams · MassDOT',  transport: 'rest', refresh_ms: 600000, rate_per_sec: 0.5, daily_cap: 1000, auth: 'browser-key' },
  g_geocode: { label: 'Google Geocoding',    transport: 'rest', direct_url: 'https://maps.googleapis.com/maps/api/geocode/json', refresh_ms: 0, rate_per_sec: 1, daily_cap: 8000, auth: 'browser-key' },
  g_places:  { label: 'Google Places (New)', transport: 'rest', direct_url: 'https://places.googleapis.com/v1/places:searchNearby', refresh_ms: 0, rate_per_sec: 1, daily_cap: 4000, auth: 'browser-key' },
  g_aqi:     { label: 'Air Quality (Google)', transport: 'tile-imagery', refresh_ms: 0, rate_per_sec: 1, daily_cap: 8000, auth: 'browser-key' },
  g_pollen:  { label: 'Pollen (Google)',      transport: 'tile-imagery', refresh_ms: 0, rate_per_sec: 1, daily_cap: 8000, auth: 'browser-key' },
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
