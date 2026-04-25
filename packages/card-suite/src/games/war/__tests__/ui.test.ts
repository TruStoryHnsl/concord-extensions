/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, makeInitial, WarAction } from '../rules'
import { renderWar } from '../ui'

function freshGame() {
  const rng = mulberry32(41)
  const state = makeInitial({ playerIds: ['@a:x', '@b:x'] }, rng)
  return { state, rng }
}

describe('renderWar', () => {
  it('renders both players + initial card backs without autoplay', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderWar({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: () => {},
      autoplay: false,
    })
    expect(root.textContent).toContain('@a:x')
    expect(root.textContent).toContain('@b:x')
    const backs = root.querySelectorAll('.cs-card-down')
    expect(backs.length).toBeGreaterThanOrEqual(2)
    handle.destroy()
  })

  it('clicking Flip dispatches flip', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: WarAction[] = []
    const handle = renderWar({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: (a) => fired.push(a),
      autoplay: false,
    })
    const flip = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Flip',
    )
    expect(flip).toBeTruthy()
    flip!.click()
    expect(fired.length).toBe(1)
    expect(fired[0].kind).toBe('flip')
    handle.destroy()
  })

  it('update() reflects post-flip state including a face-up reveal', () => {
    const root = document.createElement('div')
    const { state, rng } = freshGame()
    const handle = renderWar({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: () => {},
      autoplay: false,
    })
    const next = applyAction(state, { kind: 'flip' }, rng)
    handle.update(next)
    const upCards = root.querySelectorAll('.cs-card-up')
    expect(upCards.length).toBeGreaterThanOrEqual(2)
    handle.destroy()
  })

  it('Pause toggles the autoplay timer', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: WarAction[] = []
    const handle = renderWar({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: (a) => fired.push(a),
      autoplay: true,
      flipIntervalMs: 50,
    })
    const pause = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Pause',
    ) as HTMLButtonElement
    pause.click()
    const before = fired.length
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired.length).toBe(before)
        handle.destroy()
        resolve()
      }, 120)
    })
  })

  it('destroy() stops the autoplay timer', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: WarAction[] = []
    const handle = renderWar({
      root,
      initialState: state,
      variant: 'shared-display',
      selfPlayerId: '@a:x',
      onAction: (a) => fired.push(a),
      autoplay: true,
      flipIntervalMs: 50,
    })
    handle.destroy()
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired.length).toBe(0)
        resolve()
      }, 120)
    })
  })
})
