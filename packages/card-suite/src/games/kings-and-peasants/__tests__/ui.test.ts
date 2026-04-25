/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, KPAction, makeInitial } from '../rules'
import { renderKingsAndPeasants } from '../ui'

function freshGame() {
  const rng = mulberry32(31)
  const state = makeInitial({ playerIds: ['@a:x', '@b:x', '@c:x', '@d:x'] }, rng)
  return { state, rng }
}

describe('renderKingsAndPeasants', () => {
  it('renders trick area + my hand + opponent tiles', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderKingsAndPeasants({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: '@a:x',
      onAction: () => {},
    })
    expect(root.textContent).toContain('Round 1')
    expect(root.textContent).toContain('@b:x')
    handle.destroy()
  })

  it('clicking a card selects it and shows Play button', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const fired: KPAction[] = []
    const handle = renderKingsAndPeasants({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: state.players[state.toAct].id,
      onAction: (a) => fired.push(a),
    })
    // Click the first hand card
    const me = state.players[state.toAct]
    const firstCardEl = root.querySelector(
      `.cs-card-up[data-card-id="${me.hand[0].id}"]`,
    ) as HTMLElement | null
    expect(firstCardEl).not.toBeNull()
    firstCardEl!.click()
    const playBtn = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Play selection',
    )
    expect(playBtn).toBeTruthy()
    playBtn!.click()
    expect(fired.find((a) => a.kind === 'play')).toBeTruthy()
    handle.destroy()
  })

  it('Pass button is hidden when leading (no top combo)', () => {
    const root = document.createElement('div')
    const { state } = freshGame()
    const handle = renderKingsAndPeasants({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: state.players[state.toAct].id,
      onAction: () => {},
    })
    const passBtn = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Pass',
    )
    expect(passBtn).toBeUndefined()
    handle.destroy()
  })

  it('update() rerenders after applyAction', () => {
    const root = document.createElement('div')
    const { state, rng } = freshGame()
    const handle = renderKingsAndPeasants({
      root,
      initialState: state,
      variant: 'shared-controller',
      selfPlayerId: state.players[state.toAct].id,
      onAction: () => {},
    })
    const me = state.players[state.toAct]
    const next = applyAction(
      state,
      { kind: 'play', by: me.id, cardIds: [me.hand[0].id] },
      rng,
    )
    expect(() => handle.update(next)).not.toThrow()
    handle.destroy()
  })
})
