/**
 * Pure input router for chess-checkers boards.
 *
 * Takes raw click `{file,rank}` events and the current game state and
 * returns a small descriptor describing the new selection state and any
 * proposed move. The renderer is responsible for re-rendering with the
 * new highlight set; the host is responsible for calling rules.applyMove
 * if `propose` is set.
 *
 * All logic here is pure — no DOM access, no side effects. Tests cover
 * the state machine in isolation.
 *
 * Spec ref: docs/extensions/specs/chess-checkers.md §7.
 */

import type { GameState, Move, Square } from "../engine/types"

export interface ControllerInput {
  /** Current game state. */
  state: GameState
  /** Pure rules function returning legal moves filtered by `from` square. */
  legalMoves: (state: GameState, from?: Square) => Move[]
  /** Currently-selected square, if any. */
  selected: Square | null
  /** The square the user just clicked. */
  click: Square
  /** The active player's color, if the input belongs to a participant. If
   * null the click is read-only (display / observer / spectator). */
  asColor: "white" | "black" | null
}

export interface ControllerOutput {
  /** New selected square (may be null to clear selection). */
  selected: Square | null
  /** Legal target squares to highlight on the board. */
  highlights: Square[]
  /** If set, a legal move was proposed and the host should apply it. */
  propose: Move | null
}

/**
 * Compute the next selection / highlight state and any proposed move
 * from a click. Pure.
 *
 * State machine:
 *   1. If the click is on a friendly piece with legal moves -> select it
 *      and return its legal targets as highlights.
 *   2. If a piece is already selected and the click matches one of its
 *      legal-move target squares -> propose that move and clear selection.
 *   3. If a piece is selected and the click is elsewhere -> clear
 *      selection (effectively cancel).
 *   4. If the click hits an empty / opponent square with no selection ->
 *      no-op.
 *
 * If the local viewer is not a participant (`asColor === null`) or it's
 * not their color's turn, every click is a no-op.
 */
export function handleClick(input: ControllerInput): ControllerOutput {
  const { state, click, selected, asColor, legalMoves } = input

  // Read-only viewers and out-of-turn participants can't click anything.
  if (asColor === null) return { selected: null, highlights: [], propose: null }
  if (state.toMove !== asColor) {
    return { selected: null, highlights: [], propose: null }
  }
  if (state.status !== "playing") {
    return { selected: null, highlights: [], propose: null }
  }

  const piece = state.board[click.rank]?.[click.file] ?? null

  // Case 2: a piece is already selected — is the click a legal target?
  if (selected) {
    const moves = legalMoves(state, selected)
    const hit = moves.find((m) => m.to.file === click.file && m.to.rank === click.rank)
    if (hit) {
      return { selected: null, highlights: [], propose: hit }
    }
    // Case 1 (re-select): clicking on a different friendly piece moves
    // the selection over to that piece instead of cancelling.
    if (piece && piece.color === asColor) {
      const next = legalMoves(state, click)
      if (next.length > 0) {
        return {
          selected: click,
          highlights: next.map((m) => m.to),
          propose: null,
        }
      }
    }
    // Case 3: cancel selection.
    return { selected: null, highlights: [], propose: null }
  }

  // Case 1 (initial select): friendly piece with legal moves available.
  if (piece && piece.color === asColor) {
    const next = legalMoves(state, click)
    if (next.length > 0) {
      return {
        selected: click,
        highlights: next.map((m) => m.to),
        propose: null,
      }
    }
  }

  // Case 4: empty / opponent / no-legal-moves square with no current
  // selection.
  return { selected: null, highlights: [], propose: null }
}
