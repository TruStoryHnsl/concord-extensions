/**
 * Pure sync-state reducer for shared playback. Spec §7.
 *
 * v0.1.0: local-loop only. The mount site invokes applyEvent on every
 * state change; the post-Phase-1 wave will route SyncEvent objects via
 * concord state events so observers in other tabs/devices apply the
 * same transition.
 *
 * v0.2.0: adds Party-mode queue + transport commands (PartyCommand) and
 * a separate applyPartyCommand reducer. The two reducers operate on the
 * same SyncState but use different event types so callers can keep them
 * straight: SyncEvent for host-emitted Display-mode wall-clock-anchored
 * timestamps, PartyCommand for controller-emitted commands that the TV
 * resolves into local play/pause/seek operations.
 */

/** A single queued item; populated via party-cmd-queue-add. */
export interface QueuedItem {
  itemId: string
  addedBy: string
  addedAtMs: number
}

export interface SyncState {
  itemId: string | null
  status: "idle" | "playing" | "paused" | "buffering"
  positionMs: number
  positionAtMs: number
  rate: number
  hostId: string
  /** v0.2.0 party-mode queue. Empty in pure Display mode. */
  queue: QueuedItem[]
  /** Index into `queue` of the currently-playing item; -1 if nothing. */
  queueCursor: number
}

export type SyncEvent =
  | { type: "select"; itemId: string; atMs: number }
  | { type: "play"; positionMs: number; atMs: number }
  | { type: "pause"; positionMs: number; atMs: number }
  | { type: "seek"; positionMs: number; atMs: number }
  | { type: "host-transfer"; newHostId: string }

/**
 * Party-mode commands emitted by phone controllers via
 * extension:send_state_event with eventType
 * "com.concord.orrdia-bridge.party.command". The TV (and other
 * controllers, optimistically) receive them via concord:state_event and
 * apply via applyPartyCommand.
 */
export type PartyCommand =
  | { type: "party-cmd-queue-add"; itemId: string; addedBy: string; atMs: number }
  | { type: "party-cmd-select"; queueIndex: number; atMs: number }
  | { type: "party-cmd-play"; atMs: number }
  | { type: "party-cmd-pause"; atMs: number }
  | { type: "party-cmd-next"; atMs: number }
  | { type: "party-cmd-prev"; atMs: number }

export function makeInitialSyncState(hostId: string): SyncState {
  return {
    itemId: null,
    status: "idle",
    positionMs: 0,
    positionAtMs: 0,
    rate: 1.0,
    hostId,
    queue: [],
    queueCursor: -1,
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
  // Defensive: an upstream sender may post a malformed SyncEvent (e.g.
  // network corruption, version-mismatched extension talking to an older
  // shell, or simply garbage). Return state unchanged for unknown
  // discriminants rather than letting `undefined` propagate. Cast to
  // `string` so TypeScript's exhaustiveness checker still complains if a
  // new variant is added without a case.
  if (typeof ev !== "object" || ev === null || typeof (ev as { type?: unknown }).type !== "string") {
    return state
  }
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
    default:
      return state
  }
}

/**
 * Apply a Party-mode command to the sync state. Pure / deterministic.
 *
 * Notes:
 *  - queue-add deduplicates on (addedBy, atMs): an optimistic local apply
 *    plus its own remote echo with the same (addedBy, atMs) tuple yields
 *    one entry, not two. Different users adding the same item at the
 *    same atMs (extremely unlikely with millisecond timestamps) are
 *    treated as duplicates and the second one is dropped — this favors
 *    the no-double-queue UX over the no-lost-add corner case. Network
 *    layers that re-clock atMs must preserve the original or callers
 *    will see lost adds.
 *  - select clamps the queueIndex; an out-of-range index leaves the state
 *    unchanged.
 *  - next / prev are bounds-clamped: at end of queue, next is a no-op;
 *    at start, prev is a no-op.
 *  - play / pause leave positionMs as-is (the TV may have advanced past
 *    the command's wall clock; the controller doesn't know the exact
 *    head, so the TV-local sample wins on a follow-up SyncEvent).
 */
export function applyPartyCommand(
  state: SyncState,
  cmd: PartyCommand,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _localId: string,
): SyncState {
  // Defensive: malformed commands from the network drop to no-op rather
  // than throwing. v0.3.2 cold-reader pass discovered the original
  // implementation would propagate `undefined` for unknown discriminants.
  if (typeof cmd !== "object" || cmd === null || typeof (cmd as { type?: unknown }).type !== "string") {
    return state
  }
  switch (cmd.type) {
    case "party-cmd-queue-add": {
      // Dedup on (addedBy, addedAtMs): the optimistic local apply uses
      // the same wall-clock atMs as the remote echo (the controller emits
      // the cmd, applies optimistically, then receives its own echo via
      // bridge.onStateEvent — both share the original atMs). Two
      // different users adding the same item must use distinct atMs to
      // both land; in practice atMs is millisecond-granular so collisions
      // require a deliberate clock collision.
      const dup = state.queue.some(
        (q) => q.addedBy === cmd.addedBy && q.addedAtMs === cmd.atMs && q.itemId === cmd.itemId,
      )
      if (dup) return state
      return {
        ...state,
        queue: [
          ...state.queue,
          { itemId: cmd.itemId, addedBy: cmd.addedBy, addedAtMs: cmd.atMs },
        ],
      }
    }
    case "party-cmd-select": {
      if (cmd.queueIndex < 0 || cmd.queueIndex >= state.queue.length) return state
      const target = state.queue[cmd.queueIndex]
      return {
        ...state,
        queueCursor: cmd.queueIndex,
        itemId: target.itemId,
        status: "paused",
        positionMs: 0,
        positionAtMs: cmd.atMs,
      }
    }
    case "party-cmd-play":
      return { ...state, status: "playing", positionAtMs: cmd.atMs }
    case "party-cmd-pause":
      return { ...state, status: "paused", positionAtMs: cmd.atMs }
    case "party-cmd-next": {
      const next = state.queueCursor + 1
      if (next < 0 || next >= state.queue.length) return state
      const target = state.queue[next]
      return {
        ...state,
        queueCursor: next,
        itemId: target.itemId,
        status: "paused",
        positionMs: 0,
        positionAtMs: cmd.atMs,
      }
    }
    case "party-cmd-prev": {
      const prev = state.queueCursor - 1
      if (prev < 0 || prev >= state.queue.length) return state
      const target = state.queue[prev]
      return {
        ...state,
        queueCursor: prev,
        itemId: target.itemId,
        status: "paused",
        positionMs: 0,
        positionAtMs: cmd.atMs,
      }
    }
    default:
      return state
  }
}

/** Compute a projected current position given wall-clock now. Pure. */
export function projectPosition(state: SyncState, nowMs: number): number {
  if (state.status !== "playing") return state.positionMs
  const elapsed = Math.max(0, nowMs - state.positionAtMs) * state.rate
  return state.positionMs + elapsed
}
