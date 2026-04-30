# WorldView — Photorealistic Globe + Steel UI + Data-Layer Expansion

**Date:** 2026-04-30
**Project:** `concord-extensions/packages/worldview-map`
**Status:** Approved, ready for implementation plan
**Build approach:** Vertical slice (Slice A = canary, Slice B = fan-out)

---

## 1. Goal

Bring WorldView from a Cesium-World-Terrain OSINT prototype to a photorealistic 3D globe with a non-obtrusive Steel UI, hardened safeguards against API spend, a much wider set of authenticated data streams, polished plane click-tracking, and pinnable CCTV PiP tiles. Both standalone and concord-extension surfaces share the same codebase (single package).

## 2. Slices

### Slice A — Canary (proves new stack end-to-end)

1. **Google Photorealistic 3D Tiles** as the default base layer; fall back to current Cesium World Terrain when `GOOGLE_MAPS_KEY` is missing.
2. **Steel UI palette** applied repo-wide for default `"normal"` mode. CRT/NVG/FLIR mode overrides preserved.
3. **`wv-fetch`** egress wrapper — every layer routes through it: rate caps, daily quotas, cache, health tracking.
4. **Server-side proxy hardening** in `concord/server/routers/ext_proxy.py` — per-source token-bucket + `__healthz` endpoint per source.
5. **Stream-health panel** in the bottom bar — one row per registered source: name, last-success age, latency, status dot. Drill-down on click.
6. **Budget guard** — passive toast when any source crosses 80% of daily quota.
7. **NWS Alerts** layer (canary) — proves the new layer-pattern works against the photoreal globe with GeoJSON polygons.
8. **Auth verification** for every existing source (OpenSky, AISStream, TomTom, Sentinel, Windy, USGS, military, satellites, ports, jamming, CCTV) — visible green in stream-health panel within 2 min of load, or red with the actual error.

### Slice B — Fan-out

9. **Plane click-track polish** — refine existing 3D `plane.glb` swap, chase camera, dead-reckoning so it actually animates at the reported velocity. Click-only trigger (no zoom-based auto-swap).
10. **CCTV PiP grid** — click camera marker → live MJPEG/HLS stream in a draggable PiP tile. Cap 6 simultaneous tiles. Pin set persists across sessions.
11. **New data layers** (each its own module, each registered with `wv-fetch` and the health panel):
    - **airplanes.live** `/v2/mil` — military aircraft (1 req/sec, no auth)
    - **NASA FIRMS** — global wildfire hotspots (free MAP_KEY, 5k tx / 10 min)
    - **NOAA NHC** — active tropical cyclones (no auth, free)
    - **Launch Library 2** — upcoming rocket launches with pad coords (free key for 1k/day)
    - **Cloudflare Radar Outages** — verified internet outages (free token, 1200/5min)
    - **OSM Overpass** for ALPR / Flock cameras (`man_made=surveillance` + `surveillance:type=ALPR`); refresh hourly + cache; ODbL attribution
    - **DOT camera aggregator** — Caltrans CWWP2 (no key) + WSDOT + OregonDOT + 511NY + MassDOT (free keys, signed agreements where required)
    - **Time-zone polygons** — static GeoJSON layer (Evan Siroky `timezone-boundary-builder`); not the API
    - **Google Geocoding** — search bar that flies the globe to a typed place
    - **Google Places (New)** — click empty terrain → POI name + photo
    - **Google Air Quality** — current AQI heatmap layer
    - **Google Pollen** — seasonal pollen layer

YouTube Data v3 is **dropped** (uploaders rarely geotag livestreams; near-zero practical yield). State-DOT camera feeds + Windy Webcams supplement cover the "open webcams" intent.

## 3. Architecture

```
Browser iframe (worldview-map)
├── Cesium Viewer + Google 3D Tiles primitive
├── Layer modules (flights, mil, nws, firms, nhc, launchlib, …)
│     └── all import wv-fetch (no direct window.fetch)
├── UI panels (Steel theme)
│     ├── stream-health panel
│     ├── budget-guard toasts
│     └── CCTV PiP grid
└── wv-fetch (single egress wrapper)
       ├── per-source token bucket
       ├── per-source daily quota counter
       ├── in-memory TTL cache
       └── health record (last success ts, latency, error)

Egress paths:
  • Direct external (browser keys, referrer-locked):
      Google Map Tiles, Geocoding, Places, AQ, Pollen
      Cesium Ion (terrain fallback)
      AISStream WebSocket
      USGS, NWS, FIRMS, NHC, Launch Library, Cloudflare Radar,
      Caltrans, OregonDOT, OSM Overpass (all keyless / CORS-OK)
  • Server-side proxy (/api/ext-proxy/com.concord.worldview-map/<source>):
      OpenSky (existing)
      Sentinel Hub (existing)
      airplanes.live (new — for token-bucket only, not auth)
      511NY (new — key-gated agreement)
      WSDOT (new — key-gated)
      MassDOT (new — Open511)
      any new auth-bearing source
```

## 4. Components

### Files added

| Path | Purpose |
|---|---|
| `dist/src/lib/wv-fetch.js` | Single egress wrapper (rate, quota, cache, health) |
| `dist/src/lib/photoreal.js` | Installs Google 3D Tiles primitive; falls back to ellipsoid |
| `dist/src/lib/sources.js` | Source-registry (URL, auth mode, refresh cadence, daily cap) |
| `dist/src/layers/nws.js` | NWS Alerts polygons (canary, Slice A) |
| `dist/src/layers/airplanes_live.js` | Mil flights (Slice B) |
| `dist/src/layers/firms.js` | Wildfire hotspots (Slice B) |
| `dist/src/layers/nhc.js` | Tropical cyclones (Slice B) |
| `dist/src/layers/launchlib.js` | Upcoming launches (Slice B) |
| `dist/src/layers/cf_outages.js` | Cloudflare Radar outages (Slice B) |
| `dist/src/layers/alpr.js` | OSM Overpass ALPR / Flock (Slice B) |
| `dist/src/layers/dotcams.js` | Multi-DOT camera aggregator (Slice B) |
| `dist/src/layers/timezones.js` | Static-GeoJSON tz polygons (Slice B) |
| `dist/src/layers/g_aqi.js` | Google Air Quality (Slice B) |
| `dist/src/layers/g_pollen.js` | Google Pollen (Slice B) |
| `dist/src/ui/health-panel.js` | Bottom-bar health widget |
| `dist/src/ui/budget-guard.js` | 80%-quota toast |
| `dist/src/ui/cctv-pip.js` | CCTV PiP grid (Slice B) |
| `dist/src/ui/search-bar.js` | Google Geocoding fly-to (Slice B) |
| `dist/src/ui/place-card.js` | Google Places click-card (Slice B) |
| `dist/data/timezones.geojson` | Static tz polygons (committed asset) |

### Files modified

| Path | Change |
|---|---|
| `dist/src/main.js` | Call `WV.Photoreal.install(viewer)` after init; conditionally swap terrain |
| `dist/src/config.example.js` | Add `GOOGLE_MAPS_KEY`, `FIRMS_KEY`, `LAUNCHLIB_KEY`, `CLOUDFLARE_TOKEN`, `WSDOT_KEY`, `NY511_KEY`, `MASSDOT_KEY` slots |
| `dist/styles/main.css` | Steel palette pass: `--accent: #9DB9D9`, `--panel-bg: rgba(20,30,45,0.65)`, `--panel-border: rgba(120,150,180,0.22)`, `--text: #c4d0de`, `--text-dim`, `--bar-bg: rgba(10,16,24,0.72)`. Add `backdrop-filter: blur(14px) saturate(140%)` to `.panel`, `.bar`, `.preset`. Drop opacity defaults from 0.90 → 0.65. Existing `body[data-mode="..."]` mode overrides preserved |
| `dist/index.html` | Add `<div id="wv-health">` slot in bottom bar; add `<div id="wv-pip-grid">` overlay; add `<input id="wv-search">` in top bar |
| `dist/manifest.json` | Add `data_sources` block (manifest-driven health panel + proxy auto-config); add new `browser_keys` and `needs_proxy` entries |
| `dist/src/layers/flights.js` | Polish click-track: ensure `_modelEntity` actually swaps, chase cam locks to predicted-position, dead-reckoning interpolates between OpenSky updates at `velocity` m/s |
| `dist/src/layers/cctv.js` | Wire click-to-pin handler → `wv-cctv-pip` event |
| `concord/server/routers/ext_proxy.py` | Add per-source token bucket; expose `GET /api/ext-proxy/{ext_id}/__healthz/{source}`; register new auth-bearing sources |

## 5. Safeguards Against API Spend

The user's `GOOGLE_MAPS_KEY` currently has access to ALL Google APIs and is unrestricted. Spec mandates **all four layers** before any Google API call ships:

1. **Google Cloud Console — API restriction**
   Restrict the key to ONLY: Map Tiles API, Geocoding API, Places API (New), Air Quality API, Pollen API. Set HTTP-referrer restrictions to `localhost:*`, `127.0.0.1:*`, and the production hostnames where the iframe loads (`concorrd.com/*`, plus user's local dev origins).
2. **Google Cloud Console — per-API daily quotas**
   For each enabled API, set a hard daily quota cap below the free tier:
   - Map Tiles: 25,000 tile loads/day (free 28k)
   - Geocoding: 8,000/month (free 10k)
   - Places (Text Search): 4,000/month (free 5k)
   - Air Quality: 8,000/day (free 10k)
   - Pollen: 8,000/day (free 10k)
3. **Google Cloud Console — billing budget alert**
   $1 budget with email alerts at 50%, 90%, 100%. (GCP minimum is $0; using $1 to make alerts actionable rather than informational.)
4. **App-side enforcement (`wv-fetch`)**
   - Token-bucket rate cap per source, default 1 req/sec.
   - Daily counter in `sessionStorage`; hard-stop at 80% of free tier (well below the GCP cap, so we hit our own gate first).
   - Every layer's polling interval auto-reduced (with toast) when ≥3 of its requests fail in a 60s window.
   - Cesium tile-loading: `maximumScreenSpaceError: 16` (default 2 = aggressive, 16 = ~8x fewer tile requests with negligible visual loss at typical zooms).
   - `requestRenderMode: true` already on; preserved.

## 6. Stream-Health Panel + Auth Verification

Bottom-bar widget driven by `dist/src/lib/sources.js` registry. Each source row:

```
  ●  opensky          12s ago      88ms     [details]
  ●  airplanes.live   8s ago       142ms    [details]
  ◐  sentinel         pending      —        [details]
  ●  nws              43s ago      210ms    [details]
  ●  firms            2m ago       550ms    [details]
  ✗  windy            error        —        [details]    ← red
```

- **Green**: last success within 3× refresh interval, no errors in last 5 min.
- **Amber**: ≥80% of daily quota used, OR pending first response, OR latency >2s.
- **Red**: last attempt failed, OR no successful response within 10× refresh interval.
- Click `[details]` → expand drawer: full URL, last error message, last success ISO timestamp, daily-cap counter, manual "retry now" button.
- Authentication failures (401/403/wrong key) flagged distinctly from network failures.

Slice A's "auth verification" requirement is satisfied by every pre-existing source going green within 2 min of load (or red with the specific 401/403/etc. error).

## 7. Plane Click-Track Refinement (Slice B)

Existing code at `dist/src/layers/flights.js` already has the `_modelEntity`, `_trackEntity`, chase-cam math, and dead-reckoning scaffolding (`_drPredict`). Bugs/gaps to address:

1. **Velocity math**: confirm `_drPredict` extrapolates lat/lon using `velocity` (m/s) and `heading` (deg) over `dt` correctly. Rebench against known flights.
2. **Smooth tween**: when a fresh OpenSky update arrives, snap-vs-tween the model position (currently snaps — visible jump). Replace with a 1.5s linear tween from predicted-pos to actual-pos, so the model glides.
3. **Model-orientation lag**: heading changes should ease over ~2s, not instant snap.
4. **Chase cam stability**: `CHASE_RANGE = 4000m` causes clipping into Photoreal 3D Tiles at urban airports. Increase to 6000m and add `clampToGround: false`.
5. **Billboard hide on track**: currently hidden via `_wvIcao === trackedIcao` filter — verify this still works after `wv-fetch` refactor.
6. **Click-only trigger** (no zoom-based auto-swap, per scope decision).

## 8. CCTV PiP Grid (Slice B)

- Click camera marker → emit `wv-cctv-pin` event with `{id, name, lat, lon, stream_url, format}`.
- `dist/src/ui/cctv-pip.js` listens, opens a draggable tile (`<video>` for HLS, `<img>` for MJPEG, `<iframe>` for embedded players that block raw stream access).
- Tile chrome: title bar, drag handle, close button, "fly to" button (recenters globe on the camera).
- Grid container `<div id="wv-pip-grid">` is fixed-position, top-right by default.
- **Browser-playable formats only**: MJPEG, HLS, browser-embeddable iframe. RTSP cameras are surfaced in the layer with a "raw stream — not browser-playable" marker; clicking copies the RTSP URL to clipboard for an external player.
- **Bandwidth cap**: max 6 simultaneous tiles. Adding a 7th replaces the oldest (LRU) with a "evicted" toast.
- **Persistence**: pin set saved to `localStorage` (`wv.cctv.pins`) — survives reload. Optional sync to extension session-state via `extension_action` for cross-device persistence in concord context.

## 9. UI Redesign (Steel)

Default `"normal"` mode tokens:
```css
--accent:       #9DB9D9;
--accent-dim:   rgba(157, 185, 217, 0.50);
--accent-glow:  rgba(157, 185, 217, 0.12);
--panel-bg:     rgba(20, 30, 45, 0.65);
--panel-border: rgba(120, 150, 180, 0.22);
--text:         #c4d0de;
--text-dim:     rgba(180, 200, 220, 0.50);
--text-muted:   rgba(180, 200, 220, 0.30);
--bar-bg:       rgba(10, 16, 24, 0.72);
```

Universal panel rules:
```css
.panel, .bar, .preset, .health-panel, .pip-tile {
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
}
```

Mode-toggle CSS overrides preserved verbatim (`body[data-mode="flir|crt|nvg"]` stay untouched). The Steel palette IS the new "normal" — selecting "normal" in the mode toggle gives Steel.

Implementation: redesign in slice A uses the `frontend-design` skill once writing-plans phase is done — that skill is invoked by the implementation plan, not by this spec.

## 10. Error Handling

| Case | Behavior |
|---|---|
| Google key missing | Photoreal disabled silently, ellipsoid terrain shown; health panel marks `gmaps` source amber with "no key configured"; budget guard reports $0 spend |
| Google key invalid | First Map Tiles 401 → ellipsoid swap-back at runtime; health panel red with the 401 message |
| Quota near limit (≥80%) | Amber dot + toast; refresh cadence auto-doubles |
| Quota exceeded | Source-specific layer freezes at last data; health panel red; toast asks user to wait until next reset window |
| Network failure (3 in 60s) | Layer pauses, health red, exponential backoff up to 5 min retry interval |
| Auth failure (401/403) | Layer pauses, health red with distinct icon, manual "retry now" only |
| Cesium tile load fail | Cesium's own retry handles it; if persistent, photoreal-source flips amber |
| CCTV stream broken | PiP tile shows static "stream unavailable" frame; auto-removed after 10s |
| WebSocket disconnect (AISStream) | Auto-reconnect with backoff; health amber during reconnect |

No silent failures — every failure mode surfaces in the stream-health panel.

## 11. Testing

Per project `CLAUDE.md`, tests are written in a **separate session** by a cold reader, not by the implementation session. The spec defines the **acceptance criteria** — observable, user-visible behavior — that the test session will verify.

### Slice A acceptance (must all be observed, not just compile-clean)

1. Globe loads with Photorealistic 3D Tiles when key configured — verified by browser screenshot showing recognizable photogrammetric buildings (e.g. fly to NYC, see Chrysler Building).
2. Globe falls back to Cesium World Terrain when key absent — verified by browser screenshot.
3. Steel palette visible — side-by-side screenshot of pre/post.
4. Stream-health panel renders all 11 existing sources + NWS = 12 rows, all green within 2 min — screenshot.
5. NWS alert polygons render over current US weather conditions — screenshot.
6. Inject 999 fake calls to one source → health row goes amber at 80% — screenshot of the amber state.
7. Remove the Google API key from config → reload → no Google API calls in network tab.

### Slice B acceptance

8. Click commercial flight → 3D plane.glb appears, chase camera engages, plane visibly moves along trajectory between OpenSky updates with no snap — Playwright trace + video.
9. Click 3 CCTV markers → 3 PiP tiles appear; drag to rearrange; reload page; same 3 tiles re-appear in same positions.
10. Each new layer toggle shows actual data on the globe — screenshot per layer.
11. Cloud Console dashboard after 30 min of use shows zero API calls exceeded their daily quota cap.
12. Billing → no charges accrued.

### Regression guards

- Slice A must not break any existing layer; pre-existing 11 layers stay green in the health panel.
- Mode toggles (CRT/NVG/FLIR) still re-skin correctly after Steel becomes the default.
- Concord shell session-model integration (INS-036) still passes — `concord:init`, `concord:participant_*`, `concord:surface_resize`, `extension_action` continue to work; new UI panels respect surface dimensions.

## 12. Out of Scope

- YouTube Data v3 (geotag yield ≈ 0).
- ADSBExchange post-JetNet paywall.
- ACLED (manual key approval + commercial-use ToS).
- Insecam / Opentopia / EarthCam (legal/ethical issues).
- Blitzortung (community policy against unauthorized scraping).
- New plane-detail flow beyond the click-track polish (no inspector pane, no flight-path replay).
- New CCTV onboarding flow (no admin UI to add custom cameras — pinning works on existing layer markers).
- Multi-device pin sync UX (cross-device persistence is best-effort via concord extension session state, not a designed-out feature).
- Mobile-touch ergonomics for PiP grid (desktop-first; basic touch works but isn't tuned).
- Themes other than Steel as the new default. CRT/NVG/FLIR keep their existing styles.

---

**Implementation plan target:** `docs/superpowers/plans/2026-04-30-worldview-photoreal-plan.md` — generated by `superpowers:writing-plans` skill from this spec.
