/**
 * Effect ADT — what role handlers emit. The engine applies effects back
 * onto GameState; this keeps role logic pure and testable against crafted
 * states.
 *
 * Generic shape (no role-specific knowledge baked in):
 *   - whisper / info_grant: messages to a player; no state mutation
 *   - status_set / status_clear: toggle a named status on a player
 *   - kill: mark a player dead (death source labeled for UI)
 *   - mark_for_death: set "marked_for_death" status; resolved at dawn so
 *     the Doctor's protection can negate it
 *   - clear_marks: dawn-step helper to drop all "marked_for_death" statuses
 */

import { GameState, PlayerId } from './types'

export type Effect =
  /** DM text to a single player. */
  | { readonly kind: 'whisper'; readonly to: PlayerId; readonly text: string }
  /** Structured info grant to a player (e.g. "Seer learns target's team"). */
  | { readonly kind: 'info_grant'; readonly to: PlayerId; readonly payload: Readonly<Record<string, unknown>> }
  /** Toggle a named status on a player. */
  | { readonly kind: 'status_set'; readonly target: PlayerId; readonly status: string }
  /** Remove a named status from a player. */
  | { readonly kind: 'status_clear'; readonly target: PlayerId; readonly status: string }
  /** Kill a player. Bookkeeping (lynches counter etc.) happens via deaths.ts. */
  | { readonly kind: 'kill'; readonly target: PlayerId; readonly source: 'werewolves' | 'lynch' | 'witch' | 'other' }
  /** Mark a player for death; resolved at dawn (Doctor protection cancels it). */
  | { readonly kind: 'mark_for_death'; readonly target: PlayerId; readonly source: 'werewolves' | 'witch' }

export const MARKED_FOR_DEATH = 'marked_for_death'
export const PROTECTED = 'protected'
export const DOCTOR_LAST_TARGET_PREFIX = 'doctor_last:'
export const WITCH_HEAL_USED = 'witch_heal_used'
export const WITCH_KILL_USED = 'witch_kill_used'

/**
 * Apply an Effect to GameState, returning a new GameState. Pure.
 * `kill` mutates `players[i].alive`; whisper/info_grant are no-ops.
 */
export function applyEffect(state: GameState, effect: Effect): GameState {
  switch (effect.kind) {
    case 'whisper':
    case 'info_grant':
      return state

    case 'status_set':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === effect.target && !p.statuses.includes(effect.status)
            ? { ...p, statuses: [...p.statuses, effect.status] }
            : p,
        ),
      }

    case 'status_clear':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === effect.target
            ? { ...p, statuses: p.statuses.filter((s) => s !== effect.status) }
            : p,
        ),
      }

    case 'kill':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === effect.target && p.alive ? { ...p, alive: false } : p,
        ),
      }

    case 'mark_for_death':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === effect.target && !p.statuses.includes(MARKED_FOR_DEATH)
            ? { ...p, statuses: [...p.statuses, MARKED_FOR_DEATH] }
            : p,
        ),
      }
  }
}

export function applyEffects(state: GameState, effects: readonly Effect[]): GameState {
  let s = state
  for (const e of effects) s = applyEffect(s, e)
  return s
}
