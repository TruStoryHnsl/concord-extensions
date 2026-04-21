/**
 * Trouble Brewing pilot roster (v1 subset).
 * Spec: INS-004 §5. Full 22-role script is deferred; these five exercise
 * every branch of the Effect ADT: role_info / info_grant / status_set /
 * status_clear / kill.
 */

import { RoleDef } from './role-def'
import { imp, IMP_ID } from './imp'
import { investigator, INVESTIGATOR_ID } from './investigator'
import { librarian, LIBRARIAN_ID } from './librarian'
import { poisoner, POISONER_ID } from './poisoner'
import { washerwoman, WASHERWOMAN_ID } from './washerwoman'

export const TROUBLE_BREWING_PILOT_ROLES: Record<string, RoleDef> = {
  [WASHERWOMAN_ID]: washerwoman,
  [LIBRARIAN_ID]: librarian,
  [INVESTIGATOR_ID]: investigator,
  [IMP_ID]: imp,
  [POISONER_ID]: poisoner,
}

export {
  imp,
  IMP_ID,
  investigator,
  INVESTIGATOR_ID,
  librarian,
  LIBRARIAN_ID,
  poisoner,
  POISONER_ID,
  washerwoman,
  WASHERWOMAN_ID,
}
export type { RoleDef } from './role-def'
