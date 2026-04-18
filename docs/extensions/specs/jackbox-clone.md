# JackBox Clone (INS-008)

**Status:** Design spec
**Extension ID:** `com.concord.partybox`
**Pricing:** `one_time`
**Modes:** Party
**Depends on:** [INS-001 UX Modes](../ux-modes.md)

---

## 1. Scope

A Jackbox-style party game suite: one big shared display drives the game, each player uses their phone as a controller to answer prompts and vote on results. Full in-house implementation of the format; no dependency on external Jackbox titles or APIs.

v1 ships five mini-games under one extension. Party mode only — the format doesn't translate to Display / Service / Chat / Hybrid without losing what makes it work.

---

## 2. Package layout

```
packages/partybox/
  manifest.json              # modes: ["party"], pricing: "one_time"
  index.html
  src/
    index.ts                 # bootstrap + game-picker + round runner
    engine/
      round.ts               # pure round-state machine (see §3)
      scoring.ts              # pure score aggregation
      rng.ts                 # seeded
      __tests__/*
    games/
      quiplash-lite/         # prompt/response + head-to-head vote
        prompts.json         # bundled prompt library
        game.ts              # game-specific state + action handlers
        display.ts           # display-surface UI
        controller.ts        # phone-surface UI
        __tests__/*
      drawful-lite/          # draw a prompt, others guess it
        prompts.json
        game.ts
        display.ts
        controller.ts
      trivia-murder/         # fast trivia, last-place penalty
        questions.json
        game.ts
        display.ts
        controller.ts
      fibbage-lite/          # bluffing with fake facts
        facts.json
        game.ts
        display.ts
        controller.ts
      wordspiracy/           # collaborative word-clue guessing
        words.json
        game.ts
        display.ts
        controller.ts
    session/
      lobby.ts               # join-code + player roster
      game-picker.ts         # which game this round
  scripts/pack.mjs
```

---

## 3. Round state machine (shared)

All five games share a four-phase round loop:

```
LOBBY
  └→ prompt (display shows prompt; controllers collect inputs)
       └→ resolve (display shows answers; game-specific logic)
            └→ vote (controllers vote on answers)
                 └→ reveal (display shows scoring, winner of round)
                      └→ next round OR over
```

Implemented as a pure state machine in `engine/round.ts`:

```ts
type RoundPhase = "lobby" | "prompt" | "resolve" | "vote" | "reveal" | "over"

type Player = {
  id: PlayerId               // matrix user id
  displayName: string
  score: number
  roundInput: string | null
  roundVote: string | null   // target player id or answer id
  connected: boolean
}

type RoundState<GameData> = {
  phase: RoundPhase
  roundIndex: number          // 0..N
  totalRounds: number
  players: Player[]
  deadlineMs: number | null   // when the current phase auto-advances
  data: GameData              // game-specific payload
}
```

Phase transitions are driven by:
- All players submitted input → advance early.
- Deadline reached → advance with whatever's collected (blanks filled by a game-specific default).
- Host manually advances (`!advance` chat command or display-surface admin button).

---

## 4. Scoring

Scoring is per-game but aggregates into `Player.score`. Shared helper:

```ts
export function awardPoints(players: Player[], awards: Map<PlayerId, number>): Player[]
```

Pure — returns new players array. Games call this from their `applyAction` functions after resolving a round.

Final round bonuses (e.g. "double points") are a `multiplier` field passed to `awardPoints`.

---

## 5. The five initial games

### 5.1 Quiplash-lite

- Prompt / response game. Each player sees two prompts per round, types short responses.
- After all responses collected, display pairs up responses head-to-head; other players vote which is funnier.
- Winner of each matchup gets points; loser gets half; both get zero if nobody votes.
- Prompt library: ~200 prompts shipped in `prompts.json`.

### 5.2 Drawful-lite

- Each player gets a secret prompt, draws it on their phone (touch canvas → small PNG).
- Display shows each drawing in turn; other players type guesses.
- Guesses + the real prompt are shuffled; everyone votes which is the real one.
- Drawer gets points when others vote wrong; guessers get points when others vote for their guess.

### 5.3 Trivia Murder

- Fast multiple-choice trivia with a twist: last-place-per-round player loses a life. Lose 3 lives → eliminated, enters ghost mode (still votes but no points).
- 10-question rounds. Final round: survivors race through a sudden-death sequence.
- Question bank: ~500 questions across 10 categories shipped in `questions.json`.

### 5.4 Fibbage-lite

- Display shows a true-but-obscure fact with one blank. Players type a fake ending.
- All fakes + the real ending are shuffled; players vote which is real.
- Points for fooling others; points for finding the real one; zero for voting your own fake.
- Fact library: ~150 facts in `facts.json`.

### 5.5 Wordspiracy

- Collaborative clue game. One player is the secret "impostor" who doesn't know the round's word.
- Each other player types a one-word clue related to the secret word.
- Impostor has to bluff a clue; players discuss via chat channel then vote on who the impostor is.
- Impostor wins if majority votes wrong; players win if majority votes right.
- Word bank: ~300 words in `words.json`.

---

## 6. Party-mode surfaces

Matches the standard Party-mode contract from [INS-001](../ux-modes.md):

- **Display surface** (1 `fullscreen`): the big screen. Shows round phase, prompts, drawings, trivia questions, score ticker. Per-game display UI lives in `games/*/display.ts`.
- **Controller surface** (1 `panel` per participant): the phone. Shows input widgets appropriate to the current phase — text entry, vote buttons, a drawing canvas, a trivia answer picker. Per-game controller UI in `games/*/controller.ts`.

Seat mapping:
- `host` = lobby creator; controls game-picker, round count, skip/continue.
- `participant` = player with a phone connected.
- `observer` = channel member watching the big screen without a phone; has no input.

---

## 7. Lobby + join flow

1. A channel member runs the extension with mode `party`.
2. The display surface opens on the big-screen device and shows a 4-character join code.
3. Other channel members tap the extension in the channel → their phone opens as a controller surface and they submit the code.
4. Host picks which of the five games to play and the round count (3 / 5 / 7).
5. Round loop runs; reveal screen after the last round shows final standings.

Join codes are 4 characters (A-Z + 2-9, no confusables) to keep typing fast on a phone. Codes are session-scoped — a new lobby gets a new code.

---

## 8. Content bundling

Prompt libraries, fact lists, and word banks are bundled JSON files. Hot-swap / user-authored content is explicitly deferred to post-v1. When an author wants a prompt library of their own, they'll use [INS-007 Game Maker Protocol](../game-maker-protocol.md) rather than forking this extension.

Profanity / age-appropriate flags ship as-is in v1 (PG-13 prompts only). A toggle for "adult prompts" is a v1.1 feature.

---

## 9. Out of scope for v1

- More than five games.
- User-authored prompt libraries.
- Streaming-friendly features (no-spoiler mode, streamer-safe prompts).
- Per-player cosmetics / unlockables.
- Any dependency on Jackbox Games' own infrastructure.

---

## 10. References

- [INS-001 UX Modes](../ux-modes.md) — Party mode contract.
- Jackbox Games party format (reference only): https://www.jackboxgames.com/ — this extension is a clean-room clone of the format, not a port.
