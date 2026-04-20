/**
 * Card primitives. Immutable value types.
 * Spec: INS-006 §3.1.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'

export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  readonly suit: Suit
  readonly rank: Rank
  /** Stable comparable id, e.g. "AS" (Ace of Spades), "10H" (Ten of Hearts). */
  readonly id: string
}

/** Special id used for the Joker pseudo-suit when present in a deck. */
export const JOKER_ID_RED = 'JOKER_R'
export const JOKER_ID_BLACK = 'JOKER_B'

const SUIT_LETTER: Record<Suit, string> = {
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
}

const RANK_VALUE: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13,
}

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'] as const
export const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
] as const

export function makeCard(suit: Suit, rank: Rank): Card {
  return Object.freeze({
    suit,
    rank,
    id: `${rank}${SUIT_LETTER[suit]}`,
  })
}

export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank]
}

export function color(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black'
}

/** Parse a card id string back into a Card. Throws on malformed input. */
export function parseCardId(id: string): Card {
  if (id === JOKER_ID_RED || id === JOKER_ID_BLACK) {
    throw new Error(`parseCardId: joker ids (${id}) are not standard-suit cards`)
  }
  // Rank is everything except the last char; suit is the last char.
  const suitLetter = id[id.length - 1]
  const rankStr = id.slice(0, -1)
  const suit = (Object.entries(SUIT_LETTER).find(([, l]) => l === suitLetter)?.[0]) as Suit | undefined
  if (!suit) throw new Error(`parseCardId: unknown suit letter in "${id}"`)
  if (!(rankStr in RANK_VALUE)) throw new Error(`parseCardId: unknown rank "${rankStr}" in "${id}"`)
  return makeCard(suit, rankStr as Rank)
}
