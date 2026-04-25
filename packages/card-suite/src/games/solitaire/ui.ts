/**
 * Klondike Solitaire renderer.
 *
 * Variant: only `solo` is meaningful. Other variants render the same way
 * (Solitaire is a single-player game; the seat split has no effect).
 *
 * Interaction:
 *   - Click stock → `draw-from-stock` (or `recycle-waste` if stock is empty).
 *   - Click any face-up card → "select" (the source becomes the selected
 *     card, plus a destination prompt for legal moves).
 *   - Click an empty / valid destination → emits a `move` action.
 *
 * Network sync hook: a future shell wave will pipe `onAction` outbound and
 * receive remote state updates inbound — the renderer itself only knows
 * how to apply state via update().
 */

import { Suit } from '../../engine/card'
import {
  GameRenderHandle,
  GameRenderOpts,
  gameRootStyle,
  makeButton,
  makeCardBackEl,
  makeCardEl,
  makeEmptySlotEl,
  panelStyle,
  replaceChildren,
} from '../ui-common'
import {
  legalActions,
  SolitaireAction,
  SolitaireState,
} from './rules'

type Selection =
  | { kind: 'tableau'; index: number; depth: number } // depth = run length from top
  | { kind: 'waste' }
  | { kind: 'foundation'; suit: Suit }

export function renderSolitaire(
  opts: GameRenderOpts<SolitaireState, SolitaireAction>,
): GameRenderHandle<SolitaireState> {
  const { root, initialState, selfPlayerId, onAction } = opts
  let state = initialState
  let selection: Selection | null = null

  gameRootStyle(root)
  const wrapper = document.createElement('div')
  wrapper.style.maxWidth = '900px'
  wrapper.style.margin = '0 auto'
  root.appendChild(wrapper)

  const topRow = document.createElement('div')
  topRow.style.display = 'grid'
  topRow.style.gridTemplateColumns = 'auto 1fr auto'
  topRow.style.gap = '12px'
  topRow.style.alignItems = 'start'
  topRow.style.marginBottom = '16px'
  wrapper.appendChild(topRow)

  const stockArea = document.createElement('div')
  stockArea.style.display = 'flex'
  stockArea.style.gap = '8px'
  topRow.appendChild(stockArea)

  const spacer = document.createElement('div')
  topRow.appendChild(spacer)

  const foundationsArea = document.createElement('div')
  foundationsArea.style.display = 'flex'
  foundationsArea.style.gap = '8px'
  topRow.appendChild(foundationsArea)

  const tableauArea = document.createElement('div')
  tableauArea.style.display = 'grid'
  tableauArea.style.gridTemplateColumns = 'repeat(7, 1fr)'
  tableauArea.style.gap = '12px'
  wrapper.appendChild(tableauArea)

  const status = document.createElement('div')
  status.style.marginTop = '12px'
  status.style.fontSize = '13px'
  status.style.opacity = '0.7'
  wrapper.appendChild(status)

  // ----- helpers -------------------------------------------------------
  function setStatus(s: string): void {
    status.textContent = s
  }

  function clearSelection(): void {
    selection = null
    redraw()
  }

  function safeOnAction(a: SolitaireAction): void {
    try {
      onAction(a)
    } catch (e) {
      setStatus(`Illegal: ${(e as Error).message}`)
    }
  }

  function trySelectAndMove(target: Selection | { dest: 'tableau'; index: number } | { dest: 'foundation'; suit: Suit }): void {
    // If 'target' has a 'dest' field, it's a destination click; otherwise a source click.
    if ('dest' in target) {
      if (!selection) {
        setStatus('Pick a source card first.')
        return
      }
      const action: SolitaireAction = buildMoveAction(selection, target)
      selection = null
      safeOnAction(action)
      return
    }
    selection = target
    redraw()
  }

  function buildMoveAction(
    sel: Selection,
    dest: { dest: 'tableau'; index: number } | { dest: 'foundation'; suit: Suit },
  ): SolitaireAction {
    const from =
      sel.kind === 'tableau'
        ? { type: 'tableau' as const, index: sel.index }
        : sel.kind === 'waste'
          ? { type: 'waste' as const }
          : { type: 'foundation' as const, suit: sel.suit }
    const to =
      dest.dest === 'tableau'
        ? { type: 'tableau' as const, index: dest.index }
        : { type: 'foundation' as const, suit: dest.suit }
    const count = sel.kind === 'tableau' ? sel.depth : 1
    return { kind: 'move', from, to, count }
  }

  // ----- redraw --------------------------------------------------------
  function redraw(): void {
    // Stock + waste
    replaceChildren(stockArea)
    const stockEl =
      state.stock.length > 0
        ? makeCardBackEl()
        : makeEmptySlotEl({ label: state.waste.length > 0 ? '⟲' : '' })
    stockEl.style.cursor = 'pointer'
    stockEl.title = state.stock.length > 0 ? 'Draw from stock' : 'Recycle waste'
    stockEl.addEventListener('click', () => {
      if (state.stock.length > 0) safeOnAction({ kind: 'draw-from-stock' })
      else if (state.waste.length > 0) safeOnAction({ kind: 'recycle-waste' })
    })
    stockArea.appendChild(stockEl)
    if (state.waste.length === 0) {
      stockArea.appendChild(makeEmptySlotEl())
    } else {
      const top = state.waste[state.waste.length - 1]
      const wasteEl = makeCardEl(top)
      wasteEl.style.cursor = 'pointer'
      if (selection?.kind === 'waste') wasteEl.style.outline = '2px solid #6cf'
      wasteEl.addEventListener('click', () =>
        trySelectAndMove({ kind: 'waste' }),
      )
      stockArea.appendChild(wasteEl)
    }

    // Foundations
    replaceChildren(foundationsArea)
    for (const f of state.foundations) {
      const top = f.cards.length > 0 ? f.cards[f.cards.length - 1] : null
      const el = top
        ? makeCardEl(top)
        : makeEmptySlotEl({ label: suitGlyph(f.suit) })
      el.style.cursor = 'pointer'
      el.title = `Foundation ${f.suit}`
      if (selection?.kind === 'foundation' && selection.suit === f.suit) {
        el.style.outline = '2px solid #6cf'
      }
      el.addEventListener('click', () => {
        if (selection) {
          trySelectAndMove({ dest: 'foundation', suit: f.suit })
        } else if (top) {
          trySelectAndMove({ kind: 'foundation', suit: f.suit })
        }
      })
      foundationsArea.appendChild(el)
    }

    // Tableau
    replaceChildren(tableauArea)
    state.tableau.forEach((pile, i) => {
      const col = document.createElement('div')
      col.style.display = 'flex'
      col.style.flexDirection = 'column'
      col.style.gap = '0'
      col.style.minHeight = '100px'
      col.style.alignItems = 'center'

      // Face-down stack: render as overlapping backs
      const stack = document.createElement('div')
      stack.style.position = 'relative'
      stack.style.width = '52px'
      stack.style.minHeight = '20px'
      pile.faceDown.forEach((_, fdIdx) => {
        const back = makeCardBackEl()
        back.style.position = 'absolute'
        back.style.top = `${fdIdx * 4}px`
        back.style.left = '0'
        stack.appendChild(back)
      })
      col.appendChild(stack)

      // Face-up cards: vertical fan, each clickable
      const fan = document.createElement('div')
      fan.style.position = 'relative'
      fan.style.width = '52px'
      const offsetStart = pile.faceDown.length * 4
      pile.faceUp.forEach((card, fIdx) => {
        const cEl = makeCardEl(card)
        cEl.style.position = 'absolute'
        cEl.style.top = `${offsetStart + fIdx * 22}px`
        cEl.style.left = '0'
        cEl.style.cursor = 'pointer'
        const isSelectedTop =
          selection?.kind === 'tableau' &&
          selection.index === i &&
          fIdx >= pile.faceUp.length - selection.depth
        if (isSelectedTop) cEl.style.outline = '2px solid #6cf'
        cEl.addEventListener('click', (e) => {
          e.stopPropagation()
          if (selection) {
            // If clicking the same column → destination = this column
            trySelectAndMove({ dest: 'tableau', index: i })
            return
          }
          // Select this card + everything below it as the run depth.
          const depth = pile.faceUp.length - fIdx
          trySelectAndMove({ kind: 'tableau', index: i, depth })
        })
        fan.appendChild(cEl)
      })
      // Empty pile slot if no face-up either
      if (pile.faceDown.length === 0 && pile.faceUp.length === 0) {
        const empty = makeEmptySlotEl()
        empty.style.cursor = 'pointer'
        empty.addEventListener('click', () => {
          if (selection) trySelectAndMove({ dest: 'tableau', index: i })
        })
        fan.appendChild(empty)
      }
      col.appendChild(fan)

      // Clicking the column also targets it as a destination (when below cards)
      col.addEventListener('click', () => {
        if (selection) trySelectAndMove({ dest: 'tableau', index: i })
      })
      tableauArea.appendChild(col)
    })

    // Status footer
    const acts = legalActions(state, selfPlayerId)
    const won =
      state.foundations.every(
        (f) => f.cards.length === 13 && f.cards[f.cards.length - 1].rank === 'K',
      )
    if (won) setStatus(`You win! Moves: ${state.moves}`)
    else if (selection) setStatus('Pick a destination, or click again to deselect.')
    else setStatus(`Moves: ${state.moves}  ·  ${acts.length} legal actions.`)
  }

  function suitGlyph(s: Suit): string {
    return s === 'clubs' ? '♣' : s === 'diamonds' ? '♦' : s === 'hearts' ? '♥' : '♠'
  }

  // Auto-complete button when applicable
  const autoBtn = makeButton('Auto-complete', () => safeOnAction({ kind: 'auto-complete' }))
  autoBtn.style.marginTop = '8px'
  panelStyle(autoBtn)
  autoBtn.style.padding = '6px 10px'
  wrapper.appendChild(autoBtn)

  // Click outside any card → clear selection
  function onRootClick(e: Event): void {
    const target = e.target as HTMLElement
    if (target === wrapper || target === root) clearSelection()
  }
  root.addEventListener('click', onRootClick)

  redraw()

  return {
    destroy() {
      root.removeEventListener('click', onRootClick)
      replaceChildren(root)
    },
    update(next: SolitaireState) {
      if (next === state) return
      state = next
      // Reset selection on remote updates to avoid stale picks.
      selection = null
      redraw()
    },
  }
}
