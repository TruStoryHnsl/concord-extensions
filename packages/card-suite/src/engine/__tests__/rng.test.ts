import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'

describe('mulberry32 RNG', () => {
  it('produces deterministic output for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different output for different seeds', () => {
    const a = mulberry32(1).next()
    const b = mulberry32(2).next()
    expect(a).not.toBe(b)
  })

  it('next() returns values in [0, 1)', () => {
    const r = mulberry32(999)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextInt returns values in [0, max)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      const v = r.nextInt(52)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(52)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('nextInt throws on non-positive bounds', () => {
    const r = mulberry32(1)
    expect(() => r.nextInt(0)).toThrow()
    expect(() => r.nextInt(-5)).toThrow()
  })
})
