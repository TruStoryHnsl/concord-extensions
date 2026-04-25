/**
 * Default Werewolf rolesets and night-action resolution order.
 *
 * Three small-table rolesets ship in v0.4.0:
 *   - classic-5: 5 players, 1 Werewolf, 1 Seer, 3 Villagers
 *   - classic-6: 6 players, 1 Werewolf, 1 Seer, 1 Doctor, 3 Villagers
 *   - classic-7: 7 players, 2 Werewolves, 1 Seer, 1 Doctor, 1 Witch, 2 Villagers
 *
 * Night-action resolution order matters: Doctor must resolve BEFORE the
 * werewolves' kill is finalised at dawn, and the Witch's heal potion
 * must resolve BEFORE the dawn step too. The order below matches that —
 * the Werewolves only mark_for_death; the dawn step applies the kill.
 *
 * Spec resolution order: Werewolves → Doctor → Witch → Seer.
 */

import { DOCTOR_ID, SEER_ID, VILLAGER_ID, WEREWOLF_ID, WITCH_ID } from './roles'
import { RoleId, RolesetId } from './engine/types'

export interface RolesetDef {
  readonly id: RolesetId
  readonly displayName: string
  readonly playerCount: number
  /** Multiset of role ids that should be in play. Length === playerCount. */
  readonly roles: readonly RoleId[]
  /** First-night wake order. */
  readonly firstNightOrder: readonly RoleId[]
  /** Regular-night wake order. */
  readonly nightOrder: readonly RoleId[]
}

const STANDARD_FIRST_NIGHT: readonly RoleId[] = [
  // No Werewolf kill on first night per default rules. Other roles wake to
  // gather info / set up state.
  DOCTOR_ID,
  WITCH_ID,
  SEER_ID,
]

const STANDARD_NIGHT: readonly RoleId[] = [
  // Wolves mark first so the Doctor's protection can negate the mark, then
  // the Witch can heal whatever's left or add her own kill, then the Seer
  // peeks (peek result reflects the night's deaths).
  WEREWOLF_ID,
  DOCTOR_ID,
  WITCH_ID,
  SEER_ID,
]

export const CLASSIC_5: RolesetDef = {
  id: 'classic-5',
  displayName: '5 players · classic small',
  playerCount: 5,
  roles: [WEREWOLF_ID, SEER_ID, VILLAGER_ID, VILLAGER_ID, VILLAGER_ID],
  firstNightOrder: STANDARD_FIRST_NIGHT,
  nightOrder: STANDARD_NIGHT,
}

export const CLASSIC_6: RolesetDef = {
  id: 'classic-6',
  displayName: '6 players · classic plus Doctor',
  playerCount: 6,
  roles: [WEREWOLF_ID, SEER_ID, DOCTOR_ID, VILLAGER_ID, VILLAGER_ID, VILLAGER_ID],
  firstNightOrder: STANDARD_FIRST_NIGHT,
  nightOrder: STANDARD_NIGHT,
}

export const CLASSIC_7: RolesetDef = {
  id: 'classic-7',
  displayName: '7 players · pack of two with Witch',
  playerCount: 7,
  roles: [
    WEREWOLF_ID,
    WEREWOLF_ID,
    SEER_ID,
    DOCTOR_ID,
    WITCH_ID,
    VILLAGER_ID,
    VILLAGER_ID,
  ],
  firstNightOrder: STANDARD_FIRST_NIGHT,
  nightOrder: STANDARD_NIGHT,
}

export const ALL_ROLESETS: readonly RolesetDef[] = [CLASSIC_5, CLASSIC_6, CLASSIC_7]

export function getRoleset(id: RolesetId): RolesetDef {
  switch (id) {
    case 'classic-5':
      return CLASSIC_5
    case 'classic-6':
      return CLASSIC_6
    case 'classic-7':
      return CLASSIC_7
  }
}
