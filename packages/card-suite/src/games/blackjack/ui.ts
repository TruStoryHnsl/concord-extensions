/**
 * Blackjack renderer.
 *
 * Variants:
 *   - solo / shared-controller: dealer hand + your hand + hit/stand/double/split/surrender buttons.
 *   - shared-display: dealer hand + every player's visible cards (no buttons).
 *   - hybrid-public: shared-display compact.
 *   - hybrid-private: shared-controller compact.
 *
 * Network sync hook: future shell wave will pipe `onAction` outbound.
 */

import { Card } from '../../engine/card'
import {
  GameRenderHandle,
  GameRenderOpts,
  gameRootStyle,
  makeButton,
  makeCardEl,
  panelStyle,
  replaceChildren,
} from '../ui-common'
import { BlackjackAction, BlackjackState, legalActions } from './rules'
import { scoreHand } from './dealer-ai'

export function renderBlackjack(
  opts: GameRenderOpts<BlackjackState, BlackjackAction>,
): GameRenderHandle<BlackjackState> {
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

  const dealerArea = document.createElement('div')
  panelStyle(dealerArea)
  dealerArea.style.marginBottom = '16px'
  wrapper.appendChild(dealerArea)

  const playersArea = document.createElement('div')
  playersArea.style.display = 'grid'
  playersArea.style.gridTemplateColumns = isPublic
    ? 'repeat(auto-fit, minmax(200px, 1fr))'
    : '1fr'
  playersArea.style.gap = '12px'
  wrapper.appendChild(playersArea)

  const actionArea = document.createElement('div')
  panelStyle(actionArea)
  actionArea.style.marginTop = '16px'
  if (isPublic) actionArea.style.display = 'none'
  wrapper.appendChild(actionArea)

  function safeOnAction(a: BlackjackAction): void {
    try {
      onAction(a)
    } catch (e) {
      actionArea.title = (e as Error).message
    }
  }

  function renderHand(cards: readonly Card[], label?: string): HTMLElement {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    if (label) {
      const l = document.createElement('div')
      l.style.fontSize = '12px'
      l.style.opacity = '0.7'
      l.style.minWidth = '80px'
      l.textContent = label
      row.appendChild(l)
    }
    for (const c of cards) row.appendChild(makeCardEl(c, { compact }))
    return row
  }

  function redraw(): void {
    // Dealer
    replaceChildren(dealerArea)
    const dealerLbl = document.createElement('div')
    dealerLbl.style.fontWeight = '600'
    dealerLbl.style.marginBottom = '6px'
    const dScore = scoreHand(state.dealer.cards)
    const showFull = state.phase !== 'players-turn'
    dealerLbl.textContent = `Dealer  ${
      state.dealer.cards.length === 0
        ? ''
        : showFull
          ? `(${dScore.total}${dScore.bust ? ' BUST' : ''})`
          : '(showing)'
    }`
    dealerArea.appendChild(dealerLbl)
    const dealerCards = showFull
      ? state.dealer.cards
      : state.dealer.cards.slice(0, 1) // show only upcard mid-hand
    const dRow = renderHand(dealerCards)
    if (!showFull && state.dealer.cards.length > 1) {
      // Append a card-back for the hidden second card
      const back = document.createElement('div')
      back.style.width = compact ? '36px' : '52px'
      back.style.height = compact ? '52px' : '74px'
      back.style.background =
        'repeating-linear-gradient(45deg, #2a4d6c 0 6px, #1f3a52 6px 12px)'
      back.style.border = '1px solid #555'
      back.style.borderRadius = '6px'
      dRow.appendChild(back)
    }
    dealerArea.appendChild(dRow)

    // Players
    replaceChildren(playersArea)
    state.players.forEach((p, pIdx) => {
      // In private/controller variants, only render the local player.
      if (!isPublic && p.id !== selfPlayerId) return
      const tile = document.createElement('div')
      panelStyle(tile)
      tile.style.border =
        pIdx === state.toAct ? '1px solid #6cf' : '1px solid #333'
      const head = document.createElement('div')
      head.style.fontWeight = '600'
      head.style.marginBottom = '6px'
      head.textContent = `${p.id}${p.id === selfPlayerId ? ' (you)' : ''}  ·  Stack: ${p.stack}`
      tile.appendChild(head)
      p.hands.forEach((h, hi) => {
        const sc = scoreHand(h.cards)
        const label = `Hand ${hi + 1} (${sc.total}${sc.bust ? ' BUST' : ''}${sc.blackjack ? ' BJ' : ''})`
        tile.appendChild(renderHand(h.cards as never[], label))
        if (h.result) {
          const r = document.createElement('div')
          r.style.fontSize = '12px'
          r.style.opacity = '0.8'
          r.style.marginTop = '4px'
          r.textContent = `→ ${h.result} (payout ${h.payout - h.bet >= 0 ? '+' : ''}${h.payout - h.bet})`
          tile.appendChild(r)
        }
      })
      playersArea.appendChild(tile)
    })

    // Actions
    if (!isPublic) {
      replaceChildren(actionArea)
      const head = document.createElement('div')
      head.style.fontSize = '13px'
      head.style.marginBottom = '8px'
      const isMine =
        state.phase === 'players-turn' &&
        state.toAct >= 0 &&
        state.players[state.toAct].id === selfPlayerId
      head.textContent = isMine ? 'Your turn' : `Phase: ${state.phase}`
      actionArea.appendChild(head)
      const acts = legalActions(state, selfPlayerId)
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.gap = '8px'
      row.style.flexWrap = 'wrap'
      const haveButtons = acts.filter(
        (a) => a.kind !== 'dealer-play',
      )
      for (const a of haveButtons) {
        row.appendChild(
          makeButton(a.kind.charAt(0).toUpperCase() + a.kind.slice(1), () =>
            safeOnAction(a),
          { primary: a.kind === 'hit' || a.kind === 'stand' }),
        )
      }
      // Surface dealer-play if applicable so spectators can advance.
      const dealerAct = acts.find((a) => a.kind === 'dealer-play')
      if (dealerAct) {
        row.appendChild(
          makeButton('Reveal dealer', () => safeOnAction(dealerAct), { primary: true }),
        )
      }
      if (haveButtons.length === 0 && !dealerAct) {
        const note = document.createElement('span')
        note.textContent = 'Waiting…'
        note.style.opacity = '0.6'
        note.style.fontSize = '12px'
        row.appendChild(note)
      }
      actionArea.appendChild(row)
    }
  }

  redraw()

  return {
    destroy() {
      replaceChildren(root)
    },
    update(next: BlackjackState) {
      if (next === state) return
      state = next
      redraw()
    },
  }
}
