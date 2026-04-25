/**
 * Dawn resolution — pure.
 *
 * After every night, the engine collects each role's emitted Effects, then
 * runs the dawn step:
 *
 *   1. For each player still flagged `marked_for_death`:
 *      - if they are also `protected` (Doctor / Witch heal), drop both
 *        statuses; no death.
 *      - otherwise, kill them; drop both statuses.
 *   2. After kills, drop residual `protected` statuses on everyone (the
 *      Doctor's protection only lasts one night).
 *
 * The Witch's `kill` effect is applied directly during her night-action
 * (it's not a mark_for_death — she chose a specific player and her kill
 * is not protectable by the Doctor's same-night choice). The dawn step
 * only resolves marks left by the Werewolves' attack.
 *
 * Returns the post-dawn GameState. Pure / deterministic.
 */

import { GameState } from './types'
import { MARKED_FOR_DEATH, PROTECTED } from './effects'

export interface DawnReport {
  readonly state: GameState
  readonly killed: readonly string[]
  readonly saved: readonly string[]
}

export function resolveDawn(state: GameState): DawnReport {
  const killed: string[] = []
  const saved: string[] = []

  const players = state.players.map((p) => {
    const marked = p.statuses.includes(MARKED_FOR_DEATH)
    const protectedNow = p.statuses.includes(PROTECTED)
    if (!marked && !protectedNow) return p

    const nextStatuses = p.statuses.filter(
      (s) => s !== MARKED_FOR_DEATH && s !== PROTECTED,
    )

    let alive = p.alive
    if (marked && !protectedNow && p.alive) {
      alive = false
      killed.push(p.id)
    } else if (marked && protectedNow) {
      saved.push(p.id)
    }
    // Persistent statuses (doctor_last:<id>, witch_*_used) survive — they
    // weren't matched by the filter above.

    return { ...p, alive, statuses: nextStatuses }
  })

  return {
    state: { ...state, players },
    killed,
    saved,
  }
}
