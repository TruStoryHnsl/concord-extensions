/**
 * Phase state machine — pure transitions.
 * Spec: INS-004 §4.
 *
 * Canonical loop:
 *   setup → first_night → day (1) → night → day (2) → ... → over
 *
 * Each advance returns a new GameState with phase / day updated and
 * per-phase bookkeeping cleared (nominations reset per day).
 */

import { GameState, Phase } from './types'
import { checkWinCondition } from './deaths'

const PHASE_ORDER: readonly Phase[] = ['setup', 'first_night', 'day', 'night'] as const

/** Valid next-phase targets from a given current phase. */
export function legalNextPhases(current: Phase): readonly Phase[] {
  switch (current) {
    case 'setup':
      return ['first_night']
    case 'first_night':
      return ['day']
    case 'day':
      // Day can end either into night (normal) or directly into over (if
      // win condition triggered during the day). Execution is an event
      // inside day, not a separate phase in v1.
      return ['night', 'over']
    case 'night':
      return ['day', 'over']
    case 'execution':
    case 'over':
      return []
  }
}

/**
 * Advance to a named target phase. Throws if the transition is illegal.
 * Handles day-counter bump + per-day bookkeeping reset.
 */
export function advanceToPhase(state: GameState, target: Phase): GameState {
  const legal = legalNextPhases(state.phase)
  if (!legal.includes(target)) {
    throw new Error(
      `phases: illegal transition from "${state.phase}" to "${target}" (legal: ${legal.join(', ')})`,
    )
  }

  let day = state.day
  let nominations = state.nominations
  let executionsToday = state.executionsToday

  // Entering day increments the day counter and clears nominations & execution count.
  if (target === 'day') {
    day = state.day + 1
    nominations = []
    executionsToday = 0
  }

  // Win check after any non-setup transition.
  let winner = state.winner
  if (state.phase !== 'setup' && winner === null) {
    winner = checkWinCondition(state)
  }

  return {
    ...state,
    phase: winner !== null ? 'over' : target,
    day,
    nominations,
    executionsToday,
    winner,
  }
}

/**
 * Convenience: step forward through the canonical loop. Setup→first_night,
 * first_night→day, day→night, night→day. Useful for bot-admin sessions
 * that don't expose manual phase picking.
 */
export function advanceCanonical(state: GameState): GameState {
  switch (state.phase) {
    case 'setup':
      return advanceToPhase(state, 'first_night')
    case 'first_night':
      return advanceToPhase(state, 'day')
    case 'day':
      return advanceToPhase(state, 'night')
    case 'night':
      return advanceToPhase(state, 'day')
    case 'execution':
    case 'over':
      return state
  }
}

export { PHASE_ORDER }
