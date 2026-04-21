/**
 * Pile primitives. Last index = top of the pile.
 * Spec: INS-006 §3.4.
 */

import { Card } from './card'

export interface Pile {
  readonly cards: readonly Card[]
}

export function emptyPile(): Pile {
  return { cards: [] }
}

export function push(p: Pile, c: Card): Pile {
  return { cards: [...p.cards, c] }
}

export function pop(p: Pile): { popped: Card | null; remaining: Pile } {
  if (p.cards.length === 0) return { popped: null, remaining: p }
  return {
    popped: p.cards[p.cards.length - 1],
    remaining: { cards: p.cards.slice(0, -1) },
  }
}

export function peekTop(p: Pile, n: number): Card[] {
  const clamped = Math.min(n, p.cards.length)
  return p.cards.slice(p.cards.length - clamped)
}
