/**
 * Party-mode phone controller (v0.2.0). Spec §8.2.
 *
 * Three rows top-to-bottom:
 *   1. Now-playing strip — current item title (from local mirrored state).
 *   2. Library browser — clicking a tile adds to queue OR plays-now.
 *   3. Transport bar — Play / Pause / Prev / Next.
 *
 * The controller does NOT mount a <video>. It emits PartyCommands via
 * bridge.sendStateEvent({ eventType: "com.concord.orrdia-bridge.party.command",
 * content: <PartyCommand> }), and optimistically updates a local mirror
 * of SyncState by subscribing to bridge.onStateEvent for those same
 * commands (so the controller's now-playing strip refreshes when any
 * controller in the room queues something).
 */

import { listItems, listLibraries } from "../engine/client"
import { AuthSession, LibraryView, MediaItem } from "../engine/types"
import {
  applyPartyCommand,
  makeInitialSyncState,
  PartyCommand,
  SyncState,
} from "../session/sync"
import { ShellBridge } from "../shell/bridge"
import { ConcordStateEventPayload } from "../shell/sdk-types"
import { clearChildren } from "./dom-util"

export const PARTY_COMMAND_EVENT_TYPE = "com.concord.orrdia-bridge.party.command"

export interface MountPartyControllerOpts {
  session: AuthSession
  bridge: ShellBridge
  participantId: string
  /** Defaults to () => Date.now(); override for deterministic tests. */
  now?: () => number
  onError?: (err: unknown) => void
}

export interface PartyControllerHandle {
  unmount: () => void
  getState: () => SyncState
}

export function mountPartyController(
  root: HTMLElement,
  opts: MountPartyControllerOpts,
): PartyControllerHandle {
  clearChildren(root)

  const now = opts.now ?? (() => Date.now())
  let state: SyncState = makeInitialSyncState(opts.participantId)

  const wrap = document.createElement("div")
  wrap.className = "orrdia-party-controller"
  wrap.style.display = "flex"
  wrap.style.flexDirection = "column"
  wrap.style.height = "100%"
  wrap.style.fontFamily = "system-ui, sans-serif"

  // Row 1 — Now playing
  const nowRow = document.createElement("div")
  nowRow.className = "orrdia-party-now"
  nowRow.style.padding = "0.6em 1em"
  nowRow.style.borderBottom = "1px solid #444"
  nowRow.style.fontWeight = "600"
  wrap.appendChild(nowRow)

  // Row 2 — Library
  const libRow = document.createElement("div")
  libRow.className = "orrdia-party-library"
  libRow.style.flex = "1"
  libRow.style.minHeight = "0"
  libRow.style.overflow = "auto"
  libRow.style.padding = "0.4em"
  wrap.appendChild(libRow)

  // Row 3 — Transport
  const transport = document.createElement("div")
  transport.className = "orrdia-party-transport"
  transport.style.display = "flex"
  transport.style.gap = "0.5em"
  transport.style.padding = "0.6em 1em"
  transport.style.borderTop = "1px solid #444"
  wrap.appendChild(transport)

  root.appendChild(wrap)

  function makeButton(label: string, ariaLabel: string): HTMLButtonElement {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.textContent = label
    btn.setAttribute("aria-label", ariaLabel)
    return btn
  }

  const prevBtn = makeButton("⏮ Prev", "previous")
  const playBtn = makeButton("▶ Play", "play")
  const pauseBtn = makeButton("⏸ Pause", "pause")
  const nextBtn = makeButton("⏭ Next", "next")
  prevBtn.dataset["partyCmd"] = "prev"
  playBtn.dataset["partyCmd"] = "play"
  pauseBtn.dataset["partyCmd"] = "pause"
  nextBtn.dataset["partyCmd"] = "next"
  transport.append(prevBtn, playBtn, pauseBtn, nextBtn)

  prevBtn.addEventListener("click", () =>
    sendCommand({ type: "party-cmd-prev", atMs: now() }),
  )
  playBtn.addEventListener("click", () =>
    sendCommand({ type: "party-cmd-play", atMs: now() }),
  )
  pauseBtn.addEventListener("click", () =>
    sendCommand({ type: "party-cmd-pause", atMs: now() }),
  )
  nextBtn.addEventListener("click", () =>
    sendCommand({ type: "party-cmd-next", atMs: now() }),
  )

  function renderNow(): void {
    if (state.itemId == null) {
      nowRow.textContent = "Nothing queued"
    } else {
      nowRow.textContent = `Now playing: ${state.itemId} (${state.status})`
    }
  }
  renderNow()

  /**
   * Send a PartyCommand to the room and apply it locally for an
   * optimistic UI update. The TV (and other controllers) will receive
   * it back via concord:state_event and re-apply — that's idempotent for
   * select/play/pause/next/prev; queue-add is intentionally not, but
   * each controller that emits a queue-add is the only one applying its
   * own optimistic copy, so the duplicate from echo is just one extra
   * entry on first round-trip. v0.2.0 accepts this; a follow-up can
   * dedupe on (addedBy, atMs).
   */
  function sendCommand(cmd: PartyCommand): void {
    state = applyPartyCommand(state, cmd, opts.participantId)
    renderNow()
    opts.bridge.sendStateEvent({
      eventType: PARTY_COMMAND_EVENT_TYPE,
      content: cmd as unknown as Record<string, unknown>,
    })
  }

  // Subscribe to incoming party-command state events from the room.
  const offState = opts.bridge.onStateEvent((p: ConcordStateEventPayload) => {
    if (p.eventType !== PARTY_COMMAND_EVENT_TYPE) return
    const cmd = p.content as unknown as PartyCommand
    if (!cmd || typeof cmd !== "object" || typeof (cmd as { type?: unknown }).type !== "string") return
    state = applyPartyCommand(state, cmd, opts.participantId)
    renderNow()
  })

  // Library loader — same browse pattern as library-browser, but the
  // onSelect handler emits queue-add instead of mounting a player.
  loadViews().catch(opts.onError)

  async function loadViews(): Promise<void> {
    clearChildren(libRow)
    const status = document.createElement("div")
    status.textContent = "Loading libraries…"
    libRow.appendChild(status)
    try {
      const views = await listLibraries(opts.session)
      clearChildren(libRow)
      for (const v of views) renderViewTile(v)
    } catch (err) {
      libRow.textContent = `Failed to load libraries: ${describe(err)}`
      opts.onError?.(err)
    }
  }

  function renderViewTile(v: LibraryView): void {
    const row = document.createElement("div")
    row.className = "orrdia-party-tile-row"
    row.style.display = "flex"
    row.style.gap = "0.5em"
    row.style.padding = "0.3em"

    const browseBtn = document.createElement("button")
    browseBtn.type = "button"
    browseBtn.textContent = `Browse: ${v.name}`
    browseBtn.style.flex = "1"
    browseBtn.dataset["viewId"] = v.id
    browseBtn.addEventListener("click", () => loadFolder(v.id, v.name))
    row.appendChild(browseBtn)

    libRow.appendChild(row)
  }

  async function loadFolder(parentId: string, label: string): Promise<void> {
    clearChildren(libRow)
    const back = document.createElement("button")
    back.type = "button"
    back.textContent = "← Back to libraries"
    back.addEventListener("click", () => loadViews())
    libRow.appendChild(back)
    const heading = document.createElement("h4")
    heading.textContent = label
    libRow.appendChild(heading)

    try {
      const items = await listItems(opts.session, { parentId })
      for (const it of items) renderItemTile(it)
    } catch (err) {
      libRow.textContent = `Failed to load items: ${describe(err)}`
      opts.onError?.(err)
    }
  }

  function renderItemTile(it: MediaItem): void {
    const row = document.createElement("div")
    row.className = "orrdia-party-item-row"
    row.style.display = "flex"
    row.style.gap = "0.5em"
    row.style.alignItems = "center"
    row.style.padding = "0.3em"

    const label = document.createElement("span")
    label.textContent = `${it.name}${it.type ? ` (${it.type})` : ""}`
    label.style.flex = "1"
    row.appendChild(label)

    const isFolder =
      it.hasChildren ||
      it.type === "Folder" ||
      it.type === "Series" ||
      it.type === "Season"

    if (isFolder) {
      const drill = document.createElement("button")
      drill.type = "button"
      drill.textContent = "Open"
      drill.addEventListener("click", () => loadFolder(it.id, it.name))
      row.appendChild(drill)
    } else {
      const queueBtn = document.createElement("button")
      queueBtn.type = "button"
      queueBtn.textContent = "Add to queue"
      queueBtn.dataset["partyAction"] = "queue-add"
      queueBtn.addEventListener("click", () =>
        sendCommand({
          type: "party-cmd-queue-add",
          itemId: it.id,
          addedBy: opts.participantId,
          atMs: now(),
        }),
      )
      row.appendChild(queueBtn)

      const playNowBtn = document.createElement("button")
      playNowBtn.type = "button"
      playNowBtn.textContent = "Play now"
      playNowBtn.dataset["partyAction"] = "play-now"
      playNowBtn.addEventListener("click", () => {
        // queue-add followed by select to the new index. atMs is shared so the TV
        // can correlate the pair if it cares.
        const ts = now()
        sendCommand({
          type: "party-cmd-queue-add",
          itemId: it.id,
          addedBy: opts.participantId,
          atMs: ts,
        })
        sendCommand({
          type: "party-cmd-select",
          queueIndex: state.queue.length - 1,
          atMs: ts,
        })
      })
      row.appendChild(playNowBtn)
    }

    libRow.appendChild(row)
  }

  return {
    unmount: () => {
      offState()
      clearChildren(root)
    },
    getState: () => state,
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
