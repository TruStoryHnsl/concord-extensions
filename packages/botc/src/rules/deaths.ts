/**
 * Death resolution — pure.
 * Spec: INS-004 §4, §7, §9.
 *
 * BotC has two primary death paths: night kill (demon) and execution (day).
 * This module composes the small state transitions around dying: marking
 * dead, marking the kill source for UI, bumping executionsToday when
 * appropriate, and checking the game-end conditions.
 */

import { Alignment, GameState, PlayerId } from './types'

export interface DeathContext {
  readonly source: 'demon' | 'execution' | 'other'
  readonly dayNumber: number
}

/** Apply a death. Returns new GameState. */
export function applyDeath(
  state: GameState,
  target: PlayerId,
  ctx: DeathContext,
): GameState {
  const next = {
    ...state,
    players: state.players.map((p) =>
      p.id === target && p.alive ? { ...p, alive: false } : p,
    ),
  }

  if (ctx.source === 'execution') {
    return { ...next, executionsToday: next.executionsToday + 1 }
  }
  return next
}

/**
 * Evaluate end-of-game conditions. Returns the winning alignment if the game
 * is over, otherwise null.
 *
 * Simplified v1 rules (match the pilot-role subset we ship):
 *   - If the demon is dead and not resurrected, good wins.
 *   - If fewer than 3 good players remain alive, evil wins.
 *
 * These match the canonical Trouble Brewing resolution for the 5-role pilot.
 * Full endgame (Saint, Mayor, Slayer interactions) lives in role-specific
 * handlers that mark additional statuses / override the result.
 */
export function checkWinCondition(state: GameState): Alignment | null {
  // No win check until the script has dealt roles (there's at least one demon
  // player in the game). This prevents an empty-roster state from being
  // reported as a good win.
  const demonExists = state.players.some((p) => p.team === 'demon')
  if (!demonExists) return null

  const demonAlive = state.players.some((p) => p.team === 'demon' && p.alive)
  if (!demonAlive) return 'good'

  const aliveGood = state.players.filter((p) => p.alignment === 'good' && p.alive).length
  if (aliveGood < 3) return 'evil'

  return null
}
