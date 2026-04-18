/**
 * Dice primitives — deterministic under a seeded RNG (for tests and replay).
 *
 * Supports: dN, MdN, MdN+K, MdN+<expr>, MdN keep highest K, MdN keep lowest K.
 * See protocol spec section 6.3.
 */

import type { DiceExpr } from "../types"

/** Mulberry32 — simple seeded PRNG. Uniform on [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Roll one die of N sides (1..N). Uniform if rng is uniform. */
export function rollDie(sides: number, rng: () => number): number {
  if (sides < 2) throw new Error(`dice sides must be >= 2, got ${sides}`)
  return Math.floor(rng() * sides) + 1
}

export interface RollResult {
  /** Individual die faces that actually contributed to the total. */
  kept: number[]
  /** Faces that were rolled but dropped by `keep highest/lowest`. */
  dropped: number[]
  modifier: number
  total: number
}

/**
 * Execute a dice expression. `modifierValue` is the already-resolved integer
 * value of the DiceExpr's `modifier` Expr (the caller evaluates it against
 * state before calling this function); pass 0 when there is no modifier.
 */
export function rollDice(expr: DiceExpr, modifierValue: number, rng: () => number): RollResult {
  const faces: number[] = []
  for (let i = 0; i < expr.count; i++) faces.push(rollDie(expr.sides, rng))

  let kept: number[] = faces
  let dropped: number[] = []
  if (expr.keep) {
    const sorted = [...faces].sort((a, b) => a - b)
    if (expr.keep.mode === "highest") {
      kept = sorted.slice(Math.max(0, sorted.length - expr.keep.count))
      dropped = sorted.slice(0, Math.max(0, sorted.length - expr.keep.count))
    } else {
      kept = sorted.slice(0, expr.keep.count)
      dropped = sorted.slice(expr.keep.count)
    }
  }
  const sum = kept.reduce((acc, v) => acc + v, 0)
  return { kept, dropped, modifier: modifierValue, total: sum + modifierValue }
}

/** Human-readable roll transcript: `rolls 2d6+3 (4+5+3) = 12`. */
export function describeRoll(expr: DiceExpr, result: RollResult, labelPrefix?: string): string {
  const countStr = expr.count === 1 ? "d" : `${expr.count}d`
  let spec = `${countStr}${expr.sides}`
  if (expr.keep) spec += ` keep ${expr.keep.mode} ${expr.keep.count}`
  const mod = result.modifier
  if (mod !== 0) spec += `${mod >= 0 ? " + " : " - "}${Math.abs(mod)}`
  const parts: string[] = [...result.kept.map(String)]
  if (mod !== 0) parts.push(`${mod >= 0 ? "" : "-"}${Math.abs(mod)}`)
  const breakdown = parts.join(" + ")
  const prefix = labelPrefix ? `${labelPrefix} ` : ""
  return `${prefix}rolls ${spec} (${breakdown}) = ${result.total}`
}
