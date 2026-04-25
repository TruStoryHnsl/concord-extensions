/**
 * Role definition contract.
 *
 * Each role is a tiny module exporting a RoleDef. The engine calls
 * firstNight(state, self, rng) on the first night, night(state, self, rng)
 * on subsequent nights, and uses team/role to drive day-vote logic.
 *
 * Targets are injected via `target:<playerId>` statuses on the actor's
 * PlayerState before invocation — the same pattern card-suite/botc used.
 * This keeps role logic pure (no IO/UI access from the role file) and
 * deterministic for tests, while letting the moderator UI / bot driver
 * drop in target choices as plain status mutations.
 */

import { Effect } from '../engine/effects'
import { RNG } from '../engine/rng'
import { GameState, PlayerState, RoleId, Team } from '../engine/types'

export interface RoleDef {
  readonly id: RoleId
  readonly team: Team

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[]
  night(state: GameState, self: PlayerState, rng: RNG): Effect[]
  onDeath(state: GameState, self: PlayerState): Effect[]
}

export const TARGET_STATUS_PREFIX = 'target:'
export const HEAL_TARGET_STATUS_PREFIX = 'heal_target:'
export const KILL_TARGET_STATUS_PREFIX = 'kill_target:'

/** Read the current `target:<id>` from an actor's statuses, if any. */
export function readTarget(self: PlayerState, prefix = TARGET_STATUS_PREFIX): string | null {
  for (const s of self.statuses) {
    if (s.startsWith(prefix)) return s.slice(prefix.length)
  }
  return null
}
