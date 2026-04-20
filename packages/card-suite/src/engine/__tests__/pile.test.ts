import { describe, expect, it } from 'vitest'
import { makeCard } from '../card'
import { emptyPile, peekTop, pop, push } from '../pile'

describe('Pile', () => {
  it('push and pop round-trip', () => {
    const a = makeCard('spades', 'A')
    const b = makeCard('hearts', '5')
    let p = emptyPile()
    p = push(p, a)
    p = push(p, b)
    const { popped, remaining } = pop(p)
    expect(popped?.id).toBe('5H')
    expect(remaining.cards.length).toBe(1)
    expect(remaining.cards[0].id).toBe('AS')
  })

  it('pop on empty returns null without mutation', () => {
    const p = emptyPile()
    const { popped, remaining } = pop(p)
    expect(popped).toBeNull()
    expect(remaining).toBe(p)
  })

  it('peekTop returns top n without mutation', () => {
    let p = emptyPile()
    p = push(p, makeCard('clubs', '2'))
    p = push(p, makeCard('clubs', '3'))
    p = push(p, makeCard('clubs', '4'))
    const top2 = peekTop(p, 2)
    expect(top2.map((c) => c.id)).toEqual(['3C', '4C'])
    expect(p.cards.length).toBe(3)
  })

  it('push does not mutate input pile', () => {
    const p = emptyPile()
    push(p, makeCard('spades', 'A'))
    expect(p.cards.length).toBe(0)
  })
})
