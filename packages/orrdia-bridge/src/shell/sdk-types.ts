/**
 * Concord Shell SDK message types — INLINED COPY.
 *
 * Source of truth lives in the main concord repo at:
 *   /home/corr/projects/concord/client/src/extensions/sdk.ts
 *
 * Per project rule: "SDK stays in concord repo until launch phase. Do not
 * extract to packages/concord-sdk/ before Phase 4 is scheduled." We mirror
 * just the types we need here so orrdia-bridge compiles + runs standalone
 * (and inside the iframe at runtime).
 *
 * If the upstream protocol shape changes (CONCORD_SDK_VERSION bump), bump
 * this file too and re-test the bridge.
 */

/** Protocol version — must match the value posted by the shell. */
export const CONCORD_SDK_VERSION = 1

/** Interaction modes the shell can hand the iframe. */
export type Mode =
  | "shared"
  | "shared_readonly"
  | "shared_admin_input"
  | "per_user"
  | "hybrid"

/** Seat role assigned to the local participant for this session. */
export type Seat = "host" | "participant" | "observer" | "spectator"

export type SurfaceType =
  | "panel"
  | "modal"
  | "pip"
  | "fullscreen"
  | "background"
  | "browser"

export type SurfaceAnchor =
  | "left_sidebar"
  | "right_sidebar"
  | "bottom_bar"
  | "center"
  | "none"

export interface SurfaceDescriptor {
  surface_id: string
  type: SurfaceType
  anchor: SurfaceAnchor
  min_width_px?: number
  min_height_px?: number
  preferred_aspect?: string | null
  z_index?: number
}

export interface ConcordInitPayload {
  sessionId: string
  extensionId: string
  mode: Mode
  participantId: string
  seat: Seat
  surfaces: SurfaceDescriptor[]
}

export interface ConcordParticipantJoinPayload {
  participantId: string
  seat: Seat
}

export interface ConcordParticipantLeavePayload {
  participantId: string
}

export interface ConcordHostTransferPayload {
  previousHostId: string
  newHostId: string
  newSeat: Seat
}

export interface ConcordSurfaceResizePayload {
  surfaceId: string
  widthPx: number
  heightPx: number
}

/** A Matrix room state event forwarded to the extension (concord PR #39 / INS-066 W5).
 *
 * The shell observes the Matrix client's incoming events for the active
 * room and forwards each one as a `concord:state_event` IFF the
 * extension's manifest permissions include `state_events` or
 * `matrix.read`. Extensions without those permissions never see this
 * message — the gate is enforced shell-side, not in the extension. */
export interface ConcordStateEventPayload {
  /** Matrix room ID where the event originated. */
  roomId: string
  /** Matrix event type (e.g. `m.room.message`, `com.concord.foo.state`). */
  eventType: string
  /** Opaque event content. Shape depends on `eventType`; the shell forwards
   *  the raw object without interpretation. */
  content: Record<string, unknown>
  /** Matrix user ID of the event sender. */
  sender: string
  /** Origin server timestamp in milliseconds since epoch. */
  originServerTs: number
  /** Optional state_key for state events. Absent on message events. */
  stateKey?: string
}

/** Sent back to an extension after a denied verb (concord PR #39 / INS-066 W6). */
export interface ConcordPermissionDeniedPayload {
  /** The verb name that was denied (e.g. `extension:send_state_event`). */
  action: string
  /** Human-readable reason. Stable identifiers preferred:
   *  - "manifest_missing_permission"   — manifest didn't request the perm
   *  - "session_role_forbidden"        — InputRouter rejected the seat/mode
   *  - "manifest_unknown"              — shell has no manifest for this ext
   *  - "invalid_payload"               — payload shape was wrong
   */
  reason: string
  /** Optional extra context (e.g. the missing permission name). */
  detail?: string
}

export type ConcordShellMessage =
  | { type: "concord:init"; payload: ConcordInitPayload; version: typeof CONCORD_SDK_VERSION }
  | {
      type: "concord:participant_join"
      payload: ConcordParticipantJoinPayload
      version: typeof CONCORD_SDK_VERSION
    }
  | {
      type: "concord:participant_leave"
      payload: ConcordParticipantLeavePayload
      version: typeof CONCORD_SDK_VERSION
    }
  | {
      type: "concord:host_transfer"
      payload: ConcordHostTransferPayload
      version: typeof CONCORD_SDK_VERSION
    }
  | {
      type: "concord:surface_resize"
      payload: ConcordSurfaceResizePayload
      version: typeof CONCORD_SDK_VERSION
    }
  | {
      type: "concord:state_event"
      payload: ConcordStateEventPayload
      version: typeof CONCORD_SDK_VERSION
    }
  | {
      type: "concord:permission_denied"
      payload: ConcordPermissionDeniedPayload
      version: typeof CONCORD_SDK_VERSION
    }

/** Payload for `extension:send_state_event` (concord PR #39 / INS-066 W6).
 *
 * The extension requests that the shell emit a Matrix state event on its
 * behalf. The shell checks (a) InputRouter session/seat permission, and
 * (b) the manifest declared `state_events` or `matrix.send`. Both gates
 * must pass; otherwise a `concord:permission_denied` is posted back. */
export interface ExtensionSendStateEventPayload {
  /** Optional Matrix room ID. When omitted, the shell uses the active
   *  room for the current session. Extensions are NOT allowed to send
   *  to arbitrary rooms — providing a room_id different from the
   *  current session's room is rejected. */
  roomId?: string
  /** Matrix event type to emit, e.g. `com.concord.orrdia-bridge.party.command`. */
  eventType: string
  /** State key. Optional — defaults to empty string. */
  stateKey?: string
  /** Event content. */
  content: Record<string, unknown>
}

export type ExtensionInboundMessage = {
  type: "extension:send_state_event"
  payload: ExtensionSendStateEventPayload
  version: typeof CONCORD_SDK_VERSION
}

/** Type guard — exact mirror of upstream `isConcordShellMessage`. */
export function isConcordShellMessage(data: unknown): data is ConcordShellMessage {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.type === "string" &&
    d.type.startsWith("concord:") &&
    d.version === CONCORD_SDK_VERSION
  )
}

/** Type guard for inbound `extension:*` verbs. Mirrors upstream. */
export function isExtensionInboundMessage(
  data: unknown,
): data is ExtensionInboundMessage {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.type === "string" &&
    d.type.startsWith("extension:") &&
    d.version === CONCORD_SDK_VERSION &&
    typeof d.payload === "object" &&
    d.payload !== null
  )
}
