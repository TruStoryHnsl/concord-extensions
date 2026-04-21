/**
 * Chess rules — pure legal-move generation + apply.
 *
 * Targets FIDE rules: sliding pieces, knights, castling (both sides),
 * en passant, promotion, check/checkmate/stalemate, 50-move draw,
 * insufficient material. Threefold repetition is not included in the v1
 * terminal check (not needed for perft / bot search).
 *
 * The perft suite in __tests__/chess-rules.test.ts asserts depth-3 nodes
 * from the starting position match 8902 (the canonical perft value).
 */

import {
  Board, Color, GameState, GameStatus, Move, Piece, Square,
  cloneBoard, inBounds, opposite, sameSquare,
} from "../types"

// Piece kinds: K Q R B N P

export function makeInitial(): GameState {
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null))
  const backRank: string[] = ["R", "N", "B", "Q", "K", "B", "N", "R"]
  for (let f = 0; f < 8; f++) {
    board[0][f] = { color: "white", kind: backRank[f], hasMoved: false }
    board[1][f] = { color: "white", kind: "P", hasMoved: false }
    board[6][f] = { color: "black", kind: "P", hasMoved: false }
    board[7][f] = { color: "black", kind: backRank[f], hasMoved: false }
  }
  return {
    board,
    toMove: "white",
    history: [],
    status: "playing",
    winner: null,
    halfmoveClock: 0,
    epTarget: null,
    castling: "KQkq",
    fullmove: 1,
  }
}

export function pieceAt(board: Board, sq: Square): Piece | null {
  if (!inBounds(sq)) return null
  return board[sq.rank][sq.file]
}

// ─── Pseudo-legal generation ──────────────────────────────────────────────

export function pseudoMoves(state: GameState, color: Color): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f]
      if (!p || p.color !== color) continue
      movesForPiece(state, p, { file: f, rank: r }, moves)
    }
  }
  return moves
}

function movesForPiece(state: GameState, p: Piece, from: Square, out: Move[]): void {
  switch (p.kind) {
    case "P": return pawnMoves(state, p, from, out)
    case "N": return knightMoves(state, p, from, out)
    case "B": return slideMoves(state, p, from, out, [[1, 1], [1, -1], [-1, 1], [-1, -1]])
    case "R": return slideMoves(state, p, from, out, [[1, 0], [-1, 0], [0, 1], [0, -1]])
    case "Q": return slideMoves(state, p, from, out, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])
    case "K": return kingMoves(state, p, from, out)
  }
}

function pawnMoves(state: GameState, p: Piece, from: Square, out: Move[]): void {
  const dir = p.color === "white" ? 1 : -1
  const startRank = p.color === "white" ? 1 : 6
  const promoRank = p.color === "white" ? 7 : 0
  const one: Square = { file: from.file, rank: from.rank + dir }
  if (inBounds(one) && !pieceAt(state.board, one)) {
    pushPawn(from, one, promoRank, out)
    const two: Square = { file: from.file, rank: from.rank + 2 * dir }
    if (from.rank === startRank && !pieceAt(state.board, two)) {
      out.push({ from, to: two })
    }
  }
  for (const df of [-1, 1]) {
    const cap: Square = { file: from.file + df, rank: from.rank + dir }
    if (!inBounds(cap)) continue
    const target = pieceAt(state.board, cap)
    if (target && target.color !== p.color) {
      pushPawn(from, cap, promoRank, out)
    }
    if (state.epTarget && sameSquare(state.epTarget, cap)) {
      out.push({ from, to: cap, enPassant: true, capture: { file: cap.file, rank: from.rank } })
    }
  }
}

function pushPawn(from: Square, to: Square, promoRank: number, out: Move[]): void {
  if (to.rank === promoRank) {
    for (const promo of ["Q", "R", "B", "N"]) out.push({ from, to, promotion: promo })
  } else {
    out.push({ from, to })
  }
}

function knightMoves(state: GameState, p: Piece, from: Square, out: Move[]): void {
  const offsets = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]
  for (const [df, dr] of offsets) {
    const to = { file: from.file + df, rank: from.rank + dr }
    if (!inBounds(to)) continue
    const t = pieceAt(state.board, to)
    if (!t || t.color !== p.color) out.push({ from, to })
  }
}

function slideMoves(state: GameState, p: Piece, from: Square, out: Move[], dirs: number[][]): void {
  for (const [df, dr] of dirs) {
    let f = from.file + df
    let r = from.rank + dr
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const to = { file: f, rank: r }
      const t = pieceAt(state.board, to)
      if (!t) {
        out.push({ from, to })
      } else {
        if (t.color !== p.color) out.push({ from, to })
        break
      }
      f += df; r += dr
    }
  }
}

function kingMoves(state: GameState, p: Piece, from: Square, out: Move[]): void {
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      if (df === 0 && dr === 0) continue
      const to = { file: from.file + df, rank: from.rank + dr }
      if (!inBounds(to)) continue
      const t = pieceAt(state.board, to)
      if (!t || t.color !== p.color) out.push({ from, to })
    }
  }
  // Castling: only generate the pseudo-move here; legality filter verifies
  // the king doesn't pass through or end in check.
  const rank = p.color === "white" ? 0 : 7
  if (from.rank !== rank || from.file !== 4 || p.hasMoved) return
  const canKingSide = state.castling.includes(p.color === "white" ? "K" : "k")
  const canQueenSide = state.castling.includes(p.color === "white" ? "Q" : "q")
  if (canKingSide) {
    const f5 = pieceAt(state.board, { file: 5, rank })
    const f6 = pieceAt(state.board, { file: 6, rank })
    const rook = pieceAt(state.board, { file: 7, rank })
    if (!f5 && !f6 && rook && rook.kind === "R" && rook.color === p.color && !rook.hasMoved) {
      out.push({ from, to: { file: 6, rank }, castleRookFile: 7 })
    }
  }
  if (canQueenSide) {
    const b = pieceAt(state.board, { file: 1, rank })
    const c = pieceAt(state.board, { file: 2, rank })
    const d = pieceAt(state.board, { file: 3, rank })
    const rook = pieceAt(state.board, { file: 0, rank })
    if (!b && !c && !d && rook && rook.kind === "R" && rook.color === p.color && !rook.hasMoved) {
      out.push({ from, to: { file: 2, rank }, castleRookFile: 0 })
    }
  }
}

// ─── Attack check ─────────────────────────────────────────────────────────

export function isSquareAttacked(board: Board, target: Square, by: Color): boolean {
  // Pawn attacks
  const pdir = by === "white" ? 1 : -1
  for (const df of [-1, 1]) {
    const from = { file: target.file - df, rank: target.rank - pdir }
    const p = pieceAt(board, from)
    if (p && p.color === by && p.kind === "P") return true
  }
  // Knight
  for (const [df, dr] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
    const from = { file: target.file - df, rank: target.rank - dr }
    const p = pieceAt(board, from)
    if (p && p.color === by && p.kind === "N") return true
  }
  // King
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      if (df === 0 && dr === 0) continue
      const from = { file: target.file + df, rank: target.rank + dr }
      const p = pieceAt(board, from)
      if (p && p.color === by && p.kind === "K") return true
    }
  }
  // Sliding pieces
  const straight: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const diag: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  for (const [df, dr] of straight) {
    if (slideHit(board, target, df, dr, by, ["R", "Q"])) return true
  }
  for (const [df, dr] of diag) {
    if (slideHit(board, target, df, dr, by, ["B", "Q"])) return true
  }
  return false
}

function slideHit(board: Board, from: Square, df: number, dr: number, by: Color, kinds: string[]): boolean {
  let f = from.file + df
  let r = from.rank + dr
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    const p = board[r][f]
    if (p) {
      return p.color === by && kinds.includes(p.kind)
    }
    f += df; r += dr
  }
  return false
}

function findKing(board: Board, color: Color): Square | null {
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f]
    if (p && p.color === color && p.kind === "K") return { file: f, rank: r }
  }
  return null
}

export function isInCheck(state: GameState, color: Color): boolean {
  const king = findKing(state.board, color)
  if (!king) return false
  return isSquareAttacked(state.board, king, opposite(color))
}

// ─── Legal filter + apply ─────────────────────────────────────────────────

export function legalMoves(state: GameState, from?: Square): Move[] {
  const pseudos = pseudoMoves(state, state.toMove)
  const filtered = pseudos.filter((m) => {
    if (from && !sameSquare(m.from, from)) return false
    // Castling path squares must not be under attack, and king must not be in check before.
    if (m.castleRookFile !== undefined) {
      const king = findKing(state.board, state.toMove)
      if (!king) return false
      if (isInCheck(state, state.toMove)) return false
      const step = m.to.file > m.from.file ? 1 : -1
      for (let f = m.from.file; f !== m.to.file + step; f += step) {
        if (isSquareAttacked(state.board, { file: f, rank: m.from.rank }, opposite(state.toMove))) return false
      }
    }
    const next = applyMoveUnchecked(state, m)
    return !isInCheck(next, state.toMove)
  })
  return filtered
}

export function applyMove(state: GameState, move: Move): GameState {
  const next = applyMoveUnchecked(state, move)
  const status = terminalStatus({ ...next })
  return { ...next, status, winner: status === "checkmate" ? state.toMove : null }
}

function applyMoveUnchecked(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board)
  const mover = board[move.from.rank][move.from.file]
  if (!mover) return state
  const isPawn = mover.kind === "P"
  const isCapture = !!board[move.to.rank][move.to.file] || move.enPassant === true
  board[move.from.rank][move.from.file] = null

  if (move.enPassant && move.capture) {
    board[move.capture.rank][move.capture.file] = null
  }

  const promoted: Piece = move.promotion
    ? { color: mover.color, kind: move.promotion, hasMoved: true }
    : { ...mover, hasMoved: true }
  board[move.to.rank][move.to.file] = promoted

  // Castling: move rook too
  if (move.castleRookFile !== undefined) {
    const rank = move.from.rank
    const rook = board[rank][move.castleRookFile]
    if (rook) {
      board[rank][move.castleRookFile] = null
      const newRookFile = move.castleRookFile === 7 ? 5 : 3
      board[rank][newRookFile] = { ...rook, hasMoved: true }
    }
  }

  // Update castling rights when king or rook moves
  let castling = state.castling
  if (mover.kind === "K") {
    if (mover.color === "white") castling = castling.replace(/[KQ]/g, "")
    else castling = castling.replace(/[kq]/g, "")
  }
  if (mover.kind === "R") {
    if (mover.color === "white" && move.from.rank === 0 && move.from.file === 0) castling = castling.replace("Q", "")
    if (mover.color === "white" && move.from.rank === 0 && move.from.file === 7) castling = castling.replace("K", "")
    if (mover.color === "black" && move.from.rank === 7 && move.from.file === 0) castling = castling.replace("q", "")
    if (mover.color === "black" && move.from.rank === 7 && move.from.file === 7) castling = castling.replace("k", "")
  }
  // Captured rook on its starting square also loses castling
  if (move.to.rank === 0 && move.to.file === 0) castling = castling.replace("Q", "")
  if (move.to.rank === 0 && move.to.file === 7) castling = castling.replace("K", "")
  if (move.to.rank === 7 && move.to.file === 0) castling = castling.replace("q", "")
  if (move.to.rank === 7 && move.to.file === 7) castling = castling.replace("k", "")
  if (castling === "") castling = "-"

  // En-passant target
  let epTarget: Square | null = null
  if (isPawn && Math.abs(move.to.rank - move.from.rank) === 2) {
    epTarget = { file: move.from.file, rank: (move.from.rank + move.to.rank) / 2 }
  }

  const halfmoveClock = (isPawn || isCapture) ? 0 : state.halfmoveClock + 1
  const fullmove = state.toMove === "black" ? state.fullmove + 1 : state.fullmove

  return {
    board,
    toMove: opposite(state.toMove),
    history: [...state.history, move],
    status: "playing",
    winner: null,
    halfmoveClock,
    epTarget,
    castling: castling === "" ? "-" : castling,
    fullmove,
  }
}

// ─── Terminal status ─────────────────────────────────────────────────────

export function terminalStatus(state: GameState): GameStatus {
  if (state.halfmoveClock >= 100) return "draw"
  if (insufficientMaterial(state.board)) return "draw"
  const moves = legalMoves(state)
  if (moves.length === 0) {
    return isInCheck(state, state.toMove) ? "checkmate" : "stalemate"
  }
  return "playing"
}

function insufficientMaterial(board: Board): boolean {
  const pieces: Piece[] = []
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f]
    if (p) pieces.push(p)
  }
  if (pieces.length <= 2) return true // K vs K
  if (pieces.length === 3) {
    const non = pieces.find((p) => p.kind !== "K")
    if (non && (non.kind === "B" || non.kind === "N")) return true
  }
  return false
}

// ─── Perft (for test suite) ──────────────────────────────────────────────

export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1
  let count = 0
  for (const m of legalMoves(state)) {
    const next = applyMoveUnchecked(state, m)
    count += perft(next, depth - 1)
  }
  return count
}
