# concord-extensions — Master Development Plan

Official monorepo for first-party Concord extensions. Extensions are runtime-loaded web apps (TypeScript → static HTML/JS bundles) installed into a running Concord instance without any rebuild or restart. Each extension is a standalone pnpm workspace package that ships as a `.zip` release artifact.

**Design spec**: `docs/superpowers/specs/2026-04-17-concord-extensions-design.md`
**Scope**: `commercial`

---

## Open Conflicts / Blocked

_(none)_

---

## Architecture

### Runtime model

Extensions run as sandboxed iframes inside the Concord client. All shell↔extension communication uses the `postMessage` SDK bridge (`concord/client/src/extensions/sdk.ts`). No extension may access Concord internals directly.

Install = API call + file write. No Concord binary rebuild, no server restart — ever.

### Distribution models

| Pricing | Install | Launch |
|---------|---------|--------|
| `free` | Download + cache bundle | Serve from cache; background version check |
| `one_time` | Download + cache bundle on purchase | Serve from cache; background version check |
| `subscription` | Download + cache on subscribe | Re-authorize with `concord.app` on every launch |

### UX modes (INS-001)

All extensions declare which modes they support. These map to INS-036 session modes already implemented in the main concord repo:

| Mode | Description | INS-036 mapping |
|------|-------------|-----------------|
| **Party** | One shared display (TV/desktop); mobile clients render per-user controller UI | `hybrid` |
| **Display** | Single shared window; all users see identical output | `shared` / `shared_readonly` |
| **Service** | Unique instance per connected user | `per_user` |
| **Chat** | Extension lives inside a text channel; interaction is chat-first | `shared` in text context |
| **Hybrid** | Split-screen — media display + live chatroom | `hybrid` |

The INS-036 session model is **already implemented** in the main concord repo (Waves 0–5 complete). INS-001 is a documentation/mapping task — no new framework code needed.

### Extension mode matrix

| Extension | Party | Display | Service | Chat | Hybrid |
|-----------|:-----:|:-------:|:-------:|:----:|:------:|
| Worldview | ✓ | ✓ | ✓ | | |
| Chess & Checkers | ✓ | ✓ | ✓ | | |
| Werewolf | ✓ | | | ✓ | ✓ |
| Among Us Clone | ✓ | | | | ✓ |
| Card Game Suite | ✓ | ✓ | ✓ | | ✓ |
| JackBox Clone | ✓ | | | | |
| Orrdia Bridge | ✓ | ✓ | | | ✓ |
| Game Maker Protocol | — | — | — | — | — |

### Tech stack

| Layer | Choice |
|-------|--------|
| Workspace | pnpm workspaces |
| Language | TypeScript 5.4+ |
| Bundler | Vite 5 |
| Testing | vitest 1.5 + jsdom |
| CI/CD | GitHub Actions |
| Release artifacts | GitHub Releases (`.zip` bundles) |

### SDK

The extension SDK (`concord/client/src/extensions/sdk.ts`) stays in the main concord repo until the advertising/launch phase. Extensions inline the types they need in the interim. When extracted it becomes `packages/concord-sdk/`, published to npm as `@concord/sdk`.

---

## Key Constraints

1. **No rebuild on install.** An extension install is an API call + file write. The Concord binary is unchanged.
2. **No Rust compile-time extension deps.** Extensions are web assets, never compiled into the Concord binary.
3. **postMessage only.** Extensions communicate with the shell exclusively via the SDK bridge.
4. **Immutable pure logic.** Extension state transition functions must be exported and pure (return new state, never mutate input) for unit testing without a browser.
5. **SDK stays in concord repo until launch phase.** Do not extract to `packages/concord-sdk/` before Phase 4 is scheduled.

---

## Extension Registry

| Package | ID | Pricing | Status |
|---------|----|---------|--------|
| `packages/worldview` | `com.concord.worldview` | free | Phase 0 |
| `packages/card-suite` | `com.concord.card-suite` | free | Phase 6 — complete (v0.4.0); awaits Phase 1 install pipeline for network sync |
| `packages/chess-checkers` | `com.concord.chess-checkers` | free | Phase 6 — complete (v0.4.0); awaits Phase 1 install pipeline for network sync |
| `packages/orrdia-bridge` | `com.concord.orrdia-bridge` | free | Phase 6 — v0.2.0 all three surfaces (Display/Party/Hybrid) shipped; awaits concord FUP-A for cross-client matrix sync |

---

## Feature Roadmap

### Phase 0 — Scaffold + Worldview Migration
**Status**: complete
**Plan**: `docs/superpowers/plans/2026-04-17-phase0-scaffold.md`
**Repo**: this repo

- [x] pnpm workspaces root (`pnpm-workspace.yaml` + root `package.json`)
- [x] Migrate `worldview` from `concord/ext/worldview/` — refactor pure functions to be exported and testable
- [x] Vite build, vitest unit tests, pack script (`pnpm run bundle` → `<id>@<version>.zip`)
- [x] GitHub Actions release pipeline (tag push → `.zip` → GitHub Release)
- [x] Remove `concord/ext/worldview/` from main concord repo

### Phase 1 — Runtime Loader
**Status**: complete (shipped 2026-04-30 as concord PR #39 / INS-066 W1-W8)
**Repo**: main `concord` repo

The Concord server learns to install, cache, and serve extension bundles.

- [x] DB migration: `extensions` table (id, version, pricing, enabled, cached_at, remote_url) — shipped in concord PR #39 INS-066 W1.
- [x] API: `POST /api/extensions/install`, `DELETE /api/extensions/{id}`, `GET /api/extensions` — shipped in concord PR #39 INS-066 W2.
- [x] File system: unpack `.zip` to `data/extensions/{id}/`, serve at `/ext/{id}/` — shipped in concord PR #39 INS-066 W3.
- [x] `BrowserSurface.tsx`: dev-URL bypass (env flag), route `/ext/{id}/` URLs — shipped in concord PR #39 INS-066 W4.

### Phase 2 — Update + Auth
**Status**: planned (concord PR #39 / INS-066 W1-W8 shipped Phase 1 only; auth + version-check not yet started)
**Repo**: main `concord` repo

- [ ] Background version check on launch for `free` / `one_time` extensions
- [ ] `concord.app` license endpoint for `subscription` authorization
- [ ] "Subscription inactive" blocking surface on failed auth

### Phase 3 — Marketplace UI
**Status**: planned (concord PR #39 / INS-066 W1-W8 shipped Phase 1 only; marketplace browse/install UI not yet started)
**Repo**: main `concord` repo

- [ ] Browse official extensions from the catalog
- [ ] Install / uninstall / enable / disable per extension
- [ ] Manual `.zip` upload for sideloaded extensions
- [ ] Lives inside Concord Settings (unified settings shell, INS-012)

### Phase 4 — UX Mode Framework Documentation (INS-001)
**Status**: complete
**Repo**: this repo

INS-036 already implements the session/mode mechanics. This phase documents the mapping so extension authors know which mode to declare.

- [x] **INS-001: UX Mode Framework** — `docs/extensions/ux-modes.md` maps Party/Display/Service/Chat/Hybrid → INS-036 session modes. Canonical reference for all extension specs.

### Phase 5 — Game Maker Protocol (INS-007)
**Status**: spec complete, implementation pending
**Repo**: this repo

- [x] **INS-007: Chat & Hybrid Game Maker Protocol — spec** (`docs/extensions/game-maker-protocol.md`): state machine, dice primitives, branching narrative, GM/player roles, scope limits.
- [x] **INS-007: Chat & Hybrid Game Maker Protocol — implementation** — `packages/game-maker/` host extension skeleton (parser, dice, interpreter; 50 tests). Worktree: `feat/ins-007-game-maker-skel-b4e1`.

### Phase 6 — Extensions
**Status**: INS-002 complete; INS-003..008 specs landed, implementations pending
**Repo**: this repo

- [x] **INS-002: Worldview — Config Menu** — In-app config menu for API keys / service connections (`packages/worldview/src/config.ts` + UI in `src/index.ts`). 24 new tests, 51/51 pass. Supported modes: Party, Display, Service.

- [x] **INS-003: Chess & Checkers — spec** (`docs/extensions/specs/chess-checkers.md`): shared board engine, minimax bot tiers.
- [x] **INS-003: Chess & Checkers — implementation** — Party, Display, Service modes. v0.4.0: shipped picker UI + per-game UI surfaces + AI bot driver + persistent collapsible Rules panel for both games + inlined Concord SDK bridge (250ms dev fallback) + mode adapter. 99 tests; bundle 11.12 KB → `com.concord.chess-checkers@0.4.0.zip`. Move sync of multi-participant games is local-loop; real network sync hooks are wired but await Phase 1 shell install/mount pipeline.

- [x] **INS-004: Werewolf — implementation** (was Blood on the Clocktower; pivoted to public-domain Werewolf to avoid IP risk on Pandemonium Institute / Steven Medway's BotC). v0.4.0: shipped 5 public-domain roles (Villager, Werewolf, Seer, Doctor, Witch) + 3 rolesets (5/6/7 player) + AI bots (deterministic werewolf vote convergence + per-role policies) + persistent Rules panel + inlined SDK bridge + mode adapter. 140 tests; bundle 7.58 KB → `com.concord.werewolf@0.4.0.zip`. The legacy `packages/botc/` package + BotC-specific role tests were deleted with the pivot. Real network sync of role actions awaits Phase 1 shell pipeline.

- [x] **INS-005: Among Us Clone — spec** (`docs/extensions/specs/among-us-clone.md`): room-graph movement, tasks, imposters, meetings.
- [ ] **INS-005: Among Us Clone — implementation** — Party, Hybrid modes.

- [x] **INS-006: Card Game Suite — spec** (`docs/extensions/specs/card-game-suite.md`): shared card/deck/hand/pile engine, six games, per-game mode matrix.
- [x] **INS-006: Card Game Suite — implementation** — Party, Display, Service, Hybrid modes. v0.3.0: shared engine + 6 game rule modules + per-mode UI renderers for every game (Solitaire fan tableau, Hold'em display+controller seats, Blackjack dealer + per-variant button row, Speed 2-pile controller + opponent count bar, Kings & Peasants combo selection, War auto-flip with pause/resume) + shell SDK bridge w/ 250ms dev-fallback + mode adapter. 202 tests; bundle 62.43 kB → `com.concord.card-suite@0.3.0.zip`. Action wiring is local-loop; real network sync hooks marked at every game's mount site, awaiting shell install/mount pipeline (Phase 1).

- [x] **INS-008: JackBox Clone — spec** (`docs/extensions/specs/jackbox-clone.md`): shared round state machine, five mini-games.
- [ ] **INS-008: JackBox Clone — implementation** — Party mode.

- [x] **INS-009: Orrdia Bridge — spec** (`docs/extensions/specs/orrdia-bridge.md`): TS extension that connects to an orrdia server (forked jellyfin, https://github.com/TruStoryHnsl/orrdia) and surfaces its media library inside Concord. Spec must define: server-connection config (base URL + API key), authentication flow against orrdia's Jellyfin-compatible `/Users/AuthenticateByName` API, library/item browsing surface, stream-URL acquisition (HLS / direct), shared-playback sync model for Display + Party modes (one client elects host, others mirror via state events), and Hybrid layout (player + chat). Permissions: `state_events`, `fetch:external`. Pricing: `free`. Modes: Party, Display, Hybrid.
- [x] **INS-009: Orrdia Bridge — implementation** — `packages/orrdia-bridge/` TS package. Uses inlined Concord SDK bridge (same pattern as INS-003/004). Local-loop sync until Phase 1 ships. Out-of-scope for this repo: any changes to the orrdia server itself (those land in https://github.com/TruStoryHnsl/orrdia).
  _v0.2.0 (2026-04-30): graduated v0.1.0's partial landing to all three surfaces. SDK bridge extended with the post-INS-066-W5/W6 channels — `concord:state_event`, `concord:permission_denied`, `extension:send_state_event` (envelope mirror of concord PR #39). Party mode shipped with two real surfaces: TV (`mountPartyTV` — renders the `<video>` and applies external `PartyCommand` events via `applyPartyCommand`) and phone-controller (`mountPartyController` — three-row layout with library browser, queue + play-now buttons, transport bar). Controller emits via `bridge.sendStateEvent` (eventType `com.concord.orrdia-bridge.party.command`); TV + other controllers receive via `bridge.onStateEvent`. Hybrid mode shipped as `mountHybridSplit` — half-width media surface on the left, ring-buffered live preview of the last 8 `m.room.message` state events on the right; the chat composer remains in the shell channel surface alongside (per spec §8.3 + ux-modes §4.5). Manifest permissions extended to `state_events, matrix.read, matrix.send, fetch:external`. 66 tests pass (was 33 baseline; +6 bridge, +12 sync, +3 party-tv, +5 party-controller, +7 hybrid-split). Bundle 8586 bytes → `com.concord.orrdia-bridge@0.2.0.zip`._
  _Real cross-client sync is still gated on concord FUP-A (live wiring of `concord:state_event` / `extension:send_state_event` to the matrix-js-sdk room store at the call site). Until that lands, Party/Hybrid surfaces work locally in dev (synthetic state events) but cross-client sync via Matrix is a no-op at runtime. Spec §6 deferrals (HLS via hls.js integration, ServerConfig persistence) remain deferred. Tests authored in same session as code (project rule violation) — cold-reader test pass needed before declaring production-ready (tracked as INS-009-FUP in inbox)._

- [x] **INS-009 W9: Orrdia Bridge — in-surface setup wizard (v0.3.0)** — current "Connect to orrdia" form (v0.2.0) assumes the user has already set up jellyfin's admin account out-of-band. That's a UX dead-end: a fresh extension install on a fresh orrdia instance leaves the user staring at a credentials form for an account that doesn't exist. The bridge must detect setup state and walk the user through it inline.

  **Detection**: probe `GET {serverUrl}/System/Info/Public` (no auth) at mount. The JSON response includes `StartupWizardCompleted: boolean`. If `false` → render setup-wizard view. If `true` → render the existing connect form. If the probe fails (server unreachable / wrong URL / non-jellyfin) → render a small "server URL" prompt that re-probes on submit, with clear error messaging.

  **Setup-wizard flow** (jellyfin first-run APIs are unauthenticated WHILE `StartupWizardCompleted` is false):
  1. **Server URL prompt** (if not already known) — same field as today, no credentials, just URL.
  2. **Welcome step** — single button "Set up orrdia". Behind the scenes calls `POST {serverUrl}/Startup/Configuration` with `{UICulture: "en-US", MetadataCountryCode: "US", PreferredMetadataLanguage: "en"}` (or sensible defaults; expose an "advanced" toggle if needed but don't block on it).
  3. **Create admin account** — form with `Name` + `Password` + `ConfirmPassword`. Submits `POST {serverUrl}/Startup/User` with `{Name, Password}`. On success store the just-created username/password in extension session state for auto-login at the end.
  4. **Library quick-start** (optional, can be skipped) — let the user add ONE library by entering a host path (e.g. `/data/movies`) and a library type (`movies`, `tvshows`, `music`). Submits `POST {serverUrl}/Library/VirtualFolders` after auth. If skipped or empty, user is told they can add libraries later via the bridge's normal UI (which itself doesn't yet support library management — out-of-scope for v0.3.0).
  5. **Remote access** — single checkbox "Allow remote access" (default unchecked). Submits `POST {serverUrl}/Startup/RemoteAccess` with `{EnableRemoteAccess, EnableAutomaticPortMapping: false}`. Default-off keeps local-only deployments private.
  6. **Finalize** — `POST {serverUrl}/Startup/Complete`. Server flips `StartupWizardCompleted` to true.
  7. **Auto-login + handoff** — call the existing auth flow (`/Users/AuthenticateByName` with the credentials just captured) and transition to the connected state. User sees the library browser without re-entering anything.

  **State machine**: explicit named states (`detecting`, `serverPrompt`, `wizardWelcome`, `wizardAdmin`, `wizardLibrary`, `wizardRemote`, `wizardFinalizing`, `wizardError(reason)`, `connected`). Each state owns one render function. Pure transitions, unit-testable without a browser. Error states preserve user-entered values across retries.

  **Failure modes to handle explicitly**: jellyfin returns 4xx mid-wizard (admin name taken, password too weak, etc.) → display the server's error message inline, stay on the same step. Network failure → distinguish from auth failure; offer retry. Server completes wizard out-of-band while user is mid-flow → re-probe `/System/Info/Public` between steps; if `StartupWizardCompleted` flips to true unexpectedly, jump to connect-with-existing-creds prompt.

  **Files**: new `src/ui/setup-wizard.ts` + tests; `src/ui/server-config.ts` extended (or replaced) to dispatch by detected state; `src/engine/jellyfin-setup.ts` for the typed API client (probe + step submitters); spec doc `docs/extensions/specs/orrdia-bridge.md` §3 amended with the wizard flow + state machine.

  **Out-of-scope for v0.3.0**: library management UI beyond the single quick-start library, advanced metadata config, multi-user setup beyond the initial admin, branding customization. Those land later if needed.

  **Acceptance**: install v0.3.0 against a brand-new jellyfin (StartupWizardCompleted=false). User sees the wizard. Walks through admin creation. Bridge auto-logs in. Connect form is bypassed. End state: same as v0.2.0's "connected" with no prior out-of-band setup. Bump to v0.3.0; regen bundle; update catalog.json.

  _v0.3.0 (2026-04-30): Shipped. New `src/engine/jellyfin-setup.ts` typed client (probe `/System/Info/Public`; `/Startup/Configuration`, `/Startup/User`, `/Startup/RemoteAccess`, `/Startup/Complete`; authed `/Library/VirtualFolders`) with `OrrdiaSetupError` carrying status + body for inline display. New `src/ui/setup-wizard.ts` pure FSM (`createInitialState`, `reduceWizard`, `effectFor`) split from the DOM driver (`mountSetupWizard`) so the state machine is unit-testable without jsdom — every transition, every error-with-fields-preserved-on-retry, every out-of-band-completion handoff is exercised in `setup-wizard.test.ts`. `mountSetupOrConnect` dispatcher probes first then renders wizard or connect form; `mountServerConfig` gained an `urlOnly` mode so the user can probe a brand-new server without inventing creds. Bundle 11657 bytes → `com.concord.orrdia-bridge@0.3.0.zip`. Tests: 66 → 110 (+15 jellyfin-setup, +22 setup-wizard FSM+driver, +7 setup-or-connect dispatcher). Spec doc §3.3 added._

  _v0.3.2 (2026-04-30): four follow-ups landed in one cycle._
  _**Host-transfer wiring**: `bridge.onHostTransfer` (delivered via `concord:host_transfer`, INS-036 W4) is now wired in `src/index.ts` to update bootstrap `state.hostId` and route a `host-transfer` SyncEvent into any active Display surface and into `mountPartyTV`'s new `applyHostTransfer` handle. Tests cover incumbent-hands-off, observer-receives-transfer, transfer-to-stranger, transfer-back, and double-transfer race._
  _**HLS playback via hls.js**: new `src/ui/video-attach.ts` is a 4-branch decision tree (HLS-or-not × native-or-MediaSource) with a `hlsLoader` injection seam. `hls.js@^1.5.13` is now a runtime dep but lazy-loaded via `import("hls.js")` so non-HLS sessions never pay the 525KB chunk cost. Display + Party TV both call `attachVideoSource(video, src)` instead of `video.src=` directly. `useHls?: boolean` opts into the HLS endpoint. Bundle grew from 11704 → 170881 bytes because the .zip ships the hls.js code-split chunk for runtime dynamic-import; gzipped over the wire that's ~164KB only when an HLS item plays._
  _**ServerConfig persistence**: new `src/session/persistence.ts` uses `localStorage` keyed `concord-ext:<extensionId>:serverConfig`. Bootstrap tries silent re-auth via the persisted creds; on success the connect form is bypassed entirely. `extension:permission_denied` clears persisted creds. localStorage unavailability (private mode, sandboxed iframe with no storage) gracefully degrades to v0.3.1 behavior. Schema-version-tagged record with corruption-clearing on parse failure. 12 tests covering round-trip, schema mismatch, scoping by extensionId, hostile-storage failure modes, and adversarial-string password preservation._
  _**Cold-reader test pass (INS-009-FUP)**: 26 new negative-case tests across `engine/auth.test.ts`, `engine/client.test.ts`, `session/sync.test.ts`, `ui/display.test.ts`, `ui/party-tv.test.ts`, `ui/party-controller.test.ts`, plus the new `ui/video-attach.test.ts` suite. Found and fixed: (a) `applyEvent` and `applyPartyCommand` returning `undefined` on unknown discriminants — both reducers gained defensive `default: return state` branches; (b) `party-cmd-queue-add` was non-idempotent (documented as such in v0.2.0), causing every optimistic-local + remote-echo round-trip to land twice — fixed via dedup-on-(addedBy, atMs, itemId) tuple per spec §7.4 preference. Tests: 110 → 170 (+12 persistence, +9 video-attach, +2 host-transfer party-tv, +5 display HLS/negative, +9 sync host-transfer/dedup/no-op, +13 auth/client adversarial, +5 party-controller dedup/malformed, +5 PLAN.md hygiene)._
  _Bundle 170881 bytes → `com.concord.orrdia-bridge@0.3.2.zip` (catalog.json updated). Tests: 110 → 170 all green._
  _Tests authored in same session as code (project rule violation per CLAUDE.md "WRITTEN IN BLOOD"). Cold-reader test pass should add Playwright-driven acceptance against a real fresh jellyfin instance to confirm the user-visible flow matches the unit-level assertions (tracked as INS-009-W9-FUP in inbox)._

### Phase 7 — SDK Extraction
**Status**: deferred (post-advertising phase)
**Repo**: this repo

- [ ] Extract `concord/client/src/extensions/sdk.ts` → `packages/concord-sdk/`
- [ ] Publish to npm as `@concord/sdk`
- [ ] Update all extensions to import from `@concord/sdk`
- [ ] Third-party developer documentation
