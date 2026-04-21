/**
 * Trouble Brewing — Washerwoman.
 *
 * First night: learn that exactly one of two players is a specific townsfolk
 * role. The engine picks one real townsfolk + one bluff (any other player) and
 * one role id. The info is "one of these two is a [Chef/Empath/Investigator...]".
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { GameState, PlayerState, RoleId } from '../../types'
import { RoleDef } from './role-def'

export const WASHERWOMAN_ID = 'washerwoman' as const

export const washerwoman: RoleDef = {
  id: WASHERWOMAN_ID,
  team: 'townsfolk',
  alignment: 'good',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    // Find one real townsfolk (not self).
    const townsfolk = state.players.filter(
      (p) => p.team === 'townsfolk' && p.id !== self.id,
    )
    if (townsfolk.length === 0) return [] // no legal info

    const target = rng.pick(townsfolk)
    const targetRoleId: RoleId = target.role

    // Find one bluff candidate — any other player not the target.
    const bluffPool = state.players.filter(
      (p) => p.id !== self.id && p.id !== target.id,
    )
    if (bluffPool.length === 0) return []
    const bluff = rng.pick(bluffPool)

    // Randomise which of the two is listed first.
    const [first, second] =
      rng.next() < 0.5 ? [target, bluff] : [bluff, target]

    return [
      {
        kind: 'role_info',
        to: self.id,
        roles: [targetRoleId],
      },
      {
        kind: 'info_grant',
        to: self.id,
        payload: {
          source: WASHERWOMAN_ID,
          candidates: [first.id, second.id],
          role: targetRoleId,
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
