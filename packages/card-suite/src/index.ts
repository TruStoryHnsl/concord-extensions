/**
 * Card Game Suite (INS-006) — entry point.
 *
 * This extension is logic-first for v1; the per-mode UI surfaces are wired up
 * once the main concord repo ships the extension shell SDK (Phase 1). Until
 * then index.ts only registers the game-picker root element and re-exports
 * the pure rule modules so they can be imported by tests.
 */

export * as card from './engine/card'
export * as deck from './engine/deck'
export * as hand from './engine/hand'
export * as pile from './engine/pile'
export * as rng from './engine/rng'
export * from './engine/types'
export { solitaireRules } from './games/solitaire/rules'

// Mount-point placeholder — real UI is gated on the shell SDK.
if (typeof document !== 'undefined') {
  const root = document.getElementById('card-suite-root')
  if (root) {
    root.textContent = 'Card Game Suite extension (logic-only v0.1.0)'
  }
}
