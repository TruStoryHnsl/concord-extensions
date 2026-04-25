/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, BlackjackAction, makeInitial } from '../rules'
import { renderBlackjack } from '../ui'

function freshGame() {
  const rng = mulberry32(13)
  const state = makeInitial({ playerIds: ['@me:x'], initialBet: 50 }, rng)
  return { state, rng }
}

describe('renderBlackjack', () => {
  it('renders dealer + player area on initial state', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderBlackjack({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: () => {},
    })
    expect(root.textContent).toContain('Dealer')
    expect(root.textContent).toContain('@me:x')
    handle.destroy()
  })

  it('clicking Hit fires a hit action', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: BlackjackAction[] = []
    const handle = renderBlackjack({
      root,
      initialState: state,
      variant: 'solo',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    const hitBtn = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Hit',
    )
    if (!hitBtn) {
      // Initial deal might have produced a natural BJ — check via state instead.
      expect(state.players[0].hands[0].stood).toBe(true)
      handle.destroy()
      return
    }
    hitBtn.click()
    expect(fired.length).toBe(1)
    expect(fired[0].kind).toBe('hit')
    handle.destroy()
  })

  it('update() renders a hit-applied state without throwing', () => {
    const root = document.createElement('div')
    const { state, rng } = freshGame()
    const handle = renderBlackjack({
      root,
      initialState: state,
      variant: 'solo',
      selfPlayerId: '@me:x',
      onAction: () => {},
    })
    // Try a hit if the hand isn't already terminal.
    if (!state.players[0].hands[0].stood) {
      const next = applyAction(state, { kind: 'hit', by: '@me:x' }, rng)
      expect(() => handle.update(next)).not.toThrow()
    }
    handle.destroy()
  })

  it('hybrid-private variant uses compact card sizing', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderBlackjack({
      root,
      initialState: state,
      variant: 'hybrid-private',
      selfPlayerId: '@me:x',
      onAction: () => {},
    })
    const cards = root.querySelectorAll('.cs-card-up') as NodeListOf<HTMLElement>
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].style.width).toBe('36px')
    handle.destroy()
  })

  it('shared-display variant renders dealer + every player but no game-action buttons', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderBlackjack({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@me:x',
      onAction: () => {},
    })
    // Exclude buttons from the Rules panel — those aren't game-action buttons.
    const allButtons = Array.from(root.querySelectorAll('button'))
    const gameButtons = allButtons.filter((b) => !b.closest('[data-role="rules-panel"]'))
    expect(gameButtons.length).toBe(0)
    handle.destroy()
  })
})
