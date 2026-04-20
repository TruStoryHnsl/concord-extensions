/**
 * Effect ADT — what role handlers emit. The engine is responsible for
 * applying effects back onto GameState; this keeps role logic pure and
 * testable against crafted states.
 * Spec: INS-004 §5.
 */

import { GameState, PlayerId, RoleId } from './types'

export type Effect =
  /** DM text to a single player. */
  | { readonly kind: 'whisper'; readonly to: PlayerId; readonly text: string }
  /** Structured info grant: role ids or player references. */
  | { readonly kind: 'info_grant'; readonly to: PlayerId; readonly payload: Readonly<Record<string, unknown>> }
  /** Toggle a named status on a player. */
  | { readonly kind: 'status_set'; readonly target: PlayerId; readonly status: string }
  /** Remove a named status from a player. */
  | { readonly kind: 'status_clear'; readonly target: PlayerId; readonly status: string }
  /** Kill a player. Bookkeeping (ghost vote etc.) happens in deaths.ts. */
  | { readonly kind: 'kill'; readonly target: PlayerId; readonly source: 'demon' | 'execution' | 'other' }
  /** Reveal one role id to a player (Washerwoman / Librarian-style bluff pool). */
  | { readonly kind: 'role_info'; readonly to: PlayerId; readonly roles: readonly RoleId[] }

/**
 * Apply an Effect to GameState, returning a new GameState. Pure.
 * `kill` uses deaths.ts via a re-export to avoid a circular module.
 */
export function applyEffect(state: GameState, effect: Effect): GameState {
  switch (effect.kind) {
    case 'whisper':
    case 'info_grant':
    case 'role_info':
      // No state mutation — these are messages sent to the client via
      // send_to_device. The engine logs them but does not change GameState.
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
      // Implemented here (not deaths.ts) to avoid circular imports; deaths.ts
      // imports types only.
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === effect.target && p.alive ? { ...p, alive: false } : p,
        ),
      }
  }
}

export function applyEffects(state: GameState, effects: readonly Effect[]): GameState {
  let s = state
  for (const e of effects) s = applyEffect(s, e)
  return s
}
