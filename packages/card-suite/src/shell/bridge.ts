/**
 * Shell bridge — listens for postMessage envelopes from the Concord shell
 * and dispatches typed events to in-iframe subscribers.
 *
 * Dev fallback: if no `concord:init` arrives within INIT_FALLBACK_MS, we
 * synthesize a default init so `pnpm dev` and pack-and-load testing still
 * work outside the shell.
 */

import {
  ConcordHostTransferPayload,
  ConcordInitPayload,
  ConcordParticipantJoinPayload,
  ConcordParticipantLeavePayload,
  ConcordShellMessage,
  ConcordSurfaceResizePayload,
  CONCORD_SDK_VERSION,
  isConcordShellMessage,
} from './sdk-types'

export const INIT_FALLBACK_MS = 250

/**
 * Dev fallback default. Two important choices:
 *
 *   - `mode: "shared_admin_input"` maps to UX "party" — the one mode that
 *     EVERY card-suite game supports. With "shared" → "display" the
 *     picker filtered out Hold'em / Speed / Kings & Peasants entirely
 *     because they don't support display mode, so only half the suite
 *     was reachable in dev.
 *   - `seat: "participant"` so the chosen variant gets the controller
 *     surface (with action buttons) instead of the read-only display
 *     variant. The dev/solo user is BOTH the host (audience) AND the
 *     actor; in production those are different devices, but in dev we
 *     want the device that's open to actually be playable.
 *
 * In production the shell sends a real concord:init payload before the
 * 250ms fallback fires, so this default is dev-only and never racing
 * shell-driven sessions.
 */
const DEV_INIT: ConcordInitPayload = {
  sessionId: 'dev',
  extensionId: 'com.concord.card-suite',
  mode: 'shared_admin_input',
  participantId: '@dev:local',
  seat: 'participant',
  surfaces: [{ surface_id: 'main', type: 'panel', anchor: 'center' }],
}

type Unsubscribe = () => void

/**
 * Bridge instance. Subscribes to one window's `message` events and keeps
 * the most-recent init payload around for late subscribers.
 */
export class ShellBridge {
  private win: Window | null
  private initResolved: ConcordInitPayload | null = null
  private initPromise: Promise<ConcordInitPayload> | null = null
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private joinHandlers = new Set<(p: ConcordParticipantJoinPayload) => void>()
  private leaveHandlers = new Set<(p: ConcordParticipantLeavePayload) => void>()
  private hostTransferHandlers = new Set<(p: ConcordHostTransferPayload) => void>()
  private resizeHandlers = new Set<(p: ConcordSurfaceResizePayload) => void>()
  private destroyed = false
  private msgListener = (e: MessageEvent) => this.onMessage(e)

  constructor(win: Window | null = typeof window !== 'undefined' ? window : null) {
    this.win = win
    if (this.win) this.win.addEventListener('message', this.msgListener)
  }

  /**
   * Resolves with the init payload — either from the shell or, after
   * INIT_FALLBACK_MS with no init, from the dev-fallback default.
   */
  getInit(fallbackMs: number = INIT_FALLBACK_MS): Promise<ConcordInitPayload> {
    if (this.initResolved) return Promise.resolve(this.initResolved)
    if (this.initPromise) return this.initPromise
    this.initPromise = new Promise<ConcordInitPayload>((resolve) => {
      const completeWith = (payload: ConcordInitPayload) => {
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer)
          this.fallbackTimer = null
        }
        this.initResolved = payload
        resolve(payload)
      }
      // Re-route the message handler to capture init.
      const captureInit = (msg: ConcordShellMessage) => {
        if (msg.type === 'concord:init') completeWith(msg.payload)
      }
      this.initCaptures.add(captureInit)
      this.fallbackTimer = setTimeout(() => {
        if (!this.initResolved) completeWith({ ...DEV_INIT })
      }, fallbackMs)
    })
    return this.initPromise
  }

  /** Subscribe to participant_join. Returns an unsubscribe fn. */
  onParticipantJoin(fn: (p: ConcordParticipantJoinPayload) => void): Unsubscribe {
    this.joinHandlers.add(fn)
    return () => this.joinHandlers.delete(fn)
  }

  /** Subscribe to participant_leave. Returns an unsubscribe fn. */
  onParticipantLeave(fn: (p: ConcordParticipantLeavePayload) => void): Unsubscribe {
    this.leaveHandlers.add(fn)
    return () => this.leaveHandlers.delete(fn)
  }

  /** Subscribe to host_transfer. Returns an unsubscribe fn. */
  onHostTransfer(fn: (p: ConcordHostTransferPayload) => void): Unsubscribe {
    this.hostTransferHandlers.add(fn)
    return () => this.hostTransferHandlers.delete(fn)
  }

  /** Subscribe to surface_resize. Returns an unsubscribe fn. */
  onResize(fn: (p: ConcordSurfaceResizePayload) => void): Unsubscribe {
    this.resizeHandlers.add(fn)
    return () => this.resizeHandlers.delete(fn)
  }

  /** Tear down the listener; idempotent. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.win) this.win.removeEventListener('message', this.msgListener)
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    this.initCaptures.clear()
    this.joinHandlers.clear()
    this.leaveHandlers.clear()
    this.hostTransferHandlers.clear()
    this.resizeHandlers.clear()
  }

  // ------------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------------

  private initCaptures = new Set<(m: ConcordShellMessage) => void>()

  private onMessage(e: MessageEvent): void {
    const data = e.data
    // Reject anything that isn't shaped like a shell message.
    if (typeof data !== 'object' || data === null) return
    const obj = data as { type?: unknown; version?: unknown }
    // Version-mismatch rejection: drop `concord:*` events with the wrong version.
    if (
      typeof obj.type === 'string' &&
      obj.type.startsWith('concord:') &&
      obj.version !== CONCORD_SDK_VERSION
    ) {
      return
    }
    if (!isConcordShellMessage(data)) return
    // Init capture (one-shot per call; getInit cleans up via timer + resolved cache).
    if (data.type === 'concord:init') {
      for (const cap of this.initCaptures) cap(data)
      // Cache and short-circuit any future getInit() too.
      if (!this.initResolved) this.initResolved = data.payload
      return
    }
    if (data.type === 'concord:participant_join') {
      for (const h of this.joinHandlers) h(data.payload)
      return
    }
    if (data.type === 'concord:participant_leave') {
      for (const h of this.leaveHandlers) h(data.payload)
      return
    }
    if (data.type === 'concord:host_transfer') {
      for (const h of this.hostTransferHandlers) h(data.payload)
      return
    }
    if (data.type === 'concord:surface_resize') {
      for (const h of this.resizeHandlers) h(data.payload)
      return
    }
  }
}

/**
 * Module-level singleton for the iframe. Lazily constructed so it doesn't
 * try to attach to `window` during SSR / vitest setup before jsdom is up.
 */
let defaultBridge: ShellBridge | null = null
export function getDefaultBridge(): ShellBridge {
  if (!defaultBridge) defaultBridge = new ShellBridge()
  return defaultBridge
}
