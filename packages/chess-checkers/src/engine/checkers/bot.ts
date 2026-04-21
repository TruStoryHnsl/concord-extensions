/**
 * Checkers bot — minimax + alpha-beta pruning.
 *
 * Evaluation weights material (kings worth more), mobility, and a small
 * back-rank bonus for the advanced+ tiers.
 */

import type { GameState, Move } from "../types"
import { applyMove, legalMoves } from "./rules"

export type Tier = "beginner" | "casual" | "advanced" | "expert"

const DEPTH: Record<Tier, number> = {
  beginner: 2,
  casual: 4,
  advanced: 6,
  expert: 8,
}

export function evaluate(state: GameState, tier: Tier): number {
  let score = 0
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = state.board[r][f]
    if (!p) continue
    const v = p.kind === "k" ? 300 : 100
    score += p.color === "white" ? v : -v
    if (tier === "advanced" || tier === "expert") {
      if (p.kind === "m" && ((p.color === "white" && r === 0) || (p.color === "black" && r === 7))) {
        score += p.color === "white" ? 10 : -10 // back-rank man protects promotion file
      }
    }
  }
  if (tier !== "beginner") {
    const my = legalMoves(state).length
    const opp = legalMoves({ ...state, toMove: state.toMove === "white" ? "black" : "white" }).length
    const sign = state.toMove === "white" ? 1 : -1
    score += sign * (my - opp) * 2
  }
  return score
}

export function chooseMove(state: GameState, tier: Tier): Move | null {
  const moves = legalMoves(state)
  if (moves.length === 0) return null
  const maximise = state.toMove === "white"
  let bestScore = maximise ? -Infinity : Infinity
  let best: Move = moves[0]
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
    return state.toMove === "white" ? -99999 : 99999
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
