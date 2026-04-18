/**
 * Checkers rules (American / English draughts).
 *
 * Key rules encoded:
 * - Forced captures: if ANY capture is available, ALL returned moves are captures.
 * - Men (kind "m") move diagonally forward only; kings (kind "k") both directions.
 * - Multi-jumps collapse into one Move with `chain` listing intermediate jumps.
 * - Promotion to king when a man reaches the opponent's back rank. A man that
 *   promotes mid-chain stops (cannot continue jumping as a king in the same turn).
 * - 40-turn no-progress draw: 40 half-moves with no captures and no king promotions.
 *
 * @see docs/extensions/specs/chess-checkers.md section 4
 */

import {
  Board, Color, GameState, GameStatus, Move, Piece, Square,
  cloneBoard, inBounds, opposite, sameSquare,
} from "../types"

const MEN_DIRS: Record<Color, [number, number][]> = {
  white: [[1, 1], [-1, 1]],   // white moves up (rank+1)
  black: [[1, -1], [-1, -1]], // black moves down (rank-1)
}
const KING_DIRS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]]

export function makeInitial(): GameState {
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null))
  // Standard: white on ranks 0-2 on dark squares, black on ranks 5-7.
  // Dark squares: (file+rank) odd.
  for (let r = 0; r < 3; r++) {
    for (let f = 0; f < 8; f++) {
      if ((f + r) % 2 === 1) board[r][f] = { color: "white", kind: "m" }
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if ((f + r) % 2 === 1) board[r][f] = { color: "black", kind: "m" }
    }
  }
  return {
    board,
    toMove: "white",
    history: [],
    status: "playing",
    winner: null,
    halfmoveClock: 0,
    epTarget: null,
    castling: "-",
    fullmove: 1,
    checkersProgress: 0,
  }
}

function dirsFor(p: Piece): [number, number][] {
  return p.kind === "k" ? KING_DIRS : MEN_DIRS[p.color]
}

export function legalMoves(state: GameState, from?: Square): Move[] {
  const captures: Move[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f]
      if (!p || p.color !== state.toMove) continue
      if (from && !sameSquare(from, { file: f, rank: r })) continue
      for (const chain of findCaptureChains(state.board, p, { file: f, rank: r })) {
        // Collapse the chain into a single Move: `from`, final `to`,
        // `chain` containing the whole sequence for replay, `capture` the
        // first captured square (convenience).
        const first = chain[0]
        const last = chain[chain.length - 1]
        captures.push({
          from: first.from,
          to: last.to,
          chain: chain.length > 1 ? chain : undefined,
          capture: first.capture,
        })
      }
    }
  }
  if (captures.length > 0) return captures

  const simples: Move[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f]
      if (!p || p.color !== state.toMove) continue
      if (from && !sameSquare(from, { file: f, rank: r })) continue
      for (const [df, dr] of dirsFor(p)) {
        const to = { file: f + df, rank: r + dr }
        if (!inBounds(to)) continue
        if (state.board[to.rank][to.file] === null) {
          simples.push({ from: { file: f, rank: r }, to })
        }
      }
    }
  }
  return simples
}

/** Find every maximal jump chain starting from `from`. Each returned chain is
 *  a list of 1+ single-hop Move structures (no nested `chain`). */
function findCaptureChains(board: Board, piece: Piece, from: Square): Move[][] {
  const chains: Move[][] = []
  walk(board, piece, from, [], false)
  return chains

  function walk(b: Board, p: Piece, pos: Square, path: Move[], promoted: boolean): void {
    const dirs = p.kind === "k" ? KING_DIRS : MEN_DIRS[p.color]
    let extended = false
    for (const [df, dr] of dirs) {
      const mid = { file: pos.file + df, rank: pos.rank + dr }
      const end = { file: pos.file + 2 * df, rank: pos.rank + 2 * dr }
      if (!inBounds(mid) || !inBounds(end)) continue
      const midP = b[mid.rank][mid.file]
      const endP = b[end.rank][end.file]
      if (!midP || midP.color === p.color || endP) continue
      // Disallow re-jumping a piece we already captured this chain.
      if (path.some((m) => m.capture && sameSquare(m.capture, mid))) continue
      const nextB = cloneBoard(b)
      nextB[pos.rank][pos.file] = null
      nextB[mid.rank][mid.file] = null
      // Promotion mid-chain: if a man reaches the back rank, it stops.
      const manPromotes = p.kind === "m" && ((p.color === "white" && end.rank === 7) || (p.color === "black" && end.rank === 0))
      const steppedPiece: Piece = manPromotes ? { ...p, kind: "k" } : p
      nextB[end.rank][end.file] = steppedPiece
      const newMove: Move = { from: pos, to: end, capture: mid }
      const newPath = [...path, newMove]
      extended = true
      if (manPromotes) {
        chains.push(newPath)
      } else {
        // Recurse from the landing square; if no further jump is possible, record.
        const before = chains.length
        walk(nextB, steppedPiece, end, newPath, promoted || manPromotes)
        const after = chains.length
        if (after === before) chains.push(newPath)
      }
    }
    if (!extended && path.length > 0 && chains[chains.length - 1] !== path) {
      // terminal: caller will record via the `before === after` check
    }
  }
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board)
  const mover = board[move.from.rank][move.from.file]
  if (!mover) return state
  let capturesCount = 0
  let promoted = false
  const steps: Move[] = move.chain ?? [move]
  let currentPiece: Piece = { ...mover }
  let lastTo = move.from
  for (const step of steps) {
    board[step.from.rank][step.from.file] = null
    if (step.capture) {
      board[step.capture.rank][step.capture.file] = null
      capturesCount++
    }
    const promotes =
      currentPiece.kind === "m" &&
      ((currentPiece.color === "white" && step.to.rank === 7) || (currentPiece.color === "black" && step.to.rank === 0))
    if (promotes) {
      currentPiece = { ...currentPiece, kind: "k" }
      promoted = true
    }
    board[step.to.rank][step.to.file] = currentPiece
    lastTo = step.to
  }
  void lastTo
  const checkersProgress = capturesCount > 0 || promoted ? 0 : (state.checkersProgress ?? 0) + 1
  const toMove = opposite(state.toMove)
  const next: GameState = {
    ...state,
    board,
    toMove,
    history: [...state.history, move],
    fullmove: state.toMove === "black" ? state.fullmove + 1 : state.fullmove,
    checkersProgress,
  }
  const status = terminalStatus(next)
  const winner = status === "checkmate" ? state.toMove : null
  return { ...next, status, winner }
}

export function terminalStatus(state: GameState): GameStatus {
  if ((state.checkersProgress ?? 0) >= 40) return "draw"
  const moves = legalMoves(state)
  if (moves.length === 0) {
    // No moves → opponent wins (checkmate-style — called so for consistency
    // with chess; in checkers it's "loss by no moves").
    return "checkmate"
  }
  return "playing"
}
