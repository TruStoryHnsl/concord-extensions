/**
 * Tests for ShellBridge — verifies dev-fallback timing, init capture from
 * postMessage, version-mismatch rejection, and event subscription teardown.
 *
 * Mirrors the structure of card-suite/src/shell/__tests__/bridge.test.ts.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShellBridge, INIT_FALLBACK_MS } from "../bridge"
import { CONCORD_SDK_VERSION, isConcordShellMessage } from "../sdk-types"

function postShellMessage(win: Window, msg: object): void {
  // Synchronously dispatch a MessageEvent that the bridge can intercept.
  win.dispatchEvent(new MessageEvent("message", { data: msg }))
}

describe("ShellBridge", () => {
  let bridge: ShellBridge
  beforeEach(() => {
    vi.useFakeTimers()
    bridge = new ShellBridge(window)
  })
  afterEach(() => {
    bridge.destroy()
    vi.useRealTimers()
  })

  it("falls back to dev init after INIT_FALLBACK_MS when no message arrives", async () => {
    const p = bridge.getInit()
    vi.advanceTimersByTime(INIT_FALLBACK_MS + 1)
    const init = await p
    expect(init.sessionId).toBe("dev")
    expect(init.extensionId).toBe("com.concord.chess-checkers")
    expect(init.mode).toBe("shared_admin_input")
    expect(init.seat).toBe("participant")
  })

  it("dev fallback timeout is configurable per-call", async () => {
    const p = bridge.getInit(50)
    vi.advanceTimersByTime(51)
    const init = await p
    expect(init.sessionId).toBe("dev")
  })

  it("captures shell init payload via postMessage", async () => {
    const p = bridge.getInit()
    postShellMessage(window, {
      type: "concord:init",
      version: CONCORD_SDK_VERSION,
      payload: {
        sessionId: "real",
        extensionId: "com.concord.chess-checkers",
        mode: "shared_admin_input",
        participantId: "@alice:x",
        seat: "participant",
        surfaces: [],
      },
    })
    const init = await p
    expect(init.sessionId).toBe("real")
    expect(init.participantId).toBe("@alice:x")
  })

  it("getInit() returns the cached payload on subsequent calls", async () => {
    postShellMessage(window, {
      type: "concord:init",
      version: CONCORD_SDK_VERSION,
      payload: {
        sessionId: "cached",
        extensionId: "com.concord.chess-checkers",
        mode: "per_user",
        participantId: "@bob:x",
        seat: "host",
        surfaces: [],
      },
    })
    const a = await bridge.getInit()
    const b = await bridge.getInit()
    expect(a.sessionId).toBe("cached")
    expect(b).toBe(a)
  })

  it("rejects messages with the wrong protocol version", async () => {
    const p = bridge.getInit()
    postShellMessage(window, {
      type: "concord:init",
      version: 999,
      payload: { sessionId: "wrong", extensionId: "x", mode: "shared", participantId: "x", seat: "host", surfaces: [] },
    })
    vi.advanceTimersByTime(INIT_FALLBACK_MS + 1)
    const init = await p
    // Wrong-version init was ignored — fallback fired.
    expect(init.sessionId).toBe("dev")
  })

  it("delivers participant_join events to subscribers", () => {
    const seen: unknown[] = []
    bridge.onParticipantJoin((p) => seen.push(p))
    postShellMessage(window, {
      type: "concord:participant_join",
      version: CONCORD_SDK_VERSION,
      payload: { participantId: "@new:x", seat: "participant" },
    })
    expect(seen).toHaveLength(1)
    expect((seen[0] as { participantId: string }).participantId).toBe("@new:x")
  })

  it("unsubscribes correctly", () => {
    const seen: unknown[] = []
    const unsub = bridge.onParticipantJoin((p) => seen.push(p))
    unsub()
    postShellMessage(window, {
      type: "concord:participant_join",
      version: CONCORD_SDK_VERSION,
      payload: { participantId: "@x:x", seat: "host" },
    })
    expect(seen).toHaveLength(0)
  })

  it("destroy() removes the message listener and clears subscribers", () => {
    const seen: unknown[] = []
    bridge.onParticipantJoin((p) => seen.push(p))
    bridge.destroy()
    postShellMessage(window, {
      type: "concord:participant_join",
      version: CONCORD_SDK_VERSION,
      payload: { participantId: "@x:x", seat: "host" },
    })
    expect(seen).toHaveLength(0)
  })

  it("ignores non-shell objects on the message channel", async () => {
    const p = bridge.getInit()
    postShellMessage(window, { foo: "bar" })
    vi.advanceTimersByTime(INIT_FALLBACK_MS + 1)
    const init = await p
    expect(init.sessionId).toBe("dev")
  })
})

describe("isConcordShellMessage", () => {
  it("accepts a valid envelope", () => {
    expect(
      isConcordShellMessage({
        type: "concord:init",
        version: CONCORD_SDK_VERSION,
        payload: {},
      }),
    ).toBe(true)
  })
  it("rejects mismatched versions", () => {
    expect(
      isConcordShellMessage({ type: "concord:init", version: 999, payload: {} }),
    ).toBe(false)
  })
  it("rejects non-concord types", () => {
    expect(
      isConcordShellMessage({
        type: "other:init",
        version: CONCORD_SDK_VERSION,
        payload: {},
      }),
    ).toBe(false)
  })
  it("rejects non-objects", () => {
    expect(isConcordShellMessage(null)).toBe(false)
    expect(isConcordShellMessage("string")).toBe(false)
    expect(isConcordShellMessage(42)).toBe(false)
  })
})
