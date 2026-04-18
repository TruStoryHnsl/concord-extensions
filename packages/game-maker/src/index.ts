/**
 * Game Maker host extension — DOM bootstrap.
 *
 * This is a minimal stub that wires the pure interpreter into a browser
 * iframe. The full Chat / Hybrid SDK integration (matrix.read / matrix.send
 * / matrix.send_to_device) is a Phase 1 (runtime loader) concern handled in
 * the main Concord repo; the interpreter itself is shell-agnostic and has
 * full test coverage as pure functions.
 *
 * @see docs/extensions/game-maker-protocol.md
 */

import { parseGameDocument } from "./parser/document"
import { start, chooseOption, handleMessage, tick } from "./engine/interpreter"
import { makeRng } from "./engine/dice"
import type { GameDocument, NarratorEvent, SessionState } from "./types"

// Re-export the pure surface so tests and downstream code can import from
// the package root when the SDK is eventually extracted.
export * from "./types"
export { parseGameDocument } from "./parser/document"
export { parseScript, parseExpr, parseDiceExpr } from "./parser/script"
export { rollDice, rollDie, makeRng, describeRoll } from "./engine/dice"
export { readPath, writePath, parsePath } from "./engine/state"
export { start, chooseOption, tick, handleMessage, makeInitialSession, evalExpr } from "./engine/interpreter"

// ── DOM bootstrap ─────────────────────────────────────────────────────────

function render(root: HTMLElement, doc: GameDocument | null, session: SessionState | null, log: NarratorEvent[]): void {
  root.textContent = ""
  const title = document.createElement("h1")
  title.textContent = doc?.header.title ?? "Game Maker"
  root.appendChild(title)

  if (!doc) {
    const p = document.createElement("p")
    p.textContent = "Load a .game document to begin."
    root.appendChild(p)
    return
  }

  const meta = document.createElement("p")
  meta.className = "meta"
  meta.textContent = `by ${doc.header.author} · v${doc.header.version} · mode: ${doc.header.mode}`
  root.appendChild(meta)

  const state = document.createElement("p")
  state.className = "state"
  state.textContent = `Phase: ${session?.phase ?? "(none)"} · Clock: ${session?.clock ?? 0}${session?.ended ? ` · Ended: ${session.outcome}` : ""}`
  root.appendChild(state)

  const logEl = document.createElement("div")
  logEl.className = "log"
  for (const ev of log) {
    const line = document.createElement("div")
    line.className = `log-entry log-${ev.kind}`
    line.textContent = describeEvent(ev)
    logEl.appendChild(line)
  }
  root.appendChild(logEl)
}

function describeEvent(ev: NarratorEvent): string {
  switch (ev.kind) {
    case "say": return ev.text
    case "whisper": return `(whisper to ${ev.target}) ${ev.text}`
    case "ask": return `(ask ${ev.target}) ${ev.prompt}`
    case "roll_transcript": return ev.text
    case "phase_entered": return `— phase: ${ev.phase} —`
    case "ended": return `=== ended: ${ev.outcome} ===`
    case "option_presented": return `• ${ev.label}`
    case "error": return `[error] ${ev.message}`
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("game-maker-root")
    if (!root) return
    render(root, null, null, [])
    // Expose tiny test hook so a shell can push a .game document in during dev.
    ;(window as unknown as { __gameMakerLoad?: (src: string, seed?: number) => void }).__gameMakerLoad =
      (src: string, seed = 1) => {
        const doc = parseGameDocument(src)
        const rng = makeRng(seed)
        const { next, events } = start(doc, rng)
        const log = [...events]
        render(root, doc, next, log)
      }
  })
}

// Silence unused-import warnings for re-exported surface when DOM is absent.
void chooseOption; void handleMessage; void tick
