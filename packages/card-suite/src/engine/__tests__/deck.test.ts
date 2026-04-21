import { describe, expect, it } from 'vitest'
import { decksEqual, draw, peek, shuffle, standardDeck, standardDeckWithJokers } from '../deck'
import { mulberry32 } from '../rng'

describe('Deck', () => {
  it('standardDeck produces exactly 52 unique cards', () => {
    const d = standardDeck()
    expect(d.cards.length).toBe(52)
    const ids = new Set(d.cards.map((c) => c.id))
    expect(ids.size).toBe(52)
  })

  it('standardDeckWithJokers produces 54 cards', () => {
    const d = standardDeckWithJokers()
    expect(d.cards.length).toBe(54)
  })

  it('shuffle is deterministic for the same seed', () => {
    const a = shuffle(standardDeck(), mulberry32(42))
    const b = shuffle(standardDeck(), mulberry32(42))
    expect(decksEqual(a, b)).toBe(true)
  })

  it('shuffle produces different results for different seeds', () => {
    const a = shuffle(standardDeck(), mulberry32(1))
    const b = shuffle(standardDeck(), mulberry32(2))
    expect(decksEqual(a, b)).toBe(false)
  })

  it('shuffle preserves every card', () => {
    const orig = standardDeck()
    const shuffled = shuffle(orig, mulberry32(99))
    const origIds = [...orig.cards.map((c) => c.id)].sort()
    const newIds = [...shuffled.cards.map((c) => c.id)].sort()
    expect(newIds).toEqual(origIds)
  })

  it('shuffle does not mutate input', () => {
    const orig = standardDeck()
    const origFirst = orig.cards[0].id
    shuffle(orig, mulberry32(7))
    expect(orig.cards[0].id).toBe(origFirst)
  })

  it('draw removes the requested number of cards from the top', () => {
    const d = standardDeck()
    const { drawn, remaining } = draw(d, 5)
    expect(drawn.length).toBe(5)
    expect(remaining.cards.length).toBe(47)
    // Drawn cards should be the last 5 of original
    expect(drawn.map((c) => c.id)).toEqual(d.cards.slice(-5).map((c) => c.id))
  })

  it('draw does not mutate input deck', () => {
    const d = standardDeck()
    const beforeLen = d.cards.length
    draw(d, 10)
    expect(d.cards.length).toBe(beforeLen)
  })

  it('draw throws on over-draw', () => {
    const d = standardDeck()
    expect(() => draw(d, 53)).toThrow()
  })

  it('draw(0) is a no-op', () => {
    const d = standardDeck()
    const { drawn, remaining } = draw(d, 0)
    expect(drawn).toEqual([])
    expect(remaining.cards.length).toBe(52)
  })

  it('peek returns the top n without mutation', () => {
    const d = standardDeck()
    const top3 = peek(d, 3)
    expect(top3.length).toBe(3)
    expect(d.cards.length).toBe(52)
  })

  it('peek clamps to deck size', () => {
    const d = standardDeck()
    const all = peek(d, 999)
    expect(all.length).toBe(52)
  })
})
