/**
 * Mode adapter — bridges the concord shell's SDK Mode primitives to the
 * Card Suite's internal UX-mode taxonomy and chooses a concrete
 * ViewVariant for the renderer.
 *
 * The extension's UX modes (party / display / service / chat / hybrid) are
 * the marketing-level mental model — they describe how the experience is
 * *presented* (party = communal screen + private inputs, display = public
 * presentation, etc.). The SDK's Mode is finer: it describes the *input
 * topology* the shell will route. mapSdkModeToUxMode() projects between
 * them, falling back to the first supported UX mode when no direct match
 * is feasible.
 *
 * pickViewVariant() then picks a concrete render variant from (uxMode, seat).
 */

import { Seat, Mode as SdkMode } from '../shell/sdk-types'
import { UXMode } from '../engine/types'

/**
 * The renderer-level taxonomy. Each game's UI knows how to render any
 * subset of these (e.g. solitaire only knows "solo"; poker only knows
 * the shared / hybrid splits).
 */
export type ViewVariant =
  | 'solo'
  | 'shared-display'
  | 'shared-controller'
  | 'hybrid-public'
  | 'hybrid-private'

/**
 * Pick a concrete view variant given the resolved UX mode and the local
 * participant's seat. Pure / deterministic.
 *
 *   service        → solo (per-user surface, no audience)
 *   display        → shared-display (read-only big screen)
 *   chat           → shared-controller (chat overlay, single primary actor)
 *   party          → host/admin → shared-display, others → shared-controller
 *   hybrid         → host → hybrid-public, others → hybrid-private
 */
export function pickViewVariant(
  uxMode: UXMode | 'chat',
  seat: Seat,
): ViewVariant {
  switch (uxMode) {
    case 'service':
      return 'solo'
    case 'display':
      return 'shared-display'
    case 'chat':
      return 'shared-controller'
    case 'party':
      // Host / observer / spectator see the shared display; participants
      // get the controller surface.
      if (seat === 'host' || seat === 'observer' || seat === 'spectator') {
        return 'shared-display'
      }
      return 'shared-controller'
    case 'hybrid':
      if (seat === 'host' || seat === 'observer' || seat === 'spectator') {
        return 'hybrid-public'
      }
      return 'hybrid-private'
  }
}

/**
 * Project the shell SDK's Mode into the extension's UX-mode taxonomy,
 * preferring the most natural match and falling back to the first
 * supported mode in the game's `supportedModes` if the natural match
 * isn't supported.
 *
 * Mapping:
 *   shared              → display
 *   shared_readonly     → display
 *   shared_admin_input  → party
 *   per_user            → service
 *   hybrid              → hybrid
 */
export function mapSdkModeToUxMode(
  sdkMode: SdkMode,
  gameSupportedModes: readonly UXMode[],
): UXMode {
  if (gameSupportedModes.length === 0) {
    throw new Error('mode-adapter: game has no supportedModes')
  }
  const natural = naturalMatch(sdkMode)
  if (gameSupportedModes.includes(natural)) return natural
  return gameSupportedModes[0]
}

function naturalMatch(sdkMode: SdkMode): UXMode {
  switch (sdkMode) {
    case 'shared':
    case 'shared_readonly':
      return 'display'
    case 'shared_admin_input':
      return 'party'
    case 'per_user':
      return 'service'
    case 'hybrid':
      return 'hybrid'
  }
}
