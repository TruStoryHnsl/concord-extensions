/**
 * Chess & Checkers extension (INS-003) — entry point.
 *
 * v0.4.0: full picker + per-game UI + AI bots + persistent rules panels,
 * paralleling card-suite v0.4.0. Game flow:
 *
 *   1. ShellBridge resolves the init payload (250ms dev fallback).
 *   2. The picker renders Mode + Seat dropdowns and game tiles for
 *      Chess and Checkers, each annotated "vs <tier> bot" if a bot is
 *      enabled.
 *   3. Click a game tile -> mount the rules panel + board + controller +
 *      status banner + back button. The bot driver schedules a 600ms-
 *      delayed move whenever it is the bot's turn.
 *
 * Network sync of moves is deferred — proposeMove() applies locally;
 * the shell wave that wires send_to_device + state_events will route
 * those through the rest of the table.
 */

export * from "./engine/types"
export * as chessRules from "./engine/chess/rules"
export * as chessBot from "./engine/chess/bot"
export * as checkersRules from "./engine/checkers/rules"
export * as checkersBot from "./engine/checkers/bot"
export { renderBoard } from "./ui/board"
export { handleClick } from "./ui/controller"
export type { ControllerInput, ControllerOutput } from "./ui/controller"
export { mountRulesPanel } from "./ui/rules-panel"
export * from "./session/pairing"
export * from "./session/game-selector"
export { ShellBridge, getDefaultBridge } from "./shell/bridge"
export {
  pickViewVariant,
  mapSdkModeToUxMode,
} from "./session/mode-adapter"
export type { ViewVariant, UXMode } from "./session/mode-adapter"
export { BOT_TURN_DELAY_MS, isBotId, PendingTimers } from "./session/bot-driver"

import * as chessRulesNs from "./engine/chess/rules"
import * as chessBotNs from "./engine/chess/bot"
import * as checkersRulesNs from "./engine/checkers/rules"
import * as checkersBotNs from "./engine/checkers/bot"
import type { Tier } from "./engine/chess/bot"
import type { Color, GameState, Move, Square } from "./engine/types"
import { renderBoard } from "./ui/board"
import { handleClick } from "./ui/controller"
import { mountRulesPanel } from "./ui/rules-panel"
import { RULES as CHESS_RULES_DOC } from "./engine/chess/rules-doc"
import { RULES as CHECKERS_RULES_DOC } from "./engine/checkers/rules-doc"
import { BOT_TURN_DELAY_MS, PendingTimers } from "./session/bot-driver"
import {
  mapSdkModeToUxMode,
  pickViewVariant,
  UXMode,
  ViewVariant,
} from "./session/mode-adapter"
import { ShellBridge, getDefaultBridge } from "./shell/bridge"
import type { ConcordInitPayload } from "./shell/sdk-types"
import type { RulesDoc } from "./games/rules-doc-types"

const HUMAN_COLOR: Color = "white"
const BOT_COLOR: Color = "black"

type GameKind = "chess" | "checkers"

interface GameModule {
  readonly id: GameKind
  readonly displayName: string
  readonly rulesDoc: RulesDoc
  readonly makeInitial: () => GameState
  readonly legalMoves: (state: GameState, from?: Square) => Move[]
  readonly applyMove: (state: GameState, move: Move) => GameState
  readonly chooseBotMove: (state: GameState, tier: Tier) => Move | null
}

const GAMES: ReadonlyArray<GameModule> = [
  {
    id: "chess",
    displayName: "Chess",
    rulesDoc: CHESS_RULES_DOC,
    makeInitial: chessRulesNs.makeInitial,
    legalMoves: chessRulesNs.legalMoves,
    applyMove: chessRulesNs.applyMove,
    chooseBotMove: chessBotNs.chooseMove,
  },
  {
    id: "checkers",
    displayName: "Checkers",
    rulesDoc: CHECKERS_RULES_DOC,
    makeInitial: checkersRulesNs.makeInitial,
    legalMoves: checkersRulesNs.legalMoves,
    applyMove: checkersRulesNs.applyMove,
    chooseBotMove: checkersBotNs.chooseMove,
  },
]

const TIER_ORDER: ReadonlyArray<Tier> = ["beginner", "casual", "advanced", "expert"]
const ALL_UX_MODES: UXMode[] = ["party", "display", "service"]

interface PickerPrefs {
  vsBot: boolean
  tier: Tier
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
  const prefs: PickerPrefs = { vsBot: true, tier: "casual" }
  renderPicker(root, init, bridge, prefs)
}

function renderPicker(
  root: HTMLElement,
  init: ConcordInitPayload,
  bridge: ShellBridge,
  prefs: PickerPrefs,
): void {
  rootStyle(root)
  replaceChildren(root)

  const resolvedUx = mapSdkModeToUxMode(init.mode, ALL_UX_MODES)

  const title = document.createElement("h1")
  title.textContent = "Chess & Checkers"
  title.style.margin = "0 0 8px 0"
  title.style.fontSize = "24px"
  title.style.fontWeight = "600"
  root.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.textContent = `Session ${init.sessionId} · seat ${init.seat} · UX ${resolvedUx}`
  subtitle.style.margin = "0 0 24px 0"
  subtitle.style.opacity = "0.7"
  subtitle.style.fontSize = "13px"
  root.appendChild(subtitle)

  // Always-rendered Mode + Seat picker so a solo dev/host can play any
  // variant of any game without redeploy.
  root.appendChild(
    renderSessionPicker(init, () => renderPicker(root, init, bridge, prefs)),
  )

  root.appendChild(
    renderBotControls(prefs, () => renderPicker(root, init, bridge, prefs)),
  )

  const grid = document.createElement("div")
  grid.style.display = "grid"
  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))"
  grid.style.gap = "12px"
  grid.style.maxWidth = "640px"
  grid.dataset.role = "picker-grid"
  root.appendChild(grid)

  for (const game of GAMES) {
    const tile = document.createElement("button")
    tile.dataset.gameId = game.id
    tile.style.padding = "20px 16px"
    tile.style.background = "#2c2c2c"
    tile.style.color = "#e8e8e8"
    tile.style.border = "1px solid #3a3a3a"
    tile.style.borderRadius = "8px"
    tile.style.cursor = "pointer"
    tile.style.fontSize = "16px"
    tile.style.fontWeight = "500"
    tile.style.display = "flex"
    tile.style.flexDirection = "column"
    tile.style.alignItems = "flex-start"
    tile.style.textAlign = "left"
    tile.style.gap = "4px"
    const annotation = prefs.vsBot ? `vs ${prefs.tier} bot` : "vs human"
    tile.title = `${game.displayName} · ${annotation}`
    const titleEl = document.createElement("div")
    titleEl.textContent = game.displayName
    titleEl.style.fontWeight = "600"
    tile.appendChild(titleEl)
    const sub = document.createElement("div")
    sub.dataset.role = "tile-subtitle"
    sub.textContent = annotation
    sub.style.fontSize = "12px"
    sub.style.opacity = "0.7"
    sub.style.fontWeight = "400"
    tile.appendChild(sub)
    tile.addEventListener("mouseenter", () => {
      tile.style.background = "#3a3a3a"
    })
    tile.addEventListener("mouseleave", () => {
      tile.style.background = "#2c2c2c"
    })
    tile.addEventListener("click", () => {
      const variant = pickViewVariant(resolvedUx, init.seat)
      mountGame(root, game, variant, init, bridge, prefs)
    })
    grid.appendChild(tile)
  }
}

interface MountedGame {
  state: GameState
  selected: Square | null
  highlights: Square[]
  rulesHandle: { destroy(): void }
  timers: PendingTimers
  destroyed: boolean
}

function mountGame(
  root: HTMLElement,
  game: GameModule,
  variant: ViewVariant,
  init: ConcordInitPayload,
  bridge: ShellBridge,
  prefs: PickerPrefs,
): void {
  rootStyle(root)
  replaceChildren(root)

  const back = document.createElement("button")
  back.textContent = "← Back to picker"
  back.dataset.role = "back"
  back.style.padding = "6px 10px"
  back.style.background = "#2c2c2c"
  back.style.color = "#e8e8e8"
  back.style.border = "1px solid #3a3a3a"
  back.style.borderRadius = "6px"
  back.style.cursor = "pointer"
  back.style.fontSize = "12px"
  back.style.marginBottom = "12px"
  root.appendChild(back)

  const rules = mountRulesPanel(root, game.rulesDoc, game.id)
  rules.gameArea.dataset.role = "game-mount"
  rules.gameArea.dataset.gameId = game.id

  const statusEl = document.createElement("div")
  statusEl.dataset.role = "status"
  statusEl.style.padding = "8px 12px"
  statusEl.style.marginBottom = "12px"
  statusEl.style.background = "#212121"
  statusEl.style.border = "1px solid #333"
  statusEl.style.borderRadius = "6px"
  statusEl.style.fontSize = "13px"
  rules.gameArea.appendChild(statusEl)

  const boardHost = document.createElement("div")
  boardHost.dataset.role = "board-host"
  rules.gameArea.appendChild(boardHost)

  const mounted: MountedGame = {
    state: game.makeInitial(),
    selected: null,
    highlights: [],
    rulesHandle: rules,
    timers: new PendingTimers(),
    destroyed: false,
  }

  const humanIsBot = prefs.vsBot && shouldUseBot(variant)

  function localControlColor(): Color | null {
    if (variant !== "shared-controller" && variant !== "solo") return null
    return HUMAN_COLOR
  }

  function rerender(): void {
    if (mounted.destroyed) return
    statusEl.textContent = describeStatus(mounted.state, humanIsBot, prefs.tier)
    while (boardHost.firstChild) boardHost.removeChild(boardHost.firstChild)
    const flipped = localControlColor() === "black"
    const svg = renderBoard(mounted.state.board, {
      flipped,
      highlight: mounted.highlights,
      selected: mounted.selected,
    })
    svg.style.cursor = localControlColor() ? "pointer" : "default"
    svg.dataset.role = "board"
    svg.addEventListener("click", (e) => {
      const sq = squareFromEvent(svg, e)
      if (!sq) return
      onClickSquare(sq)
    })
    boardHost.appendChild(svg)
  }

  function onClickSquare(sq: Square): void {
    const asColor = localControlColor()
    if (asColor === null) return
    const out = handleClick({
      state: mounted.state,
      legalMoves: game.legalMoves,
      selected: mounted.selected,
      click: sq,
      asColor,
    })
    mounted.selected = out.selected
    mounted.highlights = out.highlights
    if (out.propose) {
      try {
        mounted.state = game.applyMove(mounted.state, out.propose)
      } catch {
        /* illegal — controller already validated */
      }
    }
    rerender()
    if (humanIsBot && mounted.state.status === "playing" && mounted.state.toMove === BOT_COLOR) {
      scheduleBotMove()
    }
  }

  function scheduleBotMove(): void {
    if (mounted.destroyed) return
    mounted.timers.schedule(() => {
      if (mounted.destroyed) return
      if (mounted.state.status !== "playing") return
      const move = game.chooseBotMove(mounted.state, prefs.tier)
      if (!move) return
      try {
        mounted.state = game.applyMove(mounted.state, move)
      } catch {
        return
      }
      rerender()
    }, BOT_TURN_DELAY_MS)
  }

  back.addEventListener("click", () => {
    mounted.destroyed = true
    mounted.timers.cancelAll()
    rules.destroy()
    renderPicker(root, init, bridge, prefs)
  })

  rerender()

  if (humanIsBot && mounted.state.toMove === BOT_COLOR) {
    scheduleBotMove()
  }
}

function shouldUseBot(variant: ViewVariant): boolean {
  // solo (service) and shared-controller (party participant): bot is the
  // opponent. shared-display (display mode, or party hosts/observers):
  // we don't drive moves from this surface — the network would, but in
  // dev/local-only we leave it idle. For v0.4 we only enable bot in
  // surfaces that have control input.
  return variant === "solo" || variant === "shared-controller"
}

function describeStatus(state: GameState, vsBot: boolean, tier: Tier): string {
  if (state.status === "checkmate") {
    return `Checkmate. ${state.winner === "white" ? "White" : "Black"} wins.`
  }
  if (state.status === "stalemate") return "Stalemate. Draw."
  if (state.status === "draw") return "Draw."
  if (state.status === "resigned") return "Resigned."
  const turn = state.toMove === "white" ? "White" : "Black"
  if (vsBot) {
    const who = state.toMove === HUMAN_COLOR ? "you" : `${tier} bot`
    return `Turn ${state.fullmove} — ${turn} to move (${who}).`
  }
  return `Turn ${state.fullmove} — ${turn} to move.`
}

function rootStyle(root: HTMLElement): void {
  root.style.fontFamily = "system-ui, -apple-system, sans-serif"
  root.style.background = "#1a1a1a"
  root.style.color = "#e8e8e8"
  root.style.minHeight = "100vh"
  root.style.padding = "24px"
  root.style.boxSizing = "border-box"
}

function replaceChildren(el: HTMLElement, ...nodes: Node[]): void {
  while (el.firstChild) el.removeChild(el.firstChild)
  for (const n of nodes) el.appendChild(n)
}

function renderSessionPicker(
  init: ConcordInitPayload,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement("div")
  wrap.dataset.role = "session-picker"
  wrap.style.display = "flex"
  wrap.style.gap = "12px"
  wrap.style.alignItems = "center"
  wrap.style.flexWrap = "wrap"
  wrap.style.padding = "10px 12px"
  wrap.style.background = "#212121"
  wrap.style.border = "1px solid #333"
  wrap.style.borderRadius = "6px"
  wrap.style.marginBottom = "12px"
  wrap.style.fontSize = "12px"

  const label = document.createElement("span")
  label.textContent = "View as:"
  label.style.opacity = "0.7"
  wrap.appendChild(label)

  const modeOpts: { value: ConcordInitPayload["mode"]; label: string }[] = [
    { value: "shared_admin_input", label: "shared_admin_input → party" },
    { value: "shared", label: "shared → display" },
    { value: "shared_readonly", label: "shared_readonly → display" },
    { value: "per_user", label: "per_user → service" },
  ]
  const modeSel = document.createElement("select")
  modeSel.dataset.role = "session-mode"
  styleSelect(modeSel)
  for (const opt of modeOpts) {
    const o = document.createElement("option")
    o.value = opt.value
    o.textContent = opt.label
    if (opt.value === init.mode) o.selected = true
    modeSel.appendChild(o)
  }
  modeSel.addEventListener("change", () => {
    init.mode = modeSel.value as ConcordInitPayload["mode"]
    onChange()
  })
  wrap.appendChild(modeSel)

  const seatOpts: { value: ConcordInitPayload["seat"]; label: string }[] = [
    { value: "participant", label: "participant (controller)" },
    { value: "host", label: "host (display)" },
    { value: "observer", label: "observer (display)" },
    { value: "spectator", label: "spectator (display)" },
  ]
  const seatSel = document.createElement("select")
  seatSel.dataset.role = "session-seat"
  styleSelect(seatSel)
  for (const opt of seatOpts) {
    const o = document.createElement("option")
    o.value = opt.value
    o.textContent = opt.label
    if (opt.value === init.seat) o.selected = true
    seatSel.appendChild(o)
  }
  seatSel.addEventListener("change", () => {
    init.seat = seatSel.value as ConcordInitPayload["seat"]
    onChange()
  })
  wrap.appendChild(seatSel)

  return wrap
}

function renderBotControls(
  prefs: PickerPrefs,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement("div")
  wrap.dataset.role = "bot-controls"
  wrap.style.display = "flex"
  wrap.style.gap = "12px"
  wrap.style.alignItems = "center"
  wrap.style.flexWrap = "wrap"
  wrap.style.padding = "10px 12px"
  wrap.style.background = "#212121"
  wrap.style.border = "1px solid #333"
  wrap.style.borderRadius = "6px"
  wrap.style.marginBottom = "20px"
  wrap.style.fontSize = "12px"

  const label = document.createElement("span")
  label.textContent = "Opponent:"
  label.style.opacity = "0.7"
  wrap.appendChild(label)

  const botToggle = document.createElement("label")
  botToggle.style.display = "flex"
  botToggle.style.alignItems = "center"
  botToggle.style.gap = "6px"
  botToggle.style.cursor = "pointer"
  const cb = document.createElement("input")
  cb.type = "checkbox"
  cb.checked = prefs.vsBot
  cb.dataset.role = "bot-toggle"
  cb.addEventListener("change", () => {
    prefs.vsBot = cb.checked
    onChange()
  })
  botToggle.appendChild(cb)
  const cbText = document.createElement("span")
  cbText.textContent = "vs bot"
  botToggle.appendChild(cbText)
  wrap.appendChild(botToggle)

  const tierSel = document.createElement("select")
  tierSel.dataset.role = "tier-select"
  styleSelect(tierSel)
  for (const t of TIER_ORDER) {
    const o = document.createElement("option")
    o.value = t
    o.textContent = `${t}`
    if (t === prefs.tier) o.selected = true
    tierSel.appendChild(o)
  }
  tierSel.disabled = !prefs.vsBot
  tierSel.addEventListener("change", () => {
    prefs.tier = tierSel.value as Tier
    onChange()
  })
  wrap.appendChild(tierSel)

  return wrap
}

function styleSelect(sel: HTMLSelectElement): void {
  sel.style.background = "#1a1a1a"
  sel.style.color = "#e8e8e8"
  sel.style.border = "1px solid #3a3a3a"
  sel.style.borderRadius = "4px"
  sel.style.padding = "4px 8px"
  sel.style.fontSize = "12px"
  sel.style.fontFamily = "inherit"
  sel.style.cursor = "pointer"
}

/**
 * Resolve a click event on the board SVG to engine `{file, rank}`. Climbs
 * the DOM looking for `data-file` / `data-rank`; falls back to viewBox
 * coordinate hit-testing when the click landed on a piece glyph.
 */
function squareFromEvent(svg: SVGSVGElement, e: MouseEvent): Square | null {
  let cur: Element | null = e.target as Element | null
  while (cur && cur !== svg) {
    const f = cur.getAttribute?.("data-file")
    const r = cur.getAttribute?.("data-rank")
    if (f !== null && f !== undefined && r !== null && r !== undefined) {
      const file = parseInt(f, 10)
      const rank = parseInt(r, 10)
      if (Number.isFinite(file) && Number.isFinite(rank)) {
        return { file, rank }
      }
    }
    cur = cur.parentElement
  }
  // Fallback: viewBox coords. The board renders 8x8 cells of size 48 in
  // viewBox units, so we scale clientX/Y -> cell index.
  try {
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const cellPx = rect.width / 8
    const fileIdx = Math.floor((e.clientX - rect.left) / cellPx)
    // Rank rendering: when not flipped, rank 0 is at the BOTTOM of the
    // SVG (renderBoard uses dispRank = 7 - r). So pixel y from top maps
    // to engine rank as: rank = 7 - floor(y / cell).
    const yPx = (e.clientY - rect.top) / cellPx
    const rankIdx = 7 - Math.floor(yPx)
    if (
      Number.isFinite(fileIdx) &&
      Number.isFinite(rankIdx) &&
      fileIdx >= 0 &&
      fileIdx < 8 &&
      rankIdx >= 0 &&
      rankIdx < 8
    ) {
      return { file: fileIdx, rank: rankIdx }
    }
  } catch {
    /* ignore */
  }
  return null
}

// Boot the picker when running in the iframe.
if (typeof document !== "undefined") {
  const boot = (): void => {
    const root = document.getElementById("chess-checkers-root")
    if (root && !root.dataset.booted) {
      root.dataset.booted = "1"
      void mountSuite(root)
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot)
  } else {
    boot()
  }
}
