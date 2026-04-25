/**
 * Speed renderer.
 *
 * Variant: shared-controller only (each player needs their own private hand).
 * Other variants fall back to the same layout with a "spectator" badge.
 *
 * Network sync hook: `onAction` fires with `play` actions; future shell wave
 * will broadcast and reconcile real-time conflicts via resolveTick().
 */

import {
  GameRenderHandle,
  GameRenderOpts,
  gameRootStyle,
  makeButton,
  makeCardEl,
  makeEmptySlotEl,
  panelStyle,
  replaceChildren,
} from '../ui-common'
import { legalActions, SpeedAction, SpeedState } from './rules'

export function renderSpeed(
  opts: GameRenderOpts<SpeedState, SpeedAction>,
): GameRenderHandle<SpeedState> {
  const { root, initialState, variant, selfPlayerId, onAction } = opts
  let state = initialState

  gameRootStyle(root)
  const wrapper = document.createElement('div')
  wrapper.style.maxWidth = '700px'
  wrapper.style.margin = '0 auto'
  root.appendChild(wrapper)

  const status = document.createElement('div')
  status.style.fontSize = '13px'
  status.style.opacity = '0.7'
  status.style.marginBottom = '8px'
  wrapper.appendChild(status)

  const opponentRow = document.createElement('div')
  panelStyle(opponentRow)
  opponentRow.style.marginBottom = '12px'
  wrapper.appendChild(opponentRow)

  const middleRow = document.createElement('div')
  panelStyle(middleRow)
  middleRow.style.display = 'flex'
  middleRow.style.justifyContent = 'space-around'
  middleRow.style.alignItems = 'center'
  middleRow.style.marginBottom = '12px'
  middleRow.style.minHeight = '90px'
  wrapper.appendChild(middleRow)

  const myRow = document.createElement('div')
  panelStyle(myRow)
  wrapper.appendChild(myRow)

  const stuckBtnWrap = document.createElement('div')
  stuckBtnWrap.style.marginTop = '8px'
  wrapper.appendChild(stuckBtnWrap)

  function safeOnAction(a: SpeedAction): void {
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
    status.textContent = state.winner
      ? `Winner: ${state.winner}`
      : `Variant: ${variant} · Your hand has ${state.players[meIdx()]?.hand.length ?? 0} cards`

    // Opponent (cards-as-count bar)
    replaceChildren(opponentRow)
    const oppIdx = meIdx() === 0 ? 1 : 0
    const opp = state.players[oppIdx]
    if (opp) {
      const lbl = document.createElement('div')
      lbl.style.fontSize = '12px'
      lbl.style.marginBottom = '6px'
      lbl.textContent = `${opp.id}  ·  hand ${opp.hand.length}  ·  draw ${opp.draw.length}  ·  side ${opp.sideStack.length}`
      opponentRow.appendChild(lbl)
      const bar = document.createElement('div')
      bar.style.display = 'flex'
      bar.style.gap = '2px'
      for (let i = 0; i < opp.hand.length; i++) {
        const t = document.createElement('div')
        t.style.width = '10px'
        t.style.height = '14px'
        t.style.background = '#2a4d6c'
        t.style.borderRadius = '2px'
        bar.appendChild(t)
      }
      opponentRow.appendChild(bar)
    }

    // Middle: discard piles
    replaceChildren(middleRow)
    state.discards.forEach((pile, idx) => {
      const wrap = document.createElement('div')
      wrap.style.display = 'flex'
      wrap.style.flexDirection = 'column'
      wrap.style.alignItems = 'center'
      wrap.style.gap = '4px'
      const label = document.createElement('div')
      label.style.fontSize = '11px'
      label.style.opacity = '0.6'
      label.textContent = `Pile ${idx + 1}`
      wrap.appendChild(label)
      const top = pile.length > 0 ? pile[pile.length - 1] : null
      wrap.appendChild(top ? makeCardEl(top) : makeEmptySlotEl({ label: '—' }))
      middleRow.appendChild(wrap)
    })

    // My hand
    replaceChildren(myRow)
    const me = state.players[meIdx()]
    if (me) {
      const lbl = document.createElement('div')
      lbl.style.fontSize = '12px'
      lbl.style.marginBottom = '6px'
      lbl.textContent = `${me.id} (you) · hand ${me.hand.length} · draw ${me.draw.length}`
      myRow.appendChild(lbl)
      const handRow = document.createElement('div')
      handRow.style.display = 'flex'
      handRow.style.gap = '6px'
      handRow.style.flexWrap = 'wrap'
      const acts = legalActions(state, selfPlayerId)
      for (const c of me.hand) {
        const cEl = makeCardEl(c)
        cEl.style.cursor = 'pointer'
        cEl.addEventListener('click', () => {
          // Find a legal target pile for this card; prefer pile 0 if both legal.
          const a = acts.find(
            (x): x is Extract<SpeedAction, { kind: 'play' }> =>
              x.kind === 'play' && x.cardId === c.id,
          )
          if (!a) {
            status.textContent = `${c.rank}${c.suit[0].toUpperCase()} has no legal pile.`
            return
          }
          safeOnAction(a)
        })
        handRow.appendChild(cEl)
      }
      myRow.appendChild(handRow)
    }

    // Stuck-reveal button
    replaceChildren(stuckBtnWrap)
    const acts = legalActions(state, selfPlayerId)
    const stuck = acts.find((a) => a.kind === 'reveal-stuck')
    if (stuck) {
      stuckBtnWrap.appendChild(
        makeButton('Reveal (both stuck)', () => safeOnAction(stuck), { primary: true }),
      )
    }
  }

  redraw()
  return {
    destroy() {
      replaceChildren(root)
    },
    update(next: SpeedState) {
      if (next === state) return
      state = next
      redraw()
    },
  }
}
