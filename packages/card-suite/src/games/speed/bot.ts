/**
 * Speed bot — pure decision module.
 *
 * Contract:
 *   pickAction(state, playerId, rng): SpeedAction
 *
 * For each card in the bot's working hand, scan both discard piles for a
 * legal target. Return the first legal `play`. If no card is legal, return
 * the `reveal-stuck` action when both players are stuck (the rules engine
 * surfaces this in legalActions). Otherwise we don't have a useful action
 * and the caller should treat the result as a "no-op".
 *
 * `_rng` is accepted to satisfy the bot module contract; Speed has no
 * randomness in the picker (we always pick the first legal play in a fixed
 * scan order so behavior is reproducible).
 */

import { RNG } from '../../engine/rng'
import { PlayerId } from '../../engine/types'
import { legalActions, ranksAdjacent, SpeedAction, SpeedState } from './rules'

export function pickAction(
  state: SpeedState,
  playerId: PlayerId,
  _rng: RNG,
): SpeedAction {
  if (state.winner) {
    // Game already over — caller must check before invoking.
    throw new Error('speed bot: game already won')
  }
  const playerIdx = state.players.findIndex((p) => p.id === playerId)
  if (playerIdx < 0) throw new Error(`speed bot: no player ${playerId}`)

  const me = state.players[playerIdx]
  const tops = [
    state.discards[0].length > 0
      ? state.discards[0][state.discards[0].length - 1]
      : null,
    state.discards[1].length > 0
      ? state.discards[1][state.discards[1].length - 1]
      : null,
  ]

  // Scan the bot's hand in fixed order (left-to-right). For each card, try
  // pile 0 then pile 1. Return the first legal play we find.
  for (const card of me.hand) {
    for (const pile of [0, 1] as const) {
      const top = tops[pile]
      if (top && ranksAdjacent(card.rank, top.rank)) {
        return { kind: 'play', by: playerId, cardId: card.id, toPile: pile }
      }
    }
  }

  // No legal play. If reveal-stuck is available, fire it.
  const acts = legalActions(state, playerId)
  const stuck = acts.find((a) => a.kind === 'reveal-stuck')
  if (stuck) return stuck

  // No legal action at all — return a no-op-equivalent. The rules layer
  // will reject this if it ever reaches applyAction. The caller is
  // responsible for detecting "not the bot's turn yet" via legalActions.
  return { kind: 'reveal-stuck' }
}
