/**
 * orrdia-bridge extension (INS-009) — entry point.
 *
 * v0.1.0 first surface = Display. Flow:
 *   1. ShellBridge resolves init (250ms dev fallback).
 *   2. Mode adapter projects SDK Mode -> UXMode -> ViewVariant.
 *   3. Server-config form -> authenticateByName -> AuthSession.
 *   4. Library browser -> user picks an item -> Display surface mounts.
 *
 * Party + Hybrid surfaces are stubbed for v0.1.0 (partial landing —
 * shared-controller and hybrid-split variants render placeholder text
 * pointing at the spec). Real cross-client sync awaits Phase 1.
 */

import { authenticateByName } from "./engine/auth"
import { AuthSession, MediaItem, ServerConfig } from "./engine/types"
import {
  mapSdkModeToUxMode,
  pickViewVariant,
  UXMode,
  ViewVariant,
} from "./session/mode-adapter"
import { mountDisplay } from "./ui/display"
import { clearChildren } from "./ui/dom-util"
import { mountLibraryBrowser } from "./ui/library-browser"
import { mountServerConfig } from "./ui/server-config"
import { ShellBridge, getDefaultBridge } from "./shell/bridge"

export * from "./engine/types"
export {
  authenticateByName,
  buildEmbyAuthHeader,
  normalizeBaseUrl,
  makeDeviceId,
} from "./engine/auth"
export type { FetchLike } from "./engine/auth"
export {
  listLibraries,
  listItems,
  imageUrl,
} from "./engine/client"
export type { ListItemsOpts } from "./engine/client"
export { directStreamUrl, hlsStreamUrl } from "./engine/stream-url"
export type { DirectStreamOpts, HlsStreamOpts } from "./engine/stream-url"
export * from "./session/sync"
export * from "./session/mode-adapter"
export { ShellBridge, getDefaultBridge } from "./shell/bridge"
export { mountDisplay } from "./ui/display"
export { mountLibraryBrowser } from "./ui/library-browser"
export { mountServerConfig } from "./ui/server-config"

const SUPPORTED_MODES: readonly UXMode[] = ["display", "party", "hybrid"]

interface BootstrapState {
  session: AuthSession | null
  selectedItem: MediaItem | null
  uxMode: UXMode
  variant: ViewVariant
  participantId: string
  hostId: string
}

export async function bootstrap(root: HTMLElement, bridge: ShellBridge = getDefaultBridge()): Promise<void> {
  const init = await bridge.getInit()
  const uxMode = mapSdkModeToUxMode(init.mode, SUPPORTED_MODES)
  const variant = pickViewVariant(uxMode, init.seat)

  const state: BootstrapState = {
    session: null,
    selectedItem: null,
    uxMode,
    variant,
    participantId: init.participantId,
    hostId: init.participantId, // launcher = host in v0.1.0
  }

  renderStage(root, state)
}

function renderStage(root: HTMLElement, state: BootstrapState): void {
  clearChildren(root)

  if (state.variant === "shared-controller") {
    renderControllerStub(root)
    return
  }

  if (!state.session) {
    mountServerConfig(root, {
      onConnect: async (config: ServerConfig) => {
        const session = await authenticateByName(config)
        state.session = session
        renderStage(root, state)
      },
    })
    return
  }

  if (!state.selectedItem) {
    if (state.variant === "hybrid-split") {
      renderHybridSplit(root, state)
      return
    }
    mountLibraryBrowser(root, {
      session: state.session,
      onSelect: (item) => {
        state.selectedItem = item
        renderStage(root, state)
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("orrdia-bridge: library load failed", err)
      },
    })
    return
  }

  // Display surface — selected item.
  mountDisplay(root, {
    session: state.session,
    item: state.selectedItem,
    role: state.participantId === state.hostId ? "host" : "observer",
    participantId: state.participantId,
    hostId: state.hostId,
    onBack: () => {
      state.selectedItem = null
      renderStage(root, state)
    },
  })
}

function renderControllerStub(root: HTMLElement): void {
  // Party-mode phone-controller variant — partial landing, placeholder UI.
  const wrap = document.createElement("div")
  wrap.style.padding = "1em"

  const h2 = document.createElement("h2")
  h2.textContent = "Phone Controller"
  wrap.appendChild(h2)

  const p = document.createElement("p")
  p.textContent =
    "Party-mode controller is a stub in v0.1.0. The TV/host device runs the player; this surface will gain a search + send-to-TV UI in a follow-up cycle. See docs/extensions/specs/orrdia-bridge.md section 8.2."
  wrap.appendChild(p)

  root.appendChild(wrap)
}

function renderHybridSplit(root: HTMLElement, state: BootstrapState): void {
  // Hybrid-mode split layout — partial landing. Left = library/player,
  // right = chat-panel placeholder.
  const wrap = document.createElement("div")
  wrap.style.display = "flex"
  wrap.style.height = "100%"

  const leftPane = document.createElement("div")
  leftPane.style.flex = "2"
  leftPane.style.minWidth = "0"
  wrap.appendChild(leftPane)

  const rightPane = document.createElement("div")
  rightPane.style.flex = "1"
  rightPane.style.minWidth = "0"
  rightPane.style.borderLeft = "1px solid #888"
  rightPane.style.padding = "0.5em"
  const chatTitle = document.createElement("h3")
  chatTitle.textContent = "Chat"
  rightPane.appendChild(chatTitle)
  const chatStub = document.createElement("p")
  chatStub.textContent =
    "Hybrid chat surface is a stub in v0.1.0. Will tap matrix.read/send permissions in a follow-up cycle. See spec section 8.3."
  rightPane.appendChild(chatStub)
  wrap.appendChild(rightPane)

  root.appendChild(wrap)

  if (!state.session) {
    return
  }
  mountLibraryBrowser(leftPane, {
    session: state.session,
    onSelect: (item) => {
      state.selectedItem = item
      // For now hybrid still uses the Display surface for media playback.
      state.variant = "shared-display"
      renderStage(root, state)
    },
  })
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const root = document.getElementById("orrdia-bridge-root")
  if (root) {
    bootstrap(root).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("orrdia-bridge: bootstrap failed", err)
    })
  }
}
