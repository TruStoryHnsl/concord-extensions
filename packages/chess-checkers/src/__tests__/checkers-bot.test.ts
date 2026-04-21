import { describe, it, expect } from "vitest"
import { chooseMove } from "../engine/checkers/bot"
import { makeInitial, legalMoves } from "../engine/checkers/rules"

describe("checkers bot", () => {
  it("beginner tier returns a legal move from the starting position", () => {
    const s = makeInitial()
    const m = chooseMove(s, "beginner")
    expect(m).not.toBeNull()
    const legal = legalMoves(s)
    expect(legal.some((x) => x.from.file === m!.from.file && x.from.rank === m!.from.rank && x.to.file === m!.to.file && x.to.rank === m!.to.rank)).toBe(true)
  })

  it("casual tier finishes in a reasonable time", () => {
    const s = makeInitial()
    const t0 = Date.now()
    chooseMove(s, "casual")
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(10_000)
  })
})
