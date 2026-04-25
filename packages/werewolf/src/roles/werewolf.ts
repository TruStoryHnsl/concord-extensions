/**
 * Werewolf (Werewolves team).
 *
 * Each night, the werewolves collectively choose one player to attack.
 * The chosen target is *marked for death* — the actual kill resolves at
 * dawn so the Doctor's protection can negate it.
 *
 * Per-werewolf flow: each werewolf receives a `target:<id>` status (their
 * vote for tonight's kill). The role's night() emits a `mark_for_death`
 * for the target. Multiple werewolves voting for the same id stack
 * idempotently (mark_for_death is idempotent in effects.ts).
 *
 * If no target is stamped, the role auto-picks a random non-werewolf
 * alive player to keep the game advancing in headless / dev mode.
 *
 * Werewolves do NOT act on the first night in our default ruleset — the
 * first night is reserved for info roles (Seer) so day 1 isn't an empty
 * lynch. This matches the most common public-domain Werewolf variant.
 */

import { Effect } from '../engine/effects'
import { RNG } from '../engine/rng'
import { GameState, PlayerState } from '../engine/types'
import { RoleDef, readTarget } from './role-def'

export const WEREWOLF_ID = 'werewolf' as const

function killAction(state: GameState, self: PlayerState, rng: RNG): Effect[] {
  if (!self.alive) return []
  let targetId = readTarget(self)
  if (!targetId) {
    const pool = state.players.filter((p) => p.alive && p.team !== 'werewolves')
    if (pool.length === 0) return []
    targetId = rng.pick(pool).id
  }
  // Don't mark a non-existent or dead player.
  const target = state.players.find((p) => p.id === targetId)
  if (!target || !target.alive) return []
  return [{ kind: 'mark_for_death', target: targetId, source: 'werewolves' }]
}

export const werewolf: RoleDef = {
  id: WEREWOLF_ID,
  team: 'werewolves',

  firstNight(): Effect[] {
    // Werewolves do not kill on the first night — first night is reserved
    // for info roles to seed the game.
    return []
  },
  night(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    return killAction(state, self, rng)
  },
  onDeath(): Effect[] {
    return []
  },
}
