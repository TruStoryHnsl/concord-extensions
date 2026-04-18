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
**Status**: planned
**Plan**: `docs/superpowers/plans/2026-04-17-phase0-scaffold.md`
**Repo**: this repo

- [ ] pnpm workspaces root (`pnpm-workspace.yaml` + root `package.json`)
- [ ] Migrate `worldview` from `concord/ext/worldview/` — refactor pure functions to be exported and testable
- [ ] Vite build, vitest unit tests, pack script (`<id>@<version>.zip`)
- [ ] GitHub Actions release pipeline (tag push → `.zip` → GitHub Release)
- [ ] Remove `concord/ext/worldview/` from main concord repo

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
**Status**: planned
**Repo**: this repo

INS-036 already implements the session/mode mechanics. This phase documents the mapping so extension authors know which mode to declare.

- [ ] **INS-001: UX Mode Framework** — Write `docs/extensions/ux-modes.md` mapping Party/Display/Service/Chat/Hybrid → INS-036 session modes with examples. Serves as the canonical reference every extension spec links to.

### Phase 5 — Game Maker Protocol (INS-007)
**Status**: planned
**Repo**: this repo

- [ ] **INS-007: Chat & Hybrid Game Maker Protocol** — Authoring protocol for custom tabletop-style games playable via Chat and Hybrid modes. Text-primary input; no complex display authoring. Must be expressive enough to run a full D&D campaign (branching narrative, state tracking, GM/player roles, dice resolution). Infrastructure only — not a user-facing display extension. Design alongside INS-001 docs.

### Phase 6 — Extensions
**Status**: planned
**Repo**: this repo

- [ ] **INS-002: Worldview — Config Menu** — Add in-app config menu for API keys and external service connections. Local copy at `/home/corr/WorldView` — diff against repo before implementing to capture all existing changes. Supported modes: Party, Display, Service.

- [ ] **INS-003: Chess & Checkers** — Human vs. human and human vs. bot (multiple difficulty levels). Supported modes: Party, Display, Service.

- [ ] **INS-004: Blood on the Clocktower** — Full BotC implementation with bot-administered roles/phases (Chat Mode) and split narration display (Hybrid Mode). Supported modes: Party, Chat, Hybrid.

- [ ] **INS-005: Among Us Clone** — Social deduction game. Party Mode: per-user character view with movement during game phases. Hybrid Mode: shared map/event display alongside chatroom. Supported modes: Party, Hybrid.

- [ ] **INS-006: Card Game Suite** — Solitaire, Poker, Blackjack, Speed, Kings & Peasants, War under one extension with a shared card/deck engine. Each game individually selectable. Supported modes: Party, Display, Service, Hybrid.

- [ ] **INS-008: JackBox Clone** — Jackbox-style party game suite (prompt/response, voting, scoring loop). Full in-house implementation; no dependency on external Jackbox titles. Supported modes: Party.

### Phase 7 — SDK Extraction
**Status**: deferred (post-advertising phase)
**Repo**: this repo

- [ ] Extract `concord/client/src/extensions/sdk.ts` → `packages/concord-sdk/`
- [ ] Publish to npm as `@concord/sdk`
- [ ] Update all extensions to import from `@concord/sdk`
- [ ] Third-party developer documentation
