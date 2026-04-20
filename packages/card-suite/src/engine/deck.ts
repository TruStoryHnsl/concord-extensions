/**
 * Deck primitives. Pure, immutable operations.
 * Spec: INS-006 §3.2.
 */

import { Card, JOKER_ID_BLACK, JOKER_ID_RED, RANKS, SUITS, makeCard } from './card'
import { RNG } from './rng'

export interface Deck {
  readonly cards: readonly Card[]
}

export function standardDeck(): Deck {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(makeCard(suit, rank))
    }
  }
  return { cards }
}

export function standardDeckWithJokers(): Deck {
  // Jokers don't have a suit/rank in Card, so we represent them with a pseudo
  // Card that carries the joker id. Consumers that care about suit/rank
  // should ignore joker cards by id prefix.
  const base = standardDeck()
  // We can't construct a joker via makeCard (Suit/Rank don't include jokers),
  // so we cast two pseudo-entries with frozen references.
  const jokers: Card[] = [
    Object.freeze({ suit: 'hearts' as const, rank: 'A' as const, id: JOKER_ID_RED }),
    Object.freeze({ suit: 'spades' as const, rank: 'A' as const, id: JOKER_ID_BLACK }),
  ]
  return { cards: [...base.cards, ...jokers] }
}

/**
 * Pure Fisher-Yates shuffle using the provided RNG.
 * Returns a new Deck; does not mutate input.
 */
export function shuffle(deck: Deck, rng: RNG): Deck {
  const arr = [...deck.cards]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return { cards: arr }
}

/** Draw n cards off the top (end) of the deck. Pure. */
export function draw(deck: Deck, n: number): { drawn: Card[]; remaining: Deck } {
  if (n < 0) throw new Error(`draw: n must be >= 0, got ${n}`)
  if (n > deck.cards.length) {
    throw new Error(`draw: requested ${n} but only ${deck.cards.length} remain`)
  }
  const drawn = deck.cards.slice(deck.cards.length - n)
  const remaining = { cards: deck.cards.slice(0, deck.cards.length - n) }
  return { drawn, remaining }
}

/** Peek top n cards without mutation. Returns copy. */
export function peek(deck: Deck, n: number): Card[] {
  const clamped = Math.min(n, deck.cards.length)
  return deck.cards.slice(deck.cards.length - clamped)
}

/** Deep equality for decks by card id sequence. Used in tests. */
export function decksEqual(a: Deck, b: Deck): boolean {
  if (a.cards.length !== b.cards.length) return false
  for (let i = 0; i < a.cards.length; i++) {
    if (a.cards[i].id !== b.cards[i].id) return false
  }
  return true
}
