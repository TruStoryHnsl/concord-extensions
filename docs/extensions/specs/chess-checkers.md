# Chess & Checkers (INS-003)

**Status:** Design spec
**Extension ID:** `com.concord.chess-checkers`
**Pricing:** `free`
**Modes:** Party, Display, Service
**Depends on:** [INS-001 UX Modes](../ux-modes.md)

---

## 1. Scope

One extension, two games: Chess and Checkers. They share a board-rendering surface, a move-engine contract, and a bot tier system. Rules are separate modules; no cross-game logic lives in shared code.

Human-vs-human and human-vs-bot (multiple difficulty tiers) are required from v1. Online matchmaking, rating systems, tournaments, and opening books are explicitly out of scope for v1.

---

## 2. Package layout

```
packages/chess-checkers/
  manifest.json                # id, version, modes: ["party","display","service"]
  index.html                   # iframe entry
  src/
    index.ts                   # bootstrap + DOM, like worldview
    engine/
      types.ts                 # shared Move, Square, Piece, Color types
      chess/
        rules.ts               # pure legal-move + checkmate logic
        bot.ts                 # minimax bot; depth per tier
        __tests__/rules.test.ts
        __tests__/bot.test.ts
      checkers/
        rules.ts               # pure legal-move + win logic
        bot.ts                 # minimax bot
        __tests__/*
    ui/
      board.ts                 # pure SVG/DOM board renderer (no game logic)
      controller.ts            # input routing for Party mode controller UI
      display.ts               # passive board renderer for Display / Service
    session/
      game-selector.ts         # chess vs. checkers pick screen
      pairing.ts               # seat → color assignment
  scripts/pack.mjs             # (shared pattern with worldview)
  vite.config.ts
  tsconfig.json
```

Engine modules export pure functions only. Tests never instantiate DOM.

---

## 3. Game-state model

### 3.1 Shared types

```ts
type Color = "white" | "black"          // chess
type Side  = "red"   | "black"          // checkers (re-export of Color with aliases)
type Square = { file: number; rank: number } // 0..7
type Piece = { color: Color; kind: string; promoted?: boolean }
type Board = (Piece | null)[][]          // [rank][file]
type Move = {
  from: Square
  to: Square
  promotion?: string                     // chess: Q|R|B|N
  capture?: Square                       // checkers: jumped square
  chain?: Move[]                         // checkers: multi-jump chain
}
type GameState = {
  board: Board
  toMove: Color
  history: Move[]
  status: "playing" | "checkmate" | "stalemate" | "draw" | "resigned"
  winner: Color | null
}
```

### 3.2 Rules module contract

Every rules module exports:

```ts
export function makeInitial(): GameState
export function legalMoves(state: GameState, from?: Square): Move[]
export function applyMove(state: GameState, move: Move): GameState    // pure
export function terminalStatus(state: GameState): GameState["status"]
```

`applyMove` never mutates the input — it returns a new `GameState`. This is the invariant that makes bot search and test coverage tractable.

---

## 4. Move validation

Chess: standard FIDE rules including castling, en passant, promotion, threefold repetition (via `history`), 50-move rule, insufficient material.

Checkers: standard American checkers rules: forced captures (if any capture is available, it MUST be taken), multi-jumps chain into a single `Move` with `chain` array, kings move/capture in both directions, draw on no-progress after 40 moves without a capture or king-promote.

Legal-move generation is tested exhaustively against known positions (Wikipedia endgame studies, opening positions from FIDE archives) in `__tests__/rules.test.ts`.

---

## 5. Bot tiers

Each game exposes a minimax bot with alpha-beta pruning and a simple evaluation function:

| Tier | Search depth | Evaluation | Target player strength |
|------|-------------:|------------|------------------------|
| `beginner` | 2 ply | Material-only | New players |
| `casual` | 4 ply | Material + mobility | Club-beginner |
| `advanced` | 6 ply | Material + mobility + king safety (chess) / back-rank (checkers) | Intermediate |
| `expert` | 8 ply + iterative deepening | Full positional heuristics | Regular players |

Bot tiers are chosen at game start. Harder tiers MUST complete a move within 10 seconds on mid-2020s consumer hardware; the `expert` tier uses iterative deepening with a time cap instead of strict depth.

`bot.chooseMove(state: GameState, tier: Tier): Move` is pure and exposed for tests. The DOM never calls into bot logic except through this one function.

---

## 6. UX per mode

### 6.1 Party mode

- **Display surface** (1 `fullscreen`): renders the board. No input. Shows whose turn it is, captured pieces, a clock if enabled.
- **Controller surface** (1 `panel` per participant): renders a compact board with tap-to-select-then-tap-to-move input. Only the participant whose color matches the active turn has active controls; other controllers show "opponent is thinking" or spectator board view.
- **Seats**: `host` = game starter (picks chess vs. checkers, decides time control); `participant` = one per color (up to 2); `observer` = any other channel member watching on the display.
- **Who-plays-what**: first two participants (in join order) claim colors; subsequent joiners become observers unless a participant leaves. Bot games: the participant picks a color at start, bot takes the other.

### 6.2 Display mode

- **Surface** (1 `fullscreen` or `panel`): single shared board rendering. Input depends on `input_permissions`:
  - `shared` (everyone-can-move): messy but fine for teaching / casual.
  - `shared_admin_input`: only `host` can move. Used when the `host` is demonstrating a game.
- **Typical use**: teaching, spectating a famous game (PGN playback), or a single-device couch game where two people pass a laptop back and forth.

### 6.3 Service mode

- **Surface** (1 `panel` per user): every participant runs their own board. Bot games only — no multi-user shared state in this mode. Useful as a per-user solo practice tool that lives inside Concord.

---

## 7. Input model

Pointer / tap events never go directly to engine code. They go through `ui/controller.ts`, which:

1. Receives a raw `{ square: Square }` click.
2. If no piece is selected and the square holds a friendly piece with legal moves → selects it, highlights targets from `legalMoves(state, square)`.
3. If a piece is selected and the click hits a target → emits `proposeMove(move)`.
4. `proposeMove` is validated via `legalMoves` once more, then dispatched as a `send_state_events` action via the SDK.

The display is always a pure function of `GameState`; the controller is the only source of state mutations.

---

## 8. Testing plan

Per the workspace testing rules (written in blood), tests are authored in a separate session from feature code. For v1 the rules / bot test suites MUST cover:

- Chess: every FIDE-documented illegal-move-type has a test.
- Chess: perft counts at depth 3 from the starting position match the canonical 8,902 nodes.
- Checkers: forced-capture enforcement has a test that FAILS if a non-capture move is accepted while a capture is available.
- Checkers: a multi-jump chain collapses into a single `Move.chain` and no intermediate positions become visible to the caller.
- Bot: higher tiers beat or draw lower tiers across a suite of 20 randomized openings.

Playwright tests drive the Party-mode UI on two simulated phones against a single display surface and verify both see consistent board state after 20 turns.

---

## 9. Out of scope for v1

- Online matchmaking outside a Concord channel.
- Ratings (ELO / Glicko).
- Opening books, tablebases, endgame databases.
- PGN / FEN import/export UI (the engine reads/writes FEN internally; just no user-facing picker).
- Time controls beyond a single shared game clock.

---

## 10. References

- [INS-001 UX Modes](../ux-modes.md) — Party / Display / Service mode contracts.
- [Worldview source](../../../packages/worldview/) — reference for package layout, pack script, and pure-function-with-DOM-bootstrap pattern.
- FIDE handbook — https://handbook.fide.com/ (chess rules).
- World Checkers Draughts Federation rules — https://worldcdf.org/rules/ (checkers, American/English variant).
