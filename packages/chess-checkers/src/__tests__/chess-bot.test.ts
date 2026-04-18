import { describe, it, expect } from "vitest"
import { chooseMove, evaluate } from "../engine/chess/bot"
import { makeInitial, applyMove, legalMoves, pieceAt } from "../engine/chess/rules"
import type { GameState, Piece, Board } from "../engine/types"

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null))
}

function baseState(board: Board, toMove: "white" | "black" = "white"): GameState {
  return { board, toMove, history: [], status: "playing", winner: null, halfmoveClock: 0, epTarget: null, castling: "-", fullmove: 1 }
}

describe("chess bot: termination + legality", () => {
  it("beginner tier returns a move within a reasonable time", () => {
    const t0 = Date.now()
    const m = chooseMove(makeInitial(), "beginner")
    const elapsed = Date.now() - t0
    expect(m).not.toBeNull()
    expect(elapsed).toBeLessThan(5000)
  })

  it("chosen move is in the legal move list", () => {
    const s = makeInitial()
    const m = chooseMove(s, "beginner")
    expect(m).not.toBeNull()
    const legal = legalMoves(s)
    expect(legal.some((x) => x.from.file === m!.from.file && x.from.rank === m!.from.rank && x.to.file === m!.to.file && x.to.rank === m!.to.rank)).toBe(true)
  })

  it("bot chooses a capture when a free queen is hanging", () => {
    // White to move; black queen undefended on d5; white knight on b3 or c3 can take d5? Put white rook on d1 vs black queen on d5.
    const board = emptyBoard()
    board[0][4] = { color: "white", kind: "K" }
    board[0][3] = { color: "white", kind: "R" }
    board[4][3] = { color: "black", kind: "Q" }
    board[7][4] = { color: "black", kind: "K" }
    const s = baseState(board)
    const m = chooseMove(s, "casual")
    expect(m).not.toBeNull()
    // bot should capture the queen (Rxd5)
    expect(m!.to).toEqual({ file: 3, rank: 4 })
    const capturedFrom = pieceAt(s.board, m!.to)
    expect(capturedFrom?.kind).toBe("Q")
  })
})

describe("chess bot: evaluation", () => {
  it("material advantage flips sign with color", () => {
    const whiteUp = emptyBoard()
    whiteUp[0][4] = { color: "white", kind: "K" }
    whiteUp[0][0] = { color: "white", kind: "Q" }
    whiteUp[7][4] = { color: "black", kind: "K" }
    const a = evaluate(baseState(whiteUp), "beginner")
    const blackUp = emptyBoard()
    blackUp[0][4] = { color: "white", kind: "K" }
    blackUp[7][0] = { color: "black", kind: "Q" }
    blackUp[7][4] = { color: "black", kind: "K" }
    const b = evaluate(baseState(blackUp), "beginner")
    expect(a).toBeGreaterThan(0)
    expect(b).toBeLessThan(0)
  })
})
