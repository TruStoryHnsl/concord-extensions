/**
 * Script composition — which roles are in play for a given script + night
 * order.
 * Spec: INS-004 §5.
 *
 * v1 pilot ships the Trouble Brewing script with the five pilot roles only.
 * Full Trouble Brewing (22 roles), Sects & Violets, and Bad Moon Rising
 * compose onto the same engine in later sprints.
 */

import {
  IMP_ID,
  INVESTIGATOR_ID,
  LIBRARIAN_ID,
  POISONER_ID,
  RoleDef,
  TROUBLE_BREWING_PILOT_ROLES,
  WASHERWOMAN_ID,
} from './roles/trouble-brewing'
import { RoleId, ScriptId } from './types'

export interface ScriptDef {
  readonly id: ScriptId
  readonly displayName: string
  readonly roles: Record<RoleId, RoleDef>
  /** First-night wake order — script-canonical. */
  readonly firstNightOrder: readonly RoleId[]
  /** Regular night wake order. */
  readonly nightOrder: readonly RoleId[]
}

export const TROUBLE_BREWING_PILOT: ScriptDef = {
  id: 'trouble-brewing',
  displayName: 'Trouble Brewing (pilot)',
  roles: TROUBLE_BREWING_PILOT_ROLES,
  firstNightOrder: [
    POISONER_ID, // minions learn / act first
    WASHERWOMAN_ID,
    LIBRARIAN_ID,
    INVESTIGATOR_ID,
    // Imp does NOT kill on first night per Trouble Brewing rules.
  ],
  nightOrder: [
    POISONER_ID,
    IMP_ID,
    // Info-gathering townsfolk (Washerwoman/Librarian/Investigator) are
    // first-night-only. Empath / Undertaker / Ravenkeeper land when the
    // full roster is implemented.
  ],
}

export function getScript(id: ScriptId): ScriptDef {
  switch (id) {
    case 'trouble-brewing':
      return TROUBLE_BREWING_PILOT
    case 'sects-and-violets':
    case 'bad-moon-rising':
      throw new Error(`scripts: ${id} is not implemented in v1 pilot`)
  }
}
