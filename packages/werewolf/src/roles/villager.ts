/**
 * Villager (Village team) — no night power, just a daytime vote.
 *
 * Trivial role definition: every night-action callback returns no effects.
 * Vote logic lives in the day-vote machinery (votes.ts), not on the role.
 */

import { Effect } from '../engine/effects'
import { RoleDef } from './role-def'

export const VILLAGER_ID = 'villager' as const

export const villager: RoleDef = {
  id: VILLAGER_ID,
  team: 'village',

  firstNight(): Effect[] {
    return []
  },
  night(): Effect[] {
    return []
  },
  onDeath(): Effect[] {
    return []
  },
}
