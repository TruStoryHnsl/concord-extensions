/**
 * Trouble Brewing — Librarian.
 *
 * First night: learn that exactly one of two players is a specific outsider,
 * OR learn "0" if no outsiders are in play. Analogous to Washerwoman.
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { GameState, PlayerState } from '../../types'
import { RoleDef } from './role-def'

export const LIBRARIAN_ID = 'librarian' as const

export const librarian: RoleDef = {
  id: LIBRARIAN_ID,
  team: 'townsfolk',
  alignment: 'good',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    const outsiders = state.players.filter(
      (p) => p.team === 'outsider' && p.id !== self.id,
    )
    if (outsiders.length === 0) {
      return [
        {
          kind: 'info_grant',
          to: self.id,
          payload: { source: LIBRARIAN_ID, candidates: [], role: null, zeroOutsiders: true },
        },
      ]
    }

    const target = rng.pick(outsiders)
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
          source: LIBRARIAN_ID,
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
