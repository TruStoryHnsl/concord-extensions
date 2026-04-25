/**
 * Card Game Suite (INS-006) — entry point.
 *
 * v0.3.0: ships per-game UI surfaces wired through the Concord shell SDK.
 * The picker now resolves the session's UX mode from the shell init payload
 * (with a 250ms dev-fallback), filters games to those that support the
 * resolved mode, and on tile click mounts the game's `renderXxx`. A "Back"
 * button returns to the picker.
 *
 * Network sync of game actions is deferred — the renderer fires `onAction`
 * locally; the shell wave that wires send_to_device + state_events will
 * connect those to the rest of the table.
 */

export * as card from './engine/card'
export * as deck from './engine/deck'
export * as hand from './engine/hand'
export * as pile from './engine/pile'
export * as rng from './engine/rng'
export * from './engine/types'

export { solitaireRules } from './games/solitaire/rules'
export { holdemRules, dealHand } from './games/poker/holdem'
export { blackjackRules } from './games/blackjack/rules'
export { speedRules } from './games/speed/rules'
export { kingsAndPeasantsRules } from './games/kings-and-peasants/rules'
export { warRules } from './games/war/rules'

export {
  GAMES,
  filterGamesByMode,
  gameById,
  gameCompatList,
} from './session/game-picker'

export { ShellBridge, getDefaultBridge } from './shell/bridge'
export {
  pickViewVariant,
  mapSdkModeToUxMode,
} from './session/mode-adapter'
export type { ViewVariant } from './session/mode-adapter'

import { mulberry32 } from './engine/rng'
import { GameRuleModule, UXMode } from './engine/types'
import { renderBlackjack } from './games/blackjack/ui'
import { renderKingsAndPeasants } from './games/kings-and-peasants/ui'
import { renderHoldem } from './games/poker/ui'
import { renderSolitaire } from './games/solitaire/ui'
import { renderSpeed } from './games/speed/ui'
import { GameRenderHandle } from './games/ui-common'
import { renderWar } from './games/war/ui'
import {
  filterGamesByMode,
  GAMES,
  gameCompatList,
} from './session/game-picker'
import { mapSdkModeToUxMode, pickViewVariant, ViewVariant } from './session/mode-adapter'
import { ShellBridge, getDefaultBridge } from './shell/bridge'
import { ConcordInitPayload } from './shell/sdk-types'

/** Replace all children of an element with the given nodes. */
function replaceChildren(el: HTMLElement, ...nodes: Node[]): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  for (const n of nodes) el.appendChild(n)
}

interface MountedGame {
  handle: GameRenderHandle<unknown>
  state: unknown
  rules: GameRuleModule<unknown, unknown, unknown>
}

/**
 * Mount the picker UI. Resolves the bridge init, filters games to compatible
 * ones, and wires tile clicks to mount the appropriate game's `renderXxx`.
 *
 * Exported so picker-integration tests can inject a fake bridge.
 */
export async function mountSuite(
  root: HTMLElement,
  bridge: ShellBridge = getDefaultBridge(),
): Promise<void> {
  const init = await bridge.getInit()
  renderPicker(root, init, bridge)
}

function renderPicker(
  root: HTMLElement,
  init: ConcordInitPayload,
  bridge: ShellBridge,
): void {
  // Determine resolved UX mode for this session (using all-supported set;
  // each tile re-checks per-game compatibility below).
  const allModes: readonly UXMode[] = ['party', 'display', 'service', 'hybrid']
  const resolvedUx = mapSdkModeToUxMode(init.mode, allModes)

  rootStyle(root)
  replaceChildren(root)

  const title = document.createElement('h1')
  title.textContent = 'Card Game Suite'
  title.style.margin = '0 0 8px 0'
  title.style.fontSize = '24px'
  title.style.fontWeight = '600'
  root.appendChild(title)

  const subtitle = document.createElement('p')
  subtitle.textContent = `Session ${init.sessionId} · seat ${init.seat} · UX ${resolvedUx}`
  subtitle.style.margin = '0 0 24px 0'
  subtitle.style.opacity = '0.7'
  subtitle.style.fontSize = '13px'
  root.appendChild(subtitle)

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))'
  grid.style.gap = '12px'
  grid.style.maxWidth = '900px'
  grid.dataset.role = 'picker-grid'
  root.appendChild(grid)

  const compatList = gameCompatList(resolvedUx)
  for (const { game, compatible } of compatList) {
    const tile = document.createElement('button')
    tile.dataset.gameId = game.gameId
    tile.style.padding = '20px 16px'
    tile.style.background = '#2c2c2c'
    tile.style.color = '#e8e8e8'
    tile.style.border = '1px solid #3a3a3a'
    tile.style.borderRadius = '8px'
    tile.style.cursor = compatible ? 'pointer' : 'not-allowed'
    tile.style.fontSize = '16px'
    tile.style.fontWeight = '500'
    tile.disabled = !compatible
    tile.style.opacity = compatible ? '1' : '0.45'
    tile.title = compatible
      ? `${game.displayName} · supports: ${game.supportedModes.join(', ')}`
      : `Unavailable in '${resolvedUx}' mode (supports: ${game.supportedModes.join(', ')})`
    tile.textContent = game.displayName
    tile.addEventListener('mouseenter', () => {
      if (compatible) tile.style.background = '#3a3a3a'
    })
    tile.addEventListener('mouseleave', () => {
      tile.style.background = '#2c2c2c'
    })
    tile.addEventListener('click', () => {
      if (!compatible) return
      const variant = pickViewVariant(
        mapSdkModeToUxMode(init.mode, game.supportedModes),
        init.seat,
      )
      mountGame(root, game, variant, init, bridge)
    })
    grid.appendChild(tile)
  }
  const note = document.createElement('div')
  note.style.marginTop = '24px'
  note.style.fontSize = '12px'
  note.style.opacity = '0.5'
  const compatNames = filterGamesByMode(resolvedUx).map((g) => g.gameId).join(', ') || 'none'
  note.textContent = `Compatible games for '${resolvedUx}': ${compatNames}`
  root.appendChild(note)
}

function mountGame(
  root: HTMLElement,
  rules: GameRuleModule<unknown, unknown, unknown>,
  variant: ViewVariant,
  init: ConcordInitPayload,
  bridge: ShellBridge,
): void {
  const seed = stringHash(init.sessionId)
  const rng = mulberry32(seed)
  const initialState = buildInitialState(rules, init, rng)

  rootStyle(root)
  replaceChildren(root)

  const back = document.createElement('button')
  back.textContent = '← Back to picker'
  back.dataset.role = 'back'
  back.style.padding = '6px 10px'
  back.style.background = '#2c2c2c'
  back.style.color = '#e8e8e8'
  back.style.border = '1px solid #3a3a3a'
  back.style.borderRadius = '6px'
  back.style.cursor = 'pointer'
  back.style.fontSize = '12px'
  back.style.marginBottom = '12px'
  root.appendChild(back)

  const mount = document.createElement('div')
  mount.dataset.role = 'game-mount'
  mount.dataset.gameId = rules.gameId
  root.appendChild(mount)

  const mounted: MountedGame = {
    rules,
    state: initialState,
    handle: launchRenderer(
      rules,
      mount,
      initialState,
      variant,
      init.participantId,
      (action) => {
        try {
          const next = rules.applyAction(mounted.state, action, rng)
          mounted.state = next
          mounted.handle.update(next)
        } catch {
          /* illegal — renderer surfaces error feedback */
        }
      },
    ) as GameRenderHandle<unknown>,
  }

  back.addEventListener('click', () => {
    mounted.handle.destroy()
    renderPicker(root, init, bridge)
  })
}

function launchRenderer(
  rules: GameRuleModule<unknown, unknown, unknown>,
  mount: HTMLElement,
  initialState: unknown,
  variant: ViewVariant,
  selfPlayerId: string,
  onAction: (a: unknown) => void,
): GameRenderHandle<unknown> {
  const opts = {
    root: mount,
    initialState: initialState as never,
    variant,
    selfPlayerId,
    onAction: onAction as never,
  }
  switch (rules.gameId) {
    case 'solitaire':
      return renderSolitaire(opts) as unknown as GameRenderHandle<unknown>
    case 'holdem':
      return renderHoldem(opts) as unknown as GameRenderHandle<unknown>
    case 'blackjack':
      return renderBlackjack(opts) as unknown as GameRenderHandle<unknown>
    case 'speed':
      return renderSpeed(opts) as unknown as GameRenderHandle<unknown>
    case 'kings-and-peasants':
      return renderKingsAndPeasants(opts) as unknown as GameRenderHandle<unknown>
    case 'war':
      return renderWar({ ...opts, autoplay: false }) as unknown as GameRenderHandle<unknown>
    default:
      throw new Error(`unknown gameId: ${rules.gameId}`)
  }
}

function buildInitialState(
  rules: GameRuleModule<unknown, unknown, unknown>,
  init: ConcordInitPayload,
  rng: ReturnType<typeof mulberry32>,
): unknown {
  const me = init.participantId
  const opp = `@bot:${init.sessionId}`
  switch (rules.gameId) {
    case 'solitaire':
      // Network sync hook: real-time solitaire is single-player, no sync needed.
      return rules.makeInitial({ drawCount: 1 }, rng)
    case 'holdem': {
      // Network sync hook: shell wave will replace bot ids with real seats.
      const initial = rules.makeInitial({ playerIds: [me, opp, `@bot2:${init.sessionId}`] }, rng) as never
      // Auto-deal first hand for demo purposes.
      try {
        return rules.applyAction(initial, { kind: 'deal' } as never, rng)
      } catch {
        return initial
      }
    }
    case 'blackjack':
      // Network sync hook: shell wave will broadcast bets + draws via state_events.
      return rules.makeInitial({ playerIds: [me], initialBet: 50 }, rng)
    case 'speed':
      // Network sync hook: shell wave will run resolveTick over real-time inputs.
      return rules.makeInitial({ playerIds: [me, opp] }, rng)
    case 'kings-and-peasants':
      // Network sync hook: shell wave will route plays + passes via state_events.
      return rules.makeInitial({
        playerIds: [me, opp, `@bot2:${init.sessionId}`, `@bot3:${init.sessionId}`],
      }, rng)
    case 'war':
      // Network sync hook: shell wave will deal a single canonical state on host
      // and broadcast each flip outcome via state_events to keep both sides in sync.
      return rules.makeInitial({ playerIds: [me, opp] }, rng)
    default:
      throw new Error(`unknown gameId: ${rules.gameId}`)
  }
}

function rootStyle(root: HTMLElement): void {
  root.style.fontFamily = 'system-ui, -apple-system, sans-serif'
  root.style.background = '#1a1a1a'
  root.style.color = '#e8e8e8'
  root.style.minHeight = '100vh'
  root.style.padding = '24px'
  root.style.boxSizing = 'border-box'
}

function stringHash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Boot the picker when running in the iframe.
if (typeof document !== 'undefined') {
  const root = document.getElementById('card-suite-root')
  if (root) {
    void mountSuite(root)
  }
}

// Preserve GAMES export so external introspection still works.
void GAMES
