/**
 * Shell bridge — listens for postMessage envelopes from the Concord shell
 * and dispatches typed events to in-iframe subscribers.
 *
 * Dev fallback: if no `concord:init` arrives within INIT_FALLBACK_MS, we
 * synthesize a default init so `pnpm dev` and pack-and-load testing still
 * work outside the shell.
 *
 * Mirrors packages/chess-checkers/src/shell/bridge.ts. When the SDK is
 * extracted to packages/concord-sdk/ in Phase 7 this file becomes a
 * one-line re-export.
 */

import {
  ConcordHostTransferPayload,
  ConcordInitPayload,
  ConcordParticipantJoinPayload,
  ConcordParticipantLeavePayload,
  ConcordPermissionDeniedPayload,
  ConcordShellMessage,
  ConcordStateEventPayload,
  ConcordSurfaceResizePayload,
  CONCORD_SDK_VERSION,
  ExtensionInboundMessage,
  ExtensionSendStateEventPayload,
  isConcordShellMessage,
} from "./sdk-types"

export const INIT_FALLBACK_MS = 250

/**
 * Dev fallback default. mode = shared so the picker resolves to UXMode
 * "display" (the v0.1.0 first surface); seat = host so the local user
 * gets the controller bar instead of read-only mirror.
 */
const DEV_INIT: ConcordInitPayload = {
  sessionId: "dev",
  extensionId: "com.concord.orrdia-bridge",
  mode: "shared",
  participantId: "@dev:local",
  seat: "host",
  surfaces: [{ surface_id: "main", type: "panel", anchor: "center" }],
}

type Unsubscribe = () => void

export class ShellBridge {
  private win: Window | null
  private initResolved: ConcordInitPayload | null = null
  private initPromise: Promise<ConcordInitPayload> | null = null
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private joinHandlers = new Set<(p: ConcordParticipantJoinPayload) => void>()
  private leaveHandlers = new Set<(p: ConcordParticipantLeavePayload) => void>()
  private hostTransferHandlers = new Set<(p: ConcordHostTransferPayload) => void>()
  private resizeHandlers = new Set<(p: ConcordSurfaceResizePayload) => void>()
  private stateEventHandlers = new Set<(p: ConcordStateEventPayload) => void>()
  private permissionDeniedHandlers = new Set<(p: ConcordPermissionDeniedPayload) => void>()
  private destroyed = false
  private msgListener = (e: MessageEvent) => this.onMessage(e)

  constructor(win: Window | null = typeof window !== "undefined" ? window : null) {
    this.win = win
    if (this.win) this.win.addEventListener("message", this.msgListener)
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
      const captureInit = (msg: ConcordShellMessage) => {
        if (msg.type === "concord:init") completeWith(msg.payload)
      }
      this.initCaptures.add(captureInit)
      this.fallbackTimer = setTimeout(() => {
        if (!this.initResolved) completeWith({ ...DEV_INIT })
      }, fallbackMs)
    })
    return this.initPromise
  }

  onParticipantJoin(fn: (p: ConcordParticipantJoinPayload) => void): Unsubscribe {
    this.joinHandlers.add(fn)
    return () => this.joinHandlers.delete(fn)
  }

  onParticipantLeave(fn: (p: ConcordParticipantLeavePayload) => void): Unsubscribe {
    this.leaveHandlers.add(fn)
    return () => this.leaveHandlers.delete(fn)
  }

  onHostTransfer(fn: (p: ConcordHostTransferPayload) => void): Unsubscribe {
    this.hostTransferHandlers.add(fn)
    return () => this.hostTransferHandlers.delete(fn)
  }

  onResize(fn: (p: ConcordSurfaceResizePayload) => void): Unsubscribe {
    this.resizeHandlers.add(fn)
    return () => this.resizeHandlers.delete(fn)
  }

  /** Subscribe to incoming Matrix room state events forwarded by the shell. */
  onStateEvent(fn: (p: ConcordStateEventPayload) => void): Unsubscribe {
    this.stateEventHandlers.add(fn)
    return () => this.stateEventHandlers.delete(fn)
  }

  /** Subscribe to permission_denied responses (extension verb rejected). */
  onPermissionDenied(fn: (p: ConcordPermissionDeniedPayload) => void): Unsubscribe {
    this.permissionDeniedHandlers.add(fn)
    return () => this.permissionDeniedHandlers.delete(fn)
  }

  /**
   * Request the shell emit a Matrix state event on this extension's behalf.
   * Posts `extension:send_state_event` to window.parent (production) or to
   * the local window (dev fallback so localhost dev can self-loopback).
   */
  sendStateEvent(payload: ExtensionSendStateEventPayload): void {
    if (!this.win) return
    const msg: ExtensionInboundMessage = {
      type: "extension:send_state_event",
      payload,
      version: CONCORD_SDK_VERSION,
    }
    const target =
      this.win.parent && this.win.parent !== this.win ? this.win.parent : this.win
    target.postMessage(msg, "*")
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.win) this.win.removeEventListener("message", this.msgListener)
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    this.initCaptures.clear()
    this.joinHandlers.clear()
    this.leaveHandlers.clear()
    this.hostTransferHandlers.clear()
    this.resizeHandlers.clear()
    this.stateEventHandlers.clear()
    this.permissionDeniedHandlers.clear()
  }

  private initCaptures = new Set<(m: ConcordShellMessage) => void>()

  private onMessage(e: MessageEvent): void {
    const data = e.data
    if (typeof data !== "object" || data === null) return
    const obj = data as { type?: unknown; version?: unknown }
    if (
      typeof obj.type === "string" &&
      obj.type.startsWith("concord:") &&
      obj.version !== CONCORD_SDK_VERSION
    ) {
      return
    }
    if (!isConcordShellMessage(data)) return
    if (data.type === "concord:init") {
      for (const cap of this.initCaptures) cap(data)
      if (!this.initResolved) this.initResolved = data.payload
      return
    }
    if (data.type === "concord:participant_join") {
      for (const h of this.joinHandlers) h(data.payload)
      return
    }
    if (data.type === "concord:participant_leave") {
      for (const h of this.leaveHandlers) h(data.payload)
      return
    }
    if (data.type === "concord:host_transfer") {
      for (const h of this.hostTransferHandlers) h(data.payload)
      return
    }
    if (data.type === "concord:surface_resize") {
      for (const h of this.resizeHandlers) h(data.payload)
      return
    }
    if (data.type === "concord:state_event") {
      for (const h of this.stateEventHandlers) h(data.payload)
      return
    }
    if (data.type === "concord:permission_denied") {
      for (const h of this.permissionDeniedHandlers) h(data.payload)
      return
    }
  }
}

let defaultBridge: ShellBridge | null = null
export function getDefaultBridge(): ShellBridge {
  if (!defaultBridge) defaultBridge = new ShellBridge()
  return defaultBridge
}
