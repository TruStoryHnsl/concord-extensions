/**
 * Mode adapter — bridges the Concord SDK Mode primitives to the
 * orrdia-bridge UX-mode taxonomy and chooses a concrete ViewVariant.
 *
 * UX modes for this extension: party / display / hybrid. (Spec section
 * 8 — orrdia-bridge does NOT support service or chat as standalone.)
 *
 * mapSdkModeToUxMode: SDK mode → UX mode, falling back to the first
 * supported UX mode when the natural match isn't supported.
 *
 * pickViewVariant: (uxMode, seat) → render variant name. Variants:
 *   shared-display     — Display mode, all seats; party-mode TV/big-screen
 *   shared-controller  — Party-mode phone controller (no <video>)
 *   hybrid-split       — Hybrid mode: media surface + chat panel
 */

import { Seat, Mode as SdkMode } from "../shell/sdk-types"

export type UXMode = "party" | "display" | "hybrid"

export type ViewVariant =
  | "shared-display"
  | "shared-controller"
  | "hybrid-split"

/**
 * Pick a concrete view variant given the resolved UX mode and the local
 * participant's seat. Pure / deterministic.
 *
 *   display → shared-display (all seats)
 *   hybrid  → hybrid-split   (all seats; layout differs by seat at render)
 *   party   → host/observer/spectator → shared-display (the TV/big screen)
 *           → participant            → shared-controller (the phone)
 */
export function pickViewVariant(uxMode: UXMode, seat: Seat): ViewVariant {
  switch (uxMode) {
    case "display":
      return "shared-display"
    case "hybrid":
      return "hybrid-split"
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
 *   per_user            → (not supported) → first supported UX mode
 *   hybrid              → hybrid
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
    case "hybrid":
      return "hybrid"
    case "per_user":
      // orrdia-bridge does not declare service / per_user; fall through
      // to caller's first-supported.
      return null
  }
}
