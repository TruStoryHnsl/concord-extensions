# Chat & Hybrid Game Maker Protocol (INS-007)

**Status:** Design spec
**Scope:** Authoring protocol for custom tabletop-style games playable via Chat and Hybrid UX modes. Not a user-facing extension.
**Depends on:** [INS-001 UX Modes](./ux-modes.md)

---

## 1. Goal

Let a non-programmer describe a tabletop game — a deck of cards, a dungeon crawl, a murder mystery, or a full D&D campaign — as a text document that Concord can run as a Chat or Hybrid extension. The extension becomes the dungeon master: it reads chat, tracks state, rolls dice, moves the story forward, and defers to a human GM when the rules end.

**Target expressiveness ceiling.** A full D&D 5e one-shot adventure with branching narrative, per-character inventories, skill checks, combat, and win/lose resolution MUST fit in the protocol. Anything heavier than that — real-time physics, synced animations, free-form improv — is out of scope. The protocol names this line explicitly (`defer_to_human: true`) instead of growing features forever.

**Target authoring ease.** Writing a game should feel like writing a choose-your-own-adventure book. A flat text file that a literate non-programmer can read, edit, and share. No JSON schemas to memorize, no async state machines to wire up, no deploy pipeline.

---

## 2. Non-goals

- **Not a programming language.** No lambdas, no closures, no turing-complete computation. Authors get variables, arithmetic, randomness, and lookups. Anything more specific is a custom opcode.
- **Not a replacement for full game extensions.** If your game needs 60fps animation, physics, or a custom UI surface beyond plain text + simple menus, write it as a Display/Party extension (see INS-003..INS-006).
- **Not a marketplace DRM system.** Authors share `.game` files freely; monetization lives at the extension level (INS-001 pricing tiers), not per-game.

---

## 3. Runtime shape

The Game Maker Protocol ships as a **single host extension** — `com.concord.game-maker` — that loads arbitrary `.game` documents. The host extension is what users install; individual games are data files.

| Layer | Role |
|-------|------|
| Host extension | Registered in the marketplace as a `free` extension. Declares modes `chat` and `hybrid`. |
| Game document (`.game`) | A single text file describing a specific game. Distributed as a chat attachment, a gist URL, or a side-loaded file. |
| Game session | One running instance of a `.game` inside one Concord channel. |

The host extension exposes one Chat command: `/game load <url-or-attachment>`. Once loaded, the document takes over the channel interaction until it terminates or the host unloads it.

---

## 4. Document format

A `.game` file is a plain-text document with three sections:

```
===== HEADER =====
title: Murder at Ravensmoor
author: J. Marlowe
version: 1.0.0
min_players: 3
max_players: 6
mode: chat           # or "hybrid"
tags: mystery, one-shot

===== STATE =====
suspects:
  - name: Lord Ashford
    alive: true
    clues_found: 0
clock: 0
phase: intro

===== SCRIPT =====
on start:
  say "The rain hammers the windows of Ravensmoor Manor..."
  advance to phase:intro

phase intro:
  say "You are gathered in the drawing room. Who speaks first?"
  await player speech
  advance to phase:investigation

phase investigation:
  option "Examine the body":
    roll d20 + perception as check
    if check >= 15:
      say "You notice the broken cufflink."
      inc suspects[0].clues_found
    else:
      say "Nothing obvious catches your eye."
  option "Question the butler":
    say "The butler stammers..."
  option "Check the locked study":
    require item:key or roll d20 + lockpick >= 18 as pick
  on clock >= 5:
    advance to phase:accusation

phase accusation:
  ...
```

The three sections are:

- **HEADER** — YAML-like key/value metadata. Required keys: `title`, `author`, `version`, `mode`. Optional: `min_players`, `max_players`, `tags`, `description`, `defer_to_human` (boolean).
- **STATE** — YAML-like initial state document. The protocol engine treats this as a mutable object the script can read and write via dotted paths (`suspects[0].clues_found`).
- **SCRIPT** — Indentation-sensitive statement list. The authoring surface; see §6.

---

## 5. Player / GM roles

The protocol supports three participant categories inside a session:

| Role | Who | Capabilities |
|------|-----|--------------|
| `narrator` | The host extension running the script | Emits `say` / `whisper` / `ask` messages, mutates STATE, resolves dice. |
| `gm` (optional) | A human who loaded the game | Can issue `/gm` commands to override state, skip phases, add players, break rules. At most one per session. When present, `defer_to_human` is honored; when absent, the narrator handles everything itself. |
| `player` | A channel member who has joined with `/game join` | Addresses the narrator via normal chat messages, via `/do` commands, or via inline menu selections in Hybrid mode. |

Players get per-role private state via direct messages (roles, secret inventory) through the Matrix `matrix.send_to_device` capability. Public state flows to the channel.

---

## 6. Script language

A tiny indentation-sensitive DSL. The full grammar:

### 6.1 Statements

```
say "<literal>"                       # public channel message
whisper @<player>: "<literal>"        # DM to one player
ask @<player>: "<prompt>" as <var>    # DM with response captured
option "<label>": <block>             # adds a selectable choice in current scope
require <condition>                   # gates the surrounding branch
roll <dice-expr> as <var>             # rolls and assigns (e.g. 2d6+3, d20+str)
set <path> = <expr>                   # STATE write
inc <path>                            # STATE ++
dec <path>                            # STATE --
if <condition>: <block>               # conditional
else: <block>                         # paired with if
advance to phase:<name>               # phase transition
end with outcome:<name>               # terminates game
on <event>: <block>                   # event handler (clock, message, player_joined, ...)
include "<subdoc.game>"               # splice another document
```

### 6.2 Expressions

- Literals: integers, strings, booleans.
- STATE paths: `suspects[0].alive`, `phase`, `clock`.
- Arithmetic: `+ - * /`.
- Comparison: `< <= == != >= >`.
- Logical: `and or not`.
- Dice: `dN`, `MdN`, `MdN+K`, `roll(...)`.

### 6.3 Dice primitives

| Form | Meaning |
|------|---------|
| `dN` | One die with N sides. |
| `MdN` | M dice with N sides, summed. |
| `MdN+K` | Sum M N-sided dice then add K. |
| `MdN keep highest K` | Drop all but the top K results. |
| `MdN keep lowest K` | Drop all but the bottom K results. |
| `MdN+<expr>` | K can be any state expression (`d20 + str_mod`). |

All rolls are logged to the channel with a human-readable transcript line: `alice rolls d20 + perception (12 + 3) = 15`.

### 6.4 Events

The `on` keyword attaches handlers outside of phases:

```
on clock >= 10:
  say "Dawn breaks. The mystery remains."
  end with outcome:unsolved

on message contains "accuse":
  ...

on player_joined:
  whisper @it: "Welcome to Ravensmoor."
```

---

## 7. Branching narrative

Phases are the primary branching unit. Within a phase, `option` blocks expose choices to players; the first player (or the `gm`) to select one drives the branch. Phases can end by:

- `advance to phase:<name>` — deterministic transition.
- `end with outcome:<name>` — terminates the session; the session event tombstones and the host extension publishes an outcome record to the channel.
- `on clock >= N` — time-based transition (see §8).

Narrative state (which choices were taken, which clues found, which suspects dead) lives in STATE and is fully inspectable by the GM via `/gm inspect`.

---

## 8. Clock and pacing

Every game has a single integer `clock` that ticks on a configurable rhythm:

```
===== HEADER =====
clock_unit: turn      # turn | minute | message | manual
```

| Unit | When `clock` increments |
|------|-------------------------|
| `turn` | After every resolved `option`. |
| `minute` | Every real-time minute the session is alive. |
| `message` | After every player chat message. |
| `manual` | Only when the script calls `inc clock` or the GM issues `/gm tick`. |

Authors use `on clock >= N` handlers to pace the story: time-limited scenes, patience rewards, "you've been here too long" penalties.

---

## 9. Scope limits — when to defer

The protocol is dead-set against growing into a general game engine. Four bright lines:

1. **No real-time rendering.** If the game needs smooth motion, write a Display/Party extension.
2. **No private timing.** If a player's reaction speed matters (Jackbox-style), write it as a native Party extension.
3. **No arbitrary file I/O.** The script cannot fetch URLs, read files outside the `.game` document, or hit the network.
4. **No third-party code execution.** No `eval`, no plugin DSL extension. If an author needs a custom opcode, they contribute it to the host extension via a PR.

When an author hits one of these limits, the protocol offers one concession: `defer_to_human: true` in the HEADER. This flips the session into "GM-moderated" mode where the narrator pauses between phases and waits for the `gm` to type `/gm continue`. The GM fills in whatever the protocol can't.

---

## 10. Matrix integration

Game sessions use the existing INS-036 session model:

- Session mode: `shared` (Chat mode) or `hybrid` (Hybrid mode).
- Session state event: standard `com.concord.extension.session` with `extension_id: "com.concord.game-maker"` and the `.game` document URL stored in `metadata.game_doc_url`.
- Per-game state: stored as `com.concord.game-maker.<session_id>.state` room state events, one per phase transition (for resumability after a client disconnect).
- Private per-player state: `com.concord.game-maker.<session_id>.whisper` to-device events.

Resumability is a hard requirement: a client reconnecting mid-mystery MUST see the same phase, STATE, and option history it had before the disconnect. The host extension re-hydrates from the latest `.state` room event.

---

## 11. Authoring tools (out of scope for v1)

The first deliverable is the protocol + host extension. A web-based authoring tool (`.game` editor with syntax highlighting, lint, and a "dry run" mode) is planned but explicitly out of scope for the initial implementation. Authors write `.game` files in a text editor.

---

## 12. References

- [INS-001 UX Modes](./ux-modes.md) — the five mode vocabulary this protocol lives inside of.
- [Blood on the Clocktower spec](./specs/blood-on-the-clocktower.md) — canonical real-world test case: its Chat / Hybrid modes MUST be authorable in Game Maker Protocol once both specs stabilize.
- INS-036 session model — `concord/docs/extensions/session-model.md`.
