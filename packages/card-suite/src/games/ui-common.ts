/**
 * Shared UI helpers for per-game renderers.
 *
 * Style guide (matches the picker palette):
 *   bg            #1a1a1a
 *   fg            #e8e8e8
 *   tile          #2c2c2c
 *   tile-hover    #3a3a3a
 *   panel         #222
 *   panel-border  #333
 *   card-face     #ffffff
 *   card-text     #111 / #c33 (red suits)
 */

import { Card, color, Suit } from '../engine/card'
import { ViewVariant } from '../session/mode-adapter'

export const SUIT_GLYPH: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
}

export interface GameRenderHandle<S> {
  /** Tear down listeners and unmount. */
  destroy(): void
  /** Update the rendered DOM from a new state (no-op if state unchanged by ref). */
  update(next: S): void
}

export interface GameRenderOpts<S, A> {
  root: HTMLElement
  initialState: S
  variant: ViewVariant
  selfPlayerId: string
  onAction: (action: A) => void
}

/** Build a face-up card element. */
export function makeCardEl(card: Card, opts?: { compact?: boolean }): HTMLElement {
  const compact = opts?.compact ?? false
  const el = document.createElement('div')
  el.className = 'cs-card cs-card-up'
  el.dataset.cardId = card.id
  el.style.width = compact ? '36px' : '52px'
  el.style.height = compact ? '52px' : '74px'
  el.style.background = '#fff'
  el.style.border = '1px solid #888'
  el.style.borderRadius = compact ? '4px' : '6px'
  el.style.color = color(card.suit) === 'red' ? '#c33' : '#111'
  el.style.fontFamily = 'system-ui, -apple-system, sans-serif'
  el.style.fontWeight = '600'
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.justifyContent = 'space-between'
  el.style.padding = compact ? '3px 4px' : '4px 6px'
  el.style.boxSizing = 'border-box'
  el.style.userSelect = 'none'
  el.style.cursor = 'default'
  el.style.fontSize = compact ? '12px' : '14px'

  const tl = document.createElement('div')
  tl.textContent = `${card.rank}${SUIT_GLYPH[card.suit]}`
  tl.style.lineHeight = '1'
  el.appendChild(tl)

  const center = document.createElement('div')
  center.textContent = SUIT_GLYPH[card.suit]
  center.style.textAlign = 'center'
  center.style.fontSize = compact ? '14px' : '20px'
  center.style.lineHeight = '1'
  el.appendChild(center)

  const br = document.createElement('div')
  br.textContent = `${card.rank}${SUIT_GLYPH[card.suit]}`
  br.style.lineHeight = '1'
  br.style.textAlign = 'right'
  br.style.transform = 'rotate(180deg)'
  el.appendChild(br)

  return el
}

/** Build a face-down card element. */
export function makeCardBackEl(opts?: { compact?: boolean }): HTMLElement {
  const compact = opts?.compact ?? false
  const el = document.createElement('div')
  el.className = 'cs-card cs-card-down'
  el.style.width = compact ? '36px' : '52px'
  el.style.height = compact ? '52px' : '74px'
  el.style.background =
    'repeating-linear-gradient(45deg, #2a4d6c 0 6px, #1f3a52 6px 12px)'
  el.style.border = '1px solid #555'
  el.style.borderRadius = compact ? '4px' : '6px'
  el.style.boxSizing = 'border-box'
  return el
}

/** Build an empty pile placeholder (dotted outline). */
export function makeEmptySlotEl(opts?: { compact?: boolean; label?: string }): HTMLElement {
  const compact = opts?.compact ?? false
  const el = document.createElement('div')
  el.style.width = compact ? '36px' : '52px'
  el.style.height = compact ? '52px' : '74px'
  el.style.border = '1px dashed #444'
  el.style.borderRadius = compact ? '4px' : '6px'
  el.style.boxSizing = 'border-box'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.color = '#555'
  el.style.fontSize = '11px'
  if (opts?.label) el.textContent = opts.label
  return el
}

/** Build a styled action button. */
export function makeButton(
  label: string,
  onClick: () => void,
  opts?: { disabled?: boolean; primary?: boolean },
): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.disabled = !!opts?.disabled
  b.style.padding = '8px 14px'
  b.style.background = opts?.primary ? '#2c5d8a' : '#2c2c2c'
  b.style.color = '#e8e8e8'
  b.style.border = '1px solid #3a3a3a'
  b.style.borderRadius = '6px'
  b.style.cursor = b.disabled ? 'not-allowed' : 'pointer'
  b.style.fontSize = '13px'
  b.style.fontWeight = '500'
  if (b.disabled) b.style.opacity = '0.4'
  b.addEventListener('click', () => {
    if (!b.disabled) onClick()
  })
  return b
}

/** Replace all children of an element with the given nodes. */
export function replaceChildren(el: HTMLElement, ...nodes: Node[]): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  for (const n of nodes) el.appendChild(n)
}

/** Apply the standard panel styling (used by sub-regions of game UIs). */
export function panelStyle(el: HTMLElement): void {
  el.style.background = '#222'
  el.style.border = '1px solid #333'
  el.style.borderRadius = '8px'
  el.style.padding = '12px'
  el.style.boxSizing = 'border-box'
}

/** Apply the standard root styling for game render mounts. */
export function gameRootStyle(el: HTMLElement): void {
  el.style.fontFamily = 'system-ui, -apple-system, sans-serif'
  el.style.background = '#1a1a1a'
  el.style.color = '#e8e8e8'
  el.style.padding = '16px'
  el.style.boxSizing = 'border-box'
  el.style.minHeight = '100vh'
}
