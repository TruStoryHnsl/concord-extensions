/**
 * Mode adapter — maps the shell SDK's Mode primitives to the Werewolf
 * extension's UX-mode taxonomy and chooses a concrete ViewVariant for
 * the renderer.
 *
 * Werewolf supports party / chat / hybrid (per manifest). `chat` exists
 * as a UX mode here because BotC-style social-deduction games translate
 * naturally to a chat-only surface; the SDK doesn't have a "chat" mode,
 * but `shared_admin_input` with no big-display surface available is the
 * closest match (handled at the picker level).
 */

import { Seat, Mode as SdkMode } from '../shell/sdk-types'

export type UXMode = 'party' | 'chat' | 'hybrid'

export type ViewVariant =
  | 'shared-display' // public / audience surface (host's screen on a TV)
  | 'shared-controller' // single-actor controller (a phone, or solo player)
  | 'hybrid-public'
  | 'hybrid-private'

/**
 * Pick a concrete view variant given the resolved UX mode and the local
 * participant's seat. Pure / deterministic.
 *
 *   chat           → shared-controller (chat overlay, single primary actor)
 *   party          → host/observer/spectator → shared-display, others → controller
 *   hybrid         → host → hybrid-public, others → hybrid-private
 */
export function pickViewVariant(uxMode: UXMode, seat: Seat): ViewVariant {
  switch (uxMode) {
    case 'chat':
      return 'shared-controller'
    case 'party':
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
 * falling back to the first supported mode if the natural match isn't
 * supported.
 *
 * Mapping:
 *   shared              → party (Werewolf has no display-only mode; the
 *                         picker is interactive)
 *   shared_readonly     → party (same)
 *   shared_admin_input  → party
 *   per_user            → chat (single actor / single surface)
 *   hybrid              → hybrid
 */
export function mapSdkModeToUxMode(
  sdkMode: SdkMode,
  supported: readonly UXMode[],
): UXMode {
  if (supported.length === 0) {
    throw new Error('mode-adapter: extension has no supportedModes')
  }
  const natural = naturalMatch(sdkMode)
  if (supported.includes(natural)) return natural
  return supported[0]
}

function naturalMatch(sdkMode: SdkMode): UXMode {
  switch (sdkMode) {
    case 'shared':
    case 'shared_readonly':
    case 'shared_admin_input':
      return 'party'
    case 'per_user':
      return 'chat'
    case 'hybrid':
      return 'hybrid'
  }
}
