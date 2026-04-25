/**
 * Default Werewolf roleset — five public-domain folk-canon roles.
 *
 * Naming note: BotC calls a fixed combination of roles a "script". We use
 * "roleset" because "script" is a BotC-specific jargon term.
 */

import { villager, VILLAGER_ID } from './villager'
import { werewolf, WEREWOLF_ID } from './werewolf'
import { seer, SEER_ID } from './seer'
import { doctor, DOCTOR_ID } from './doctor'
import { witch, WITCH_ID } from './witch'
import { RoleDef } from './role-def'
import { RoleId } from '../engine/types'

export const ALL_ROLES: Record<RoleId, RoleDef> = {
  [VILLAGER_ID]: villager,
  [WEREWOLF_ID]: werewolf,
  [SEER_ID]: seer,
  [DOCTOR_ID]: doctor,
  [WITCH_ID]: witch,
}

export {
  villager,
  VILLAGER_ID,
  werewolf,
  WEREWOLF_ID,
  seer,
  SEER_ID,
  doctor,
  DOCTOR_ID,
  witch,
  WITCH_ID,
}
export type { RoleDef } from './role-def'
