import { describe, expect, it } from 'vitest'
import { Card, makeCard, parseCardId, Rank, Suit } from '../../../engine/card'
import { compareHandRank, evaluate5, evaluate5of7 } from '../hand-eval'

function c(id: string): Card {
  return parseCardId(id)
}

function hand(...ids: string[]): Card[] {
  return ids.map(c)
}

describe('Hold\'em hand evaluator — categories', () => {
  it('royal flush is a straight-flush with high 14', () => {
    const r = evaluate5(hand('10S', 'JS', 'QS', 'KS', 'AS'))
    expect(r.category).toBe('straight-flush')
    expect(r.tiebreakers).toEqual([14])
  })

  it('straight flush 9-K', () => {
    const r = evaluate5(hand('9H', '10H', 'JH', 'QH', 'KH'))
    expect(r.category).toBe('straight-flush')
    expect(r.tiebreakers).toEqual([13])
  })

  it('wheel straight-flush is a 5-high straight-flush', () => {
    const r = evaluate5(hand('AC', '2C', '3C', '4C', '5C'))
    expect(r.category).toBe('straight-flush')
    expect(r.tiebreakers).toEqual([5])
  })

  it('four of a kind beats full house', () => {
    const four = evaluate5(hand('7C', '7D', '7H', '7S', 'KS'))
    const full = evaluate5(hand('KC', 'KD', 'KH', '7S', '7C'))
    expect(four.category).toBe('four-of-a-kind')
    expect(full.category).toBe('full-house')
    expect(compareHandRank(four, full)).toBeGreaterThan(0)
  })

  it('full house tiebreak by trips then pair', () => {
    const a = evaluate5(hand('KC', 'KD', 'KH', '2S', '2C'))
    const b = evaluate5(hand('QC', 'QD', 'QH', 'AS', 'AC'))
    expect(a.category).toBe('full-house')
    expect(b.category).toBe('full-house')
    expect(compareHandRank(a, b)).toBeGreaterThan(0) // K-trips > Q-trips
  })

  it('flush vs straight: flush wins', () => {
    const flush = evaluate5(hand('2H', '5H', '7H', '9H', 'JH'))
    const str = evaluate5(hand('2H', '3D', '4S', '5C', '6H'))
    expect(flush.category).toBe('flush')
    expect(str.category).toBe('straight')
    expect(compareHandRank(flush, str)).toBeGreaterThan(0)
  })

  it('flush tiebreaker uses all 5 cards descending', () => {
    const a = evaluate5(hand('AH', '5H', '7H', '9H', 'JH'))
    const b = evaluate5(hand('KH', 'QH', '9H', '7H', '5H'))
    expect(compareHandRank(a, b)).toBeGreaterThan(0)
  })

  it('straight tiebreak by high card', () => {
    const tenHigh = evaluate5(hand('6C', '7D', '8H', '9S', '10C'))
    const sixHigh = evaluate5(hand('2C', '3D', '4H', '5S', '6C'))
    const wheel = evaluate5(hand('AC', '2D', '3H', '4S', '5C'))
    expect(tenHigh.category).toBe('straight')
    expect(sixHigh.category).toBe('straight')
    expect(wheel.category).toBe('straight')
    expect(wheel.tiebreakers).toEqual([5])
    expect(compareHandRank(tenHigh, sixHigh)).toBeGreaterThan(0)
    expect(compareHandRank(sixHigh, wheel)).toBeGreaterThan(0)
  })

  it('three of a kind', () => {
    const r = evaluate5(hand('5C', '5D', '5H', 'KS', '2C'))
    expect(r.category).toBe('three-of-a-kind')
    expect(r.tiebreakers).toEqual([5, 13, 2])
  })

  it('two pair tiebreak by high pair, low pair, kicker', () => {
    const a = evaluate5(hand('AC', 'AD', '2H', '2S', 'KS'))
    const b = evaluate5(hand('AC', 'AD', '2H', '2S', 'QS'))
    expect(a.category).toBe('two-pair')
    expect(compareHandRank(a, b)).toBeGreaterThan(0)
  })

  it('one pair with kickers', () => {
    const r = evaluate5(hand('5C', '5D', 'KS', '7H', '2C'))
    expect(r.category).toBe('pair')
    expect(r.tiebreakers).toEqual([5, 13, 7, 2])
  })

  it('high card', () => {
    const r = evaluate5(hand('AC', 'JD', '8H', '4S', '2C'))
    expect(r.category).toBe('high-card')
    expect(r.tiebreakers).toEqual([14, 11, 8, 4, 2])
  })
})

describe('evaluate5of7 — chooses best 5', () => {
  it('picks the flush when 5 of one suit are present', () => {
    const r = evaluate5of7(
      [c('AH'), c('KH')],
      [c('2H'), c('5H'), c('JH'), c('3C'), c('9D')],
    )
    expect(r.category).toBe('flush')
  })

  it('hole pair + community trips → full house', () => {
    const r = evaluate5of7(
      [c('5H'), c('5D')],
      [c('KC'), c('KD'), c('KS'), c('7H'), c('2C')],
    )
    expect(r.category).toBe('full-house')
    expect(r.tiebreakers).toEqual([13, 5])
  })

  it('community straight overrides hole pair', () => {
    const r = evaluate5of7(
      [c('2C'), c('2D')],
      [c('5H'), c('6D'), c('7C'), c('8S'), c('9H')],
    )
    expect(r.category).toBe('straight')
    expect(r.tiebreakers).toEqual([9])
  })
})

describe('compareHandRank', () => {
  it('is reflexive — equal ranks compare 0', () => {
    const a = evaluate5(hand('5C', '5D', '5H', 'KS', '2C'))
    const b = evaluate5(hand('5C', '5D', '5H', 'KS', '2C'))
    expect(compareHandRank(a, b)).toBe(0)
  })

  it('orders by category', () => {
    const pair = evaluate5(hand('AC', 'AD', '5H', '6S', '7C'))
    const trips = evaluate5(hand('AC', 'AD', 'AH', '6S', '7C'))
    expect(compareHandRank(trips, pair)).toBeGreaterThan(0)
    expect(compareHandRank(pair, trips)).toBeLessThan(0)
  })
})
