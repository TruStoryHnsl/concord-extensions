/**
 * Game picker — pure registry + filter logic for the in-iframe selector UI.
 *
 * Spec: INS-006 §6.
 *
 * The picker itself is a static menu: list the six games, optionally filter by
 * the current session's UX mode. Once a game is chosen, the rule module's
 * makeInitial() / applyAction() drive the actual gameplay. The mode-specific
 * UI surface (private hand rendering, party-display split, etc.) is wired
 * up by mode-adapters.ts when the shell SDK ships in the main concord repo.
 *
 * For now this module only exposes pure logic so it can be tested without
 * the DOM, and the in-iframe shell mounts a minimal selector that surfaces
 * the registry to the user.
 */

import { GameRuleModule, UXMode } from '../engine/types'
import { blackjackRules } from '../games/blackjack/rules'
import { kingsAndPeasantsRules } from '../games/kings-and-peasants/rules'
import { holdemRules } from '../games/poker/holdem'
import { solitaireRules } from '../games/solitaire/rules'
import { speedRules } from '../games/speed/rules'
import { warRules } from '../games/war/rules'

/**
 * The full registry of game-rule modules. Order is the canonical order in
 * which the picker grid is displayed.
 */
export const GAMES: ReadonlyArray<GameRuleModule<unknown, unknown, unknown>> = [
  solitaireRules as unknown as GameRuleModule<unknown, unknown, unknown>,
  holdemRules as unknown as GameRuleModule<unknown, unknown, unknown>,
  blackjackRules as unknown as GameRuleModule<unknown, unknown, unknown>,
  speedRules as unknown as GameRuleModule<unknown, unknown, unknown>,
  kingsAndPeasantsRules as unknown as GameRuleModule<unknown, unknown, unknown>,
  warRules as unknown as GameRuleModule<unknown, unknown, unknown>,
]

/** Lookup by gameId. Returns undefined if no match. */
export function gameById(
  id: string,
): GameRuleModule<unknown, unknown, unknown> | undefined {
  return GAMES.find((g) => g.gameId === id)
}

/** All games whose supportedModes includes the given mode. */
export function filterGamesByMode(
  mode: UXMode,
): ReadonlyArray<GameRuleModule<unknown, unknown, unknown>> {
  return GAMES.filter((g) => g.supportedModes.includes(mode))
}

/**
 * Compatibility info for a single game in the context of a session mode.
 * Used by the picker UI to gate / explain game selection.
 */
export interface GameCompat {
  readonly game: GameRuleModule<unknown, unknown, unknown>
  readonly compatible: boolean
  readonly missingMode: UXMode | null
}

/** Annotate every game with compatibility info for the given mode. */
export function gameCompatList(mode: UXMode): readonly GameCompat[] {
  return GAMES.map((g) => ({
    game: g,
    compatible: g.supportedModes.includes(mode),
    missingMode: g.supportedModes.includes(mode) ? null : mode,
  }))
}
