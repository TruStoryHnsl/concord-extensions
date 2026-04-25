/**
 * Texas Hold'em renderer.
 *
 * Variants:
 *   - shared-display: communal cards + bets + chip stacks. Hole cards hidden.
 *   - shared-controller: own hole cards + check/call/raise/fold buttons.
 *   - hybrid-public / hybrid-private: same as the two above but compact.
 *   - solo: shared-controller (for single-seat dev sessions).
 *
 * Network sync hook: future shell wave will pipe `onAction` outbound; this
 * renderer only mutates DOM via update().
 */

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
import { HoldemAction, HoldemState, legalActions } from './holdem'

export function renderHoldem(
  opts: GameRenderOpts<HoldemState, HoldemAction>,
): GameRenderHandle<HoldemState> {
  const { root, initialState, variant, selfPlayerId, onAction } = opts
  let state = initialState
  const isPublic = variant === 'shared-display' || variant === 'hybrid-public'
  const compact = variant === 'hybrid-public' || variant === 'hybrid-private'

  gameRootStyle(root)
  if (compact) root.style.padding = '8px'
  const wrapper = document.createElement('div')
  wrapper.style.maxWidth = '900px'
  wrapper.style.margin = '0 auto'
  root.appendChild(wrapper)

  // Top: pot + phase
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.justifyContent = 'space-between'
  header.style.alignItems = 'center'
  header.style.marginBottom = '12px'
  wrapper.appendChild(header)

  // Center community area
  const communityArea = document.createElement('div')
  panelStyle(communityArea)
  communityArea.style.display = 'flex'
  communityArea.style.gap = '8px'
  communityArea.style.justifyContent = 'center'
  communityArea.style.marginBottom = '16px'
  wrapper.appendChild(communityArea)

  // Seats
  const seatsArea = document.createElement('div')
  seatsArea.style.display = 'grid'
  seatsArea.style.gridTemplateColumns = compact
    ? 'repeat(auto-fit, minmax(140px, 1fr))'
    : 'repeat(auto-fit, minmax(180px, 1fr))'
  seatsArea.style.gap = '8px'
  seatsArea.style.marginBottom = '16px'
  wrapper.appendChild(seatsArea)

  // Local hand + actions (controller variants only)
  const localArea = document.createElement('div')
  panelStyle(localArea)
  localArea.style.marginTop = '12px'
  if (isPublic) localArea.style.display = 'none'
  wrapper.appendChild(localArea)

  function safeOnAction(a: HoldemAction): void {
    try {
      onAction(a)
    } catch (e) {
      // Surface in header — best-effort feedback.
      header.title = (e as Error).message
    }
  }

  function redraw(): void {
    // Header
    replaceChildren(header)
    const phaseEl = document.createElement('div')
    phaseEl.style.fontSize = '14px'
    phaseEl.textContent = `Phase: ${state.phase}  ·  Pot: ${state.pot}  ·  To call: ${state.currentBet}`
    header.appendChild(phaseEl)
    const handEl = document.createElement('div')
    handEl.style.fontSize = '12px'
    handEl.style.opacity = '0.7'
    handEl.textContent = `Hand #${state.handNumber}`
    header.appendChild(handEl)

    // Community
    replaceChildren(communityArea)
    for (let i = 0; i < 5; i++) {
      if (i < state.community.length) {
        communityArea.appendChild(makeCardEl(state.community[i], { compact }))
      } else {
        communityArea.appendChild(makeEmptySlotEl({ compact }))
      }
    }

    // Seats
    replaceChildren(seatsArea)
    state.seats.forEach((seat, i) => {
      const tile = document.createElement('div')
      tile.style.background = '#222'
      tile.style.border = i === state.toAct ? '1px solid #6cf' : '1px solid #333'
      tile.style.borderRadius = '6px'
      tile.style.padding = '8px'
      const name = document.createElement('div')
      name.style.fontWeight = '600'
      name.style.fontSize = '12px'
      name.textContent = seat.id + (seat.id === selfPlayerId ? ' (you)' : '')
      tile.appendChild(name)
      const stats = document.createElement('div')
      stats.style.fontSize = '11px'
      stats.style.opacity = '0.8'
      stats.style.marginTop = '4px'
      const status = seat.folded ? 'folded' : seat.allIn ? 'all-in' : ''
      stats.textContent = `Stack: ${seat.stack} · Bet: ${seat.streetBet}${status ? ' · ' + status : ''}`
      tile.appendChild(stats)
      // Hole cards: shown for self in controller variants; backs otherwise.
      const holeRow = document.createElement('div')
      holeRow.style.display = 'flex'
      holeRow.style.gap = '4px'
      holeRow.style.marginTop = '6px'
      for (const c of seat.hole) {
        if (seat.id === selfPlayerId && !isPublic) {
          holeRow.appendChild(makeCardEl(c, { compact: true }))
        } else {
          holeRow.appendChild(makeCardBackEl({ compact: true }))
        }
      }
      tile.appendChild(holeRow)
      seatsArea.appendChild(tile)
    })

    // Local controller
    if (!isPublic) {
      replaceChildren(localArea)
      const head = document.createElement('div')
      head.style.fontSize = '13px'
      head.style.marginBottom = '8px'
      head.textContent = `Your turn: ${state.toAct >= 0 && state.seats[state.toAct]?.id === selfPlayerId ? 'yes' : 'no'}`
      localArea.appendChild(head)
      const acts = legalActions(state, selfPlayerId)
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.gap = '8px'
      row.style.flexWrap = 'wrap'
      for (const a of acts) {
        const label =
          a.kind === 'raise'
            ? `Raise → ${a.to}`
            : a.kind === 'call'
              ? `Call ${state.currentBet - state.seats[state.toAct].streetBet}`
              : a.kind.charAt(0).toUpperCase() + a.kind.slice(1)
        row.appendChild(
          makeButton(label, () => safeOnAction(a), {
            primary: a.kind === 'call' || a.kind === 'check',
          }),
        )
      }
      if (acts.length === 0) {
        const note = document.createElement('span')
        note.textContent = 'Waiting…'
        note.style.opacity = '0.6'
        note.style.fontSize = '12px'
        row.appendChild(note)
      }
      localArea.appendChild(row)
    }
  }

  redraw()

  return {
    destroy() {
      replaceChildren(root)
    },
    update(next: HoldemState) {
      if (next === state) return
      state = next
      redraw()
    },
  }
}
