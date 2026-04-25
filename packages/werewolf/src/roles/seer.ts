/**
 * Seer (Village team).
 *
 * Each night, the Seer picks one player and learns their team
 * ("village" or "werewolves"). The peek result is delivered as an
 * `info_grant` whisper — no state mutation.
 *
 * Acts on the first night AND every subsequent night.
 */

import { Effect } from '../engine/effects'
import { RNG } from '../engine/rng'
import { GameState, PlayerState } from '../engine/types'
import { RoleDef, readTarget } from './role-def'

export const SEER_ID = 'seer' as const

function peekAction(state: GameState, self: PlayerState, rng: RNG): Effect[] {
  if (!self.alive) return []
  let targetId = readTarget(self)
  if (!targetId) {
    const pool = state.players.filter((p) => p.alive && p.id !== self.id)
    if (pool.length === 0) return []
    targetId = rng.pick(pool).id
  }
  const target = state.players.find((p) => p.id === targetId)
  if (!target) return []
  return [
    {
      kind: 'info_grant',
      to: self.id,
      payload: { peekedTarget: target.id, learnedTeam: target.team },
    },
  ]
}

export const seer: RoleDef = {
  id: SEER_ID,
  team: 'village',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return peekAction(state, self, rng)
  },
  night(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return peekAction(state, self, rng)
  },
  onDeath(): Effect[] {
    return []
  },
}
