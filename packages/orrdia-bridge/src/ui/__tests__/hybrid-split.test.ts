// NOTE: tests authored same-session as feature — see PLAN.md INS-009 entry; cold-reader pass needed before declaring production-ready.

import { afterEach, describe, expect, it, vi } from "vitest"
import { mountHybridSplit, HYBRID_PREVIEW_LIMIT } from "../hybrid-split"
import { AuthSession } from "../../engine/types"
import { ConcordStateEventPayload } from "../../shell/sdk-types"

const session: AuthSession = {
  baseUrl: "https://o.example",
  userId: "u",
  accessToken: "tok-xyz",
  serverId: "srv",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.2.0",
  deviceName: "Concord",
}

type StateEventHandler = (p: ConcordStateEventPayload) => void

interface FakeBridge {
  onStateEvent: (fn: StateEventHandler) => () => void
  fire: (p: ConcordStateEventPayload) => void
}

function makeFakeBridge(): FakeBridge {
  const handlers: StateEventHandler[] = []
  return {
    onStateEvent: (fn) => {
      handlers.push(fn)
      return () => {
        const i = handlers.indexOf(fn)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
    fire: (p) => {
      for (const h of handlers) h(p)
    },
  }
}

function mkMessageEvent(body: string, sender = "@a:s", ts = 1): ConcordStateEventPayload {
  return {
    roomId: "!r:s",
    eventType: "m.room.message",
    content: { body, msgtype: "m.text" },
    sender,
    originServerTs: ts,
  }
}

describe("mountHybridSplit (v0.2.0)", () => {
  let unmounts: Array<() => void> = []
  // Stub out the network calls the library-browser would make on mount.
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify({ Items: [] }), { status: 200 })
  })

  afterEach(() => {
    while (unmounts.length) unmounts.pop()?.()
    fetchSpy.mockClear()
  })

  it("renders a split layout with a Channel chat title and 'Waiting for messages…' empty state", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle.unmount)

    expect(root.querySelector(".orrdia-hybrid-media")).toBeTruthy()
    expect(root.querySelector(".orrdia-hybrid-chat")).toBeTruthy()
    expect(root.querySelector(".orrdia-hybrid-chat-title")?.textContent).toBe("Channel chat")
    expect(root.querySelector(".orrdia-hybrid-chat-empty")?.textContent).toMatch(/Waiting/)
    expect(root.querySelector(".orrdia-hybrid-chat-caption")?.textContent).toMatch(
      /channel chat/i,
    )
  })

  it("renders incoming m.room.message events into the preview pane (sender + body)", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle.unmount)

    bridge.fire(mkMessageEvent("hello world", "@alice:s", 100))
    bridge.fire(mkMessageEvent("second", "@bob:s", 200))

    const items = root.querySelectorAll(".orrdia-hybrid-chat-message")
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain("@alice:s")
    expect(items[0].textContent).toContain("hello world")
    expect(items[1].textContent).toContain("@bob:s")
    expect(items[1].textContent).toContain("second")
  })

  it("ignores non-m.room.message state events", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle.unmount)

    bridge.fire({
      roomId: "!r:s",
      eventType: "com.concord.orrdia-bridge.party.command",
      content: { type: "party-cmd-play" },
      sender: "@a:s",
      originServerTs: 1,
    })
    expect(handle.previewCount()).toBe(0)
  })

  it("ring-buffers the preview at HYBRID_PREVIEW_LIMIT messages (default 8)", () => {
    expect(HYBRID_PREVIEW_LIMIT).toBe(8)
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle.unmount)

    for (let i = 0; i < 10; i++) {
      bridge.fire(mkMessageEvent(`msg-${i}`, "@a:s", i))
    }
    expect(handle.previewCount()).toBe(8)
    const items = root.querySelectorAll(".orrdia-hybrid-chat-message")
    expect(items.length).toBe(8)
    // Oldest two trimmed; first rendered should be msg-2.
    expect(items[0].textContent).toContain("msg-2")
    expect(items[7].textContent).toContain("msg-9")
  })

  it("respects a custom previewLimit override", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
      previewLimit: 3,
    })
    unmounts.push(handle.unmount)

    for (let i = 0; i < 5; i++) bridge.fire(mkMessageEvent(`m${i}`, "@a:s", i))
    expect(handle.previewCount()).toBe(3)
  })

  it("falls back to JSON-stringified content when body is missing", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle.unmount)

    bridge.fire({
      roomId: "!r:s",
      eventType: "m.room.message",
      content: { msgtype: "m.image", url: "mxc://x/y" },
      sender: "@a:s",
      originServerTs: 1,
    })
    const item = root.querySelector(".orrdia-hybrid-chat-message")
    expect(item?.textContent).toContain("mxc://x/y")
  })

  it("unmount unsubscribes from the bridge", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountHybridSplit(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    handle.unmount()
    bridge.fire(mkMessageEvent("after unmount"))
    // pushPreviewMessage still works directly because the test seam doesn't
    // care about mount state, but the bridge handler should be detached:
    // the second mount on the same fake should see only events fired AFTER
    // it subscribed.
    const root2 = document.createElement("div")
    const handle2 = mountHybridSplit(root2, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      hostId: "@me",
    })
    unmounts.push(handle2.unmount)
    expect(handle2.previewCount()).toBe(0)
    bridge.fire(mkMessageEvent("after second mount"))
    expect(handle2.previewCount()).toBe(1)
  })
})
