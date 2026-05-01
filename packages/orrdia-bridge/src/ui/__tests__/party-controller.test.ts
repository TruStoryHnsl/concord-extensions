// v0.2.0 baseline + v0.3.2 cold-reader negative cases:
//  - queue-add deduplication on optimistic-local + remote-echo race
//  - malformed PartyCommand state_events (graceful no-op)
//  - state_events with the right eventType but wrong content shape

import { afterEach, describe, expect, it, vi } from "vitest"
import { mountPartyController, PARTY_COMMAND_EVENT_TYPE } from "../party-controller"
import { AuthSession } from "../../engine/types"

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

type StateEventHandler = (p: {
  eventType: string
  content: Record<string, unknown>
  roomId: string
  sender: string
  originServerTs: number
}) => void

interface FakeBridge {
  sendStateEvent: ReturnType<typeof vi.fn>
  onStateEvent: (fn: StateEventHandler) => () => void
  fireStateEvent: (payload: { eventType: string; content: Record<string, unknown> }) => void
}

function makeFakeBridge(): FakeBridge {
  const handlers: StateEventHandler[] = []
  const fb: FakeBridge = {
    sendStateEvent: vi.fn(),
    onStateEvent: (fn) => {
      handlers.push(fn)
      return () => {
        const i = handlers.indexOf(fn)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
    fireStateEvent: ({ eventType, content }) => {
      for (const h of handlers) {
        h({ eventType, content, roomId: "!r:s", sender: "@a:s", originServerTs: 1 })
      }
    },
  }
  return fb
}

describe("mountPartyController (v0.2.0)", () => {
  let unmounts: Array<() => void> = []

  afterEach(() => {
    while (unmounts.length) unmounts.pop()?.()
  })

  it("renders the four transport buttons + 'Nothing queued' on first mount", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // bridge is duck-typed; cast to ShellBridge avoids importing the class for the test
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 100,
      onError: () => {},
    })
    unmounts.push(handle.unmount)

    const playBtn = root.querySelector('[data-party-cmd="play"]')
    const pauseBtn = root.querySelector('[data-party-cmd="pause"]')
    const prevBtn = root.querySelector('[data-party-cmd="prev"]')
    const nextBtn = root.querySelector('[data-party-cmd="next"]')
    expect(playBtn).toBeTruthy()
    expect(pauseBtn).toBeTruthy()
    expect(prevBtn).toBeTruthy()
    expect(nextBtn).toBeTruthy()

    const now = root.querySelector(".orrdia-party-now")
    expect(now?.textContent).toMatch(/Nothing queued/)
  })

  it("clicking Play emits party-cmd-play via bridge.sendStateEvent", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 250,
    })
    unmounts.push(handle.unmount)

    const playBtn = root.querySelector('[data-party-cmd="play"]') as HTMLButtonElement
    playBtn.click()

    expect(bridge.sendStateEvent).toHaveBeenCalledTimes(1)
    const call = bridge.sendStateEvent.mock.calls[0][0] as {
      eventType: string
      content: { type: string; atMs: number }
    }
    expect(call.eventType).toBe(PARTY_COMMAND_EVENT_TYPE)
    expect(call.content.type).toBe("party-cmd-play")
    expect(call.content.atMs).toBe(250)
  })

  it("clicking Next + Prev emits the corresponding commands", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    const nextBtn = root.querySelector('[data-party-cmd="next"]') as HTMLButtonElement
    nextBtn.click()
    const prevBtn = root.querySelector('[data-party-cmd="prev"]') as HTMLButtonElement
    prevBtn.click()

    const types = bridge.sendStateEvent.mock.calls.map(
      (c) => (c[0] as { content: { type: string } }).content.type,
    )
    expect(types).toEqual(["party-cmd-next", "party-cmd-prev"])
  })

  it("incoming concord:state_event with PARTY_COMMAND_EVENT_TYPE updates local now-playing strip", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    bridge.fireStateEvent({
      eventType: PARTY_COMMAND_EVENT_TYPE,
      content: {
        type: "party-cmd-queue-add",
        itemId: "it-1",
        addedBy: "@alice",
        atMs: 1,
      },
    })
    bridge.fireStateEvent({
      eventType: PARTY_COMMAND_EVENT_TYPE,
      content: {
        type: "party-cmd-select",
        queueIndex: 0,
        atMs: 2,
      },
    })

    const now = root.querySelector(".orrdia-party-now")
    expect(now?.textContent).toMatch(/Now playing.*it-1/)
    expect(handle.getState().itemId).toBe("it-1")
  })

  it("ignores unrelated state_events (different eventType)", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    bridge.fireStateEvent({
      eventType: "m.room.message",
      content: { body: "hello" },
    })
    expect(handle.getState().itemId).toBeNull()
  })

  it("queue-add optimistic-local + remote-echo with same (addedBy, atMs) lands ONCE in state (v0.3.2 dedup)", () => {
    // Reproduce the race that the v0.2.0 controller documented as
    // "accepts double-entry on first round-trip". v0.3.2 added dedup in
    // applyPartyCommand on (addedBy, addedAtMs, itemId) so the optimistic
    // local apply + the bridge.onStateEvent echo (same payload) collapse
    // to a single queue entry. This is the test that locks that contract
    // in.
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 5000,
    })
    unmounts.push(handle.unmount)

    // Step 1: simulate the controller emitting an optimistic queue-add
    // by firing the same payload through fireStateEvent (the controller
    // already applies optimistically inside sendCommand). We simulate the
    // round-trip by firing a second copy of the *exact same payload* to
    // model the shell's echo back to the same iframe.
    const payload = {
      type: "party-cmd-queue-add",
      itemId: "it-1",
      addedBy: "@me",
      atMs: 5000,
    }
    // Optimistic apply
    bridge.fireStateEvent({ eventType: PARTY_COMMAND_EVENT_TYPE, content: payload })
    // Echo (same payload, same atMs, same addedBy)
    bridge.fireStateEvent({ eventType: PARTY_COMMAND_EVENT_TYPE, content: payload })

    expect(handle.getState().queue).toHaveLength(1)
  })

  it("queue-add from two different users with same atMs lands twice (no cross-user dedup)", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    bridge.fireStateEvent({
      eventType: PARTY_COMMAND_EVENT_TYPE,
      content: { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@alice", atMs: 1000 },
    })
    bridge.fireStateEvent({
      eventType: PARTY_COMMAND_EVENT_TYPE,
      content: { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@bob", atMs: 1000 },
    })
    expect(handle.getState().queue).toHaveLength(2)
  })

  it("malformed state_event content (no `type` field) is silently ignored, no exception", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    expect(() => {
      bridge.fireStateEvent({
        eventType: PARTY_COMMAND_EVENT_TYPE,
        content: { not: "a-command" },
      })
    }).not.toThrow()
    expect(handle.getState().queue).toHaveLength(0)
  })

  it("state_event with PARTY_COMMAND_EVENT_TYPE but unknown command type is graceful no-op", () => {
    const root = document.createElement("div")
    const bridge = makeFakeBridge()
    const handle = mountPartyController(root, {
      session,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bridge: bridge as any,
      participantId: "@me",
      now: () => 1,
    })
    unmounts.push(handle.unmount)

    expect(() => {
      bridge.fireStateEvent({
        eventType: PARTY_COMMAND_EVENT_TYPE,
        content: { type: "party-cmd-future-not-yet-shipped", atMs: 1 },
      })
    }).not.toThrow()
    // Queue + state untouched.
    expect(handle.getState().queue).toHaveLength(0)
    expect(handle.getState().itemId).toBeNull()
  })
})
