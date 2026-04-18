import { describe, it, expect } from "vitest"
import {
  makeInitial, legalMoves, applyMove, isInCheck, isSquareAttacked, pieceAt, perft, terminalStatus,
} from "../engine/chess/rules"
import type { Board, GameState, Piece } from "../engine/types"

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null))
}

function baseState(board: Board, toMove: "white" | "black" = "white"): GameState {
  return {
    board, toMove, history: [], status: "playing", winner: null,
    halfmoveClock: 0, epTarget: null, castling: "-", fullmove: 1,
  }
}

describe("chess: starting position", () => {
  it("white has 20 legal moves from starting position", () => {
    const s = makeInitial()
    expect(legalMoves(s).length).toBe(20)
  })
  it("neither side is in check at start", () => {
    const s = makeInitial()
    expect(isInCheck(s, "white")).toBe(false)
    expect(isInCheck(s, "black")).toBe(false)
  })
})

describe("chess: perft", () => {
  it("perft depth 1 from start position = 20", () => {
    expect(perft(makeInitial(), 1)).toBe(20)
  })
  it("perft depth 2 from start position = 400", () => {
    expect(perft(makeInitial(), 2)).toBe(400)
  })
  it("perft depth 3 from start position = 8902 (canonical)", () => {
    expect(perft(makeInitial(), 3)).toBe(8902)
  })
})

describe("chess: pawn rules", () => {
  it("pawn promotes on reaching last rank — produces 4 promotion moves", () => {
    const board = emptyBoard()
    board[6][0] = { color: "white", kind: "P", hasMoved: true }
    board[0][7] = { color: "white", kind: "K" }
    board[7][7] = { color: "black", kind: "K" }
    const s = baseState(board)
    const pushMoves = legalMoves(s).filter((m) => m.from.rank === 6 && m.to.rank === 7)
    expect(pushMoves.length).toBe(4)
    expect(new Set(pushMoves.map((m) => m.promotion))).toEqual(new Set(["Q", "R", "B", "N"]))
  })

  it("en passant capture is available immediately after double-push", () => {
    const s0 = makeInitial()
    // 1. e4  — white pawn e2-e4
    const e4 = legalMoves(s0).find((m) => m.from.file === 4 && m.from.rank === 1 && m.to.rank === 3)!
    const s1 = applyMove(s0, e4)
    // 1... a5 — black non-disruptive
    const a5 = legalMoves(s1).find((m) => m.from.file === 0 && m.from.rank === 6 && m.to.rank === 4)!
    const s2 = applyMove(s1, a5)
    // 2. e5
    const e5 = legalMoves(s2).find((m) => m.from.file === 4 && m.from.rank === 3 && m.to.rank === 4)!
    const s3 = applyMove(s2, e5)
    // 2... d5 — black pawn double-push adjacent to white e5 pawn
    const d5 = legalMoves(s3).find((m) => m.from.file === 3 && m.from.rank === 6 && m.to.rank === 4)!
    const s4 = applyMove(s3, d5)
    expect(s4.epTarget).toEqual({ file: 3, rank: 5 })
    const ep = legalMoves(s4).find((m) => m.enPassant && m.from.file === 4 && m.from.rank === 4 && m.to.file === 3 && m.to.rank === 5)
    expect(ep).toBeDefined()
  })
})

describe("chess: check and mate", () => {
  it("cannot move a pinned piece", () => {
    // White king e1, white bishop on e2, black rook on e8 — bishop pinned.
    const board = emptyBoard()
    board[0][4] = { color: "white", kind: "K" }
    board[1][4] = { color: "white", kind: "B" }
    board[7][4] = { color: "black", kind: "R" }
    board[7][7] = { color: "black", kind: "K" }
    const s = baseState(board)
    const bishopMoves = legalMoves(s).filter((m) => m.from.file === 4 && m.from.rank === 1)
    // Bishop can only move along the e-file — which it can't do diagonally.
    // So zero legal bishop moves.
    expect(bishopMoves.length).toBe(0)
  })

  it("fool's-mate-style position: 1.f3 e5 2.g4 Qh4# — mate detected", () => {
    let s = makeInitial()
    const f3 = legalMoves(s).find((m) => m.from.file === 5 && m.from.rank === 1 && m.to.rank === 2)!
    s = applyMove(s, f3)
    const e5 = legalMoves(s).find((m) => m.from.file === 4 && m.from.rank === 6 && m.to.rank === 4)!
    s = applyMove(s, e5)
    const g4 = legalMoves(s).find((m) => m.from.file === 6 && m.from.rank === 1 && m.to.rank === 3)!
    s = applyMove(s, g4)
    const qh4 = legalMoves(s).find((m) => {
      const p = pieceAt(s.board, m.from)
      return p?.kind === "Q" && m.to.file === 7 && m.to.rank === 3
    })!
    const mated = applyMove(s, qh4)
    expect(mated.status).toBe("checkmate")
    expect(mated.winner).toBe("black")
  })
})

describe("chess: castling", () => {
  it("king-side castling allowed when path clear and not in/through check", () => {
    const board = emptyBoard()
    board[0][4] = { color: "white", kind: "K", hasMoved: false }
    board[0][7] = { color: "white", kind: "R", hasMoved: false }
    board[7][4] = { color: "black", kind: "K" }
    const s: GameState = { ...baseState(board), castling: "K" }
    const castle = legalMoves(s).find((m) => m.castleRookFile === 7)
    expect(castle).toBeDefined()
    expect(castle!.to.file).toBe(6)
  })

  it("castling through an attacked square is illegal", () => {
    const board = emptyBoard()
    board[0][4] = { color: "white", kind: "K", hasMoved: false }
    board[0][7] = { color: "white", kind: "R", hasMoved: false }
    board[5][5] = { color: "black", kind: "R" } // attacks f-file (file 5)
    board[7][4] = { color: "black", kind: "K" }
    const s: GameState = { ...baseState(board), castling: "K" }
    const castle = legalMoves(s).find((m) => m.castleRookFile === 7)
    expect(castle).toBeUndefined()
  })
})

describe("chess: attack detection", () => {
  it("knight attacks L-shaped squares", () => {
    const board = emptyBoard()
    board[3][3] = { color: "white", kind: "N" }
    expect(isSquareAttacked(board, { file: 5, rank: 4 }, "white")).toBe(true)
    expect(isSquareAttacked(board, { file: 3, rank: 5 }, "white")).toBe(false)
  })
  it("rook attacks along file and rank only", () => {
    const board = emptyBoard()
    board[0][0] = { color: "white", kind: "R" }
    expect(isSquareAttacked(board, { file: 0, rank: 7 }, "white")).toBe(true)
    expect(isSquareAttacked(board, { file: 7, rank: 0 }, "white")).toBe(true)
    expect(isSquareAttacked(board, { file: 7, rank: 7 }, "white")).toBe(false)
  })
})

describe("chess: insufficient material draw", () => {
  it("K vs K is a draw", () => {
    const board = emptyBoard()
    board[0][0] = { color: "white", kind: "K" }
    board[7][7] = { color: "black", kind: "K" }
    const s = baseState(board)
    expect(terminalStatus(s)).toBe("draw")
  })
})
