/**
 * Mode adapter — bridges the Concord SDK Mode primitives to the
 * chess-checkers UX-mode taxonomy and chooses a concrete ViewVariant.
 *
 * UX modes for this extension: party / display / service. (Spec section
 * 6 — chess-checkers does NOT support chat or hybrid.)
 *
 * mapSdkModeToUxMode: SDK mode → UX mode, falling back to the first
 * supported UX mode when the natural match isn't supported.
 *
 * pickViewVariant: (uxMode, seat) → render variant name. Variants:
 *   solo            — service mode, single board for the local user
 *   shared-display  — passive board (display mode, or party-mode hosts)
 *   shared-controller — interactive board for party-mode participants
 */

import { Seat, Mode as SdkMode } from "../shell/sdk-types"

export type UXMode = "party" | "display" | "service"

export type ViewVariant = "solo" | "shared-display" | "shared-controller"

/**
 * Pick a concrete view variant given the resolved UX mode and the local
 * participant's seat. Pure / deterministic.
 *
 *   service → solo
 *   display → shared-display
 *   party   → host/observer/spectator → shared-display
 *           → participant → shared-controller
 */
export function pickViewVariant(uxMode: UXMode, seat: Seat): ViewVariant {
  switch (uxMode) {
    case "service":
      return "solo"
    case "display":
      return "shared-display"
    case "party":
      if (seat === "host" || seat === "observer" || seat === "spectator") {
        return "shared-display"
      }
      return "shared-controller"
  }
}

/**
 * Project the shell SDK's Mode into the extension's UX-mode taxonomy.
 *
 * Mapping:
 *   shared              → display
 *   shared_readonly     → display
 *   shared_admin_input  → party
 *   per_user            → service
 *   hybrid              → (not supported) → first supported UX mode
 */
export function mapSdkModeToUxMode(
  sdkMode: SdkMode,
  supportedModes: readonly UXMode[],
): UXMode {
  if (supportedModes.length === 0) {
    throw new Error("mode-adapter: no supportedModes")
  }
  const natural = naturalMatch(sdkMode)
  if (natural && supportedModes.includes(natural)) return natural
  return supportedModes[0]
}

function naturalMatch(sdkMode: SdkMode): UXMode | null {
  switch (sdkMode) {
    case "shared":
    case "shared_readonly":
      return "display"
    case "shared_admin_input":
      return "party"
    case "per_user":
      return "service"
    case "hybrid":
      // chess-checkers does not declare hybrid; fall through to caller's
      // first-supported.
      return null
  }
}
