/**
 * Chess & Checkers extension — minimal DOM bootstrap.
 *
 * Real Concord SDK integration (postMessage bridge, seat changes, state
 * events) is a Phase 1 concern in the main Concord repo. The engine + UI
 * modules here are fully pure and test-covered.
 *
 * @see docs/extensions/specs/chess-checkers.md
 */

export * from "./engine/types"
export * as chessRules from "./engine/chess/rules"
export * as chessBot from "./engine/chess/bot"
export * as checkersRules from "./engine/checkers/rules"
export * as checkersBot from "./engine/checkers/bot"
export { renderBoard } from "./ui/board"
export * from "./session/pairing"
export * from "./session/game-selector"

import * as chess from "./engine/chess/rules"
import { renderBoard } from "./ui/board"

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("chess-checkers-root")
    if (!root) return
    const state = chess.makeInitial()
    const title = document.createElement("h1")
    title.textContent = "Chess & Checkers"
    root.appendChild(title)
    root.appendChild(renderBoard(state.board))
  })
}
