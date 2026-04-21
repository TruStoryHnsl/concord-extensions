/**
 * Game-pick screen state — which game the session is playing and whether it
 * has a bot opponent.
 */

import type { Tier as ChessTier } from "../engine/chess/bot"

export type GameKind = "chess" | "checkers"

export interface SelectorState {
  game: GameKind | null
  vsBot: boolean
  botTier: ChessTier
}

export function makeInitialSelector(): SelectorState {
  return { game: null, vsBot: false, botTier: "casual" }
}

export function pickGame(prev: SelectorState, game: GameKind): SelectorState {
  return { ...prev, game }
}

export function toggleBot(prev: SelectorState): SelectorState {
  return { ...prev, vsBot: !prev.vsBot }
}

export function setTier(prev: SelectorState, tier: ChessTier): SelectorState {
  return { ...prev, botTier: tier }
}

export function isReady(s: SelectorState): boolean {
  return s.game !== null
}
