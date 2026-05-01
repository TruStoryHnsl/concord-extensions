// NOTE: tests authored in same session as feature — see PLAN.md INS-009 entry; cold-reader pass needed before declaring production-ready.

import { afterEach, describe, expect, it, vi } from "vitest"
import { ShellBridge } from "../bridge"
import { CONCORD_SDK_VERSION } from "../sdk-types"

describe("ShellBridge state_event channels (v0.2.0)", () => {
  const bridges: ShellBridge[] = []
  afterEach(() => {
    while (bridges.length) bridges.pop()?.destroy()
  })

  function make(): ShellBridge {
    const b = new ShellBridge(window)
    bridges.push(b)
    return b
  }

  it("dispatches concord:state_event payloads to onStateEvent subscribers", () => {
    const bridge = make()
    const seen: unknown[] = []
    bridge.onStateEvent((p) => seen.push(p))

    const payload = {
      roomId: "!room:server",
      eventType: "m.room.message",
      content: { body: "hi", msgtype: "m.text" },
      sender: "@alice:server",
      originServerTs: 12345,
    }
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "concord:state_event", payload, version: CONCORD_SDK_VERSION },
      }),
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual(payload)
  })

  it("dispatches concord:permission_denied payloads to subscribers", () => {
    const bridge = make()
    const seen: unknown[] = []
    bridge.onPermissionDenied((p) => seen.push(p))

    const payload = {
      action: "extension:send_state_event",
      reason: "manifest_missing_permission",
      detail: "matrix.send",
    }
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "concord:permission_denied",
          payload,
          version: CONCORD_SDK_VERSION,
        },
      }),
    )

    expect(seen).toEqual([payload])
  })

  it("ignores envelopes with mismatched version", () => {
    const bridge = make()
    const seen: unknown[] = []
    bridge.onStateEvent((p) => seen.push(p))

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "concord:state_event",
          payload: { roomId: "x", eventType: "y", content: {}, sender: "z", originServerTs: 1 },
          version: 999,
        },
      }),
    )

    expect(seen).toEqual([])
  })

  it("ignores malformed envelopes (missing type/payload)", () => {
    const bridge = make()
    const seen: unknown[] = []
    bridge.onStateEvent((p) => seen.push(p))

    window.dispatchEvent(new MessageEvent("message", { data: { version: CONCORD_SDK_VERSION } }))
    window.dispatchEvent(new MessageEvent("message", { data: null }))
    window.dispatchEvent(new MessageEvent("message", { data: "string" }))

    expect(seen).toEqual([])
  })

  it("sendStateEvent posts the correct envelope shape via window.postMessage", () => {
    const bridge = make()
    const spy = vi.spyOn(window, "postMessage")
    try {
      bridge.sendStateEvent({
        eventType: "com.concord.orrdia-bridge.party.command",
        content: { type: "party-cmd-play", atMs: 100 },
      })
    } finally {
      // assertion happens before restore so we capture the call
    }

    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]
    expect(call[0]).toEqual({
      type: "extension:send_state_event",
      payload: {
        eventType: "com.concord.orrdia-bridge.party.command",
        content: { type: "party-cmd-play", atMs: 100 },
      },
      version: CONCORD_SDK_VERSION,
    })
    expect(call[1]).toBe("*")
    spy.mockRestore()
  })

  it("unsubscribe removes the handler", () => {
    const bridge = make()
    const fn = vi.fn()
    const off = bridge.onStateEvent(fn)
    off()
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "concord:state_event",
          payload: { roomId: "!r:s", eventType: "m.room.message", content: {}, sender: "@a:s", originServerTs: 1 },
          version: CONCORD_SDK_VERSION,
        },
      }),
    )
    expect(fn).not.toHaveBeenCalled()
  })
})
