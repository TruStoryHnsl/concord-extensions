/**
 * Blackjack dealer AI — pure dealer policy.
 *
 * Standard rule: dealer hits on soft 17 (H17 variant). A "soft" total is one
 * where an Ace is being counted as 11 without busting; if the dealer's total
 * is exactly 17 with at least one Ace counted as 11, dealer must hit.
 *
 * Spec: INS-006 §5.3.
 */

import { Card } from '../../engine/card'

export interface HandValuation {
  /** Best total ≤ 21, or the smallest total if all bust. */
  readonly total: number
  /** True if any Ace is currently being counted as 11. */
  readonly soft: boolean
  /** True if total > 21. */
  readonly bust: boolean
  /** True if it's a natural 21 from 2 cards (Ace + ten-value). */
  readonly blackjack: boolean
}

const TEN_RANKS = new Set(['10', 'J', 'Q', 'K'])

/** Card point value (Ace = 1 here; soft promotion handled in scoreHand). */
function rankPoints(c: Card): number {
  if (c.rank === 'A') return 1
  if (TEN_RANKS.has(c.rank)) return 10
  // Number cards 2..9
  return parseInt(c.rank, 10)
}

/** Pure: total + soft/bust/blackjack flags. */
export function scoreHand(cards: readonly Card[]): HandValuation {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += rankPoints(c)
    if (c.rank === 'A') aces++
  }
  // Promote one Ace to 11 if it doesn't bust.
  let soft = false
  if (aces > 0 && total + 10 <= 21) {
    total += 10
    soft = true
  }
  const bust = total > 21
  const blackjack = cards.length === 2 && total === 21
  return { total, soft, bust, blackjack }
}

/**
 * Dealer policy for the H17 variant (dealer hits on soft 17).
 * Returns 'hit' if dealer must take another card, 'stand' otherwise.
 */
export function dealerPolicy(cards: readonly Card[]): 'hit' | 'stand' {
  const { total, soft, bust } = scoreHand(cards)
  if (bust) return 'stand'
  if (total < 17) return 'hit'
  if (total === 17 && soft) return 'hit'
  return 'stand'
}
