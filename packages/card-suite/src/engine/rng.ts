/**
 * Seeded Mulberry32 RNG. Deterministic pseudo-random number generator.
 *
 * Spec: INS-006 §3.5 — all shuffles flow through mulberry32 for reproducibility.
 * Production code seeds from crypto.getRandomValues; tests seed from constants.
 */

export interface RNG {
  /** Returns a float in [0, 1). */
  next(): number
  /** Returns an integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number
}

export function mulberry32(seed: number): RNG {
  let state = seed >>> 0
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0 || !Number.isFinite(maxExclusive)) {
        throw new Error(`nextInt: maxExclusive must be positive finite, got ${maxExclusive}`)
      }
      return Math.floor(this.next() * maxExclusive)
    },
  }
}

/** Seed an RNG from cryptographically strong randomness (production path). */
export function cryptoSeed(): number {
  const buf = new Uint32Array(1)
  if (typeof globalThis.crypto !== 'undefined' && 'getRandomValues' in globalThis.crypto) {
    globalThis.crypto.getRandomValues(buf)
    return buf[0] >>> 0
  }
  // Fallback for environments without crypto — still fine for testing.
  return (Math.random() * 0x100000000) >>> 0
}
