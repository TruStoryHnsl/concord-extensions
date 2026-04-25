import { describe, expect, it } from "vitest"
import { handleClick } from "../ui/controller"
import * as chess from "../engine/chess/rules"
import * as checkers from "../engine/checkers/rules"
import type { GameState } from "../engine/types"

function startState(game: "chess" | "checkers"): GameState {
  return game === "chess" ? chess.makeInitial() : checkers.makeInitial()
}

describe("controller — chess starting position", () => {
  it("clicking a friendly piece selects it and returns highlights", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: null,
      click: { file: 4, rank: 1 }, // e2 pawn
      asColor: "white",
    })
    expect(out.selected).toEqual({ file: 4, rank: 1 })
    expect(out.highlights.length).toBeGreaterThan(0)
    expect(out.propose).toBeNull()
  })

  it("clicking an enemy piece while nothing is selected does nothing", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: null,
      click: { file: 4, rank: 6 }, // e7 black pawn
      asColor: "white",
    })
    expect(out.selected).toBeNull()
    expect(out.propose).toBeNull()
  })

  it("selecting then clicking a legal target proposes the move", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: { file: 4, rank: 1 },
      click: { file: 4, rank: 3 }, // e2-e4
      asColor: "white",
    })
    expect(out.propose).toBeTruthy()
    expect(out.propose?.from).toEqual({ file: 4, rank: 1 })
    expect(out.propose?.to).toEqual({ file: 4, rank: 3 })
    expect(out.selected).toBeNull()
  })

  it("selecting then clicking an empty non-target cancels", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: { file: 4, rank: 1 },
      click: { file: 0, rank: 4 }, // off-target empty square
      asColor: "white",
    })
    expect(out.propose).toBeNull()
    expect(out.selected).toBeNull()
  })

  it("selecting then clicking another friendly piece switches selection", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: { file: 4, rank: 1 }, // e2
      click: { file: 3, rank: 1 }, // d2
      asColor: "white",
    })
    expect(out.propose).toBeNull()
    expect(out.selected).toEqual({ file: 3, rank: 1 })
    expect(out.highlights.length).toBeGreaterThan(0)
  })

  it("read-only viewer (asColor === null) ignores all clicks", () => {
    const state = startState("chess")
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: null,
      click: { file: 4, rank: 1 },
      asColor: null,
    })
    expect(out.selected).toBeNull()
    expect(out.highlights).toEqual([])
    expect(out.propose).toBeNull()
  })

  it("out-of-turn participant ignores clicks", () => {
    const state = startState("chess")
    // It's white's turn; black participant tries to move.
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: null,
      click: { file: 4, rank: 6 },
      asColor: "black",
    })
    expect(out.propose).toBeNull()
    expect(out.selected).toBeNull()
  })

  it("ignores clicks when the game is over", () => {
    const state: GameState = {
      ...startState("chess"),
      status: "checkmate",
      winner: "white",
    }
    const out = handleClick({
      state,
      legalMoves: chess.legalMoves,
      selected: null,
      click: { file: 4, rank: 1 },
      asColor: "white",
    })
    expect(out.propose).toBeNull()
  })
})

describe("controller — checkers", () => {
  it("selects a man with legal forward move", () => {
    const state = startState("checkers")
    // White men live on rank 2 (rows 0-2 dark squares). Pick a piece
    // with at least one move.
    const movesByPiece = chess.legalMoves // unused; we rely on checkers.legalMoves
    void movesByPiece
    let from: { file: number; rank: number } | null = null
    outer: for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = state.board[r][f]
        if (p && p.color === "white") {
          const m = checkers.legalMoves(state, { file: f, rank: r })
          if (m.length > 0) {
            from = { file: f, rank: r }
            break outer
          }
        }
      }
    }
    expect(from).not.toBeNull()
    const out = handleClick({
      state,
      legalMoves: checkers.legalMoves,
      selected: null,
      click: from!,
      asColor: "white",
    })
    expect(out.selected).toEqual(from)
    expect(out.highlights.length).toBeGreaterThan(0)
  })
})
