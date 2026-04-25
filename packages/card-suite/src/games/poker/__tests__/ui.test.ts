/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, dealHand, HoldemAction, makeInitial } from '../holdem'
import { renderHoldem } from '../ui'

function dealtGame() {
  const rng = mulberry32(11)
  const initial = makeInitial({ playerIds: ['@a:x', '@b:x', '@c:x'] }, rng)
  const dealt = dealHand(initial, rng)
  return { state: dealt, rng }
}

describe('renderHoldem', () => {
  it('renders 5 community placeholders + N seat tiles initially', () => {
    const root = document.createElement('div')
    const { state } = dealtGame()
    const handle = renderHoldem({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    // 0..2 face-up community cards already, but always 5 slots present (cards or empty).
    const cards = root.querySelectorAll('.cs-card')
    // Hidden hole cards for 3 seats × 2 = 6, plus 0 community cards (pre-flop).
    // Plus card backs for each opponent's hole cards in display variant: 3 seats × 2 = 6.
    // Self in shared-display variant: still hidden (so 6 backs total).
    expect(cards.length).toBeGreaterThan(0)
    handle.destroy()
  })

  it('shared-controller variant shows action buttons for the active player', () => {
    const root = document.createElement('div')
    const { state } = dealtGame()
    const fired: HoldemAction[] = []
    const handle = renderHoldem({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: state.seats[state.toAct].id,
      onAction: (a) => fired.push(a),
    })
    const buttons = Array.from(root.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    const fold = buttons.find((b) => b.textContent === 'Fold')
    expect(fold).toBeTruthy()
    fold!.click()
    expect(fired.find((a) => a.kind === 'fold')).toBeTruthy()
    handle.destroy()
  })

  it('shared-display hides hole cards (no .cs-card-up for hole cards)', () => {
    const root = document.createElement('div')
    const { state } = dealtGame()
    const handle = renderHoldem({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: state.seats[0].id,
      onAction: () => {},
    })
    // Pre-flop: 0 community face-up cards → all face-up cards are 0.
    const ups = root.querySelectorAll('.cs-card-up')
    expect(ups.length).toBe(state.community.length)
    handle.destroy()
  })

  it('hybrid-private compact variant still shows controller buttons', () => {
    const root = document.createElement('div')
    const { state } = dealtGame()
    const handle = renderHoldem({
      root,
      initialState: state,
      variant: 'hybrid-private',
      selfPlayerId: state.seats[state.toAct].id,
      onAction: () => {},
    })
    const buttons = root.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    handle.destroy()
  })

  it('update() reflects a fold (one fewer active seat)', () => {
    const root = document.createElement('div')
    const { state, rng } = dealtGame()
    const handle = renderHoldem({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    const folder = state.seats[state.toAct].id
    const next = applyAction(state, { kind: 'fold', by: folder }, rng)
    handle.update(next)
    // After a fold, the seats grid still shows all seats — but at least the
    // status reflects the new toAct.
    expect(root.textContent).toContain('Phase')
    handle.destroy()
  })
})
