/**
 * War renderer.
 *
 * Variants: shared-display, solo, hybrid-public. War is fully automatic, so
 * controller-style variants get the same view + a "Pause" toggle.
 *
 * The renderer auto-flips on a timer (FLIP_INTERVAL_MS) by calling
 * onAction({kind:'flip'}). The owner of the timer can be paused via the
 * pause button.
 *
 * Network sync hook: the timer should be driven by the host seat once the
 * shell wires sync — for now any seat can advance the local copy.
 */

import { mountRulesPanel } from '../ui-rules-panel'
import {
  GameRenderHandle,
  GameRenderOpts,
  gameRootStyle,
  makeButton,
  makeCardBackEl,
  makeCardEl,
  makeEmptySlotEl,
  panelStyle,
  replaceChildren,
} from '../ui-common'
import { WarAction, WarState } from './rules'
import { RULES } from './rules-doc'

export const FLIP_INTERVAL_MS = 800

export function renderWar(
  opts: GameRenderOpts<WarState, WarAction> & { autoplay?: boolean; flipIntervalMs?: number },
): GameRenderHandle<WarState> {
  const { root, initialState, selfPlayerId, onAction } = opts
  const interval = opts.flipIntervalMs ?? FLIP_INTERVAL_MS
  let state = initialState
  let paused = false
  let timer: ReturnType<typeof setInterval> | null = null

  gameRootStyle(root)
  const rulesHandle = mountRulesPanel(root, RULES, 'war')
  const gameArea = rulesHandle.gameArea

  const wrapper = document.createElement('div')
  wrapper.style.maxWidth = '700px'
  wrapper.style.margin = '0 auto'
  wrapper.style.textAlign = 'center'
  gameArea.appendChild(wrapper)

  const status = document.createElement('div')
  status.style.fontSize = '13px'
  status.style.opacity = '0.7'
  status.style.marginBottom = '12px'
  wrapper.appendChild(status)

  const arena = document.createElement('div')
  panelStyle(arena)
  arena.style.display = 'grid'
  arena.style.gridTemplateColumns = '1fr 1fr'
  arena.style.gap = '24px'
  arena.style.alignItems = 'center'
  arena.style.justifyItems = 'center'
  arena.style.minHeight = '160px'
  wrapper.appendChild(arena)

  const controls = document.createElement('div')
  controls.style.marginTop = '12px'
  controls.style.display = 'flex'
  controls.style.gap = '8px'
  controls.style.justifyContent = 'center'
  wrapper.appendChild(controls)

  function safeOnAction(a: WarAction): void {
    try {
      onAction(a)
    } catch (e) {
      status.textContent = `Illegal: ${(e as Error).message}`
    }
  }

  function startTimer(): void {
    stopTimer()
    if (paused) return
    timer = setInterval(() => {
      if (state.winner) {
        stopTimer()
        return
      }
      safeOnAction({ kind: 'flip' })
    }, interval)
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function redraw(): void {
    const [pa, pb] = state.players
    if (state.winner) {
      status.textContent = `Winner: ${state.winner} (step ${state.step})`
    } else {
      status.textContent = `Step ${state.step}  ·  ${pa.id}: ${pa.deck.length}  vs  ${pb.id}: ${pb.deck.length}${
        state.lastWarDepth > 0 ? `  ·  WAR x${state.lastWarDepth}` : ''
      }`
    }

    replaceChildren(arena)
    for (let s = 0; s < 2; s++) {
      const seatWrap = document.createElement('div')
      seatWrap.style.display = 'flex'
      seatWrap.style.flexDirection = 'column'
      seatWrap.style.alignItems = 'center'
      seatWrap.style.gap = '6px'
      const lbl = document.createElement('div')
      lbl.style.fontSize = '12px'
      lbl.textContent = state.players[s].id
      seatWrap.appendChild(lbl)
      // Card-back stack
      if (state.players[s].deck.length > 0) seatWrap.appendChild(makeCardBackEl())
      else seatWrap.appendChild(makeEmptySlotEl({ label: 'out' }))
      const cnt = document.createElement('div')
      cnt.style.fontSize = '11px'
      cnt.style.opacity = '0.7'
      cnt.textContent = `${state.players[s].deck.length} cards`
      seatWrap.appendChild(cnt)
      // Last revealed card (face-up)
      const reveal = state.lastReveal
      const myReveals = reveal ? (s === 0 ? reveal.p0 : reveal.p1) : []
      const top = myReveals.length > 0 ? myReveals[myReveals.length - 1] : null
      if (top) {
        const flipped = makeCardEl(top)
        flipped.style.marginTop = '6px'
        if (reveal && reveal.winner === s) flipped.style.outline = '2px solid #6c6'
        else if (reveal && reveal.winner !== 'tie' && reveal.winner !== null && reveal.winner !== s) {
          flipped.style.outline = '2px solid #c66'
          flipped.style.opacity = '0.6'
        }
        seatWrap.appendChild(flipped)
      } else {
        seatWrap.appendChild(makeEmptySlotEl({ label: '?' }))
      }
      arena.appendChild(seatWrap)
    }

    replaceChildren(controls)
    if (state.winner) {
      controls.appendChild(
        makeButton('OK', () => {
          /* terminal — no-op */
        }, { disabled: true }),
      )
    } else {
      controls.appendChild(
        makeButton('Flip', () => safeOnAction({ kind: 'flip' }), { primary: true }),
      )
      controls.appendChild(
        makeButton(paused ? 'Resume' : 'Pause', () => {
          paused = !paused
          if (paused) stopTimer()
          else startTimer()
          redraw()
        }),
      )
    }
  }

  void selfPlayerId

  redraw()
  if (opts.autoplay !== false) startTimer()

  return {
    destroy() {
      stopTimer()
      rulesHandle.destroy()
      replaceChildren(root)
    },
    update(next: WarState) {
      if (next === state) return
      state = next
      if (state.winner) stopTimer()
      redraw()
    },
  }
}
