# Orrdia Bridge (INS-009)

**Status:** Design spec
**Extension ID:** `com.concord.orrdia-bridge`
**Pricing:** `free`
**Modes:** Party, Display, Hybrid
**Depends on:** [INS-001 UX Modes](../ux-modes.md)

---

## 1. Scope

A Concord extension that bridges to an **orrdia** server (the TruStoryHnsl
Jellyfin fork at https://github.com/TruStoryHnsl/orrdia) and surfaces its
media library as a shared playback experience inside Concord. The extension
is a pure client of orrdia's Jellyfin-compatible HTTP API — **no changes to
the orrdia server itself live in this repo**; server-side work belongs in the
orrdia repository.

What's in scope (v0.1.0):

- Server-connection config (base URL + credentials, persisted in extension
  state).
- Authentication against orrdia via Jellyfin's
  `/Users/AuthenticateByName` endpoint.
- Library and item browsing (Views → Items).
- Stream-URL acquisition (Direct + HLS).
- **Display mode** as the v0.1.0 first surface — one shared `<video>` for
  all participants, host elects play/pause/seek, others mirror.
- **Party mode** stub (TV display + phone-as-remote controllers); deferred
  past v0.1.0.
- **Hybrid mode** stub (player + chat alongside); deferred past v0.1.0.

What is **not** in scope:

- Modifications to the orrdia/Jellyfin server (those land upstream).
- DRM-protected content beyond what orrdia's open profile exposes.
- Transcoding policy decisions (orrdia decides; we ask for Direct first,
  fall back to HLS).
- Real cross-client network sync — local-loop only until Phase 1 ships
  the install + state-event pipeline.
- Subtitle picker UI, audio-track picker, chapter list (post-v0.1.0).

---

## 2. Package layout

```
packages/orrdia-bridge/
  manifest.json                 # id, version, modes: ["party","display","hybrid"]
  index.html                    # iframe entry
  package.json
  tsconfig.json
  vite.config.ts
  scripts/pack.mjs              # shared pattern with chess-checkers
  src/
    index.ts                    # bootstrap; resolves bridge init, dispatches
    shell/
      sdk-types.ts              # INLINED Concord SDK types (mirror of chess-checkers)
      bridge.ts                 # ShellBridge + 250ms dev fallback
    session/
      mode-adapter.ts           # SDK Mode -> UXMode -> ViewVariant
      sync.ts                   # pure SyncState reducer (play/pause/seek)
      __tests__/sync.test.ts
    engine/
      types.ts                  # ServerConfig, AuthSession, LibraryView, MediaItem
      auth.ts                   # authenticateByName()
      client.ts                 # OrrdiaClient: listLibraries, listItems
      stream-url.ts             # directStreamUrl, hlsStreamUrl
      __tests__/auth.test.ts
      __tests__/client.test.ts
      __tests__/stream-url.test.ts
    ui/
      server-config.ts          # base URL + login form
      library-browser.ts        # views -> items grid
      display.ts                # HTML5 <video> mount for Display mode
      __tests__/display.test.ts
```

Engine modules export pure functions only. Network calls are isolated in
`engine/auth.ts` and `engine/client.ts`; both take an explicit `fetch`
implementation as an optional parameter so unit tests inject a mock without
touching `globalThis`.

---

## 3. Server-config model

### 3.1 ServerConfig

```ts
interface ServerConfig {
  baseUrl: string                // e.g. "https://orrdia.example.com"; no trailing slash
  username: string
  password: string               // entered live; not persisted to disk in v0.1.0
  deviceName?: string            // default "Concord"
  deviceId?: string              // default: stable per-extension UUID
  clientName?: string            // default "Concord-Orrdia-Bridge"
  clientVersion?: string         // default manifest.version
}
```

### 3.2 AuthSession

```ts
interface AuthSession {
  baseUrl: string
  userId: string                 // Jellyfin User.Id (GUID)
  accessToken: string            // Jellyfin AccessToken; passed via X-Emby-Token / api_key
  serverId: string
  deviceId: string
  expiresAt?: number             // millis since epoch; orrdia tokens are long-lived
}
```

The session is held in-memory by the running extension. v0.1.0 does not
persist credentials between launches; re-auth on every mount. Phase 1's
install pipeline will add a per-user secret store; spec doesn't depend on it.

### 3.3 First-run setup wizard (v0.3.0+)

A fresh orrdia install has `StartupWizardCompleted: false` and no
admin account exists yet. v0.2.0 dead-ended at "enter username/password
for an account that doesn't exist." v0.3.0 detects this state and
walks the user through inline.

**Detection probe** — at mount, before rendering any auth UI:

```
GET {baseUrl}/System/Info/Public      (no auth, always reachable)
```

The response includes `StartupWizardCompleted: boolean`. If `true` →
render the existing connect form (§4). If `false` → render the wizard.
If the probe itself fails → render the URL-only prompt and let the
user fix the address before re-probing.

**Wizard endpoint chain** (each unauthenticated WHILE
`StartupWizardCompleted=false`):

| Step | Method + Path | Body |
|------|---------------|------|
| Configuration | `POST /Startup/Configuration` | `{UICulture, MetadataCountryCode, PreferredMetadataLanguage}` |
| Admin user | `POST /Startup/User` | `{Name, Password}` |
| Library (optional, post-auth) | `POST /Library/VirtualFolders?name=&collectionType=&refreshLibrary=true` | `{LibraryOptions: {PathInfos: [{Path}]}}` |
| Remote access | `POST /Startup/RemoteAccess` | `{EnableRemoteAccess, EnableAutomaticPortMapping: false}` |
| Finalize | `POST /Startup/Complete` | `{}` |

After `/Startup/Complete` the server flips `StartupWizardCompleted` to
true; subsequent calls to `/Startup/*` reject without an AccessToken.
The wizard immediately follows with `/Users/AuthenticateByName` using
the admin credentials it just captured, then optionally creates the
quick-start library (which requires auth), and hands the AuthSession
to the host like the connect form does.

**State machine** — pure transitions, unit-testable without a browser.
Each state owns one render function. Error states preserve user-entered
values across retries.

```
detecting --probeOk(completed=true)--> connected (handoff to connect form)
detecting --probeOk(completed=false)--> wizardWelcome
detecting --probeError--> serverPrompt
serverPrompt --URL_SUBMIT--> detecting
wizardWelcome --WELCOME_CONTINUE (Configuration POST)--> wizardAdmin
wizardAdmin --ADMIN_SUBMIT (User POST)--> wizardLibrary
wizardLibrary --LIBRARY_SUBMIT or LIBRARY_SKIP--> wizardRemote
wizardRemote --REMOTE_SUBMIT (RemoteAccess + Complete + Auth + VirtualFolder)--> wizardFinalizing
wizardFinalizing --FINALIZE_DONE--> connected (with AuthSession)
any wizard step --STEP_ERROR--> wizardError(reason, returnTo)
wizardError --RETRY--> returnTo (with all entered fields preserved)
wizardError --RESET_TO_PROMPT--> serverPrompt
```

**Failure modes**:

| Symptom | Handling |
|---------|----------|
| `/Startup/User` 400 (admin name taken, password too weak) | Render server's error body inline + HTTP code; stay on wizardAdmin via Retry; preserve typed fields. |
| Network failure on probe or step POST | Distinguish from auth failure via `OrrdiaSetupError.status === 0`. Offer Retry or Change-server-URL. |
| Out-of-band wizard completion mid-flow | The probe-resilient design re-checks on entry. If probe flips to `completed=true` mid-wizard the FSM jumps to the connect form. |
| Library creation fails post-auth | Soft-warn via console; complete handoff anyway. The user has a working server; library can be added later. |

**Out-of-scope for v0.3.0**: library management UI beyond the single
quick-start library, advanced metadata config, multi-user setup beyond
the initial admin, branding customization. Those land later if needed.

---

## 4. Authentication flow

### 4.1 Endpoint

```
POST {baseUrl}/Users/AuthenticateByName
Content-Type: application/json
X-Emby-Authorization: MediaBrowser Client="{clientName}", Device="{deviceName}", DeviceId="{deviceId}", Version="{clientVersion}"

{
  "Username": "{username}",
  "Pw": "{password}"
}
```

### 4.2 Response (truncated to fields we use)

```json
{
  "User": { "Id": "<guid>", "Name": "<name>", "ServerId": "<guid>" },
  "AccessToken": "<token>",
  "ServerId": "<guid>"
}
```

### 4.3 Subsequent calls

Every subsequent request includes either:

- **Header**: `X-Emby-Token: {accessToken}` and `X-Emby-Authorization: MediaBrowser Client=..., Device=..., DeviceId=..., Version=..., Token="{accessToken}"`, OR
- **Query string**: `?api_key={accessToken}` for `<video>` / `<audio>` URLs that the browser fires off as separate GETs (it can't attach custom headers).

The client uses headers for JSON API calls; the stream-URL builder embeds
`api_key=` in the query string because `<video src=...>` requests can't
carry the auth header.

---

## 5. Library + item browsing

### 5.1 List user's library views

```
GET {baseUrl}/Users/{userId}/Views
Headers: X-Emby-Token, X-Emby-Authorization
```

Returns `Items[]` where each item is a top-level library (Movies, TV Shows,
Music, etc.). We surface them as `LibraryView`:

```ts
interface LibraryView {
  id: string                  // Item.Id
  name: string                // "Movies"
  collectionType?: string     // "movies" | "tvshows" | "music" | ...
  imageTags?: { Primary?: string }
}
```

### 5.2 List items inside a view (or a folder)

```
GET {baseUrl}/Users/{userId}/Items?ParentId={parentId}&Recursive=false&IncludeItemTypes=Movie,Series,Episode&Fields=Overview,RunTimeTicks,MediaSources&Limit=200
```

Returns `Items[]`. Mapped to:

```ts
interface MediaItem {
  id: string                  // Item.Id
  name: string
  type: "Movie" | "Series" | "Season" | "Episode" | "Folder" | string
  parentId?: string
  runTimeTicks?: number       // 1 tick = 100ns; ms = ticks/10000
  overview?: string
  imageTags?: { Primary?: string; Backdrop?: string }
  hasChildren?: boolean       // for Series/Season — drill in to list episodes
  mediaSources?: MediaSource[]
}

interface MediaSource {
  id: string                  // MediaSource.Id (used in stream URL)
  container?: string          // "mkv", "mp4", ...
  size?: number
  path?: string
  protocol?: "File" | "Http"
}
```

For Series → Seasons → Episodes browsing, the same `Items` endpoint with
`ParentId` set to the series/season Id walks the tree.

### 5.3 Image URL

```
GET {baseUrl}/Items/{itemId}/Images/Primary?fillHeight=300&fillWidth=200&quality=80&tag={imageTag}&api_key={accessToken}
```

The `library-browser` UI uses this for thumbnails. No auth header needed when
`api_key=` is in the query.

---

## 6. Stream-URL acquisition

Two URL builders, one playback contract. The Display surface tries Direct
first; if the `<video>` element fires `error` it falls back to HLS.

### 6.1 Direct stream

```
GET {baseUrl}/Videos/{itemId}/stream?Static=true&MediaSourceId={mediaSourceId}&api_key={accessToken}
```

Direct play streams the source file as-is. Works for any container the
browser natively decodes (mp4/H.264/AAC). Fails on mkv/HEVC in browsers
without those codecs.

### 6.2 HLS stream

```
GET {baseUrl}/Videos/{itemId}/main.m3u8?MediaSourceId={mediaSourceId}&deviceId={deviceId}&api_key={accessToken}&PlaySessionId={sessionUuid}&VideoCodec=h264&AudioCodec=aac,mp3&TranscodingMaxAudioChannels=2
```

orrdia transcodes on the fly to fragmented MP4/HLS. Browsers consume the
manifest natively (Safari) or via `hls.js` polyfill (Chrome/FF). v0.1.0
relies on native Safari + `<video>` only; `hls.js` integration is a
post-v0.1.0 add.

### 6.3 Stream-URL builder contract

```ts
function directStreamUrl(session: AuthSession, itemId: string, mediaSourceId?: string): string
function hlsStreamUrl(session: AuthSession, itemId: string, opts?: {
  mediaSourceId?: string
  videoCodec?: string                 // default "h264"
  audioCodec?: string                 // default "aac,mp3"
  playSessionId?: string              // default crypto.randomUUID()
}): string
```

Both are pure string builders. They never call `fetch`.

---

## 7. Shared-playback sync model

### 7.1 SyncState

```ts
interface SyncState {
  itemId: string | null             // selected item; null = idle
  status: "idle" | "playing" | "paused" | "buffering"
  positionMs: number                // last known head position
  positionAtMs: number              // wall-clock at which positionMs was sampled
  rate: number                      // playback rate; v0.1.0 always 1.0
  hostId: string                    // participantId of the elected host
}
```

### 7.2 Sync events

Host emits one of the following; observers apply to local state:

```ts
type SyncEvent =
  | { type: "select"; itemId: string }
  | { type: "play"; positionMs: number; atMs: number }
  | { type: "pause"; positionMs: number; atMs: number }
  | { type: "seek"; positionMs: number; atMs: number }
  | { type: "host-transfer"; newHostId: string }
```

### 7.3 Reducer contract

```ts
function applyEvent(state: SyncState, ev: SyncEvent, localId: string): SyncState
```

Pure / deterministic. `localId` is the participant applying the event so
the reducer can decide whether to mirror or ignore (host's own emit returns
the new state unchanged on a round-trip).

### 7.4 Host election

Whichever participant launched the session is the host. v0.1.0 stays with
the launcher; if they leave, the state-event channel hasn't shipped yet so
the session ends. Phase 1 will add `concord:host_transfer` to the SDK
(already typed in `shell/sdk-types.ts`); the reducer accepts it now.

### 7.5 Wire model (deferred to Phase 1)

In v0.1.0 the reducer fires only against local state. The mount site has a
clearly-marked `// SYNC: post Phase 1, route via concord state_events here`
TODO. When Phase 1 lands, the host posts each `SyncEvent` as a Concord
state event; observers receive it via `bridge.onStateEvent` (will be added
to the SDK at that time) and call `applyEvent` from there.

---

## 8. UX modes

### 8.1 Display (v0.1.0 first surface)

One full-bleed `<video>`. The mode-adapter resolves SDK `shared` /
`shared_readonly` → UXMode `display` → ViewVariant `shared-display`.

Layout:
- Top bar: server name + current item title + back button.
- Center: `<video>` element occupying ~85% of viewport height.
- Bottom controls (host only): scrubber, play/pause, mute. Observers see
  status text only.
- The library browser is shown until an item is selected; selection
  triggers the player surface.

### 8.2 Party (stub, partial in v0.1.0)

TV display surface = the Display layout above.
Phone surfaces = a controller UI: search bar + library browser + a
"sending to TV" status row.

The controller posts `select` events to the host (the TV); the TV is the
only surface that mounts a `<video>`. Phones never play media themselves.

### 8.3 Hybrid (stub, partial in v0.1.0)

Two-pane layout:
- Left/top: Display surface as above.
- Right/bottom: a chat surface that taps `matrix.read` + `matrix.send`
  permissions. v0.1.0 stubs this with a placeholder panel; full Hybrid
  ships when Phase 1 + the chat surface API land.

---

## 9. Manifest

```json
{
  "id": "com.concord.orrdia-bridge",
  "version": "0.1.0",
  "name": "Orrdia Bridge",
  "description": "Bridge to an orrdia/Jellyfin server. Browse the shared library and stream movies, shows, and music with synchronized playback for everyone in the room.",
  "pricing": "free",
  "entry": "index.html",
  "modes": ["party", "display", "hybrid"],
  "permissions": ["state_events", "fetch:external"],
  "minConcordVersion": "0.1.0"
}
```

Permissions:
- `state_events` — for the shared-playback sync model (Phase 1).
- `fetch:external` — outbound HTTP to the configured orrdia base URL.

A future `media-stream-proxy` permission will let the shell route stream
URLs through a server-side proxy when the orrdia base URL is private to
one user's LAN (logged as a Phase 1 inbox item; see "Punts").

---

## 10. Test plan

### 10.1 Unit (vitest, jsdom)

- `engine/auth.test.ts`
  - successful auth returns AuthSession with all fields populated;
  - non-200 throws a typed `OrrdiaAuthError`;
  - X-Emby-Authorization header is built with all five MediaBrowser fields
    in the documented order.
- `engine/client.test.ts`
  - `listLibraries` hits `/Users/{userId}/Views`, parses Items;
  - `listItems` builds the right query string (ParentId, Limit,
    IncludeItemTypes, Fields);
  - non-200 surfaces an `OrrdiaClientError` with the response body.
- `engine/stream-url.test.ts`
  - direct URL contains `/Videos/{itemId}/stream`, `Static=true`,
    `api_key=`;
  - HLS URL contains `/main.m3u8`, `VideoCodec=h264`, `api_key=`,
    `PlaySessionId=` (any non-empty UUID);
  - all builders escape special characters in tokens.
- `session/sync.test.ts`
  - reducer is pure (same input → same output, original not mutated);
  - `play` / `pause` / `seek` update positionMs + status as documented;
  - `host-transfer` updates hostId;
  - replaying the same event twice is idempotent.
- `ui/display.test.ts`
  - mounting the surface creates a `<video>` whose `src` matches
    `directStreamUrl()` for the selected item;
  - clicking play (host) updates SyncState to `playing`.

Target: ≥10 tests across the three engine + sync files for v0.1.0.

### 10.2 Manual smoke (post-v0.1.0)

- Stand up an orrdia dev server (or a public Jellyfin demo).
- `pnpm --filter concord-ext-orrdia-bridge dev`, navigate to
  `http://localhost:5173/`, enter base URL + creds, browse Movies, click
  a movie, observe `<video>` plays.
- Verify that pausing on host updates SyncState locally; mirror to a
  second tab via a manual postMessage to confirm the reducer applies.

---

## 11. References

- INS-001 UX Modes: `docs/extensions/ux-modes.md`
- Reference extensions (inlined SDK pattern): `packages/chess-checkers/`,
  `packages/werewolf/`, `packages/card-suite/`.
- Jellyfin API (orrdia is a fork; endpoints match upstream):
  - `POST /Users/AuthenticateByName`
  - `GET /Users/{userId}/Views`
  - `GET /Users/{userId}/Items?ParentId=...`
  - `GET /Items/{itemId}/Images/Primary?...`
  - `GET /Videos/{itemId}/stream?...`
  - `GET /Videos/{itemId}/main.m3u8?...`
  Reference docs: https://api.jellyfin.org/ (path/header shapes verified
  against current Jellyfin OpenAPI; orrdia's fork preserves these).
