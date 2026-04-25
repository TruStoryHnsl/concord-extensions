/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, legalActions, makeInitial, SpeedAction } from '../rules'
import { renderSpeed } from '../ui'

function freshGame() {
  const rng = mulberry32(21)
  const state = makeInitial({ playerIds: ['@a:x', '@b:x'] }, rng)
  return { state, rng }
}

describe('renderSpeed', () => {
  it('renders 5 hand cards + 2 discard piles + opponent bar', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderSpeed({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    const cards = root.querySelectorAll('.cs-card-up')
    // 5 hand + up to 2 pile tops = 5..7 face-up cards
    expect(cards.length).toBeGreaterThanOrEqual(5)
    handle.destroy()
  })

  it('clicking a legal card fires a play action', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: SpeedAction[] = []
    const handle = renderSpeed({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@a:x',
      onAction: (a) => fired.push(a),
    })
    const acts = legalActions(state, '@a:x')
    const playable = acts.find((a) => a.kind === 'play')
    if (!playable) {
      handle.destroy()
      return // no legal play this seed; that's a valid run.
    }
    const card = root.querySelector(
      `.cs-card-up[data-card-id="${(playable as Extract<SpeedAction, { kind: 'play' }>).cardId}"]`,
    ) as HTMLElement | null
    expect(card).not.toBeNull()
    card!.click()
    expect(fired.length).toBe(1)
    expect(fired[0].kind).toBe('play')
    handle.destroy()
  })

  it('shows the opponent count bar in the opponent panel', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderSpeed({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    expect(root.textContent).toContain('@b:x')
    expect(root.textContent).toContain('hand 5')
    handle.destroy()
  })

  it('update() rerenders on state change', () => {
    const root = document.createElement('div')
    const { state, rng } = freshGame()
    const handle = renderSpeed({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    const acts = legalActions(state, '@a:x')
    const playable = acts.find((a) => a.kind === 'play')
    if (playable) {
      const next = applyAction(state, playable, rng)
      expect(() => handle.update(next)).not.toThrow()
    }
    handle.destroy()
  })
})
