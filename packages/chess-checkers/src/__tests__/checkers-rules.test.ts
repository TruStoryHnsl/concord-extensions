import { describe, it, expect } from "vitest"
import { makeInitial, legalMoves, applyMove } from "../engine/checkers/rules"
import type { Board, GameState, Move, Piece } from "../engine/types"

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null))
}

function baseState(board: Board, toMove: "white" | "black" = "white"): GameState {
  return {
    board, toMove, history: [], status: "playing", winner: null,
    halfmoveClock: 0, epTarget: null, castling: "-", fullmove: 1,
    checkersProgress: 0,
  }
}

describe("checkers: starting position", () => {
  it("white has 7 legal forward moves (men on rank 2)", () => {
    const s = makeInitial()
    const moves = legalMoves(s)
    expect(moves.length).toBe(7)
    expect(moves.every((m) => m.from.rank === 2)).toBe(true)
  })
})

describe("checkers: forced captures", () => {
  it("when a capture is available, only captures are returned (FAILS if a plain move sneaks in)", () => {
    const board = emptyBoard()
    board[2][3] = { color: "white", kind: "m" }
    board[3][4] = { color: "black", kind: "m" }
    // landing square (file 5, rank 4) is empty
    const s = baseState(board)
    const moves = legalMoves(s)
    expect(moves.length).toBe(1)
    expect(moves[0].capture).toBeDefined()
    expect(moves[0].to).toEqual({ file: 5, rank: 4 })
    // Assert no non-capture moves slipped in
    expect(moves.every((m) => m.capture !== undefined)).toBe(true)
  })
})

describe("checkers: multi-jump chain collapse", () => {
  it("a two-jump chain collapses into one Move with chain.length === 2", () => {
    const board = emptyBoard()
    board[0][1] = { color: "white", kind: "m" }
    board[1][2] = { color: "black", kind: "m" }
    board[3][4] = { color: "black", kind: "m" }
    // After jumping b2-c3 landing at d4 (empty), d4-e5 jumping e5 pawn lands at f6
    // Actually: (1,2) -> (3,4)? black on (1,2) — white goes from (0,1) capturing (1,2) to land at (2,3)
    // Then (2,3) jumping (3,4) to land at (4,5). Need (4,5) empty → yes.
    const s = baseState(board)
    const moves = legalMoves(s)
    const chain = moves.find((m) => m.chain && m.chain.length === 2)
    expect(chain).toBeDefined()
    expect(chain!.from).toEqual({ file: 1, rank: 0 })
    expect(chain!.to).toEqual({ file: 5, rank: 4 })
  })

  it("applying a multi-jump removes BOTH captured pieces", () => {
    const board = emptyBoard()
    board[0][1] = { color: "white", kind: "m" }
    board[1][2] = { color: "black", kind: "m" }
    board[3][4] = { color: "black", kind: "m" }
    const s = baseState(board)
    const chain = legalMoves(s).find((m) => m.chain && m.chain.length === 2)!
    const next = applyMove(s, chain)
    expect(next.board[1][2]).toBeNull()
    expect(next.board[3][4]).toBeNull()
    expect(next.board[4][5]).not.toBeNull()
    expect(next.board[4][5]!.color).toBe("white")
  })
})

describe("checkers: king promotion", () => {
  it("man reaching last rank becomes king", () => {
    const board = emptyBoard()
    board[6][1] = { color: "white", kind: "m" }
    // no captures available → a simple move
    const s = baseState(board)
    const step = legalMoves(s).find((m) => m.to.rank === 7)!
    const next = applyMove(s, step)
    expect(next.board[7][step.to.file]?.kind).toBe("k")
  })

  it("king moves in both directions", () => {
    const board = emptyBoard()
    board[4][4] = { color: "white", kind: "k" }
    const s = baseState(board)
    const moves = legalMoves(s)
    const dirs = new Set(moves.map((m) => `${Math.sign(m.to.file - m.from.file)},${Math.sign(m.to.rank - m.from.rank)}`))
    expect(dirs.size).toBe(4)
  })
})

describe("checkers: terminal detection", () => {
  it("no moves → opponent wins", () => {
    const board = emptyBoard()
    board[0][0] = { color: "white", kind: "m" }
    board[1][1] = { color: "black", kind: "m" }
    // White has a single piece on (0,0). Forward dirs (1,1) and (-1,1).
    // (1,1) is occupied by black; (-1,1) out of bounds. Black is adjacent
    // so captures possible? White's piece at (0,0) can capture black at (1,1)
    // if (2,2) is empty — it is. So white HAS a move. Let's make white fully stuck:
    board[1][1] = { color: "black", kind: "m" }
    board[2][2] = { color: "black", kind: "m" } // blocks landing for white capture
    // Now white at (0,0): only forward diag (1,1) is occupied-by-enemy, landing (2,2) occupied → no capture
    // and (-1,1) OOB. Zero moves.
    const s = baseState(board)
    expect(legalMoves(s).length).toBe(0)
  })
})
