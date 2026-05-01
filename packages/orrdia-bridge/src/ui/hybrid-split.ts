/**
 * Hybrid-mode split surface (v0.2.0). Spec §8.3.
 *
 * Two-pane flex layout:
 *   - Left pane (flex 2): library browser + Display surface for the
 *     selected item — same shared-playback contract as Display mode.
 *   - Right pane (flex 1, min-width 280px): "Channel chat" header + a
 *     ring-buffered live preview of the last N matrix message events the
 *     shell forwards via `concord:state_event` (eventType
 *     `m.room.message`). The actual chat composer lives in the shell's
 *     channel surface alongside this iframe (per ux-modes.md §4.5 +
 *     spec §8.3) — we don't duplicate it inside the extension. A
 *     caption beneath the preview points users at it.
 *
 * matrix.read permission gates whether state_events arrive at all; the
 * extension itself doesn't filter, the shell does.
 */

import { AuthSession, MediaItem } from "../engine/types"
import { ShellBridge } from "../shell/bridge"
import { ConcordStateEventPayload } from "../shell/sdk-types"
import { mountDisplay } from "./display"
import { clearChildren } from "./dom-util"
import { mountLibraryBrowser } from "./library-browser"

export const HYBRID_PREVIEW_LIMIT = 8

export interface MountHybridSplitOpts {
  session: AuthSession
  bridge: ShellBridge
  participantId: string
  hostId: string
  onError?: (err: unknown) => void
  /** Override for tests. */
  previewLimit?: number
}

export interface HybridSplitHandle {
  unmount: () => void
  /** Test seam — push a synthetic state event without going through postMessage. */
  pushPreviewMessage: (p: ConcordStateEventPayload) => void
  /** Number of messages currently rendered in the preview pane. */
  previewCount: () => number
}

interface PreviewEntry {
  sender: string
  body: string
  ts: number
}

export function mountHybridSplit(
  root: HTMLElement,
  opts: MountHybridSplitOpts,
): HybridSplitHandle {
  clearChildren(root)
  const previewLimit = opts.previewLimit ?? HYBRID_PREVIEW_LIMIT

  const wrap = document.createElement("div")
  wrap.className = "orrdia-hybrid"
  wrap.style.display = "flex"
  wrap.style.height = "100%"
  wrap.style.fontFamily = "system-ui, sans-serif"

  // Left — media surface
  const leftPane = document.createElement("div")
  leftPane.className = "orrdia-hybrid-media"
  leftPane.style.flex = "2"
  leftPane.style.minWidth = "0"
  leftPane.style.display = "flex"
  leftPane.style.flexDirection = "column"
  wrap.appendChild(leftPane)

  // Right — chat preview
  const rightPane = document.createElement("div")
  rightPane.className = "orrdia-hybrid-chat"
  rightPane.style.flex = "1"
  rightPane.style.minWidth = "280px"
  rightPane.style.borderLeft = "1px solid #888"
  rightPane.style.padding = "0.5em"
  rightPane.style.display = "flex"
  rightPane.style.flexDirection = "column"
  rightPane.style.overflow = "hidden"

  const chatTitle = document.createElement("h3")
  chatTitle.className = "orrdia-hybrid-chat-title"
  chatTitle.textContent = "Channel chat"
  chatTitle.style.margin = "0 0 0.4em 0"
  rightPane.appendChild(chatTitle)

  const previewList = document.createElement("ul")
  previewList.className = "orrdia-hybrid-chat-preview"
  previewList.style.flex = "1"
  previewList.style.minHeight = "0"
  previewList.style.overflowY = "auto"
  previewList.style.listStyle = "none"
  previewList.style.padding = "0"
  previewList.style.margin = "0 0 0.5em 0"
  rightPane.appendChild(previewList)

  const empty = document.createElement("li")
  empty.className = "orrdia-hybrid-chat-empty"
  empty.textContent = "Waiting for messages…"
  empty.style.color = "#777"
  empty.style.fontStyle = "italic"
  previewList.appendChild(empty)

  const caption = document.createElement("div")
  caption.className = "orrdia-hybrid-chat-caption"
  caption.textContent =
    "Use the channel chat alongside this surface to talk — the shell hosts the composer."
  caption.style.fontSize = "0.85em"
  caption.style.color = "#888"
  rightPane.appendChild(caption)

  wrap.appendChild(rightPane)
  root.appendChild(wrap)

  // Left-pane state machine: library browser -> display
  let selected: MediaItem | null = null

  function renderLeft(): void {
    clearChildren(leftPane)
    if (!selected) {
      mountLibraryBrowser(leftPane, {
        session: opts.session,
        onSelect: (item) => {
          selected = item
          renderLeft()
        },
        onError: opts.onError,
      })
      return
    }
    mountDisplay(leftPane, {
      session: opts.session,
      item: selected,
      role: opts.participantId === opts.hostId ? "host" : "observer",
      participantId: opts.participantId,
      hostId: opts.hostId,
      onBack: () => {
        selected = null
        renderLeft()
      },
    })
  }
  renderLeft()

  // Right-pane preview ring buffer.
  const buffer: PreviewEntry[] = []

  function pushPreviewMessage(p: ConcordStateEventPayload): void {
    if (p.eventType !== "m.room.message") return
    const c = p.content as Record<string, unknown> | undefined
    let body = ""
    if (c && typeof c["body"] === "string") {
      body = c["body"] as string
    } else if (c) {
      try {
        body = JSON.stringify(c)
      } catch {
        body = "[unserializable]"
      }
    }
    buffer.push({ sender: p.sender, body, ts: p.originServerTs })
    while (buffer.length > previewLimit) buffer.shift()
    renderPreview()
  }

  function renderPreview(): void {
    clearChildren(previewList)
    if (buffer.length === 0) {
      const e = document.createElement("li")
      e.className = "orrdia-hybrid-chat-empty"
      e.textContent = "Waiting for messages…"
      e.style.color = "#777"
      e.style.fontStyle = "italic"
      previewList.appendChild(e)
      return
    }
    for (const entry of buffer) {
      const li = document.createElement("li")
      li.className = "orrdia-hybrid-chat-message"
      li.style.padding = "0.2em 0"
      li.style.borderBottom = "1px solid #2a2a2a"

      const who = document.createElement("strong")
      who.textContent = entry.sender
      who.style.marginRight = "0.4em"
      li.appendChild(who)

      const txt = document.createElement("span")
      txt.textContent = entry.body
      li.appendChild(txt)

      previewList.appendChild(li)
    }
  }

  // Subscribe to the bridge for incoming room messages.
  const offState = opts.bridge.onStateEvent(pushPreviewMessage)

  return {
    unmount: () => {
      offState()
      clearChildren(root)
    },
    pushPreviewMessage,
    previewCount: () => buffer.length,
  }
}
