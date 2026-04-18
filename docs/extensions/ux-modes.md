# Extension UX Modes (INS-001)

**Status:** Canonical reference
**Scope:** Every Concord extension MUST declare which of these modes it supports. Extension specs link here.

---

## 1. Purpose

The Concord session layer (INS-036) already implements the machinery for multi-participant extension sessions: `mode`, `surfaces`, `participants`, `seats`, `input_permissions`. See `concord/docs/extensions/session-model.md`.

INS-001 is the **author-facing** half: a fixed vocabulary of five UX modes that describe how an extension *feels* to users. Each UX mode maps to one of the INS-036 session modes plus a conventional surface layout. Nothing here is new runtime. This doc exists so extension authors, marketplace copy, and the settings UI all speak the same five words.

---

## 2. The Five Modes

| UX Mode | One-line description |
|---------|----------------------|
| Party | One big shared display + per-user controller UI on phones. |
| Display | One shared window; everyone sees identical output. |
| Service | Each connected user gets their own independent instance. |
| Chat | Extension lives inside a text channel; interaction is chat-first. |
| Hybrid | Split-screen — shared media surface + live chatroom. |

Every extension's `manifest.json` declares a `modes` array listing which of these it supports. The shell uses that list to filter the mode picker at launch.

---

## 3. INS-036 Mapping

| UX Mode | INS-036 `mode` | Typical surfaces | Seat semantics |
|---------|---------------|------------------|----------------|
| **Party** | `hybrid` | 1 `fullscreen` display surface on the big screen + 1 `panel` per participant device | `host` controls the display; `participant` gets a phone controller; `observer` sees the display only. |
| **Display** | `shared` or `shared_readonly` | 1 `fullscreen` or 1 `panel` | `shared` if everyone can interact; `shared_readonly` if nobody but the host can. `shared_admin_input` when the host-as-presenter pattern applies. |
| **Service** | `per_user` | 1 `panel` per participant | No `host`/`participant` asymmetry at the logic layer — each user has their own state. The shell still tracks a `host` seat but it's nominal. |
| **Chat** | `shared` (rendered in text context) | 1 `background` surface; messages flow through the channel | `host` = author of the running game; `participant` = active player; `observer` = channel member who hasn't joined. |
| **Hybrid** | `hybrid` | 1 `fullscreen` or `panel` media surface + an always-on chat channel alongside | Media surface has Display-style seat rules; chat channel has Chat-style seat rules. |

`Mode` and `Seat` types are defined in `concord/client/src/components/extension/InputRouter.ts` and re-exported through `concord/client/src/extensions/sdk.ts`.

---

## 4. Per-Mode Detail

### 4.1 Party

**When to pick it.** Couch co-op. Everyone's in the same room. A TV or monitor is the primary display; phones are the input devices.

**Shell behavior.** The extension gets two kinds of surface at once:
- One `fullscreen` or large `panel` surface on the designated "display" device (TV client, desktop big screen, projector).
- One `panel` surface per participant device, typically on phones.

The extension is expected to render different UI in each surface. The `concord:init` message includes the full `surfaces[]` array; the extension decides what to draw based on which surface descriptor matches its own window.

**Seats.** `host` is whoever launched the session — usually the device running the display surface. `participant` is anyone with a controller. `observer` may watch the display without a controller.

**Example.** JackBox clone: big screen shows the prompt, the scoreboard, and the answers; each phone shows a text input. When a round resolves, the big screen shows winners while phones get an idle screen.

### 4.2 Display

**When to pick it.** One surface, identical for everyone. Useful for presentations, passive visualizations, or any "single screen, multiple eyeballs" extension.

**Shell behavior.** One surface (`fullscreen` or `panel`). All clients render the same state. State changes fan out to every participant in real time.

**Seats.** Three common shapes:
- `shared` — every participant can interact (collaborative whiteboard).
- `shared_admin_input` — only the `host` can interact; everyone else sees the result (slideshow).
- `shared_readonly` — nobody can interact; the extension self-drives (clock, dashboard).

The extension picks one of these by setting `input_permissions` on session creation. The UX mode label stays "Display" regardless.

**Example.** Chess & Checkers in Display mode: a single board, both seats take turns, everyone else spectates.

### 4.3 Service

**When to pick it.** Per-user tools. No shared state. The extension is a utility, not a group activity.

**Shell behavior.** INS-036 `per_user` mode: each participant gets an independent state instance. The session event still exists for discovery, but each user's data lives in to-device messages (not shared room state).

**Seats.** The distinction between `host` and `participant` is mostly cosmetic — there's no shared state to arbitrate. Still, `host` keeps session-lifecycle rights (can terminate the whole session).

**Example.** Worldview's config menu in Service mode: each user sets their own API keys; nobody else sees them.

### 4.4 Chat

**When to pick it.** The game or tool IS the conversation. No display surface needed. A chatbot is authoring / refereeing something that unfolds in the text channel.

**Shell behavior.** The extension runs as a `background` surface — no visible window. It listens to channel messages (via the `matrix.read` capability) and posts replies (`matrix.send`). Users interact by typing; the extension renders its output as chat messages.

**Seats.**
- `host` = whoever launched the game. For Game Maker Protocol games (INS-007) this is the GM.
- `participant` = active player. The extension tracks them in a roster; channel members not in the roster are `observer`.

**Example.** Blood on the Clocktower in Chat Mode: the extension DMs each player their role, announces phases in the main channel, and adjudicates votes based on chat messages.

### 4.5 Hybrid

**When to pick it.** The extension needs BOTH a media surface AND the chat channel. Chat is load-bearing — not decoration.

**Shell behavior.** Two surfaces:
- A media surface (`fullscreen` or `panel`) running in the shell like Display mode would.
- The channel itself, which the extension reads and writes just like Chat mode.

Extensions in Hybrid mode effectively combine Display + Chat behaviors. The SDK `concord:init` payload lists BOTH surfaces and the channel context.

**Seats.** Media surface follows Display-mode rules; chat follows Chat-mode rules. In practice `host` = GM/narrator, `participant` = player.

**Example.** Blood on the Clocktower in Hybrid Mode: the shared media surface shows the town map, clock, and death announcements; the chat channel carries player discussion, public nominations, and the extension's phase-transition messages.

---

## 5. Matrix: extension × mode

Reference for the first-party extensions in this repo. See each extension spec in `docs/extensions/specs/` for per-mode UX detail.

| Extension | Party | Display | Service | Chat | Hybrid |
|-----------|:-----:|:-------:|:-------:|:----:|:------:|
| Worldview | ✓ | ✓ | ✓ | | |
| Chess & Checkers | ✓ | ✓ | ✓ | | |
| Blood on the Clocktower | ✓ | | | ✓ | ✓ |
| Among Us Clone | ✓ | | | | ✓ |
| Card Game Suite | ✓ | ✓ | ✓ | | ✓ |
| JackBox Clone | ✓ | | | | |
| Game Maker Protocol (INS-007) | — | — | — | — | — |

(Game Maker Protocol is authoring infrastructure, not a user-facing display extension — it has no modes of its own.)

---

## 6. Manifest declaration

Extensions declare supported modes in `manifest.json`:

```json
{
  "id": "com.concord.worldview",
  "version": "0.1.0",
  "name": "Worldview",
  "modes": ["party", "display", "service"],
  "pricing": "free",
  "entry": "index.html"
}
```

Values are lowercase: `"party" | "display" | "service" | "chat" | "hybrid"`.

The shell rejects a launch request whose requested mode is not in the extension's `modes` array.

---

## 7. References

- **INS-036 session model**: `concord/docs/extensions/session-model.md` — canonical definition of `mode`, `surfaces`, `seat`, `input_permissions`.
- **Shell ↔ extension SDK**: `concord/docs/extensions/shell-api.md` and `concord/client/src/extensions/sdk.ts` — `concord:init` envelope and the rest of the postMessage protocol.
- **Extension specs** (`docs/extensions/specs/*.md`) — each extension spec opens with a "UX modes" section that MUST link back to this document.
- **INS-007 Game Maker Protocol**: `docs/extensions/game-maker-protocol.md` — authoring protocol for Chat / Hybrid tabletop games.
