# Blood on the Clocktower (INS-004)

**Status:** Design spec
**Extension ID:** `com.concord.botc`
**Pricing:** `one_time`
**Modes:** Party, Chat, Hybrid
**Depends on:** [INS-001 UX Modes](../ux-modes.md), [INS-007 Game Maker Protocol](../game-maker-protocol.md)

---

## 1. Scope

Blood on the Clocktower (BotC) is a social-deduction game designed by The Pandemonium Institute. This extension implements the mechanical scaffolding — phase tracking, role information distribution, vote tallying, death bookkeeping — while leaving the narrative judgment calls to the human Storyteller.

Three UX modes:

- **Party** — in-person play assistance on a shared screen while the Storyteller runs the table.
- **Chat** — full bot-administered game inside a single channel, no Storyteller required.
- **Hybrid** — bot-administered game with a shared media surface for the map, clock, and death announcements, plus the chat channel for player discussion.

Official scripts (Trouble Brewing, Sects & Violets, Bad Moon Rising) are shipped; custom-script authoring is out of scope for v1.

---

## 2. Package layout

```
packages/botc/
  manifest.json               # modes: ["party","chat","hybrid"], pricing: "one_time"
  index.html
  src/
    index.ts                  # bootstrap
    rules/
      phases.ts               # pure first-night / day / night state machine
      roles/                  # one file per role, each exports a RoleDef
        trouble-brewing/
          washerwoman.ts
          librarian.ts
          ...
        sects-and-violets/
        bad-moon-rising/
      scripts.ts              # script composition (which roles are in play)
      votes.ts                # pure nomination / vote-tally logic
      deaths.ts               # pure death-resolution logic
      __tests__/*
    ui/
      grimoire.ts             # Storyteller-only role/life tracker (Party mode)
      map.ts                  # player-position circle renderer (Hybrid mode)
      narration.ts            # phase announcement banner
    session/
      seating.ts              # players around the circle
      private-channels.ts     # to-device wrapper for role info
```

---

## 3. Game state

```ts
type Alignment = "good" | "evil"
type Team      = "townsfolk" | "outsider" | "minion" | "demon"
type RoleId    = string                             // "washerwoman", "imp", ...
type Phase     = "setup" | "first_night" | "day" | "night" | "execution" | "over"
type PlayerId  = string                              // matrix user id
type PlayerState = {
  id: PlayerId
  seat: number                                       // 0..N-1, clockwise
  role: RoleId
  alignment: Alignment
  team: Team
  alive: boolean
  ghost_vote_used: boolean
  statuses: string[]                                 // "poisoned", "drunk", "mad", ...
}
type GameState = {
  script: "trouble-brewing" | "sects-and-violets" | "bad-moon-rising"
  phase: Phase
  day: number                                        // 1-indexed
  players: PlayerState[]
  nominations: Nomination[]                          // reset per day
  executionsToday: number                            // 0 or 1
  demonBluffs: RoleId[]                              // info for the Demon
  winner: Alignment | null
}
```

All state mutators are pure `apply*` functions. Role abilities are declarative — each role file exports a `RoleDef` with `firstNight`, `night`, `day` handlers; the engine invokes them deterministically in the script-defined order.

---

## 4. Phases

The canonical BotC phase loop:

```
setup
  └→ first_night (role info distribution, Demon bluffs, Minion info)
       └→ day 1 (discussion → nominations → vote → execution)
            └→ night (wake each role in script order)
                 └→ day N (repeat until winner is decided)
                      └→ over
```

Every phase transition logs a `phase_change` event to the session room so any reconnecting client can rebuild the timeline.

---

## 5. Roles

v1 ships the three official scripts:

- **Trouble Brewing** — 22 roles. Beginner-friendly.
- **Sects & Violets** — 22 roles. Information-manipulation heavy.
- **Bad Moon Rising** — 22 roles. Death/resurrection mechanics.

Each role is a TS module exporting:

```ts
export const role: RoleDef = {
  id: "washerwoman",
  team: "townsfolk",
  alignment: "good",
  firstNight(s: GameState, self: PlayerState, rng: RNG): Effect[] { ... },
  night(s: GameState, self: PlayerState, rng: RNG): Effect[] { ... },
  onNominated(s: GameState, self: PlayerState, nominator: PlayerId): Effect[] { ... },
  onDeath(s: GameState, self: PlayerState): Effect[] { ... },
}
```

`Effect[]` is a small ADT — `{ kind: "whisper", to: PlayerId, text: string } | { kind: "status_set", target: PlayerId, status: string } | { kind: "kill", target: PlayerId } | ...`. Role handlers produce effects; the engine applies them. This keeps role logic pure and testable against crafted game states.

---

## 6. Mode-by-mode UX

### 6.1 Party mode (in-person assist)

Human Storyteller runs the table; the extension runs on a shared screen and a phone per player.

- **Display surface** (1 `fullscreen`): the "Town Square" — a circle of player icons with alive/dead status, ghost vote state, and a big phase banner.
- **Per-player surface** (1 `panel` per participant): shows *that player's* role sheet, abilities, and any info they've received. Never shows other players' roles.
- **Storyteller surface** (1 `panel` for the `host` seat): the Grimoire — the full role layout, reminders, and all-player-info admin view.
- **Input**: the Storyteller drives phase transitions with `/bot next`. Players don't input anything mechanical from their phones; all nominations, votes, and speech happen out loud at the table.

Seats: `host` = Storyteller, `participant` = seated player, `observer` = channel member spectating.

### 6.2 Chat mode (full bot-administered)

No human Storyteller; the extension adjudicates everything.

- **Surface**: `background` (no visible shell window). The extension reads channel messages and posts its own.
- **Role info**: delivered via Matrix `send_to_device` to each player.
- **Phases**: the extension announces each phase in the channel with a message and an embedded control block: `!nominate <player>`, `!vote yes|no`, etc.
- **Nominations**: collected via `!nominate` commands. Each player gets one nomination per day.
- **Votes**: collected via `!vote yes` / `!vote no` in response to a nomination announcement.
- **Deaths**: announced publicly at day-start / end-of-night.
- **Demon bluffs**: sent to the Demon player at first night.

This mode is authorable in [INS-007 Game Maker Protocol](../game-maker-protocol.md) once that protocol stabilizes; for v1 we ship the Chat flow hand-coded against the rules modules, and post-v1 we retarget onto Game Maker Protocol to serve as the canonical real-world test case.

### 6.3 Hybrid mode

Bot-administered (like Chat mode), plus a shared media surface.

- **Media surface** (1 `fullscreen` or `panel`): Town Square map, current phase banner, day counter, death announcements, vote-in-progress visualizer.
- **Chat channel**: carries all player discussion, nominations, and votes just like Chat mode.
- **Role info**: still to-device, never in the channel.

Hybrid mode's value-add over pure Chat is the persistent map that shows who's alive, who's dead, and whose turn it is during nominations — information that scrolls off-screen in a pure chat view.

---

## 7. Vote mechanics

Pure tally logic in `rules/votes.ts`:

```ts
function tallyVote(
  nominee: PlayerId,
  voters: { id: PlayerId; yes: boolean; alive: boolean; ghostVoteUsed: boolean }[]
): VoteResult
```

Rules:
- Dead players vote once per game (ghost vote).
- Nominee needs votes >= `ceil(alive / 2)` to be eligible for execution.
- On tie with an existing nominee this day: nobody is eligible for execution.
- At most one execution per day.

All of this is covered in `__tests__/votes.test.ts` with crafted scenarios for every edge case (ties, ghost votes spent mid-day, abstentions).

---

## 8. Randomness

The engine takes a seeded `RNG` so tests are deterministic. Production sessions seed from `crypto.getRandomValues`; tests seed from a constant.

Demon bluffs, Drunk-role selection, red-herring picks — every random choice flows through the injected RNG.

---

## 9. Out of scope for v1

- Custom script authoring UI (all scripts are shipped as pre-built).
- Third-party scripts / role importing.
- Experimental roles.
- Fabled / Traveler roles (can be added post-v1).
- Mobile-native Party mode (web-only for v1).

---

## 10. References

- [INS-001 UX Modes](../ux-modes.md) — mode contracts.
- [INS-007 Game Maker Protocol](../game-maker-protocol.md) — Chat mode retarget path post-v1.
- Official BotC wiki: https://wiki.bloodontheclocktower.com/
- BotC print-and-play rules: https://bloodontheclocktower.com/home (for rule verification).
