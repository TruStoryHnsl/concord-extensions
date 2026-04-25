/**
 * @vitest-environment jsdom
 *
 * Per-game integration tests for the Rules panel. For each game, render
 * it, assert the panel is in the DOM and visible by default, click the
 * toggle, assert it collapses, click again to expand.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { renderBlackjack } from '../blackjack/ui'
import { makeInitial as bjMakeInitial } from '../blackjack/rules'
import { renderKingsAndPeasants } from '../kings-and-peasants/ui'
import { makeInitial as kpMakeInitial } from '../kings-and-peasants/rules'
import { renderHoldem } from '../poker/ui'
import { dealHand, makeInitial as holdemMakeInitial } from '../poker/holdem'
import { renderSolitaire } from '../solitaire/ui'
import { makeInitial as solitaireMakeInitial } from '../solitaire/rules'
import { renderSpeed } from '../speed/ui'
import { makeInitial as speedMakeInitial } from '../speed/rules'
import { GameRenderHandle } from '../ui-common'
import { renderWar } from '../war/ui'
import { makeInitial as warMakeInitial } from '../war/rules'

interface MountFn {
  (root: HTMLElement): GameRenderHandle<unknown>
}

const games: Array<{ id: string; mount: MountFn }> = [
  {
    id: 'solitaire',
    mount: (root) =>
      renderSolitaire({
        root,
        initialState: solitaireMakeInitial({ drawCount: 1 }, mulberry32(1)),
        variant: 'solo',
        selfPlayerId: '@me:x',
        onAction: () => {},
      }) as unknown as GameRenderHandle<unknown>,
  },
  {
    id: 'holdem',
    mount: (root) => {
      const rng = mulberry32(11)
      const initial = holdemMakeInitial(
        { playerIds: ['@me:x', '@bot:x', '@bot2:x'] },
        rng,
      )
      const dealt = dealHand(initial, rng)
      return renderHoldem({
        root,
        initialState: dealt,
        variant: 'shared-display',
        selfPlayerId: '@me:x',
        onAction: () => {},
      }) as unknown as GameRenderHandle<unknown>
    },
  },
  {
    id: 'blackjack',
    mount: (root) =>
      renderBlackjack({
        root,
        initialState: bjMakeInitial(
          { playerIds: ['@me:x'], initialBet: 50 },
          mulberry32(2),
        ),
        variant: 'shared-controller',
        selfPlayerId: '@me:x',
        onAction: () => {},
      }) as unknown as GameRenderHandle<unknown>,
  },
  {
    id: 'speed',
    mount: (root) =>
      renderSpeed({
        root,
        initialState: speedMakeInitial(
          { playerIds: ['@me:x', '@bot:x'] },
          mulberry32(3),
        ),
        variant: 'shared-controller',
        selfPlayerId: '@me:x',
        onAction: () => {},
      }) as unknown as GameRenderHandle<unknown>,
  },
  {
    id: 'kings-and-peasants',
    mount: (root) =>
      renderKingsAndPeasants({
        root,
        initialState: kpMakeInitial(
          { playerIds: ['@me:x', '@bot:x', '@bot2:x'] },
          mulberry32(4),
        ),
        variant: 'shared-controller',
        selfPlayerId: '@me:x',
        onAction: () => {},
      }) as unknown as GameRenderHandle<unknown>,
  },
  {
    id: 'war',
    mount: (root) =>
      renderWar({
        root,
        initialState: warMakeInitial(
          { playerIds: ['@me:x', '@bot:x'] },
          mulberry32(5),
        ),
        variant: 'shared-display',
        selfPlayerId: '@me:x',
        onAction: () => {},
        autoplay: false,
      }) as unknown as GameRenderHandle<unknown>,
  },
]

beforeEach(() => {
  // Fresh localStorage for every test so the persisted-collapsed flag
  // doesn't leak between cases.
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

afterEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('Rules panel integration — every game', () => {
  for (const { id, mount } of games) {
    describe(`${id}`, () => {
      it('mounts a Rules panel by default', () => {
        const root = document.createElement('div')
        const handle = mount(root)
        const panel = root.querySelector('[data-role="rules-panel"]')
        expect(panel).toBeTruthy()
        expect((panel as HTMLElement).dataset.gameId).toBe(id)
        handle.destroy()
      })

      it('Rules panel is expanded by default (body visible)', () => {
        const root = document.createElement('div')
        const handle = mount(root)
        const panel = root.querySelector('[data-role="rules-panel"]') as HTMLElement
        const body = panel.querySelector('[data-role="rules-body"]') as HTMLElement
        expect(panel.dataset.collapsed).toBe('false')
        expect(body.style.display).not.toBe('none')
        handle.destroy()
      })

      it('clicking the toggle collapses the panel; clicking again expands it', () => {
        const root = document.createElement('div')
        const handle = mount(root)
        const panel = root.querySelector('[data-role="rules-panel"]') as HTMLElement
        const toggle = panel.querySelector(
          '[data-role="rules-toggle"]',
        ) as HTMLButtonElement
        const body = panel.querySelector('[data-role="rules-body"]') as HTMLElement
        // Collapse
        toggle.click()
        expect(panel.dataset.collapsed).toBe('true')
        expect(body.style.display).toBe('none')
        // Expand
        toggle.click()
        expect(panel.dataset.collapsed).toBe('false')
        expect(body.style.display).not.toBe('none')
        handle.destroy()
      })

      it('persisted collapsed state survives a re-mount', () => {
        const root1 = document.createElement('div')
        const handle1 = mount(root1)
        const toggle1 = root1.querySelector(
          '[data-role="rules-toggle"]',
        ) as HTMLButtonElement
        toggle1.click()
        handle1.destroy()
        // Re-mount in a new root — should pick up the persisted collapsed flag.
        const root2 = document.createElement('div')
        const handle2 = mount(root2)
        const panel2 = root2.querySelector('[data-role="rules-panel"]') as HTMLElement
        expect(panel2.dataset.collapsed).toBe('true')
        handle2.destroy()
      })
    })
  }
})
