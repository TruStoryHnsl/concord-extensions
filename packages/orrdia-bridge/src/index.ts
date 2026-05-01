/**
 * orrdia-bridge extension (INS-009) — entry point.
 *
 * v0.1.0: Display surface shipped (HTML5 video + host-emits-events,
 * observers mirror via applyRemote), inlined SDK bridge, Party + Hybrid
 * placeholders.
 *
 * v0.2.0: Display surface unchanged. Party gets real TV + phone-
 * controller surfaces wired through bridge.sendStateEvent /
 * bridge.onStateEvent for the new concord PR #39 channels. Hybrid stays
 * placeholder in this commit; the next commit replaces it with a real
 * split layout that subscribes to bridge.onStateEvent for matrix message
 * preview.
 *
 * Flow:
 *   1. ShellBridge resolves init (250ms dev fallback).
 *   2. Mode adapter projects SDK Mode -> UXMode -> ViewVariant.
 *   3. Server-config form -> authenticateByName -> AuthSession.
 *   4a. uxMode=display, variant=shared-display -> library browser -> Display.
 *   4b. uxMode=party, variant=shared-display -> Party TV (waits for queue).
 *   4c. uxMode=party, variant=shared-controller -> Party Controller.
 *   4d. uxMode=hybrid -> renderHybridSplit (replaced in next commit).
 *
 * Real cross-client sync is gated on the live matrix-js-sdk wiring of
 * the new concord state_event channels (FUP-A in main concord). Until
 * that lands, the controller/TV interaction works locally if both
 * surfaces share the same window (dev) but is a no-op across devices.
 */

import { authenticateByName } from "./engine/auth"
import { AuthSession, MediaItem, ServerConfig } from "./engine/types"
import {
  mapSdkModeToUxMode,
  pickViewVariant,
  UXMode,
  ViewVariant,
} from "./session/mode-adapter"
import { PartyCommand } from "./session/sync"
import { mountDisplay } from "./ui/display"
import { clearChildren } from "./ui/dom-util"
import { mountLibraryBrowser } from "./ui/library-browser"
import {
  mountPartyController,
  PARTY_COMMAND_EVENT_TYPE,
} from "./ui/party-controller"
import { mountPartyTV } from "./ui/party-tv"
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
export {
  mountPartyController,
  PARTY_COMMAND_EVENT_TYPE,
} from "./ui/party-controller"
export { mountPartyTV } from "./ui/party-tv"
export { mountServerConfig } from "./ui/server-config"

const SUPPORTED_MODES: readonly UXMode[] = ["display", "party", "hybrid"]

interface BootstrapState {
  session: AuthSession | null
  selectedItem: MediaItem | null
  uxMode: UXMode
  variant: ViewVariant
  participantId: string
  hostId: string
  bridge: ShellBridge
}

export async function bootstrap(
  root: HTMLElement,
  bridge: ShellBridge = getDefaultBridge(),
): Promise<void> {
  const init = await bridge.getInit()
  const uxMode = mapSdkModeToUxMode(init.mode, SUPPORTED_MODES)
  const variant = pickViewVariant(uxMode, init.seat)

  const state: BootstrapState = {
    session: null,
    selectedItem: null,
    uxMode,
    variant,
    participantId: init.participantId,
    hostId: init.participantId, // launcher = host until concord:host_transfer arrives
    bridge,
  }

  renderStage(root, state)
}

function renderStage(root: HTMLElement, state: BootstrapState): void {
  clearChildren(root)

  // Server-config / auth gate. The Party TV surface in v0.2.0 still
  // needs a session because the controller emits opaque itemIds that the
  // TV resolves via directStreamUrl(session, ...). Until session
  // persistence ships, every mount re-auths.
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

  // Party-mode phone-controller surface.
  if (state.variant === "shared-controller") {
    mountPartyController(root, {
      session: state.session,
      bridge: state.bridge,
      participantId: state.participantId,
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("orrdia-bridge: party-controller error", err)
      },
    })
    return
  }

  // Hybrid split — placeholder in this commit; replaced in the next
  // commit by mountHybridSplit (which subscribes to bridge.onStateEvent
  // for matrix message preview).
  if (state.variant === "hybrid-split") {
    renderHybridSplit(root, state)
    return
  }

  // Party TV — listens for incoming PartyCommand state_events from the
  // room and applies them to the TV surface. The TV does not browse the
  // library directly; it waits for the controllers to queue items.
  if (state.uxMode === "party" && state.variant === "shared-display") {
    const tv = mountPartyTV(root, {
      session: state.session,
      participantId: state.participantId,
      hostId: state.hostId,
      // No itemLookup yet — the controllers know item titles, the TV
      // shows the bare itemId. A follow-up could bake item metadata into
      // the command payload so the TV banner reads "Movie A" instead.
    })
    state.bridge.onStateEvent((p) => {
      if (p.eventType !== PARTY_COMMAND_EVENT_TYPE) return
      const cmd = p.content as unknown as PartyCommand
      if (!cmd || typeof cmd !== "object" || typeof (cmd as { type?: unknown }).type !== "string") return
      tv.applyExternalCommand(cmd)
    })
    return
  }

  // Pure Display mode (uxMode=display, variant=shared-display).
  if (!state.selectedItem) {
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

function renderHybridSplit(root: HTMLElement, state: BootstrapState): void {
  // Placeholder — the next commit replaces this with mountHybridSplit
  // (split layout + matrix message preview pane fed by bridge.onStateEvent).
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
    "Hybrid chat surface placeholder; replaced in the next commit by a matrix.room.message preview pane. See spec section 8.3."
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
      state.uxMode = "display"
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
