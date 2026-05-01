/**
 * Pure sync-state reducer for shared playback. Spec §7.
 *
 * v0.1.0: local-loop only. The mount site invokes applyEvent on every
 * state change; the post-Phase-1 wave will route SyncEvent objects via
 * concord state events so observers in other tabs/devices apply the
 * same transition.
 */

export interface SyncState {
  itemId: string | null
  status: "idle" | "playing" | "paused" | "buffering"
  positionMs: number
  positionAtMs: number
  rate: number
  hostId: string
}

export type SyncEvent =
  | { type: "select"; itemId: string; atMs: number }
  | { type: "play"; positionMs: number; atMs: number }
  | { type: "pause"; positionMs: number; atMs: number }
  | { type: "seek"; positionMs: number; atMs: number }
  | { type: "host-transfer"; newHostId: string }

export function makeInitialSyncState(hostId: string): SyncState {
  return {
    itemId: null,
    status: "idle",
    positionMs: 0,
    positionAtMs: 0,
    rate: 1.0,
    hostId,
  }
}

/**
 * Apply an event to the sync state. Pure — never mutates `state`.
 * `localId` is the participant applying the event; reserved for future
 * authority checks (currently the reducer is permissive and trusts
 * whatever the caller decided to apply).
 */
export function applyEvent(
  state: SyncState,
  ev: SyncEvent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _localId: string,
): SyncState {
  switch (ev.type) {
    case "select":
      return {
        ...state,
        itemId: ev.itemId,
        status: "paused",
        positionMs: 0,
        positionAtMs: ev.atMs,
      }
    case "play":
      return {
        ...state,
        status: "playing",
        positionMs: ev.positionMs,
        positionAtMs: ev.atMs,
      }
    case "pause":
      return {
        ...state,
        status: "paused",
        positionMs: ev.positionMs,
        positionAtMs: ev.atMs,
      }
    case "seek":
      return {
        ...state,
        positionMs: ev.positionMs,
        positionAtMs: ev.atMs,
      }
    case "host-transfer":
      return { ...state, hostId: ev.newHostId }
  }
}

/** Compute a projected current position given wall-clock now. Pure. */
export function projectPosition(state: SyncState, nowMs: number): number {
  if (state.status !== "playing") return state.positionMs
  const elapsed = Math.max(0, nowMs - state.positionAtMs) * state.rate
  return state.positionMs + elapsed
}
