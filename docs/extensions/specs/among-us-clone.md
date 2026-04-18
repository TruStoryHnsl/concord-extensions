# Among Us Clone (INS-005)

**Status:** Design spec
**Extension ID:** `com.concord.crewmate`
**Pricing:** `one_time`
**Modes:** Party, Hybrid
**Depends on:** [INS-001 UX Modes](../ux-modes.md)

---

## 1. Scope

Social deduction game in the Among Us tradition: a crew completing tasks on a map while 1–3 imposters sabotage and kill. Round ends when the crew finishes tasks OR the imposters equal/outnumber the crew.

Two UX modes:

- **Party** — each player gets their own per-device character view with live movement; a shared display shows the map overview.
- **Hybrid** — shared map/event display alongside the chat channel for discussion during meetings.

Real-time 60fps rendering, persistent accounts, and monetization beyond the `one_time` purchase are out of scope for v1.

---

## 2. Package layout

```
packages/crewmate/
  manifest.json              # modes: ["party","hybrid"], pricing: "one_time"
  index.html
  src/
    index.ts
    engine/
      map.ts                 # map/room graph, adjacency, vent graph
      tasks.ts               # task catalogue + per-task state machine
      movement.ts            # pure position tick
      vision.ts              # per-role visibility masks
      meeting.ts             # nomination, vote, eject resolution
      win.ts                 # terminal-state detection
      __tests__/*
    ui/
      map-display.ts         # shared overview renderer
      player-view.ts         # per-user first-person-ish view
      task-ui/               # one component per task minigame
      meeting-ui.ts          # voting screen
      sabotage-hud.ts        # imposter sabotage panel
    session/
      role-assignment.ts     # crew/imposter RNG
      lobby.ts               # pre-game state
  scripts/pack.mjs
```

---

## 3. Game state

```ts
type Role     = "crew" | "imposter"
type Phase    = "lobby" | "playing" | "meeting" | "over"
type RoomId   = string
type TaskId   = string
type Position = { x: number; y: number; room: RoomId }

type PlayerState = {
  id: PlayerId              // matrix user id
  role: Role
  alive: boolean
  position: Position
  tasks: { id: TaskId; complete: boolean }[]     // empty for imposters
  lastMeetingButtonAt: number | null
}

type SabotageState =
  | { kind: "none" }
  | { kind: "reactor"; deadlineMs: number }
  | { kind: "oxygen"; deadlineMs: number }
  | { kind: "lights" }
  | { kind: "comms" }

type Body = { victimId: PlayerId; position: Position; reportedBy: PlayerId | null }

type GameState = {
  phase: Phase
  day: number
  players: PlayerState[]
  map: "skeld-lite" | "mira-lite" | "polus-lite"
  taskProgress: number                            // 0..1, rolls up per-crew tasks
  sabotage: SabotageState
  bodies: Body[]
  meeting: { caller: PlayerId; nominee: PlayerId | null; votes: Map<PlayerId, PlayerId | "skip"> } | null
  winner: Role | null
}
```

All `apply*` functions are pure.

---

## 4. Map model

Maps are room-graphs: a set of rooms with doors and (for imposters) vent connections.

```ts
type Room = {
  id: RoomId
  name: string
  bounds: { x: number; y: number; w: number; h: number }  // for rendering
  taskSlots: TaskId[]                                      // which tasks can spawn here
}
type Map = {
  id: string
  rooms: Room[]
  adjacency: [RoomId, RoomId][]                            // doors
  vents: [RoomId, RoomId][]                                // imposter-only teleport edges
}
```

v1 ships three lite maps (`skeld-lite`, `mira-lite`, `polus-lite`) — reduced from the canonical Among Us maps to 8-10 rooms each so the reduced-fidelity renderer stays legible on phones.

Movement is coarse-grained: a player "moves to" an adjacent room. No pixel-level navigation. This keeps the protocol tractable, lets the game run on 1Hz tick rates, and sidesteps the "needs a game engine" trap.

---

## 5. Tasks

Tasks are per-crew and randomized at round start. Each task is a mini-interaction — a pure-logic task-state machine plus a small UI.

v1 task catalogue:

| Task | Type | UI |
|------|------|-----|
| Fix Wiring | short | Three-color cable matching |
| Download Data | long | Start upload → travel → finish upload |
| Empty Trash | short | Button hold for 3s |
| Card Swipe | short | Pointer gesture |
| Align Engine | short | Drag slider to center |
| Start Reactor | short | Simon-says sequence |
| Fuel Engines | long | Pickup → travel → deliver |

Tasks contribute to `taskProgress` only on completion. Visual tasks (that others can witness) are marked in the UI so an imposter faking one is a tell.

---

## 6. Imposter mechanics

- **Kill** — cooldown-gated action, only when adjacent to a crew. Sets victim's `alive = false`, drops a `Body`.
- **Vent** — teleport along a `vents` edge.
- **Sabotage** — one active sabotage at a time. Reactor and Oxygen have deadline timers; if timer expires before fix, imposters win. Lights reduces vision radius; Comms disables the task list UI.
- **Fake tasks** — imposters have a task list shown in their UI, but tasks never complete. They're walking-around cover.

Imposter count:
- 4-6 players: 1 imposter
- 7-9 players: 2 imposters
- 10-15 players: 3 imposters

---

## 7. Meetings

Any alive player can call a meeting via the emergency button (cooldown: once per game per player) OR by reporting a body. All alive players are summoned, regardless of map position.

Meeting phases:
1. **Discussion** (90s default): free chat. In Party mode this is voice-optional; in Hybrid mode it flows through the linked channel.
2. **Voting** (30s default): each alive player votes for a nominee or "skip". Vote is private until the phase ends.
3. **Resolution**: player with most votes is ejected; ties skip. The game reveals alignment (or hides it, per lobby setting).

Votes are tallied in pure `meeting.ts:tallyVotes()`.

---

## 8. Mode-by-mode UX

### 8.1 Party mode

- **Display surface** (1 `fullscreen`): the map overview — all player positions, current sabotage, task progress bar, meeting banner when active. During meetings: the voting UI zooms to fullscreen.
- **Player surface** (1 `panel` per participant): each player sees their own character view — current room, limited vision radius, their task list, their action buttons (report, call meeting, kill/vent/sabotage for imposters, interact with tasks when in-room).
- **Seat mapping**: `host` = lobby creator (picks map, player count, imposter count, discussion time); `participant` = player in-game; `observer` = dead players (can roam freely, see everything, cannot influence).

### 8.2 Hybrid mode

- **Media surface** (1 `fullscreen` or `panel`): same map overview as Party mode; this surface shows the whole-game view.
- **Chat channel**: carries all discussion during meetings. Between meetings the chat is disabled for alive players (so you can't coordinate with other crew silently). Dead players get their own "ghost chat" to-device channel.
- **No per-player UI surface**: interactions are reduced. Players pick a room to move to via a chat command (`!move engine`) or tap on the map. Tasks are represented as chat challenges (task UI pops in-line in chat for alive players only).

Hybrid is intentionally a reduced-fidelity variant — it's for groups that want the Among Us *loop* without each person having a separate phone controller.

---

## 9. Tick loop

The game engine ticks at 1Hz. Per tick:

1. Advance any active sabotage timer.
2. Recompute task progress rollup.
3. Fire deadline-expired sabotage win conditions.
4. Publish a `com.concord.crewmate.tick` room state event with the delta.

Between ticks, player actions fire immediately via `send_state_events` and are applied optimistically. The next tick reconciles.

1Hz keeps server load trivial, matches the coarse room-based movement model, and survives modest latency without desync.

---

## 10. Winning

- **Crew wins** when `taskProgress >= 1.0` OR all imposters are ejected/dead.
- **Imposters win** when alive imposters >= alive crew, OR a sabotage deadline expires, OR all crew are dead.

`win.ts:terminalState(state) -> Role | null` runs every state transition.

---

## 11. Out of scope for v1

- Voice chat (rely on Concord's existing voice channels).
- Real-time smooth animation / pixel-level navigation.
- Persistent accounts, cosmetics, unlockables.
- Matchmaking beyond a single channel.
- Custom maps, custom tasks.
- Desktop-specific features (the extension runs in any Concord client that can mount a `panel` surface).

---

## 12. References

- [INS-001 UX Modes](../ux-modes.md) — Party / Hybrid mode contracts.
- Among Us (Innersloth) — https://www.innersloth.com/games/among-us/ (reference for the game's shape; this is a clone, not a port).
