# Card Game Suite (INS-006)

**Status:** Design spec
**Extension ID:** `com.concord.card-suite`
**Pricing:** `one_time`
**Modes:** Party, Display, Service, Hybrid
**Depends on:** [INS-001 UX Modes](../ux-modes.md)

---

## 1. Scope

One extension, six card games under a shared card/deck engine:

- Solitaire (Klondike)
- Poker (Texas Hold'em, 2–8 players)
- Blackjack (1–7 players against dealer)
- Speed (2 players, fast-paced)
- Kings & Peasants (4-player variant of Asshole/President)
- War (2 players)

Each game is independently launchable. Shared engine primitives (cards, decks, shuffle, hands, piles) live in one module and are imported by every game.

---

## 2. Package layout

```
packages/card-suite/
  manifest.json             # modes: ["party","display","service","hybrid"]
  index.html
  src/
    index.ts                # bootstrap + game-picker
    engine/
      card.ts               # Card, Suit, Rank primitives
      deck.ts               # Deck, shuffle (seedable), draw, peek
      hand.ts               # Hand ops — sort, group, match
      pile.ts               # Pile ops — push, peek, flip
      rng.ts                # Seeded Mulberry32 RNG
      __tests__/*
    games/
      solitaire/
        rules.ts            # pure Klondike state machine
        ui.ts               # tableau/foundation/stock rendering
        __tests__/*
      poker/
        holdem.ts           # pure Hold'em round state machine
        hand-eval.ts        # pure 5-of-7 hand evaluator
        ui.ts               # table, community cards, betting UI
        __tests__/*
      blackjack/
        rules.ts
        dealer-ai.ts        # pure dealer policy
        ui.ts
        __tests__/*
      speed/
        rules.ts
        ui.ts
        __tests__/*
      kings-and-peasants/
        rules.ts
        ui.ts
        __tests__/*
      war/
        rules.ts
        ui.ts
        __tests__/*
    session/
      game-picker.ts        # launcher UI
      mode-adapters.ts      # per-mode surface wiring
  scripts/pack.mjs
```

---

## 3. Shared engine API

### 3.1 Card

```ts
export type Suit = "clubs" | "diamonds" | "hearts" | "spades"
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"

export interface Card {
  readonly suit: Suit
  readonly rank: Rank
  readonly id: string        // "AS", "10H", ... — stable and comparable
}

export function makeCard(suit: Suit, rank: Rank): Card
export function rankValue(rank: Rank): number             // 1..13
export function color(suit: Suit): "red" | "black"
```

Cards are immutable value types.

### 3.2 Deck

```ts
export interface Deck { cards: Card[] }

export function standardDeck(): Deck                       // 52 cards, sorted
export function standardDeckWithJokers(): Deck             // 54 cards
export function shuffle(deck: Deck, rng: RNG): Deck        // pure, returns new deck
export function draw(deck: Deck, n: number): { drawn: Card[]; remaining: Deck }
export function peek(deck: Deck, n: number): Card[]        // no mutation
```

### 3.3 Hand

```ts
export interface Hand { cards: Card[] }

export function sortByRank(h: Hand): Hand
export function sortBySuit(h: Hand): Hand
export function groupByRank(h: Hand): Map<Rank, Card[]>
export function removeCard(h: Hand, id: string): Hand
```

### 3.4 Pile

```ts
export interface Pile { cards: Card[] }                    // last index = top

export function push(p: Pile, c: Card): Pile
export function pop(p: Pile): { popped: Card | null; remaining: Pile }
export function peekTop(p: Pile, n: number): Card[]
```

### 3.5 Seeded RNG

```ts
export interface RNG {
  next(): number                                           // [0, 1)
  nextInt(maxExclusive: number): number
}
export function mulberry32(seed: number): RNG
```

All shuffles go through `mulberry32` for determinism. Production seeds from `crypto.getRandomValues`; tests seed from constants.

---

## 4. Per-game rule-module contract

Every game module exports:

```ts
export const gameId: string                                // "solitaire", "holdem", ...
export const displayName: string
export const supportedModes: readonly UXMode[]             // which of party/display/service/hybrid
export const minPlayers: number
export const maxPlayers: number

export type GameState                                       // game-specific
export function makeInitial(opts: InitOpts, rng: RNG): GameState
export function legalActions(state: GameState, by: PlayerId): Action[]
export function applyAction(state: GameState, action: Action, rng: RNG): GameState
export function terminalStatus(state: GameState): "playing" | "win" | "loss" | "draw"
```

Tests call `applyAction` against crafted states and never touch the DOM.

---

## 5. Per-game sketches

### 5.1 Solitaire (Klondike)

- 1 player.
- State: 7 tableau piles, 4 foundations (one per suit), 1 stock, 1 waste.
- Actions: `draw-from-stock`, `move(from, to, count)`, `recycle-waste`, `auto-complete` (once all cards are face-up).
- Terminal: `win` when every foundation has K on top; `loss` never (always redealable).
- Modes: **Service** (personal game), **Display** (someone showing off a win), **Party** (big-screen with a phone controller).

### 5.2 Poker (Texas Hold'em)

- 2–8 players.
- Round phases: ante → deal hole cards → flop → turn → river → showdown.
- `hand-eval.ts` exposes `evaluate5of7(hole: [Card,Card], community: Card[]): HandRank` — pure, covered by a test matrix of known hands (royal flush through high card).
- Betting: check / call / raise / fold. Blinds configurable.
- No real money; chip stacks are session-scoped.
- Modes: **Party** (shared table display + phone controllers for bets and private hole-card view), **Hybrid** (table display + channel for chat), **Service** not offered (needs multiple humans).

### 5.3 Blackjack

- 1–7 players against a house dealer.
- Standard rules: hit / stand / double / split / surrender. Dealer hits on soft 17.
- Dealer AI is a pure `dealerPolicy(hand: Hand): "hit" | "stand"` function.
- Modes: **Party**, **Display**, **Service** (solo vs. bot dealer), **Hybrid**.

### 5.4 Speed

- 2 players.
- Each player has a 5-card working hand and a face-down draw pile. Two discard stacks sit between them. Goal: be first to play all your cards onto one of the discards (next-higher or next-lower rank, wrapping).
- Real-time fast-paced. Tick the discard eligibility check at 10Hz; any legal play resolves immediately.
- Modes: **Party** (each player gets a phone with their hand). **Display** / **Service** not offered (too-fast for latency-tolerant views).

### 5.5 Kings & Peasants

- 3–7 players. Variant of Asshole / President / Scum.
- Play rounds where each player tries to shed all cards. Rank (King / Vice-King / Neutral / Vice-Peasant / Peasant) carries over between rounds with card-passing at round start.
- Modes: **Party**, **Hybrid**. **Display** / **Service** not offered.

### 5.6 War

- 2 players.
- Deck split 26/26. Each player flips top card; higher rank wins both. Tie → each plays 3 face-down + 1 face-up.
- Fully automatic — no decisions. Extension animates the resolution; players watch.
- Modes: **Display**, **Party** (novelty), **Hybrid**. **Service** not offered.

---

## 6. Game-picker UI

On extension launch, the user sees a grid of the six games. Picking one:

1. Checks the current session mode against `supportedModes`. If unsupported, the picker surfaces which modes this game needs and offers to restart the session in a compatible mode.
2. Calls `makeInitial(opts, rng)` with mode-appropriate options.
3. Transitions the surface to the game's `ui.ts` renderer.

The picker itself is just a static menu. It does NOT implement game matchmaking — it starts a game inside the current Concord channel with whoever is already in the session.

---

## 7. Mode × game matrix

| Game | Party | Display | Service | Hybrid |
|------|:-----:|:-------:|:-------:|:------:|
| Solitaire | ✓ | ✓ | ✓ | |
| Hold'em | ✓ | | | ✓ |
| Blackjack | ✓ | ✓ | ✓ | ✓ |
| Speed | ✓ | | | |
| Kings & Peasants | ✓ | | | ✓ |
| War | ✓ | ✓ | | ✓ |

Extension `modes` manifest advertises the union: `["party", "display", "service", "hybrid"]`. The game-picker narrows based on the currently chosen mode.

---

## 8. Private hand rendering

Multi-player card games (Hold'em, Blackjack, Kings & Peasants) have private per-player state: each player's hole cards / hand are visible only to them.

Implementation: private state flows as Matrix `send_to_device` events per INS-036. The extension renders its own player's hand from to-device messages; other players' hands render as card-backs.

This works identically in Party mode (private hand shown on your phone panel) and Hybrid mode (private hand shown as a chat-embedded card view).

---

## 9. Out of scope for v1

- Real-money play (obviously).
- Custom rule variants (only canonical rules per game).
- Tournament brackets.
- Persistent player stats across sessions.
- Spectator chat in addition to the main channel (use channel chat).

---

## 10. References

- [INS-001 UX Modes](../ux-modes.md) — mode contracts.
- Texas Hold'em rules: https://www.pokernews.com/poker-rules/texas-holdem.htm
- Klondike solitaire rules: https://en.wikipedia.org/wiki/Klondike_(solitaire)
- Asshole (card game) / President rules: https://en.wikipedia.org/wiki/President_(card_game)
