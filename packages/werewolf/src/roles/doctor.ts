/**
 * Doctor (Village team).
 *
 * Each night, picks one player to protect. If the Werewolves target the
 * same player tonight, no death occurs. May NOT protect the same player
 * two nights in a row — we track `doctor_last:<id>` on the Doctor's own
 * statuses to enforce that across the rule pure functions.
 *
 * Effect emitted: `status_set` "protected" on the target. The dawn
 * resolution (engine/dawn.ts) uses that status to cancel a
 * `marked_for_death`.
 *
 * If the user's chosen target equals last night's target, the role
 * silently no-ops (the moderator UI is responsible for blocking the
 * choice; the role's job is to never produce an illegal protect).
 */

import { Effect } from '../engine/effects'
import { RNG } from '../engine/rng'
import { GameState, PlayerState } from '../engine/types'
import { DOCTOR_LAST_TARGET_PREFIX, PROTECTED } from '../engine/effects'
import { RoleDef, readTarget } from './role-def'

export const DOCTOR_ID = 'doctor' as const

function readLastTarget(self: PlayerState): string | null {
  for (const s of self.statuses) {
    if (s.startsWith(DOCTOR_LAST_TARGET_PREFIX)) {
      return s.slice(DOCTOR_LAST_TARGET_PREFIX.length)
    }
  }
  return null
}

function protectAction(state: GameState, self: PlayerState, rng: RNG): Effect[] {
  if (!self.alive) return []
  const last = readLastTarget(self)
  let targetId = readTarget(self)
  if (!targetId) {
    const pool = state.players.filter(
      (p) => p.alive && p.id !== self.id && p.id !== last,
    )
    if (pool.length === 0) return []
    targetId = rng.pick(pool).id
  }
  // Hard rule: cannot protect the same player two nights in a row.
  if (targetId === last) return []
  const target = state.players.find((p) => p.id === targetId)
  if (!target || !target.alive) return []
  const effects: Effect[] = []
  // Drop the previous "doctor_last:<x>" status before stamping the new one.
  if (last !== null) {
    effects.push({
      kind: 'status_clear',
      target: self.id,
      status: `${DOCTOR_LAST_TARGET_PREFIX}${last}`,
    })
  }
  effects.push({
    kind: 'status_set',
    target: self.id,
    status: `${DOCTOR_LAST_TARGET_PREFIX}${targetId}`,
  })
  effects.push({ kind: 'status_set', target: targetId, status: PROTECTED })
  return effects
}

export const doctor: RoleDef = {
  id: DOCTOR_ID,
  team: 'village',

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return protectAction(state, self, rng)
  },
  night(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return protectAction(state, self, rng)
  },
  onDeath(): Effect[] {
    return []
  },
}
