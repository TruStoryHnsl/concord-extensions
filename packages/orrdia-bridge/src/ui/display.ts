/**
 * Display surface. Spec section 8.1.
 *
 * Mounts a single video element pointed at directStreamUrl(session, item).
 * Host-only controls; observers see status text.
 *
 * Sync wiring: every play/pause/seek dispatched here also flows into the
 * SyncState reducer (local-loop). The Phase-1 wave will fan these out via
 * concord state events.
 */

import { directStreamUrl } from "../engine/stream-url"
import { AuthSession, MediaItem } from "../engine/types"
import {
  applyEvent,
  makeInitialSyncState,
  SyncEvent,
  SyncState,
} from "../session/sync"
import { clearChildren } from "./dom-util"

export type DisplayRole = "host" | "observer"

export interface MountDisplayOpts {
  session: AuthSession
  item: MediaItem
  role: DisplayRole
  participantId: string
  hostId: string
  onBack?: () => void
  /** Hook fired after every applyEvent — mount site routes to network in Phase 1. */
  onSyncEvent?: (ev: SyncEvent, state: SyncState) => void
}

export interface DisplayHandle {
  unmount: () => void
  getState: () => SyncState
  /** Apply an externally-received SyncEvent (observers). */
  applyRemote: (ev: SyncEvent) => void
}

export function mountDisplay(root: HTMLElement, opts: MountDisplayOpts): DisplayHandle {
  clearChildren(root)

  const wrap = document.createElement("div")
  wrap.className = "orrdia-display"
  wrap.style.display = "flex"
  wrap.style.flexDirection = "column"
  wrap.style.height = "100%"

  const topBar = document.createElement("div")
  topBar.className = "orrdia-display-topbar"
  topBar.style.display = "flex"
  topBar.style.alignItems = "center"
  topBar.style.gap = "1em"
  topBar.style.padding = "0.5em"

  const back = document.createElement("button")
  back.type = "button"
  back.textContent = "< Back"
  back.addEventListener("click", () => opts.onBack?.())
  topBar.appendChild(back)

  const title = document.createElement("span")
  title.className = "orrdia-display-title"
  title.textContent = opts.item.name
  topBar.appendChild(title)

  wrap.appendChild(topBar)

  const video = document.createElement("video")
  video.className = "orrdia-display-video"
  video.controls = opts.role === "host"
  video.style.flex = "1"
  video.style.width = "100%"
  video.style.background = "#000"
  video.preload = "metadata"
  const src = directStreamUrl(opts.session, opts.item.id, {
    mediaSourceId: opts.item.mediaSources?.[0]?.id,
  })
  video.src = src
  wrap.appendChild(video)

  const status = document.createElement("div")
  status.className = "orrdia-display-status"
  status.style.padding = "0.4em 0.8em"
  wrap.appendChild(status)

  root.appendChild(wrap)

  let state: SyncState = makeInitialSyncState(opts.hostId)
  state = applyEvent(state, { type: "select", itemId: opts.item.id, atMs: now() }, opts.participantId)
  renderStatus()

  function renderStatus(): void {
    status.textContent = `${state.status.toUpperCase()} @ ${(state.positionMs / 1000).toFixed(1)}s host=${state.hostId}`
  }

  function emit(ev: SyncEvent): void {
    state = applyEvent(state, ev, opts.participantId)
    renderStatus()
    opts.onSyncEvent?.(ev, state)
    // SYNC: post Phase 1, route ev via concord state_events here.
  }

  if (opts.role === "host") {
    video.addEventListener("play", () => {
      emit({ type: "play", positionMs: video.currentTime * 1000, atMs: now() })
    })
    video.addEventListener("pause", () => {
      emit({ type: "pause", positionMs: video.currentTime * 1000, atMs: now() })
    })
    video.addEventListener("seeked", () => {
      emit({ type: "seek", positionMs: video.currentTime * 1000, atMs: now() })
    })
  }

  return {
    unmount: () => {
      clearChildren(root)
    },
    getState: () => state,
    applyRemote: (ev: SyncEvent) => {
      state = applyEvent(state, ev, opts.participantId)
      renderStatus()
      if (opts.role === "observer") {
        const targetSec = ev.type === "host-transfer" ? null : (ev as { positionMs?: number }).positionMs
        if (typeof targetSec === "number") {
          video.currentTime = targetSec / 1000
        }
        if (ev.type === "play" && video.paused) {
          const p = video.play()
          if (p && typeof p.catch === "function") p.catch(() => undefined)
        }
        if (ev.type === "pause" && !video.paused) video.pause()
      }
    },
  }
}

function now(): number {
  return Date.now()
}
