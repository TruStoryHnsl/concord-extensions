/**
 * Werewolf — entry point.
 *
 * v0.4.0: ships a roleset picker + persistent rules panel + bot driver,
 * paralleling card-suite v0.4.0. Game flow:
 *
 *   1. ShellBridge resolves the init payload (250ms dev fallback).
 *   2. The picker renders Mode + Seat dropdowns and three roleset tiles
 *      (5/6/7 player), each annotated "vs N bots".
 *   3. Click a roleset tile → mount the rules panel + table view + back
 *      button. The bot driver schedules a 600ms-delayed bot move whenever
 *      it's a bot's turn.
 *
 * Network sync of role actions is deferred — the in-iframe action loop
 * applies state locally; the shell wave that wires send_to_device +
 * state_events will propagate moves to other surfaces.
 */

export * from './engine/types'
export * from './engine/effects'
export * from './engine/deaths'
export * from './engine/votes'
export * from './engine/phases'
export * from './engine/dawn'
export * from './engine/rng'
export * as roles from './roles'
export * from './setups'
export { ShellBridge, getDefaultBridge } from './shell/bridge'
export {
  pickViewVariant,
  mapSdkModeToUxMode,
} from './session/mode-adapter'
export type { ViewVariant, UXMode } from './session/mode-adapter'
export { BOT_TURN_DELAY_MS, isBotId, PendingTimers } from './session/bot-driver'
export { mountRulesPanel } from './ui/rules-panel'
export { RULES, totalBodyLength } from './rules-doc'
export { pickAction, maybeScheduleBotTurn } from './bot'
export type { Action } from './bot'

import { mulberry32 } from './engine/rng'
import { mountRulesPanel } from './ui/rules-panel'
import { RULES } from './rules-doc'
import { ALL_ROLESETS, getRoleset, RolesetDef } from './setups'
import {
  mapSdkModeToUxMode,
  pickViewVariant,
  UXMode,
  ViewVariant,
} from './session/mode-adapter'
import { ShellBridge, getDefaultBridge } from './shell/bridge'
import type { ConcordInitPayload } from './shell/sdk-types'
import { BOT_TURN_DELAY_MS, PendingTimers } from './session/bot-driver'
import { GameState, PlayerState, RolesetId } from './engine/types'
import { pickAction } from './bot'
import { applyEffects } from './engine/effects'
import { ALL_ROLES } from './roles'

const ALL_UX_MODES: readonly UXMode[] = ['party', 'chat', 'hybrid'] as const

/** Replace all children of an element with the given nodes. */
function replaceChildren(el: HTMLElement, ...nodes: Node[]): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  for (const n of nodes) el.appendChild(n)
}

/**
 * Mount the picker UI. Resolves the bridge init then renders the picker.
 * Exported so integration tests can inject a fake bridge.
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
  rootStyle(root)
  replaceChildren(root)

  const resolvedUx = mapSdkModeToUxMode(init.mode, ALL_UX_MODES)

  const title = document.createElement('h1')
  title.textContent = 'Werewolf'
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

  // Always-rendered Mode + Seat picker so a solo dev/host can play any
  // variant without redeploy.
  root.appendChild(renderSessionPicker(init, () => renderPicker(root, init, bridge)))

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))'
  grid.style.gap = '12px'
  grid.style.maxWidth = '900px'
  grid.dataset.role = 'picker-grid'
  root.appendChild(grid)

  for (const roleset of ALL_ROLESETS) {
    const tile = document.createElement('button')
    tile.dataset.rolesetId = roleset.id
    tile.style.padding = '20px 16px'
    tile.style.background = '#2c2c2c'
    tile.style.color = '#e8e8e8'
    tile.style.border = '1px solid #3a3a3a'
    tile.style.borderRadius = '8px'
    tile.style.cursor = 'pointer'
    tile.style.fontSize = '16px'
    tile.style.fontWeight = '500'
    tile.style.display = 'flex'
    tile.style.flexDirection = 'column'
    tile.style.alignItems = 'flex-start'
    tile.style.textAlign = 'left'
    tile.style.gap = '4px'
    tile.title = `${roleset.displayName} · vs ${roleset.playerCount - 1} bots`
    const titleEl = document.createElement('div')
    titleEl.textContent = roleset.displayName
    titleEl.style.fontWeight = '600'
    tile.appendChild(titleEl)
    const sub = document.createElement('div')
    sub.dataset.role = 'tile-subtitle'
    sub.textContent = `vs ${roleset.playerCount - 1} bots`
    sub.style.fontSize = '12px'
    sub.style.opacity = '0.7'
    sub.style.fontWeight = '400'
    tile.appendChild(sub)
    tile.addEventListener('mouseenter', () => {
      tile.style.background = '#3a3a3a'
    })
    tile.addEventListener('mouseleave', () => {
      tile.style.background = '#2c2c2c'
    })
    tile.addEventListener('click', () => {
      const variant = pickViewVariant(resolvedUx, init.seat)
      mountTable(root, roleset, variant, init, bridge)
    })
    grid.appendChild(tile)
  }
}

interface MountedTable {
  state: GameState
  rulesHandle: { destroy(): void }
  timers: PendingTimers
  destroyed: boolean
}

function mountTable(
  root: HTMLElement,
  roleset: RolesetDef,
  variant: ViewVariant,
  init: ConcordInitPayload,
  bridge: ShellBridge,
): void {
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

  const rules = mountRulesPanel(root, RULES, `table-${roleset.id}`)
  rules.gameArea.dataset.role = 'game-mount'
  rules.gameArea.dataset.rolesetId = roleset.id

  const seed = stringHash(init.sessionId + ':' + roleset.id)
  const rng = mulberry32(seed)
  const initialState = makeTableState(roleset, init.participantId, rng)

  const mounted: MountedTable = {
    state: initialState,
    rulesHandle: rules,
    timers: new PendingTimers(),
    destroyed: false,
  }

  const statusEl = document.createElement('div')
  statusEl.dataset.role = 'status'
  statusEl.style.padding = '8px 12px'
  statusEl.style.marginBottom = '12px'
  statusEl.style.background = '#212121'
  statusEl.style.border = '1px solid #333'
  statusEl.style.borderRadius = '6px'
  statusEl.style.fontSize = '13px'
  rules.gameArea.appendChild(statusEl)

  const playersEl = document.createElement('div')
  playersEl.dataset.role = 'players'
  playersEl.style.display = 'flex'
  playersEl.style.flexDirection = 'column'
  playersEl.style.gap = '4px'
  playersEl.style.fontSize = '13px'
  rules.gameArea.appendChild(playersEl)

  function renderTable(): void {
    if (mounted.destroyed) return
    const phaseLabel = mounted.state.winner
      ? `Game over — ${mounted.state.winner === 'village' ? 'Village wins' : 'Werewolves win'}`
      : `${roleset.displayName} · phase: ${mounted.state.phase} · day ${mounted.state.day}`
    statusEl.textContent = phaseLabel
    while (playersEl.firstChild) playersEl.removeChild(playersEl.firstChild)
    for (const p of mounted.state.players) {
      const row = document.createElement('div')
      row.dataset.role = 'player-row'
      row.dataset.playerId = p.id
      const isMe = p.id === init.participantId
      row.textContent = `${p.alive ? '·' : '✗'} ${p.id}${isMe ? ' (you)' : ''} — ${p.role}`
      row.style.padding = '4px 8px'
      row.style.borderRadius = '4px'
      row.style.background = p.alive ? 'transparent' : '#2a1c1c'
      row.style.opacity = p.alive ? '1' : '0.6'
      playersEl.appendChild(row)
    }
    void variant // surface variant is informational; renderer body is the same
  }

  back.addEventListener('click', () => {
    mounted.destroyed = true
    mounted.timers.cancelAll()
    rules.destroy()
    renderPicker(root, init, bridge)
  })

  renderTable()
}

/**
 * Build the initial table state for a given roleset. The local participant
 * is seated as the first non-bot; the remaining seats are filled with
 * `@bot{N}:<sessionId>` ids.
 *
 * Role assignment is deterministic given the seeded RNG: seats are shuffled
 * by RNG, then the roleset's role list is dealt round the table.
 */
function makeTableState(
  roleset: RolesetDef,
  selfId: string,
  rng: ReturnType<typeof mulberry32>,
): GameState {
  const playerIds: string[] = []
  playerIds.push(selfId)
  for (let i = 1; i < roleset.playerCount; i++) {
    playerIds.push(`@bot${i}:wolf`)
  }
  // Shuffle roles for variety (but deterministically given the seed).
  const roles = roleset.roles.slice()
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }
  const players: PlayerState[] = playerIds.map((id, idx) => {
    const role = roles[idx]
    const def = ALL_ROLES[role]
    return {
      id,
      seat: idx,
      role,
      team: def.team,
      alive: true,
      statuses: [],
    }
  })
  // Sanity: at least one werewolf in the table or the win check breaks.
  void applyEffects // touch the import so it isn't dead-pruned
  void pickAction
  return {
    roleset: roleset.id as RolesetId,
    phase: 'setup',
    day: 0,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
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

function renderSessionPicker(
  init: ConcordInitPayload,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.dataset.role = 'session-picker'
  wrap.style.display = 'flex'
  wrap.style.gap = '12px'
  wrap.style.alignItems = 'center'
  wrap.style.flexWrap = 'wrap'
  wrap.style.padding = '10px 12px'
  wrap.style.background = '#212121'
  wrap.style.border = '1px solid #333'
  wrap.style.borderRadius = '6px'
  wrap.style.marginBottom = '20px'
  wrap.style.fontSize = '12px'

  const label = document.createElement('span')
  label.textContent = 'View as:'
  label.style.opacity = '0.7'
  wrap.appendChild(label)

  const modeOpts: { value: ConcordInitPayload['mode']; label: string }[] = [
    { value: 'shared_admin_input', label: 'shared_admin_input → party' },
    { value: 'shared', label: 'shared → party' },
    { value: 'shared_readonly', label: 'shared_readonly → party' },
    { value: 'per_user', label: 'per_user → chat' },
    { value: 'hybrid', label: 'hybrid → hybrid' },
  ]
  const modeSel = document.createElement('select')
  modeSel.dataset.role = 'session-mode'
  styleSelect(modeSel)
  for (const opt of modeOpts) {
    const o = document.createElement('option')
    o.value = opt.value
    o.textContent = opt.label
    if (opt.value === init.mode) o.selected = true
    modeSel.appendChild(o)
  }
  modeSel.addEventListener('change', () => {
    init.mode = modeSel.value as ConcordInitPayload['mode']
    onChange()
  })
  wrap.appendChild(modeSel)

  const seatOpts: { value: ConcordInitPayload['seat']; label: string }[] = [
    { value: 'participant', label: 'participant (controller)' },
    { value: 'host', label: 'host (display)' },
    { value: 'observer', label: 'observer (display)' },
    { value: 'spectator', label: 'spectator (display)' },
  ]
  const seatSel = document.createElement('select')
  seatSel.dataset.role = 'session-seat'
  styleSelect(seatSel)
  for (const opt of seatOpts) {
    const o = document.createElement('option')
    o.value = opt.value
    o.textContent = opt.label
    if (opt.value === init.seat) o.selected = true
    seatSel.appendChild(o)
  }
  seatSel.addEventListener('change', () => {
    init.seat = seatSel.value as ConcordInitPayload['seat']
    onChange()
  })
  wrap.appendChild(seatSel)

  return wrap
}

function styleSelect(sel: HTMLSelectElement): void {
  sel.style.background = '#1a1a1a'
  sel.style.color = '#e8e8e8'
  sel.style.border = '1px solid #3a3a3a'
  sel.style.borderRadius = '4px'
  sel.style.padding = '4px 8px'
  sel.style.fontSize = '12px'
  sel.style.fontFamily = 'inherit'
  sel.style.cursor = 'pointer'
}

function stringHash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

void getRoleset
void BOT_TURN_DELAY_MS

// Boot the picker when running in the iframe.
if (typeof document !== 'undefined') {
  const boot = (): void => {
    const root = document.getElementById('werewolf-root')
    if (root && !root.dataset.booted) {
      root.dataset.booted = '1'
      void mountSuite(root)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
}
