import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'

describe('mulberry32', () => {
  it('produces values in [0, 1)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 100; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic given the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    let same = 0
    for (let i = 0; i < 10; i++) {
      if (a.next() === b.next()) same++
    }
    expect(same).toBeLessThan(5)
  })

  it('nextInt rejects non-positive max', () => {
    const rng = mulberry32(1)
    expect(() => rng.nextInt(0)).toThrow()
    expect(() => rng.nextInt(-3)).toThrow()
  })

  it('pick throws on empty array', () => {
    const rng = mulberry32(1)
    expect(() => rng.pick([])).toThrow()
  })
})
