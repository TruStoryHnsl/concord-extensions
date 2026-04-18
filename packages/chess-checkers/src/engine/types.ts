/**
 * Shared engine types for Chess and Checkers (INS-003).
 *
 * These types are deliberately minimal — each game's rules module layers its
 * own piece kinds on top.
 *
 * @see docs/extensions/specs/chess-checkers.md
 */

export type Color = "white" | "black"

export interface Square {
  /** 0..7 (file a..h in chess). */
  file: number
  /** 0..7 (rank 1..8 in chess; 0 = white's back rank). */
  rank: number
}

export interface Piece {
  color: Color
  /** Game-specific piece kind. Chess: K Q R B N P. Checkers: m (man) k (king). */
  kind: string
  /** Used by rules that track first-move state (castling, pawn double push). */
  hasMoved?: boolean
}

/** 8x8 grid addressed as `board[rank][file]`. */
export type Board = (Piece | null)[][]

export interface Move {
  from: Square
  to: Square
  /** Chess promotion piece kind (Q|R|B|N). */
  promotion?: string
  /** Square of the piece captured (used by chess en passant and checkers jumps). */
  capture?: Square
  /** Checkers multi-jump chain. If present, the full sequence MUST be executed. */
  chain?: Move[]
  /** Chess castling: king's rook file (0 for queenside, 7 for kingside). */
  castleRookFile?: number
  /** For chess: whether the move was an en-passant capture. */
  enPassant?: boolean
}

export type GameStatus = "playing" | "checkmate" | "stalemate" | "draw" | "resigned"

export interface GameState {
  board: Board
  toMove: Color
  history: Move[]
  status: GameStatus
  winner: Color | null
  /** Chess half-move clock for 50-move rule. Checkers uses its own progress counter. */
  halfmoveClock: number
  /** Chess en-passant target square, set the turn after a double-pawn push. */
  epTarget: Square | null
  /** Castling rights snapshot — `"KQkq"` at start. */
  castling: string
  /** Full-move number (increments after black's move in chess). */
  fullmove: number
  /** Checkers: turns since last capture OR promotion. Used for the 40-turn draw rule. */
  checkersProgress?: number
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

export function inBounds(s: Square): boolean {
  return s.file >= 0 && s.file < 8 && s.rank >= 0 && s.rank < 8
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice())
}

export function opposite(c: Color): Color {
  return c === "white" ? "black" : "white"
}
