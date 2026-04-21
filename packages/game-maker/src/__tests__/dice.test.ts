import { describe, it, expect } from "vitest"
import { makeRng, rollDie, rollDice, describeRoll } from "../engine/dice"
import type { DiceExpr } from "../types"

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it("diverges for different seeds", () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect([a(), a()]).not.toEqual([b(), b()])
  })

  it("produces values in [0, 1)", () => {
    const r = makeRng(7)
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe("rollDie", () => {
  it("produces values in [1, N]", () => {
    const r = makeRng(99)
    for (let i = 0; i < 200; i++) {
      const v = rollDie(6, r)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })

  it("rejects sides < 2", () => {
    const r = makeRng(1)
    expect(() => rollDie(1, r)).toThrow()
  })
})

describe("rollDice", () => {
  it("d20 with no modifier returns kept.length=1 total in [1,20]", () => {
    const r = makeRng(42)
    const d: DiceExpr = { count: 1, sides: 20 }
    const result = rollDice(d, 0, r)
    expect(result.kept.length).toBe(1)
    expect(result.total).toBe(result.kept[0])
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.total).toBeLessThanOrEqual(20)
  })

  it("3d6 with modifier 5 sums three faces plus 5", () => {
    const r = makeRng(3)
    const d: DiceExpr = { count: 3, sides: 6 }
    const result = rollDice(d, 5, r)
    expect(result.kept.length).toBe(3)
    expect(result.total).toBe(result.kept.reduce((a, b) => a + b, 0) + 5)
  })

  it("4d6 keep highest 3 drops the lowest face", () => {
    const r = makeRng(12345)
    const d: DiceExpr = { count: 4, sides: 6, keep: { mode: "highest", count: 3 } }
    const result = rollDice(d, 0, r)
    expect(result.kept.length).toBe(3)
    expect(result.dropped.length).toBe(1)
    // All dropped values must be <= all kept values
    for (const dr of result.dropped) {
      for (const kv of result.kept) {
        expect(dr).toBeLessThanOrEqual(kv)
      }
    }
  })

  it("2d20 keep lowest 1 picks the smaller face (disadvantage)", () => {
    const r = makeRng(555)
    const d: DiceExpr = { count: 2, sides: 20, keep: { mode: "lowest", count: 1 } }
    const result = rollDice(d, 0, r)
    expect(result.kept.length).toBe(1)
    expect(result.dropped.length).toBe(1)
    expect(result.kept[0]).toBeLessThanOrEqual(result.dropped[0])
  })

  it("is reproducible across calls with the same seed", () => {
    const d: DiceExpr = { count: 3, sides: 8 }
    const r1 = makeRng(777)
    const r2 = makeRng(777)
    expect(rollDice(d, 0, r1).kept).toEqual(rollDice(d, 0, r2).kept)
  })
})

describe("describeRoll", () => {
  it("renders a transcript line like `rolls d20 (15) = 15`", () => {
    const d: DiceExpr = { count: 1, sides: 20 }
    const result = { kept: [15], dropped: [], modifier: 0, total: 15 }
    expect(describeRoll(d, result)).toBe("rolls d20 (15) = 15")
  })

  it("renders with modifier and prefix", () => {
    const d: DiceExpr = { count: 2, sides: 6 }
    const result = { kept: [4, 5], dropped: [], modifier: 3, total: 12 }
    expect(describeRoll(d, result, "alice")).toBe("alice rolls 2d6 + 3 (4 + 5 + 3) = 12")
  })
})
