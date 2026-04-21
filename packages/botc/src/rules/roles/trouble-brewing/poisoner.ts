/**
 * Trouble Brewing — Poisoner (Minion).
 *
 * Each night, chooses a player to poison until the next night. Poisoned
 * players' abilities produce no/false info.
 *
 * v1 implementation: clears the `poisoned` status from all players first
 * (to mimic "until next night"), then marks the chosen target poisoned.
 * Target selection uses the same `target:<id>` status-injection pattern as
 * the Imp for testability.
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { GameState, PlayerState } from '../../types'
import { RoleDef } from './role-def'
import { TARGET_STATUS_PREFIX } from './imp'

export const POISONER_ID = 'poisoner' as const

function readTarget(self: PlayerState): string | null {
  for (const s of self.statuses) {
    if (s.startsWith(TARGET_STATUS_PREFIX)) return s.slice(TARGET_STATUS_PREFIX.length)
  }
  return null
}

function clearAllPoison(state: GameState): Effect[] {
  const effects: Effect[] = []
  for (const p of state.players) {
    if (p.statuses.includes('poisoned')) {
      effects.push({ kind: 'status_clear', target: p.id, status: 'poisoned' })
    }
  }
  return effects
}

function poisonAction(state: GameState, self: PlayerState, rng: RNG): Effect[] {
  if (!self.alive) return []
  let targetId = readTarget(self)
  if (!targetId) {
    const pool = state.players.filter((p) => p.alive && p.id !== self.id)
    if (pool.length === 0) return []
    targetId = rng.pick(pool).id
  }
  return [
    ...clearAllPoison(state),
    { kind: 'status_set', target: targetId, status: 'poisoned' },
  ]
}

export const poisoner: RoleDef = {
  id: POISONER_ID,
  team: 'minion',
  alignment: 'evil',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return poisonAction(state, self, rng)
  },

  night(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return poisonAction(state, self, rng)
  },

  onNominated(): Effect[] {
    return []
  },

  onDeath(): Effect[] {
    return []
  },
}
