/**
 * Death resolution — pure.
 *
 * Werewolf has three primary death paths: night kill (werewolves), day lynch
 * (vote), and witch kill (one-shot potion). This module composes the small
 * state transitions around dying: marking dead, bumping lynchesToday when
 * appropriate, and checking the game-end conditions.
 */

import { GameState, PlayerId, Team } from './types'

export interface DeathContext {
  readonly source: 'werewolves' | 'lynch' | 'witch' | 'other'
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

  if (ctx.source === 'lynch') {
    return { ...next, lynchesToday: next.lynchesToday + 1 }
  }
  return next
}

/**
 * Evaluate end-of-game conditions. Returns the winning team if the game
 * is over, otherwise null.
 *
 * Werewolf canon:
 *   - Village wins when no werewolves remain alive.
 *   - Werewolves win when alive werewolves >= alive non-werewolves
 *     (i.e. the wolves equal/outnumber the village and can't be voted down).
 *   - Game has not started until at least one werewolf is in play.
 */
export function checkWinCondition(state: GameState): Team | null {
  const werewolfExists = state.players.some((p) => p.team === 'werewolves')
  if (!werewolfExists) return null

  const aliveWerewolves = state.players.filter((p) => p.team === 'werewolves' && p.alive).length
  if (aliveWerewolves === 0) return 'village'

  const aliveVillage = state.players.filter((p) => p.team === 'village' && p.alive).length
  if (aliveWerewolves >= aliveVillage) return 'werewolves'

  return null
}
