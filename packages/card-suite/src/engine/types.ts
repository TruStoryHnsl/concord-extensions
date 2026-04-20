/**
 * Shared types for per-game rule modules.
 * Spec: INS-006 §4.
 */

import { RNG } from './rng'

export type UXMode = 'party' | 'display' | 'service' | 'hybrid'

export type PlayerId = string

export type TerminalStatus = 'playing' | 'win' | 'loss' | 'draw'

/**
 * Every game module in src/games/<id>/rules.ts exports these.
 * Tests call applyAction against crafted states; no DOM is touched.
 */
export interface GameRuleModule<TState, TAction, TInitOpts = unknown> {
  readonly gameId: string
  readonly displayName: string
  readonly supportedModes: readonly UXMode[]
  readonly minPlayers: number
  readonly maxPlayers: number

  makeInitial(opts: TInitOpts, rng: RNG): TState
  legalActions(state: TState, by: PlayerId): TAction[]
  applyAction(state: TState, action: TAction, rng: RNG): TState
  terminalStatus(state: TState): TerminalStatus
}
