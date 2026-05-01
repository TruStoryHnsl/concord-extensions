/**
 * orrdia-bridge extension (INS-009) — entry point.
 *
 * v0.1.0: Display surface shipped (HTML5 video + host-emits-events,
 * observers mirror via applyRemote), inlined SDK bridge, Party + Hybrid
 * placeholders.
 *
 * v0.2.0: Display surface unchanged. Party gets real TV + phone-
 * controller surfaces wired through bridge.sendStateEvent /
 * bridge.onStateEvent for the new concord PR #39 channels. Hybrid gets
 * a real split layout: media surface on the left, matrix.room.message
 * preview pane on the right (fed by bridge.onStateEvent).
 *
 * Flow:
 *   1. ShellBridge resolves init (250ms dev fallback).
 *   2. Mode adapter projects SDK Mode -> UXMode -> ViewVariant.
 *   3. Server-config form -> authenticateByName -> AuthSession.
 *   4a. uxMode=display, variant=shared-display -> library browser -> Display.
 *   4b. uxMode=party, variant=shared-display -> Party TV (waits for queue).
 *   4c. uxMode=party, variant=shared-controller -> Party Controller.
 *   4d. uxMode=hybrid -> mountHybridSplit.
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
import {
  clearServerConfig,
  loadServerConfig,
  saveServerConfig,
} from "./session/persistence"
import { PartyCommand } from "./session/sync"
import { DisplayHandle, mountDisplay } from "./ui/display"
import { clearChildren } from "./ui/dom-util"
import { mountHybridSplit } from "./ui/hybrid-split"
import { mountLibraryBrowser } from "./ui/library-browser"
import {
  mountPartyController,
  PARTY_COMMAND_EVENT_TYPE,
} from "./ui/party-controller"
import { mountPartyTV, PartyTVHandle } from "./ui/party-tv"
import { mountServerConfig } from "./ui/server-config"
import { mountSetupOrConnect } from "./ui/setup-or-connect"
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
export { mountHybridSplit, HYBRID_PREVIEW_LIMIT } from "./ui/hybrid-split"
export { mountLibraryBrowser } from "./ui/library-browser"
export {
  mountPartyController,
  PARTY_COMMAND_EVENT_TYPE,
} from "./ui/party-controller"
export { mountPartyTV } from "./ui/party-tv"
export { mountServerConfig } from "./ui/server-config"
export { mountSetupOrConnect } from "./ui/setup-or-connect"
export {
  createInitialState as createWizardInitialState,
  effectFor as wizardEffectFor,
  mountSetupWizard,
  reduceWizard,
} from "./ui/setup-wizard"
export type {
  AdminFields as WizardAdminFields,
  LibraryFields as WizardLibraryFields,
  RemoteFields as WizardRemoteFields,
  WizardEffect,
  WizardEvent,
  WizardState,
  WizardStateName,
} from "./ui/setup-wizard"
export {
  OrrdiaSetupError,
  probeStartupState,
  submitStartupComplete,
  submitStartupConfiguration,
  submitStartupRemoteAccess,
  submitStartupUser,
  submitVirtualFolder,
} from "./engine/jellyfin-setup"
export type {
  StartupConfigurationPayload,
  StartupProbe,
  StartupRemoteAccessPayload,
  StartupUserPayload,
  VirtualFolderPayload,
} from "./engine/jellyfin-setup"

const SUPPORTED_MODES: readonly UXMode[] = ["display", "party", "hybrid"]

interface BootstrapState {
  session: AuthSession | null
  selectedItem: MediaItem | null
  uxMode: UXMode
  variant: ViewVariant
  participantId: string
  hostId: string
  bridge: ShellBridge
  /** Live PartyTV handle if currently mounted; null otherwise. Set by
   *  renderStage when it mounts the Party TV surface so the bootstrap
   *  host-transfer listener can route updates into the live surface
   *  without re-rendering the whole stage. */
  activePartyTV: PartyTVHandle | null
  /** Live Display handle if currently mounted; null otherwise. */
  activeDisplay: DisplayHandle | null
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
    activePartyTV: null,
    activeDisplay: null,
  }

  // Listen for host-transfer events from the shell (concord:host_transfer
  // forwarded by the SDK / INS-036 W4). Update bootstrap state and notify
  // any active surface so it can flip its internal host tracking.
  bridge.onHostTransfer((p) => {
    state.hostId = p.newHostId
    if (state.activePartyTV) {
      state.activePartyTV.applyHostTransfer(p.newHostId)
    }
    if (state.activeDisplay) {
      state.activeDisplay.applyRemote({ type: "host-transfer", newHostId: p.newHostId })
    }
  })

  // Listen for permission_denied — the shell tells us when an authed
  // verb is rejected. If our persisted creds are stale, the most likely
  // signal is a downstream auth failure; we also clear on the explicit
  // permission_denied path so a future re-mount lands on a fresh form.
  bridge.onPermissionDenied(() => {
    clearServerConfig()
  })

  // v0.3.2: try persisted ServerConfig before mounting the connect form.
  // If a record exists with username + password, attempt silent auth;
  // success means the user skips the connect form on every remount.
  // Failure (revoked password, server URL changed) falls through to the
  // dispatcher pre-filled with whatever we did have.
  const persisted = loadServerConfig()
  if (persisted && persisted.username && persisted.password) {
    try {
      const session = await authenticateByName(persisted)
      state.session = session
      // Re-save to refresh savedAtMs — also lets a future expiry policy
      // distinguish active vs stale records.
      saveServerConfig(persisted)
    } catch {
      // Silent-auth failed: the saved creds are stale. Clear them so we
      // don't keep retrying the same dead config on every mount, and
      // fall through to the dispatcher (with URL prefill if we have one).
      clearServerConfig()
    }
  }

  renderStage(root, state, persisted ?? undefined)
}

function persistOnAuth(config: ServerConfig): void {
  // Strip password? No — the user just typed it; persist as-is so
  // silent re-auth works on next mount. localStorage is per-origin so a
  // hostile peer can't read it without already controlling the page.
  saveServerConfig(config)
}

function renderStage(
  root: HTMLElement,
  state: BootstrapState,
  prefillHint?: ServerConfig,
): void {
  clearChildren(root)
  // Stage transitions invalidate live surface handles. The new mount
  // path below overwrites these if it mounts a host-transfer-aware
  // surface; otherwise they stay null.
  state.activePartyTV = null
  state.activeDisplay = null

  // Server-config / auth gate. v0.3.0 inserts mountSetupOrConnect ahead
  // of the bare mountServerConfig: it probes /System/Info/Public and
  // either renders the setup wizard (StartupWizardCompleted=false) or
  // the connect form (=true). v0.3.2 adds persistence — if silent
  // re-auth succeeded in bootstrap, state.session is non-null here and
  // we skip the form entirely. If it failed (or no record existed), the
  // dispatcher gets prefillHint so the user only re-types what changed.
  if (!state.session) {
    mountSetupOrConnect(root, {
      prefilledConfig: prefillHint,
      onConnected: (session) => {
        state.session = session
        renderStage(root, state)
      },
      onAuthenticated: (config) => {
        persistOnAuth(config)
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

  // Hybrid split — left pane is the media surface (library + Display),
  // right pane is a matrix.room.message preview pane fed by
  // bridge.onStateEvent. Permission-gated by manifest matrix.read.
  if (state.variant === "hybrid-split") {
    mountHybridSplit(root, {
      session: state.session,
      bridge: state.bridge,
      participantId: state.participantId,
      hostId: state.hostId,
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("orrdia-bridge: hybrid-split error", err)
      },
    })
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
    state.activePartyTV = tv
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

  const display = mountDisplay(root, {
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
  state.activeDisplay = display
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
