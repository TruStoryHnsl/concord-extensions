/**
 * Card Game Suite (INS-006) — entry point.
 *
 * v0.2.0: ships rule modules for all 6 games (Solitaire, Hold'em, Blackjack,
 * Speed, Kings & Peasants, War) plus an in-iframe selector. The mode-specific
 * rendering surfaces (private hand on phone, party-display split, etc.) are
 * deferred until the main concord repo ships the extension shell SDK
 * (Phase 1, postMessage bridge); when that lands, mode-adapters.ts will wire
 * each game's per-mode UI through it.
 *
 * Re-exports the engine and rule modules so they can be unit-tested without
 * the DOM and so the host can introspect the registry for the marketplace UI.
 */

export * as card from './engine/card'
export * as deck from './engine/deck'
export * as hand from './engine/hand'
export * as pile from './engine/pile'
export * as rng from './engine/rng'
export * from './engine/types'

export { solitaireRules } from './games/solitaire/rules'
export { holdemRules } from './games/poker/holdem'
export { blackjackRules } from './games/blackjack/rules'
export { speedRules } from './games/speed/rules'
export { kingsAndPeasantsRules } from './games/kings-and-peasants/rules'
export { warRules } from './games/war/rules'

export {
  GAMES,
  filterGamesByMode,
  gameById,
  gameCompatList,
} from './session/game-picker'

import { GAMES } from './session/game-picker'

/** Replace all children of an element with the given nodes. */
function replaceChildren(el: HTMLElement, ...nodes: Node[]): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  for (const n of nodes) el.appendChild(n)
}

/**
 * Minimal in-iframe selector. Renders a 2x3 grid of game tiles and shows
 * mode requirements when one is clicked. Real per-mode rendering is gated
 * on the shell SDK; for now picking a game just shows its info.
 */
function mountPicker(root: HTMLElement): void {
  root.style.fontFamily = 'system-ui, -apple-system, sans-serif'
  root.style.background = '#1a1a1a'
  root.style.color = '#e8e8e8'
  root.style.minHeight = '100vh'
  root.style.padding = '24px'
  root.style.boxSizing = 'border-box'

  const title = document.createElement('h1')
  title.textContent = 'Card Game Suite'
  title.style.margin = '0 0 8px 0'
  title.style.fontSize = '24px'
  title.style.fontWeight = '600'
  root.appendChild(title)

  const subtitle = document.createElement('p')
  subtitle.textContent = 'Pick a game to play.'
  subtitle.style.margin = '0 0 24px 0'
  subtitle.style.opacity = '0.7'
  root.appendChild(subtitle)

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))'
  grid.style.gap = '12px'
  grid.style.maxWidth = '900px'
  root.appendChild(grid)

  const detail = document.createElement('div')
  detail.style.marginTop = '24px'
  detail.style.padding = '16px'
  detail.style.background = '#222'
  detail.style.borderRadius = '8px'
  detail.style.maxWidth = '900px'
  detail.style.minHeight = '60px'
  detail.style.fontSize = '14px'
  detail.style.lineHeight = '1.5'
  detail.textContent = 'Select a game above to see its mode requirements.'
  root.appendChild(detail)

  for (const g of GAMES) {
    const tile = document.createElement('button')
    tile.style.padding = '20px 16px'
    tile.style.background = '#2c2c2c'
    tile.style.color = '#e8e8e8'
    tile.style.border = '1px solid #3a3a3a'
    tile.style.borderRadius = '8px'
    tile.style.cursor = 'pointer'
    tile.style.fontSize = '16px'
    tile.style.fontWeight = '500'
    tile.style.transition = 'background 80ms'
    tile.textContent = g.displayName
    tile.addEventListener('mouseenter', () => {
      tile.style.background = '#3a3a3a'
    })
    tile.addEventListener('mouseleave', () => {
      tile.style.background = '#2c2c2c'
    })
    tile.addEventListener('click', () => {
      const modes = g.supportedModes.join(', ')
      const h = document.createElement('h3')
      h.textContent = g.displayName
      h.style.margin = '0 0 8px 0'
      const p1 = document.createElement('div')
      p1.textContent = `Players: ${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}-${g.maxPlayers}`}`
      p1.style.marginBottom = '4px'
      const p2 = document.createElement('div')
      p2.textContent = `Modes: ${modes}`
      p2.style.marginBottom = '8px'
      const note = document.createElement('div')
      note.textContent =
        'Mode-specific game UI is wired by the Concord shell SDK (Phase 1). ' +
        'This selector confirms the game is registered and its rule module loaded.'
      note.style.opacity = '0.6'
      note.style.fontStyle = 'italic'
      replaceChildren(detail, h, p1, p2, note)
    })
    grid.appendChild(tile)
  }
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('card-suite-root')
  if (root) mountPicker(root)
}
