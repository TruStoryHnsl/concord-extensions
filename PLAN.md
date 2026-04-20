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
| Blood on the Clocktower | ✓ | | | ✓ | ✓ |
| Among Us Clone | ✓ | | | | ✓ |
| Card Game Suite | ✓ | ✓ | ✓ | | ✓ |
| JackBox Clone | ✓ | | | | |
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
**Status**: planned
**Repo**: main `concord` repo

The Concord server learns to install, cache, and serve extension bundles.

- [ ] DB migration: `extensions` table (id, version, pricing, enabled, cached_at, remote_url)
- [ ] API: `POST /api/extensions/install`, `DELETE /api/extensions/{id}`, `GET /api/extensions`
- [ ] File system: unpack `.zip` to `data/extensions/{id}/`, serve at `/ext/{id}/`
- [ ] `BrowserSurface.tsx`: dev-URL bypass (env flag), route `/ext/{id}/` URLs

### Phase 2 — Update + Auth
**Status**: planned
**Repo**: main `concord` repo

- [ ] Background version check on launch for `free` / `one_time` extensions
- [ ] `concord.app` license endpoint for `subscription` authorization
- [ ] "Subscription inactive" blocking surface on failed auth

### Phase 3 — Marketplace UI
**Status**: planned
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
- [ ] **INS-003: Chess & Checkers — implementation** — Party, Display, Service modes. _Partial: engines, bots, pairing, selector, minimal board UI landed on `feat/ins-003-chess-checkers-pilot-d2c8` (34 tests, perft-3 = 8902). Mode-specific surfaces blocked on Phase 1 shell SDK in main concord repo._

- [x] **INS-004: Blood on the Clocktower — spec** (`docs/extensions/specs/blood-on-the-clocktower.md`): phases, roles, bot-storyteller.
- [ ] **INS-004: Blood on the Clocktower — implementation** — Party, Chat, Hybrid modes. _Partial: engine core (phases, votes, deaths, effects, RNG, scripts) + 5 Trouble Brewing pilot roles (Washerwoman, Librarian, Investigator, Imp, Poisoner) on `feat/ins-004-botc-core-a7e3` (51 tests). Remaining 17 Trouble Brewing roles, Sects & Violets, Bad Moon Rising, and all mode UIs pending; UIs blocked on Phase 1 shell SDK in main concord repo._

- [x] **INS-005: Among Us Clone — spec** (`docs/extensions/specs/among-us-clone.md`): room-graph movement, tasks, imposters, meetings.
- [ ] **INS-005: Among Us Clone — implementation** — Party, Hybrid modes.

- [x] **INS-006: Card Game Suite — spec** (`docs/extensions/specs/card-game-suite.md`): shared card/deck/hand/pile engine, six games, per-game mode matrix.
- [ ] **INS-006: Card Game Suite — implementation** — Party, Display, Service, Hybrid modes. _Partial: shared engine (card/deck/hand/pile/rng/types) + Solitaire pilot rules on `feat/ins-006-card-suite-engine-f9d2` (49 tests, deterministic seeded shuffle). Remaining 5 games (Hold'em, Blackjack, Speed, Kings & Peasants, War) and all mode UIs pending; UIs blocked on Phase 1 shell SDK in main concord repo._

- [x] **INS-008: JackBox Clone — spec** (`docs/extensions/specs/jackbox-clone.md`): shared round state machine, five mini-games.
- [ ] **INS-008: JackBox Clone — implementation** — Party mode.

### Phase 7 — SDK Extraction
**Status**: deferred (post-advertising phase)
**Repo**: this repo

- [ ] Extract `concord/client/src/extensions/sdk.ts` → `packages/concord-sdk/`
- [ ] Publish to npm as `@concord/sdk`
- [ ] Update all extensions to import from `@concord/sdk`
- [ ] Third-party developer documentation
