/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mountSuite } from '../../index'
import { ShellBridge } from '../../shell/bridge'
import { ConcordInitPayload, CONCORD_SDK_VERSION } from '../../shell/sdk-types'

/**
 * A fake bridge that resolves init synchronously — extends ShellBridge so
 * mountSuite()'s type accepts it but overrides getInit/destroy to skip the
 * 250ms fallback and any window listeners.
 */
class FakeBridge extends ShellBridge {
  constructor(private fakeInit: ConcordInitPayload) {
    super(null) // no window
  }
  override getInit(): Promise<ConcordInitPayload> {
    return Promise.resolve(this.fakeInit)
  }
}

const init: ConcordInitPayload = {
  sessionId: 'sess-1',
  extensionId: 'com.concord.card-suite',
  mode: 'shared', // resolves to UX 'display'
  participantId: '@me:test',
  seat: 'host',
  surfaces: [{ surface_id: 'main', type: 'panel', anchor: 'center' }],
}

void CONCORD_SDK_VERSION // silence unused-import warning under strict TS

describe('picker integration', () => {
  it('renders the picker grid with all 6 game tiles', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const grid = root.querySelector('[data-role="picker-grid"]') as HTMLElement
    expect(grid).toBeTruthy()
    const tiles = grid.querySelectorAll('button')
    expect(tiles.length).toBe(6)
  })

  it('disables tiles for games that do not support the resolved UX mode', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    // Resolved UX = 'display' — speed only supports 'party', so it's disabled.
    await mountSuite(root, new FakeBridge(init))
    const speed = root.querySelector('[data-game-id="speed"]') as HTMLButtonElement
    expect(speed.disabled).toBe(true)
    const display = root.querySelector('[data-game-id="war"]') as HTMLButtonElement
    expect(display.disabled).toBe(false)
  })

  it('clicking a compatible tile mounts the game UI', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const war = root.querySelector('[data-game-id="war"]') as HTMLButtonElement
    war.click()
    const mount = root.querySelector('[data-role="game-mount"]') as HTMLElement
    expect(mount).toBeTruthy()
    expect(mount.dataset.gameId).toBe('war')
    expect(root.querySelector('[data-role="back"]')).toBeTruthy()
  })

  it('clicking Back returns to the picker', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const war = root.querySelector('[data-game-id="war"]') as HTMLButtonElement
    war.click()
    const back = root.querySelector('[data-role="back"]') as HTMLButtonElement
    back.click()
    const grid = root.querySelector('[data-role="picker-grid"]')
    expect(grid).toBeTruthy()
    expect(root.querySelector('[data-role="game-mount"]')).toBeNull()
  })

  it('action loop applies state locally — clicking Flip in War advances the step counter', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const war = root.querySelector('[data-game-id="war"]') as HTMLButtonElement
    war.click()
    const stepBefore = root.textContent?.match(/Step (\d+)/)?.[1]
    const flip = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Flip',
    ) as HTMLButtonElement
    flip.click()
    const stepAfter = root.textContent?.match(/Step (\d+)/)?.[1]
    expect(Number(stepAfter)).toBeGreaterThan(Number(stepBefore))
  })

  it('with a per_user mode init, only games supporting service show enabled', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const perUserInit: ConcordInitPayload = { ...init, mode: 'per_user' }
    await mountSuite(root, new FakeBridge(perUserInit))
    // 'service' is supported by solitaire + blackjack only (per rule modules).
    const sol = root.querySelector('[data-game-id="solitaire"]') as HTMLButtonElement
    const bj = root.querySelector('[data-game-id="blackjack"]') as HTMLButtonElement
    const sp = root.querySelector('[data-game-id="speed"]') as HTMLButtonElement
    expect(sol.disabled).toBe(false)
    expect(bj.disabled).toBe(false)
    expect(sp.disabled).toBe(true)
  })
})
