/**
 * Hand primitives. Pure, immutable operations.
 * Spec: INS-006 §3.3.
 */

import { Card, Rank, rankValue } from './card'

export interface Hand {
  readonly cards: readonly Card[]
}

const SUIT_ORDER: Record<Card['suit'], number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
}

export function sortByRank(h: Hand): Hand {
  const sorted = [...h.cards].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
  return { cards: sorted }
}

export function sortBySuit(h: Hand): Hand {
  const sorted = [...h.cards].sort((a, b) => {
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
    if (s !== 0) return s
    return rankValue(a.rank) - rankValue(b.rank)
  })
  return { cards: sorted }
}

export function groupByRank(h: Hand): Map<Rank, Card[]> {
  const m = new Map<Rank, Card[]>()
  for (const c of h.cards) {
    const bucket = m.get(c.rank)
    if (bucket) bucket.push(c)
    else m.set(c.rank, [c])
  }
  return m
}

/** Remove first card matching id; returns new Hand. Throws if not present. */
export function removeCard(h: Hand, id: string): Hand {
  const idx = h.cards.findIndex((c) => c.id === id)
  if (idx < 0) throw new Error(`removeCard: no card with id "${id}" in hand`)
  return { cards: [...h.cards.slice(0, idx), ...h.cards.slice(idx + 1)] }
}
