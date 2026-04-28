# concord-extensions

First-party extension SDK and bundled extension packs for [Concord](https://github.com/TruStoryHnsl/concord) — runtime-loaded, never compiled in, never restart the server.

## What it is

Concord is the chat platform. `concord-extensions` is the monorepo where every official extension lives.

An extension is a self-contained TypeScript project that builds to a static web app: one `index.html`, one bundled `index.js`, and a `manifest.json`. Concord runs each one in a sandboxed iframe and talks to it over `postMessage`. That's the entire surface area.

What ships in this repo today:

- `packages/worldview-map` — Cesium 3D-globe OSINT command-center: live flight tracking (OpenSky), maritime AIS, traffic, Sentinel imagery, weather, seismic events, ~12 data layers.
- `packages/card-suite` — Six card games (Solitaire, Hold'em, Blackjack, Speed, Kings & Peasants, War) on a shared engine, with AI bots and per-game rules panels.
- `packages/chess-checkers` — Chess and Checkers, four bot-difficulty tiers, shared board engine.
- `packages/werewolf` — Open-ruleset social-deduction game (replaced the proprietary BotC pilot).
- `packages/game-maker` — Host extension for the Chat & Hybrid Game Maker Protocol (INS-007). Loads `.game` documents and acts as narrator/referee. Expressive enough to run a full D&D campaign.
- `catalog.json` — index Concord clients fetch to discover available extensions.

Install = API call + file write. No Concord rebuild. No server restart. Ever.

## Why

> "Concord is infrastructure."

Discord owns the rooms you talk in, the bots you load, and the accounts you use. Concord is the inverse: self-hosted Matrix backend, native and web clients, and — through this repo — an extension model where the maintainer decides what runs in their server.

Three principles drive the design:

1. **Install is data, not code.** Every other chat platform's "bot" model treats the host as a rebuild target. We refuse that. An extension is a `.zip` of static assets. The server unpacks it under `/ext/{id}/` and the client iframe loads it. There is no `pip install`, no `cargo build`, no `docker compose down`. The Concord binary is unchanged.

2. **Pure logic, then UI.** Each extension's state-transition functions are exported and pure — `(state, event) -> state`. They run in node under vitest with no browser. The UI layer is a thin renderer over that core. This is why the card engine ships with hundreds of unit tests and why a game's rules can be reviewed without launching the app.

3. **Five UX modes, one mechanism.** Party (one shared screen + per-user controllers), Display (everyone sees the same thing), Service (per-user instance), Chat (lives in a text channel), Hybrid (display + chat split). These map directly onto Concord's INS-036 session model — already implemented in the main repo. An extension declares which modes it supports; the shell handles the rest.

The honest framing: I want the capabilities of Discord activities, Jackbox, and tabletop-simulator-style room games, without their hosted control planes, without their pricing leverage, and without a vendor deciding which extensions get to exist on my server.

## Architecture

```
                     ┌──────────────────────────┐
                     │   concord-extensions     │
                     │   (this repo)            │
                     │                          │
                     │  packages/               │
                     │    worldview-map/        │
                     │    card-suite/           │
                     │    chess-checkers/       │
                     │    werewolf/             │
                     │    game-maker/           │
                     │                          │
                     │  catalog.json ───────────┼──┐
                     │  GitHub Releases (.zip) ─┼┐ │
                     └──────────────────────────┘│ │
                                                 │ │
                          download bundle ◄──────┘ │
                          discover index   ◄───────┘
                                                 │
                     ┌──────────────────────────┐│
                     │   Concord server         ││
                     │  (TruStoryHnsl/concord)  ││
                     │                          ││
                     │  POST /api/ext/install ──┼┘
                     │   → unpack to            │
                     │     data/extensions/{id} │
                     │   → serve /ext/{id}/     │
                     └──────────┬───────────────┘
                                │ static asset
                                ▼
                     ┌──────────────────────────┐
                     │   Concord client         │
                     │   <iframe src=/ext/...>  │
                     │      ↕ postMessage SDK   │
                     │   shell (chat, voice,    │
                     │   matrix state events)   │
                     └──────────────────────────┘
```

| Component | Role |
|-----------|------|
| `packages/<id>/src/` | Extension source. TypeScript, pure logic + UI renderer. |
| `packages/<id>/manifest.json` | Machine-readable metadata: id, version, pricing, supported modes, permissions, min concord version. Travels inside the `.zip`. |
| `packages/<id>/scripts/pack.mjs` | Builds `dist/` and zips it into `<id>@<version>.zip` for release. |
| `catalog.json` | Top-level index. Concord clients fetch this to populate the marketplace UI. |
| `pnpm-workspace.yaml` | Monorepo root. Every extension is its own package. |
| Concord shell (separate repo) | Handles install, caching, mode routing, postMessage SDK. Not part of this repo. |

### Extension manifest

```json
{
  "id": "com.concord.werewolf",
  "version": "0.4.0",
  "name": "Werewolf",
  "description": "Public-domain social deduction. Villagers vs. Werewolves.",
  "pricing": "free",
  "entry": "index.html",
  "modes": ["party", "chat", "hybrid"],
  "permissions": ["state_events", "matrix.read", "matrix.send"],
  "minConcordVersion": "0.1.0"
}
```

`pricing` ∈ `free` | `one_time` | `subscription`. `modes` ∈ `party` | `display` | `service` | `chat` | `hybrid`.

### Install / launch lifecycle

| Pricing | Install | Launch |
|---------|---------|--------|
| `free` | Download + cache `.zip`. | Serve from cache. Background version check. |
| `one_time` | Download + cache on purchase. | Serve from cache. Background version check. |
| `subscription` | Download + cache on subscribe. | Re-authorize with `concord.app` license endpoint each launch. |

Subscription auth failure blocks the iframe with a "subscription inactive" surface. The Concord shell never handles pricing logic itself — the API gate decides; the client sees only `/ext/{id}/`.

## Quickstart

### Build all extensions

```bash
git clone https://github.com/TruStoryHnsl/concord-extensions
cd concord-extensions
pnpm install
pnpm -r build
```

### Build and pack a single extension

```bash
cd packages/werewolf
pnpm build
pnpm pack       # produces com.concord.werewolf@<version>.zip
```

### Develop against a running Concord instance

```bash
cd packages/worldview-map
pnpm dev        # Vite HMR on localhost:<port>
```

In Concord's BrowserSurface, set the dev-URL bypass env flag and point it at the Vite dev server. The `*.concord.app` allowlist still applies in production builds.

### Run unit tests

```bash
pnpm -r test
```

## Features

- pnpm workspace monorepo — one repo, one CI pipeline, N extensions.
- TypeScript + Vite + vitest. No framework lock-in inside an extension; pick what fits.
- Pure-logic test layer — every state-transition function runs without a browser.
- `.zip` release artifacts published per-tag to GitHub Releases.
- `manifest.json`-driven mode declaration; the Concord shell routes the rest.
- Sandboxed iframe + `postMessage` SDK — no shared module imports, no direct DB or filesystem access.
- Five UX modes (Party / Display / Service / Chat / Hybrid) spanning shared-display, per-user, and chat-first interactions.
- Game Maker Protocol (`packages/game-maker`) for chat-first authored games — D&D-grade expressiveness without writing UI code.
- Bundled-pack approach: ship a domain (cards, chess, social deduction) as one extension with shared engine, multiple game variants.

## Status

**Active development.** Single-user / small-server deployments are working today; Concord itself is in pre-1.0 production use on `concorrd.com`.

Per-extension status lives in `PLAN.md` and `catalog.json`. As of this writing:

| Extension | Version | Status |
|-----------|---------|--------|
| `worldview-map` | 0.1.0 | Migrated from `concord/ext/worldview/`. Display mode. |
| `card-suite` | 0.4.0 | All 6 games + AI bots + rules panels. |
| `chess-checkers` | 0.4.0 | Both games + 4 difficulty tiers. |
| `werewolf` | 0.4.0 | Replaces the BotC pilot. Open ruleset. |
| `game-maker` | 0.1.0 | Chat & Hybrid host. INS-007 protocol skeleton. |

Concord-side runtime loader (Phase 1: API endpoints, DB registry, BrowserSurface routing) and marketplace UI (Phase 3) are tracked in the main `concord` repo. The SDK currently lives in `concord/client/src/extensions/sdk.ts` and gets extracted to `packages/concord-sdk/` at the launch phase — extensions inline types until then.

**Not yet supported:**

- Third-party extension submission (no review pipeline, no signing).
- `concord.app` license endpoint for subscription extensions (Phase 2).
- npm-published `@concord/sdk` (Phase 7, post-launch).
- Manual `.zip` sideload UI (Phase 3).

## Related projects

- [`concord`](https://github.com/TruStoryHnsl/concord) — the chat platform itself. Extensions plug into this. The SDK currently lives in `client/src/extensions/sdk.ts`.
- [`orrchestrator`](https://github.com/TruStoryHnsl/orrchestrator) — AI dev pipeline hypervisor. Used to run the parallel sessions that built each extension on its own branch.
- [`orrtellite`](https://github.com/TruStoryHnsl/orrtellite) — self-hosted Headscale mesh. Concord servers federate over this in private deployments.

## License

See [LICENSE](LICENSE).
