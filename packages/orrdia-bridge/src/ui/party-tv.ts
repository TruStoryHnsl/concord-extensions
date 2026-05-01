/**
 * Party-mode TV surface (v0.2.0). Spec §8.2.
 *
 * The "TV / big screen" face of Party mode. Renders the actual <video>
 * element. Receives PartyCommands from controllers (via concord
 * state_events forwarded by the shell), routes them through
 * applyPartyCommand, and reflects state changes onto the DOM (swap src
 * on item change, play/pause the element on transport flips).
 *
 * The TV does NOT subscribe to the bridge directly — index.ts owns the
 * subscription so the same incoming command can be observed for logging
 * and the surface keeps a clean injection seam for tests.
 */

import { directStreamUrl, hlsStreamUrl } from "../engine/stream-url"
import { AuthSession, MediaItem } from "../engine/types"
import {
  applyEvent,
  applyPartyCommand,
  makeInitialSyncState,
  PartyCommand,
  SyncState,
} from "../session/sync"
import { clearChildren } from "./dom-util"
import { attachVideoSource, AttachVideoSourceOpts } from "./video-attach"

export interface MountPartyTVOpts {
  session: AuthSession
  participantId: string
  hostId: string
  /** Optional lookup so the TV banner can show item titles instead of bare IDs. */
  itemLookup?: (itemId: string) => MediaItem | undefined
  /** When true, request the HLS stream URL on item swap. Default false (direct). */
  useHls?: boolean
  /** Test injection seam for the hls.js attach pipeline. */
  videoAttachOpts?: AttachVideoSourceOpts
}

export interface PartyTVHandle {
  unmount: () => void
  getState: () => SyncState
  /** Apply an incoming PartyCommand and update the DOM accordingly. */
  applyExternalCommand: (cmd: PartyCommand) => void
  /**
   * Apply an incoming `concord:host_transfer` payload. Routes a
   * `host-transfer` SyncEvent into the reducer so `state.hostId` flips
   * to the new host. The TV banner does not display the host directly,
   * so the visible effect is internal state — but other surfaces
   * reading `getState().hostId` (e.g. controllers checking authority)
   * see the updated value immediately.
   */
  applyHostTransfer: (newHostId: string) => void
}

export function mountPartyTV(root: HTMLElement, opts: MountPartyTVOpts): PartyTVHandle {
  clearChildren(root)

  const wrap = document.createElement("div")
  wrap.className = "orrdia-party-tv"
  wrap.style.display = "flex"
  wrap.style.flexDirection = "column"
  wrap.style.height = "100%"
  wrap.style.background = "#000"

  const banner = document.createElement("div")
  banner.className = "orrdia-party-tv-banner"
  banner.style.padding = "0.5em 1em"
  banner.style.color = "#eee"
  banner.style.fontFamily = "system-ui, sans-serif"
  banner.textContent = "TV — waiting for the room to queue something"
  wrap.appendChild(banner)

  const video = document.createElement("video")
  video.className = "orrdia-party-tv-video"
  video.style.flex = "1"
  video.style.width = "100%"
  video.style.background = "#000"
  video.preload = "metadata"
  // Controls visible on the TV for debugging; the controllers are the
  // primary input path. A future flag could hide them.
  video.controls = true
  wrap.appendChild(video)

  const status = document.createElement("div")
  status.className = "orrdia-party-tv-status"
  status.style.padding = "0.4em 1em"
  status.style.color = "#aaa"
  status.style.fontFamily = "system-ui, sans-serif"
  wrap.appendChild(status)

  root.appendChild(wrap)

  let state: SyncState = makeInitialSyncState(opts.hostId)
  let detach: (() => void) | null = null

  function renderBannerAndStatus(): void {
    if (!state.itemId) {
      banner.textContent = "TV — waiting for the room to queue something"
    } else {
      const item = opts.itemLookup?.(state.itemId)
      const title = item?.name ?? state.itemId
      banner.textContent = `TV — ${title}`
    }
    status.textContent = `${state.status.toUpperCase()} | queue=${state.queue.length} cursor=${state.queueCursor}`
  }

  renderBannerAndStatus()

  function applyExternalCommand(cmd: PartyCommand): void {
    const prevItemId = state.itemId
    const prevStatus = state.status
    state = applyPartyCommand(state, cmd, opts.participantId)

    if (state.itemId && state.itemId !== prevItemId) {
      const mediaSourceId = opts.itemLookup?.(state.itemId)?.mediaSources?.[0]?.id
      const newSrc = opts.useHls
        ? hlsStreamUrl(opts.session, state.itemId, { mediaSourceId })
        : directStreamUrl(opts.session, state.itemId, { mediaSourceId })
      // Tear down any prior hls.js instance before reattaching.
      if (detach) {
        try {
          detach()
        } catch {
          // best-effort
        }
        detach = null
      }
      attachVideoSource(video, newSrc, opts.videoAttachOpts ?? {})
        .then((handle) => {
          detach = handle.detach
        })
        .catch(() => {
          try {
            video.src = newSrc
          } catch {
            // last-ditch
          }
        })
    }

    if (state.status !== prevStatus) {
      if (state.status === "playing") {
        const p = video.play()
        if (p && typeof p.catch === "function") p.catch(() => undefined)
      } else if (state.status === "paused") {
        if (!video.paused) video.pause()
      }
    }

    renderBannerAndStatus()
  }

  function applyHostTransfer(newHostId: string): void {
    state = applyEvent(
      state,
      { type: "host-transfer", newHostId },
      opts.participantId,
    )
    renderBannerAndStatus()
  }

  return {
    unmount: () => {
      if (detach) {
        try {
          detach()
        } catch {
          // best-effort
        }
      }
      clearChildren(root)
    },
    getState: () => state,
    applyExternalCommand,
    applyHostTransfer,
  }
}
