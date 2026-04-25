/**
 * Seeded Mulberry32 RNG. Same shape as card-suite/engine/rng.ts.
 * All random choices in role + bot logic flow through an injected RNG so
 * tests can be deterministic.
 */

export interface RNG {
  next(): number
  nextInt(maxExclusive: number): number
  /** Picks one element from `arr`; throws on empty array. */
  pick<T>(arr: readonly T[]): T
}

export function mulberry32(seed: number): RNG {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0 || !Number.isFinite(maxExclusive)) {
        throw new Error(`nextInt: maxExclusive must be positive, got ${maxExclusive}`)
      }
      return Math.floor(next() * maxExclusive)
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick: array is empty')
      return arr[Math.floor(next() * arr.length)]
    },
  }
}
