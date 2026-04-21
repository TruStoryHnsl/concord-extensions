import { describe, expect, it } from 'vitest'
import { color, makeCard, parseCardId, rankValue, RANKS, SUITS } from '../card'

describe('Card primitives', () => {
  it('makeCard produces stable ids', () => {
    expect(makeCard('spades', 'A').id).toBe('AS')
    expect(makeCard('hearts', '10').id).toBe('10H')
    expect(makeCard('clubs', 'K').id).toBe('KC')
    expect(makeCard('diamonds', 'Q').id).toBe('QD')
  })

  it('makeCard returns frozen cards', () => {
    const c = makeCard('spades', '2')
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('rankValue maps correctly', () => {
    expect(rankValue('A')).toBe(1)
    expect(rankValue('10')).toBe(10)
    expect(rankValue('J')).toBe(11)
    expect(rankValue('Q')).toBe(12)
    expect(rankValue('K')).toBe(13)
  })

  it('color maps suits correctly', () => {
    expect(color('hearts')).toBe('red')
    expect(color('diamonds')).toBe('red')
    expect(color('clubs')).toBe('black')
    expect(color('spades')).toBe('black')
  })

  it('parseCardId round-trips all 52 ids', () => {
    for (const s of SUITS) {
      for (const r of RANKS) {
        const c = makeCard(s, r)
        const parsed = parseCardId(c.id)
        expect(parsed.suit).toBe(s)
        expect(parsed.rank).toBe(r)
        expect(parsed.id).toBe(c.id)
      }
    }
  })

  it('parseCardId throws on malformed ids', () => {
    expect(() => parseCardId('XX')).toThrow()
    expect(() => parseCardId('JOKER_R')).toThrow()
  })
})
