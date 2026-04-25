/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mountSuite } from '../index'
import { ShellBridge } from '../shell/bridge'
import { ConcordInitPayload } from '../shell/sdk-types'

class FakeBridge extends ShellBridge {
  constructor(private fakeInit: ConcordInitPayload) {
    super(null)
  }
  override getInit(): Promise<ConcordInitPayload> {
    return Promise.resolve(this.fakeInit)
  }
}

const init: ConcordInitPayload = {
  sessionId: 'sess-1',
  extensionId: 'com.concord.werewolf',
  mode: 'shared_admin_input',
  participantId: '@me:test',
  seat: 'participant',
  surfaces: [{ surface_id: 'main', type: 'panel', anchor: 'center' }],
}

describe('picker integration', () => {
  it('renders the picker grid with 3 roleset tiles', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const grid = root.querySelector('[data-role="picker-grid"]') as HTMLElement
    expect(grid).toBeTruthy()
    const tiles = grid.querySelectorAll('button[data-roleset-id]')
    expect(tiles.length).toBe(3)
  })

  it('each tile shows a "vs N bots" subtitle', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const tiles = Array.from(
      root.querySelectorAll('button[data-roleset-id]'),
    ) as HTMLButtonElement[]
    expect(tiles.length).toBe(3)
    for (const tile of tiles) {
      const sub = tile.querySelector('[data-role="tile-subtitle"]') as HTMLElement
      expect(sub).toBeTruthy()
      expect(sub.textContent).toMatch(/vs \d+ bots/)
    }
  })

  it('clicking a roleset tile mounts the table view', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const tile = root.querySelector(
      'button[data-roleset-id="classic-5"]',
    ) as HTMLButtonElement
    tile.click()
    const mount = root.querySelector('[data-role="game-mount"]') as HTMLElement
    expect(mount).toBeTruthy()
    expect(mount.dataset.rolesetId).toBe('classic-5')
    expect(root.querySelector('[data-role="back"]')).toBeTruthy()
  })

  it('clicking Back returns to the picker', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const tile = root.querySelector(
      'button[data-roleset-id="classic-5"]',
    ) as HTMLButtonElement
    tile.click()
    const back = root.querySelector('[data-role="back"]') as HTMLButtonElement
    back.click()
    const grid = root.querySelector('[data-role="picker-grid"]')
    expect(grid).toBeTruthy()
    expect(root.querySelector('[data-role="game-mount"]')).toBeNull()
  })

  it('mounted table has a persistent rules panel', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const tile = root.querySelector(
      'button[data-roleset-id="classic-5"]',
    ) as HTMLButtonElement
    tile.click()
    const panel = root.querySelector('[data-role="rules-panel"]') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.dataset.collapsed).toBe('false')
    const toggle = panel.querySelector('[data-role="rules-toggle"]') as HTMLButtonElement
    toggle.click()
    expect(panel.dataset.collapsed).toBe('true')
  })

  it('mounted classic-7 table shows 7 player rows', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    await mountSuite(root, new FakeBridge(init))
    const tile = root.querySelector(
      'button[data-roleset-id="classic-7"]',
    ) as HTMLButtonElement
    tile.click()
    const rows = root.querySelectorAll('[data-role="player-row"]')
    expect(rows.length).toBe(7)
  })
})
