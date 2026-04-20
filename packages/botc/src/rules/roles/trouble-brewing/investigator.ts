/**
 * Trouble Brewing — Investigator.
 *
 * First night: learn that exactly one of two players is a specific minion.
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { GameState, PlayerState } from '../../types'
import { RoleDef } from './role-def'

export const INVESTIGATOR_ID = 'investigator' as const

export const investigator: RoleDef = {
  id: INVESTIGATOR_ID,
  team: 'townsfolk',
  alignment: 'good',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    const minions = state.players.filter(
      (p) => p.team === 'minion' && p.id !== self.id,
    )
    if (minions.length === 0) return [] // no minions in play

    const target = rng.pick(minions)
    const bluffPool = state.players.filter(
      (p) => p.id !== self.id && p.id !== target.id,
    )
    if (bluffPool.length === 0) return []
    const bluff = rng.pick(bluffPool)
    const [first, second] =
      rng.next() < 0.5 ? [target, bluff] : [bluff, target]

    return [
      {
        kind: 'info_grant',
        to: self.id,
        payload: {
          source: INVESTIGATOR_ID,
          candidates: [first.id, second.id],
          role: target.role,
        },
      },
    ]
  },

  night(): Effect[] {
    return []
  },

  onNominated(): Effect[] {
    return []
  },

  onDeath(): Effect[] {
    return []
  },
}
