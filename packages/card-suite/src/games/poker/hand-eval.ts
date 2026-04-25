/**
 * Texas Hold'em hand evaluator — pure 5-of-7 best-hand evaluator.
 *
 * Spec: INS-006 §5.2.
 * Rules: standard No-Limit Texas Hold'em hand ranking. Evaluates the best
 * 5-card hand from a player's 2 hole cards plus the 5 community cards.
 *
 * Categories (high → low): straight-flush (incl. royal), four-of-a-kind,
 * full-house, flush, straight, three-of-a-kind, two-pair, one-pair, high-card.
 *
 * Aces play both high and low for straights (A-2-3-4-5 wheel and 10-J-Q-K-A).
 *
 * Returned HandRank objects are totally ordered via compareHandRank: same
 * category compared by tiebreakers (kickers in descending order).
 */

import { Card, Rank, Suit, rankValue } from '../../engine/card'

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'

const CATEGORY_RANK: Record<HandCategory, number> = {
  'high-card': 1,
  pair: 2,
  'two-pair': 3,
  'three-of-a-kind': 4,
  straight: 5,
  flush: 6,
  'full-house': 7,
  'four-of-a-kind': 8,
  'straight-flush': 9,
}

export interface HandRank {
  readonly category: HandCategory
  /** Tiebreakers in descending priority. Each is a rank value 1..14 (Ace high = 14). */
  readonly tiebreakers: readonly number[]
  /** The 5 cards forming the chosen hand. */
  readonly cards: readonly Card[]
}

// Internal rank value with Ace promoted to 14 when needed.
function highValue(rank: Rank): number {
  return rank === 'A' ? 14 : rankValue(rank)
}

function sortDesc(values: number[]): number[] {
  return [...values].sort((a, b) => b - a)
}

/** Generate all C(7,5)=21 5-card combinations from the 7 cards. */
function combinations5(cards: readonly Card[]): Card[][] {
  const out: Card[][] = []
  const n = cards.length
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            out.push([cards[a], cards[b], cards[c], cards[d], cards[e]])
          }
  return out
}

/** Evaluate exactly 5 cards. Pure. */
export function evaluate5(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) throw new Error(`evaluate5: expected 5 cards, got ${cards.length}`)

  const values = cards.map((c) => highValue(c.rank))
  const suits = cards.map((c) => c.suit)
  const sortedDesc = sortDesc(values)

  // Group by rank value
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  // Sort entries by (count desc, value desc) — canonical order for tiebreakers
  const grouped: Array<[number, number]> = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return b[0] - a[0]
  })
  const groupedValuesByCount = grouped.map(([v]) => v)

  const isFlush = suits.every((s) => s === suits[0])

  // Detect straight. Ace-low (wheel): A-2-3-4-5.
  let straightHigh = 0
  const uniq = [...new Set(values)].sort((a, b) => b - a)
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    // Wheel: 14,5,4,3,2 → high is 5
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
      straightHigh = 5
    }
  }

  if (isFlush && straightHigh > 0) {
    return { category: 'straight-flush', tiebreakers: [straightHigh], cards: [...cards] }
  }
  if (grouped[0][1] === 4) {
    // four-of-a-kind: tiebreakers = [quad rank, kicker]
    return { category: 'four-of-a-kind', tiebreakers: groupedValuesByCount, cards: [...cards] }
  }
  if (grouped[0][1] === 3 && grouped[1][1] === 2) {
    return { category: 'full-house', tiebreakers: groupedValuesByCount, cards: [...cards] }
  }
  if (isFlush) {
    return { category: 'flush', tiebreakers: sortedDesc, cards: [...cards] }
  }
  if (straightHigh > 0) {
    return { category: 'straight', tiebreakers: [straightHigh], cards: [...cards] }
  }
  if (grouped[0][1] === 3) {
    // three-of-a-kind: [trip rank, kicker hi, kicker lo]
    return { category: 'three-of-a-kind', tiebreakers: groupedValuesByCount, cards: [...cards] }
  }
  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    // two-pair: [hi pair, lo pair, kicker]
    return { category: 'two-pair', tiebreakers: groupedValuesByCount, cards: [...cards] }
  }
  if (grouped[0][1] === 2) {
    // pair: [pair rank, k1, k2, k3]
    return { category: 'pair', tiebreakers: groupedValuesByCount, cards: [...cards] }
  }
  // high-card
  return { category: 'high-card', tiebreakers: sortedDesc, cards: [...cards] }
}

/** Return the best 5-of-N hand evaluation. Used for evaluate5of7 (hole + community). */
export function bestOf(cards: readonly Card[]): HandRank {
  if (cards.length < 5) throw new Error(`bestOf: need ≥5 cards, got ${cards.length}`)
  let best: HandRank | null = null
  for (const combo of combinations5(cards)) {
    const ev = evaluate5(combo)
    if (best === null || compareHandRank(ev, best) > 0) best = ev
  }
  return best!
}

/** Convenience: 2 hole + 5 community → best 5. */
export function evaluate5of7(
  hole: readonly [Card, Card],
  community: readonly Card[],
): HandRank {
  if (community.length !== 5) {
    throw new Error(`evaluate5of7: community must be 5 cards, got ${community.length}`)
  }
  return bestOf([...hole, ...community])
}

/**
 * Total ordering on HandRank.
 * Returns >0 if a > b, <0 if a < b, 0 if equal.
 */
export function compareHandRank(a: HandRank, b: HandRank): number {
  const ca = CATEGORY_RANK[a.category]
  const cb = CATEGORY_RANK[b.category]
  if (ca !== cb) return ca - cb
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length)
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0
    const bv = b.tiebreakers[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

// Re-export Suit for tests that want to construct cards.
export type { Suit }
