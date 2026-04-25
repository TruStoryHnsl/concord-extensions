/**
 * Kings & Peasants bot — pure decision module.
 *
 * Contract:
 *   pickAction(state, playerId, rng): KPAction
 *
 * Strategy (intentionally weak so the human has a fighting chance):
 *   - When leading: play the lowest legal singleton combo. If no singleton
 *     is legal (impossible with cards in hand, but defensive), fall back
 *     to the lowest-power play of any size.
 *   - When following: play the lowest legal combo that strictly beats the
 *     current top. Otherwise pass.
 *
 * Determinism: among multiple actions of equal lowest power, we deterministically
 * pick the first one returned by `legalActions`. RNG is unused but accepted
 * to match the bot contract.
 */

import { Card } from '../../engine/card'
import { RNG } from '../../engine/rng'
import { PlayerId } from '../../engine/types'
import { cardPower, KPAction, KPState, legalActions } from './rules'

export function pickAction(
  state: KPState,
  playerId: PlayerId,
  _rng: RNG,
): KPAction {
  const acts = legalActions(state, playerId)
  if (acts.length === 0) {
    // Not bot's turn or already finished. Caller should not invoke.
    throw new Error(
      `kings-and-peasants bot: no legal actions for ${playerId} (not their turn?)`,
    )
  }

  // Round just ended — start the next one. If start-round is legal at all
  // it'll be in acts; we'd return that. (Currently start-round is only
  // emitted by the renderer, not legalActions, so this is mostly defensive.)
  const startRound = acts.find((a) => a.kind === 'start-round')
  if (startRound) return startRound

  const plays = acts.filter(
    (a): a is Extract<KPAction, { kind: 'play' }> => a.kind === 'play',
  )
  const passes = acts.filter(
    (a): a is Extract<KPAction, { kind: 'pass' }> => a.kind === 'pass',
  )

  // If there's no top combo we're leading. Prefer singletons.
  const leading = state.topCombo === null

  if (plays.length === 0) {
    // Can't play — pass if allowed (only legal when topCombo present).
    if (passes.length > 0) return passes[0]
    // Defensive: should not happen; leader must always have a play.
    throw new Error('kings-and-peasants bot: no plays and no pass')
  }

  if (leading) {
    // Pick lowest singleton. Among equal-power singletons, take the first.
    const singletons = plays.filter((p) => p.cardIds.length === 1)
    const sorted = (singletons.length > 0 ? singletons : plays).slice().sort(
      (a, b) => playPower(state, a) - playPower(state, b),
    )
    return sorted[0]
  }

  // Following: pick the lowest legal play that beats the top.
  // legalActions already filters to plays that beat the top, so we just
  // pick the lowest among them.
  const sorted = plays.slice().sort((a, b) => playPower(state, a) - playPower(state, b))
  return sorted[0]
}

/** Compute the rank-power of a play action by inspecting the bot's hand. */
function playPower(
  state: KPState,
  action: Extract<KPAction, { kind: 'play' }>,
): number {
  const me = state.players.find((p) => p.id === action.by)
  if (!me) return 0
  const cards: Card[] = []
  for (const id of action.cardIds) {
    const c = me.hand.find((x) => x.id === id)
    if (c) cards.push(c)
  }
  if (cards.length === 0) return 0
  return cardPower(cards[0].rank)
}
