/**
 * Role definition contract.
 * Spec: INS-004 §5.
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { Alignment, GameState, PlayerId, PlayerState, RoleId, Team } from '../../types'

export interface RoleDef {
  readonly id: RoleId
  readonly team: Team
  readonly alignment: Alignment

  firstNight(state: GameState, self: PlayerState, rng: RNG): Effect[]
  night(state: GameState, self: PlayerState, rng: RNG): Effect[]
  onNominated(state: GameState, self: PlayerState, nominator: PlayerId): Effect[]
  onDeath(state: GameState, self: PlayerState): Effect[]
}
