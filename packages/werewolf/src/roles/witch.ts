/**
 * Witch (Village team).
 *
 * Holds two one-shot potions for the entire game:
 *   - heal: negates one Werewolf kill tonight (clears any
 *     `marked_for_death` status placed by the wolves' attack)
 *   - kill: kills one player of her choice tonight
 *
 * Both are night-only and consumed by status flags on the Witch herself
 * (`witch_heal_used`, `witch_kill_used`). The engine commits potions
 * before the day vote outcome, matching the canonical no-foreknowledge
 * rule.
 *
 * Targets are injected as separate statuses so the Witch can heal AND
 * kill in the same night:
 *   `heal_target:<id>` — drops the marked_for_death from <id>
 *   `kill_target:<id>` — emits a kill on <id>
 *
 * Without those targets the role no-ops (Witch chooses to hold).
 */

import { Effect } from '../engine/effects'
import {
  HEAL_TARGET_STATUS_PREFIX,
  KILL_TARGET_STATUS_PREFIX,
  RoleDef,
  readTarget,
} from './role-def'
import {
  MARKED_FOR_DEATH,
  WITCH_HEAL_USED,
  WITCH_KILL_USED,
} from '../engine/effects'
import { GameState, PlayerState } from '../engine/types'

export const WITCH_ID = 'witch' as const

function witchAction(state: GameState, self: PlayerState): Effect[] {
  if (!self.alive) return []
  const effects: Effect[] = []
  const healTarget = readTarget(self, HEAL_TARGET_STATUS_PREFIX)
  const killTarget = readTarget(self, KILL_TARGET_STATUS_PREFIX)
  const healUsed = self.statuses.includes(WITCH_HEAL_USED)
  const killUsed = self.statuses.includes(WITCH_KILL_USED)

  if (healTarget && !healUsed) {
    const target = state.players.find((p) => p.id === healTarget)
    if (target && target.alive) {
      // Heal cancels the marked_for_death status if present.
      effects.push({ kind: 'status_clear', target: healTarget, status: MARKED_FOR_DEATH })
      effects.push({ kind: 'status_set', target: self.id, status: WITCH_HEAL_USED })
    }
  }

  if (killTarget && !killUsed && killTarget !== self.id) {
    const target = state.players.find((p) => p.id === killTarget)
    if (target && target.alive) {
      effects.push({ kind: 'kill', target: killTarget, source: 'witch' })
      effects.push({ kind: 'status_set', target: self.id, status: WITCH_KILL_USED })
    }
  }

  return effects
}

export const witch: RoleDef = {
  id: WITCH_ID,
  team: 'village',

  firstNight(state: GameState, self: PlayerState): Effect[] {
    return witchAction(state, self)
  },
  night(state: GameState, self: PlayerState): Effect[] {
    return witchAction(state, self)
  },
  onDeath(): Effect[] {
    return []
  },
}
