import { describe, expect, it } from 'vitest'
import { Card, parseCardId } from '../../../engine/card'
import { dealerPolicy, scoreHand } from '../dealer-ai'

function h(...ids: string[]): Card[] {
  return ids.map((id) => parseCardId(id))
}

describe('Blackjack dealer-ai — scoreHand', () => {
  it('counts an ace as 11 when soft', () => {
    const r = scoreHand(h('AC', '6D'))
    expect(r.total).toBe(17)
    expect(r.soft).toBe(true)
    expect(r.bust).toBe(false)
  })

  it('counts an ace as 1 when 11 would bust', () => {
    const r = scoreHand(h('AC', '6D', '8H'))
    expect(r.total).toBe(15)
    expect(r.soft).toBe(false)
  })

  it('detects natural blackjack on 2 cards', () => {
    const r = scoreHand(h('AS', 'KS'))
    expect(r.total).toBe(21)
    expect(r.blackjack).toBe(true)
  })

  it('21 from 3 cards is not a blackjack', () => {
    const r = scoreHand(h('7C', '7D', '7H'))
    expect(r.total).toBe(21)
    expect(r.blackjack).toBe(false)
  })

  it('busts above 21', () => {
    const r = scoreHand(h('KC', 'QD', '5H'))
    expect(r.total).toBe(25)
    expect(r.bust).toBe(true)
  })

  it('two aces: one as 11, one as 1 = 12', () => {
    const r = scoreHand(h('AC', 'AD'))
    expect(r.total).toBe(12)
    expect(r.soft).toBe(true)
  })
})

describe('Blackjack dealer-ai — dealerPolicy (H17)', () => {
  it('hits below 17', () => {
    expect(dealerPolicy(h('5C', '6D'))).toBe('hit')   // 11
    expect(dealerPolicy(h('5C', '7D'))).toBe('hit')   // 12
    expect(dealerPolicy(h('5C', 'JD'))).toBe('hit')   // 15
    expect(dealerPolicy(h('5C', 'JD', 'AS'))).toBe('hit') // 16
  })

  it('stands on hard 17–21', () => {
    expect(dealerPolicy(h('10C', '7D'))).toBe('stand')
    expect(dealerPolicy(h('10C', '8D'))).toBe('stand')
    expect(dealerPolicy(h('10C', 'KD', 'AS'))).toBe('stand') // 21 (10+10+1)
    expect(dealerPolicy(h('10C', '5D', '6H'))).toBe('stand') // 21
  })

  it('hits on soft 17 (H17 rule)', () => {
    expect(dealerPolicy(h('AC', '6D'))).toBe('hit') // soft 17
  })

  it('stands on soft 18', () => {
    expect(dealerPolicy(h('AC', '7D'))).toBe('stand') // soft 18
  })

  it('stands when bust (no further draw possible)', () => {
    expect(dealerPolicy(h('KC', 'QD', '5H'))).toBe('stand')
  })
})
