/**
 * Concord Shell SDK message types — INLINED COPY.
 *
 * Source of truth lives in the main concord repo at:
 *   /home/corr/projects/concord/client/src/extensions/sdk.ts
 *
 * Per project rule: "SDK stays in concord repo until launch phase. Do not
 * extract to packages/concord-sdk/ before Phase 4 is scheduled." We mirror
 * just the types we need here so chess-checkers compiles + runs standalone
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
