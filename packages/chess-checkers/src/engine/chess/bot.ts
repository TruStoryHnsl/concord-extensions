/**
 * Chess bot — minimax + alpha-beta pruning. Tiered depth.
 *
 * Evaluation weight:
 * - Material (all tiers).
 * - Mobility (casual+).
 * - King safety (advanced+): penalize own king in check.
 *
 * `chooseMove` is a pure function — given the same state + tier it returns
 * a deterministic move (ties broken by move-index order).
 */

import type { Color, GameState, Move } from "../types"
import { applyMove, isInCheck, legalMoves } from "./rules"

export type Tier = "beginner" | "casual" | "advanced" | "expert"

const DEPTH: Record<Tier, number> = {
  beginner: 2,
  casual: 4,
  advanced: 6,
  expert: 6, // iterative deepening with time cap would go here; keep 6 for v1
}

const PIECE_VALUE: Record<string, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
}

export function evaluate(state: GameState, tier: Tier): number {
  // Positive = good for white; negated at caller level when black to move.
  let score = 0
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = state.board[r][f]
    if (!p) continue
    const v = PIECE_VALUE[p.kind] ?? 0
    score += p.color === "white" ? v : -v
  }
  if (tier !== "beginner") {
    const whiteMoves = state.toMove === "white" ? legalMoves(state).length : countMovesFor(state, "white")
    const blackMoves = state.toMove === "black" ? legalMoves(state).length : countMovesFor(state, "black")
    score += 5 * (whiteMoves - blackMoves)
  }
  if (tier === "advanced" || tier === "expert") {
    if (isInCheck(state, "white")) score -= 50
    if (isInCheck(state, "black")) score += 50
  }
  return score
}

function countMovesFor(state: GameState, color: Color): number {
  if (state.toMove === color) return legalMoves(state).length
  // Cheaply approximate by temporarily flipping toMove — pure state so safe.
  const flipped: GameState = { ...state, toMove: color }
  return legalMoves(flipped).length
}

export function chooseMove(state: GameState, tier: Tier): Move | null {
  const moves = legalMoves(state)
  if (moves.length === 0) return null
  const maximise = state.toMove === "white"
  let bestScore = maximise ? -Infinity : Infinity
  let best: Move | null = moves[0]
  const depth = DEPTH[tier]
  for (const m of moves) {
    const next = applyMove(state, m)
    const score = minimax(next, depth - 1, -Infinity, Infinity, !maximise, tier)
    if (maximise ? score > bestScore : score < bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}

function minimax(state: GameState, depth: number, alpha: number, beta: number, maximise: boolean, tier: Tier): number {
  if (depth === 0 || state.status !== "playing") return evaluate(state, tier)
  const moves = legalMoves(state)
  if (moves.length === 0) {
    // Terminal: checkmate is catastrophic for side-to-move, stalemate is 0.
    if (isInCheck(state, state.toMove)) {
      return state.toMove === "white" ? -99999 - depth : 99999 + depth
    }
    return 0
  }
  if (maximise) {
    let value = -Infinity
    for (const m of moves) {
      const next = applyMove(state, m)
      value = Math.max(value, minimax(next, depth - 1, alpha, beta, false, tier))
      alpha = Math.max(alpha, value)
      if (alpha >= beta) break
    }
    return value
  } else {
    let value = Infinity
    for (const m of moves) {
      const next = applyMove(state, m)
      value = Math.min(value, minimax(next, depth - 1, alpha, beta, true, tier))
      beta = Math.min(beta, value)
      if (alpha >= beta) break
    }
    return value
  }
}
