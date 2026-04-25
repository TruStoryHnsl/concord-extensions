/**
 * Kings & Peasants renderer.
 *
 * Variants: shared-controller and hybrid-private. Other variants use the same
 * layout (the game is hand-private; spectators just see opponent counts).
 *
 * Interaction:
 *   - Click a card in your hand → toggle selection. Selecting multiple cards
 *     of the same rank is allowed (combo size 1..4). Click "Play" to fire.
 *   - "Pass" button when a top combo exists.
 *   - "Start next round" shown when the round is settled.
 *
 * Network sync hook: `onAction` fires with `play` / `pass` / `start-round`.
 */

import {
  GameRenderHandle,
  GameRenderOpts,
  gameRootStyle,
  makeButton,
  makeCardEl,
  panelStyle,
  replaceChildren,
} from '../ui-common'
import { KPAction, KPState, legalActions } from './rules'

export function renderKingsAndPeasants(
  opts: GameRenderOpts<KPState, KPAction>,
): GameRenderHandle<KPState> {
  const { root, initialState, variant, selfPlayerId, onAction } = opts
  let state = initialState
  let selected: Set<string> = new Set()

  gameRootStyle(root)
  const wrapper = document.createElement('div')
  wrapper.style.maxWidth = '900px'
  wrapper.style.margin = '0 auto'
  root.appendChild(wrapper)

  const status = document.createElement('div')
  status.style.fontSize = '13px'
  status.style.opacity = '0.7'
  status.style.marginBottom = '8px'
  wrapper.appendChild(status)

  const opponents = document.createElement('div')
  panelStyle(opponents)
  opponents.style.marginBottom = '12px'
  wrapper.appendChild(opponents)

  const trick = document.createElement('div')
  panelStyle(trick)
  trick.style.minHeight = '90px'
  trick.style.display = 'flex'
  trick.style.gap = '8px'
  trick.style.alignItems = 'center'
  trick.style.justifyContent = 'center'
  trick.style.marginBottom = '12px'
  wrapper.appendChild(trick)

  const myArea = document.createElement('div')
  panelStyle(myArea)
  wrapper.appendChild(myArea)

  const buttons = document.createElement('div')
  buttons.style.marginTop = '8px'
  buttons.style.display = 'flex'
  buttons.style.gap = '8px'
  wrapper.appendChild(buttons)

  function safeOnAction(a: KPAction): void {
    try {
      onAction(a)
    } catch (e) {
      status.textContent = `Illegal: ${(e as Error).message}`
    }
  }

  function meIdx(): number {
    return state.players.findIndex((p) => p.id === selfPlayerId)
  }

  function redraw(): void {
    const livingCount = state.players.filter((p) => p.finishOrder === null).length
    status.textContent = livingCount <= 1
      ? `Round ${state.roundNumber} complete.`
      : `Round ${state.roundNumber}  ·  Variant: ${variant}  ·  Top combo: ${
          state.topCombo ? state.topCombo.cards.map((c) => c.rank).join('·') : '— (lead)'
        }`

    // Opponents
    replaceChildren(opponents)
    const oppHeader = document.createElement('div')
    oppHeader.style.fontSize = '12px'
    oppHeader.style.marginBottom = '6px'
    oppHeader.textContent = 'Opponents:'
    opponents.appendChild(oppHeader)
    const oppRow = document.createElement('div')
    oppRow.style.display = 'flex'
    oppRow.style.gap = '12px'
    oppRow.style.flexWrap = 'wrap'
    state.players.forEach((p, i) => {
      if (p.id === selfPlayerId) return
      const tile = document.createElement('div')
      tile.style.background = '#2c2c2c'
      tile.style.border = i === state.toAct ? '1px solid #6cf' : '1px solid #3a3a3a'
      tile.style.borderRadius = '6px'
      tile.style.padding = '6px 8px'
      tile.style.minWidth = '120px'
      const name = document.createElement('div')
      name.style.fontSize = '12px'
      name.style.fontWeight = '600'
      name.textContent = `${p.id}${p.finishOrder !== null ? ' · done' : ''}`
      tile.appendChild(name)
      const bar = document.createElement('div')
      bar.style.display = 'flex'
      bar.style.gap = '1px'
      bar.style.marginTop = '4px'
      const max = Math.min(p.hand.length, 18)
      for (let k = 0; k < max; k++) {
        const t = document.createElement('div')
        t.style.width = '6px'
        t.style.height = '12px'
        t.style.background = '#2a4d6c'
        bar.appendChild(t)
      }
      tile.appendChild(bar)
      const cnt = document.createElement('div')
      cnt.style.fontSize = '11px'
      cnt.style.opacity = '0.7'
      cnt.style.marginTop = '4px'
      cnt.textContent = `${p.hand.length} cards · ${p.socialRank}`
      tile.appendChild(cnt)
      oppRow.appendChild(tile)
    })
    opponents.appendChild(oppRow)

    // Trick / top combo
    replaceChildren(trick)
    if (state.topCombo) {
      for (const c of state.topCombo.cards) trick.appendChild(makeCardEl(c, { compact: true }))
    } else {
      const t = document.createElement('div')
      t.style.opacity = '0.5'
      t.style.fontSize = '13px'
      t.textContent = 'No top combo — leader picks freely.'
      trick.appendChild(t)
    }

    // My hand
    replaceChildren(myArea)
    const me = state.players[meIdx()]
    if (me) {
      const head = document.createElement('div')
      head.style.fontSize = '12px'
      head.style.marginBottom = '6px'
      head.textContent = `${me.id} (you) · ${me.hand.length} cards · ${me.socialRank}${
        meIdx() === state.toAct ? ' · YOUR TURN' : ''
      }`
      myArea.appendChild(head)
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.gap = '4px'
      row.style.flexWrap = 'wrap'
      for (const c of me.hand) {
        const cEl = makeCardEl(c, { compact: true })
        cEl.style.cursor = 'pointer'
        if (selected.has(c.id)) cEl.style.outline = '2px solid #6cf'
        cEl.addEventListener('click', () => {
          if (selected.has(c.id)) selected.delete(c.id)
          else selected.add(c.id)
          redraw()
        })
        row.appendChild(cEl)
      }
      myArea.appendChild(row)
    }

    // Buttons
    replaceChildren(buttons)
    const acts = legalActions(state, selfPlayerId)
    if (selected.size > 0) {
      const playMatching = acts.find(
        (a) =>
          a.kind === 'play' &&
          a.cardIds.length === selected.size &&
          a.cardIds.every((id) => selected.has(id)),
      )
      buttons.appendChild(
        makeButton('Play selection', () => {
          if (!playMatching) {
            status.textContent = 'No legal combo with that selection.'
            return
          }
          selected.clear()
          safeOnAction(playMatching)
        }, { primary: true, disabled: !playMatching }),
      )
      buttons.appendChild(
        makeButton('Clear selection', () => {
          selected.clear()
          redraw()
        }),
      )
    }
    const passAct = acts.find((a) => a.kind === 'pass')
    if (passAct) {
      buttons.appendChild(makeButton('Pass', () => safeOnAction(passAct)))
    }
    if (livingCount <= 1) {
      buttons.appendChild(
        makeButton('Start next round', () => safeOnAction({ kind: 'start-round' }), { primary: true }),
      )
    }
  }

  redraw()
  return {
    destroy() {
      replaceChildren(root)
    },
    update(next: KPState) {
      if (next === state) return
      state = next
      selected.clear()
      redraw()
    },
  }
}
