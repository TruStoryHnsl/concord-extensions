import { describe, expect, it } from 'vitest'
import { makeCard } from '../card'
import { groupByRank, Hand, removeCard, sortByRank, sortBySuit } from '../hand'

describe('Hand', () => {
  const h: Hand = {
    cards: [
      makeCard('hearts', 'K'),
      makeCard('clubs', '2'),
      makeCard('spades', 'A'),
      makeCard('diamonds', '10'),
    ],
  }

  it('sortByRank orders ascending', () => {
    const sorted = sortByRank(h)
    expect(sorted.cards.map((c) => c.rank)).toEqual(['A', '2', '10', 'K'])
  })

  it('sortBySuit orders clubs -> diamonds -> hearts -> spades', () => {
    const sorted = sortBySuit(h)
    expect(sorted.cards.map((c) => c.suit)).toEqual(['clubs', 'diamonds', 'hearts', 'spades'])
  })

  it('groupByRank buckets duplicates', () => {
    const dup: Hand = {
      cards: [
        makeCard('hearts', '7'),
        makeCard('clubs', '7'),
        makeCard('spades', 'K'),
      ],
    }
    const m = groupByRank(dup)
    expect(m.get('7')?.length).toBe(2)
    expect(m.get('K')?.length).toBe(1)
    expect(m.get('A')).toBeUndefined()
  })

  it('removeCard returns a new hand without the target', () => {
    const without = removeCard(h, 'AS')
    expect(without.cards.length).toBe(3)
    expect(without.cards.find((c) => c.id === 'AS')).toBeUndefined()
    // original unchanged
    expect(h.cards.length).toBe(4)
  })

  it('removeCard throws when id not present', () => {
    expect(() => removeCard(h, '5H')).toThrow()
  })
})
