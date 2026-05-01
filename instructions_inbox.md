# concord-extensions — Instruction Inbox

### INS-001: Define Extension UX Mode Framework (source: plans/2026-05-02-01-19.md)
Establish a shared UX mode specification for all Concord extensions. Define the following modes as canonical:

- **Party Mode**: One shared display (TV/desktop); mobile clients render user-specific UI.
- **Display Mode**: Single shared window; all users see identical output.
- **Service Mode**: Unique instance rendered per connected user.
- **Chat Mode**: Extension lives inside a text channel; interaction is chat-first. Uses the chat game engine (in development) to let users define bot subroutines that administer arbitrary games.
- **Hybrid Mode**: Split-screen — media display + live chatroom. Enables story-based and more complex chat games.

Each extension's spec must declare which modes it supports. This framework is the prerequisite for all extension work below.

### INS-002: Worldview — Add Config Menu (API Key / Service Connection UI) (source: plans/2026-05-02-01-19.md)
Add a configuration menu to the Worldview extension allowing users to input API keys and connect external services directly within the app. Menu must be accessible in-app (not via config file).

Local copy at `/home/corr/WorldView`. Before implementing the config menu, diff `/home/corr/WorldView` against the repo version to capture all existing changes (API keys, other modifications) before any new work begins.

Supported modes: Party, Display, Service.

### INS-003: Chess & Checkers Extension (source: plans/2026-05-02-01-19.md)
Build a Chess and Checkers extension supporting:
- Human vs. human
- Human vs. bot (multiple difficulty levels)

Supported modes: Party, Display, Service.

### INS-004: Blood on the Clocktower Extension (source: plans/2026-05-02-01-19.md)
Build a Blood on the Clocktower implementation. Must support Chat Mode (bot-administered roles/phases via chatroom) and Hybrid Mode (split media + chat for narration/story phases). Party Mode also required for in-person-style play.

Supported modes: Party, Chat, Hybrid.

### INS-005: Among Us Clone (source: plans/2026-05-02-01-19.md)
Build an Among Us-style social deduction game. Party Mode gives each user their own character view with movement during appropriate game phases. Hybrid Mode provides the shared map/event display alongside the chatroom.

Supported modes: Party, Hybrid.

### INS-006: Card Game Suite (source: plans/2026-05-02-01-19.md)
Build a suite of card games under a single extension: Solitaire, Poker, Blackjack, Speed, Kings & Peasants, War. Suite should share a common card/deck engine. Each game must be individually selectable.

Supported modes: Party, Display, Service, Hybrid.

### INS-007: Chat & Hybrid Game Maker Protocol (source: plans/2026-05-02-01-19.md)
Build a game authoring protocol that enables users to create and distribute custom tabletop-style games playable via Chat and Hybrid modes. Requirements:

- Primary input method is text; no complex display authoring required beyond simple touch menus.
- Must be expressive enough to support a full, interactable D&D campaign (branching narrative, state tracking, GM/player role separation, dice resolution).
- Intent: make tabletop game programming dead-simple so Concord serves as a lightweight proxy for any tabletop game users want to play together.
- When complexity exceeds the protocol's scope, defer to external applications (do not attempt to extend the protocol beyond its design limit).

UX mode: None (this is infrastructure/protocol, not a user-facing display extension).

### INS-008: JackBox Clone (source: plans/2026-05-02-01-19.md)
Build a Jackbox-style party game suite native to the Concord ecosystem. No dependency on external Jackbox titles — full in-house implementation of the game format (prompt/response, voting, scoring loop).

Supported modes: Party.

### INS-009-FUP: Orrdia Bridge — cold-reader test pass (source: develop_feature INS-009 cycle, 2026-04-30)
Re-author or audit the unit tests in `packages/orrdia-bridge/src/**/__tests__/` from a cold-reader perspective. v0.1.0's tests were written in the same session as the engine — known violation of CLAUDE.md "tests-in-separate-session" rule. Concentrate scrutiny on:

- `engine/__tests__/stream-url.test.ts`: substring assertions like `"includes('api_key=')"` will pass even if the production code emits a differently-named param. Verify against a real orrdia/jellyfin response shape.
- `ui/__tests__/display.test.ts`: applyRemote / host-emit roundtrip — confirm assertions check user-visible state (video element src, currentTime, paused), not internal reducer fields.
- All HTTP-client tests use mocked fetch; add at least one Playwright smoke that boots the dev server, fills the form against a real (or fake-server-shaped) orrdia, and asserts `<video src=...>` actually appears.

Out of scope: Party + Hybrid surfaces (those are tracked separately as INS-009 partial-landing items in PLAN.md).

Supported modes: N/A (test-quality work, no UX surface).
