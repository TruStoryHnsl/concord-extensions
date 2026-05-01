// v0.2.0 baseline tests authored same-session as the original feature.
// v0.3.2 added cold-reader negative cases: host-transfer edge cases
// (nonexistent peer, transfer back, double-race), malformed SyncEvent
// payloads (graceful no-op contract), and queue-add dedup-on-
// (addedBy, atMs) covering the optimistic-local + remote-echo race.

import { describe, expect, it } from "vitest"
import {
  applyEvent,
  applyPartyCommand,
  makeInitialSyncState,
  projectPosition,
  SyncState,
} from "../sync"

describe("makeInitialSyncState", () => {
  it("starts idle with no item", () => {
    const s = makeInitialSyncState("@host")
    expect(s.itemId).toBeNull()
    expect(s.status).toBe("idle")
    expect(s.positionMs).toBe(0)
    expect(s.hostId).toBe("@host")
  })

  it("starts with empty queue and cursor=-1 (v0.2.0)", () => {
    const s = makeInitialSyncState("@host")
    expect(s.queue).toEqual([])
    expect(s.queueCursor).toBe(-1)
  })
})

describe("applyEvent", () => {
  const base = makeInitialSyncState("@host")

  it("does not mutate the input state", () => {
    const before: SyncState = { ...base }
    applyEvent(base, { type: "play", positionMs: 500, atMs: 1000 }, "@me")
    expect(base).toEqual(before)
  })

  it("select sets itemId, status=paused, position=0", () => {
    const s = applyEvent(base, { type: "select", itemId: "it-1", atMs: 1000 }, "@me")
    expect(s.itemId).toBe("it-1")
    expect(s.status).toBe("paused")
    expect(s.positionMs).toBe(0)
  })

  it("play sets status playing + records position+atMs", () => {
    const s = applyEvent(
      { ...base, itemId: "it-1" },
      { type: "play", positionMs: 1500, atMs: 2000 },
      "@me",
    )
    expect(s.status).toBe("playing")
    expect(s.positionMs).toBe(1500)
    expect(s.positionAtMs).toBe(2000)
  })

  it("pause flips status, holds position", () => {
    const s = applyEvent(
      { ...base, status: "playing", positionMs: 1500, positionAtMs: 1000 },
      { type: "pause", positionMs: 1700, atMs: 1200 },
      "@me",
    )
    expect(s.status).toBe("paused")
    expect(s.positionMs).toBe(1700)
  })

  it("seek updates positionMs, keeps status", () => {
    const before: SyncState = { ...base, status: "playing", positionMs: 1000, positionAtMs: 100 }
    const s = applyEvent(before, { type: "seek", positionMs: 5000, atMs: 200 }, "@me")
    expect(s.positionMs).toBe(5000)
    expect(s.status).toBe("playing")
  })

  it("host-transfer changes hostId only", () => {
    const s = applyEvent(base, { type: "host-transfer", newHostId: "@bob" }, "@me")
    expect(s.hostId).toBe("@bob")
    expect(s.status).toBe(base.status)
    expect(s.itemId).toBe(base.itemId)
  })

  it("host-transfer to a never-seen-before peer is permitted (reducer does not gatekeep membership)", () => {
    // This tests the contract: the reducer trusts the caller. Membership
    // checks are the upstream's job (the shell vetted the host_transfer
    // before forwarding it). A bogus newHostId reaches state.hostId; if
    // that's wrong, the bug is shell-side, not reducer-side.
    const s = applyEvent(base, { type: "host-transfer", newHostId: "@stranger-from-nowhere" }, "@me")
    expect(s.hostId).toBe("@stranger-from-nowhere")
  })

  it("host-transfer back to the original host restores the original hostId", () => {
    const s1 = applyEvent(base, { type: "host-transfer", newHostId: "@bob" }, "@me")
    const s2 = applyEvent(s1, { type: "host-transfer", newHostId: base.hostId }, "@me")
    expect(s2.hostId).toBe(base.hostId)
  })

  it("double host-transfer in rapid succession — last one wins", () => {
    let s = applyEvent(base, { type: "host-transfer", newHostId: "@bob" }, "@me")
    s = applyEvent(s, { type: "host-transfer", newHostId: "@carol" }, "@me")
    expect(s.hostId).toBe("@carol")
  })

  it("malformed SyncEvent (unknown type) returns state unchanged (graceful no-op)", () => {
    const s = applyEvent(
      base,
      { type: "garbage-event" } as unknown as Parameters<typeof applyEvent>[1],
      "@me",
    )
    expect(s).toBe(base)
  })

  it("malformed SyncEvent (null) returns state unchanged", () => {
    const s = applyEvent(
      base,
      null as unknown as Parameters<typeof applyEvent>[1],
      "@me",
    )
    expect(s).toBe(base)
  })

  it("is idempotent — applying same event twice yields same state", () => {
    const ev = { type: "play" as const, positionMs: 800, atMs: 100 }
    const s1 = applyEvent(base, ev, "@me")
    const s2 = applyEvent(s1, ev, "@me")
    expect(s1).toEqual(s2)
  })
})

describe("projectPosition", () => {
  it("returns positionMs unchanged when paused", () => {
    const s: SyncState = { ...makeInitialSyncState("@h"), status: "paused", positionMs: 1000, positionAtMs: 500 }
    expect(projectPosition(s, 9999)).toBe(1000)
  })

  it("advances position by elapsed wall-clock when playing", () => {
    const s: SyncState = {
      ...makeInitialSyncState("@h"),
      status: "playing",
      positionMs: 1000,
      positionAtMs: 500,
      rate: 1.0,
    }
    expect(projectPosition(s, 1500)).toBe(2000)
  })

  it("respects rate", () => {
    const s: SyncState = {
      ...makeInitialSyncState("@h"),
      status: "playing",
      positionMs: 1000,
      positionAtMs: 500,
      rate: 2.0,
    }
    expect(projectPosition(s, 1500)).toBe(3000)
  })
})

describe("applyPartyCommand (v0.2.0)", () => {
  const base = makeInitialSyncState("@host")

  it("queue-add appends to the queue with addedBy and addedAtMs", () => {
    const s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@alice", atMs: 1000 },
      "@me",
    )
    expect(s.queue).toHaveLength(1)
    expect(s.queue[0]).toEqual({ itemId: "it-1", addedBy: "@alice", addedAtMs: 1000 })
    expect(s.queueCursor).toBe(-1) // queue-add does NOT auto-advance cursor
  })

  it("queue-add dedups on (addedBy, addedAtMs, itemId) — optimistic+echo race yields one entry (v0.3.2)", () => {
    // v0.3.2 cold-reader pass changed the contract from "intentionally
    // not idempotent" to "deduped on the (addedBy, atMs, itemId) tuple"
    // because the original behavior was the source of double-queue bugs
    // when a controller's optimistic local apply got echoed back via
    // concord:state_event with the same payload.
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@a", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@a", atMs: 1 },
      "@me",
    )
    expect(s.queue).toHaveLength(1)
  })

  it("queue-add by different addedBy with same atMs lands twice (no dedup across users)", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@alice", atMs: 100 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@bob", atMs: 100 },
      "@me",
    )
    expect(s.queue).toHaveLength(2)
  })

  it("queue-add same user same item different atMs lands twice (legitimate re-queue)", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@alice", atMs: 100 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@alice", atMs: 200 },
      "@me",
    )
    expect(s.queue).toHaveLength(2)
  })

  it("party-cmd-select moves cursor + sets itemId from queue, status=paused, position=0", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "it-1", addedBy: "@a", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "it-2", addedBy: "@a", atMs: 2 },
      "@me",
    )
    s = applyPartyCommand(s, { type: "party-cmd-select", queueIndex: 1, atMs: 100 }, "@me")
    expect(s.queueCursor).toBe(1)
    expect(s.itemId).toBe("it-2")
    expect(s.status).toBe("paused")
    expect(s.positionMs).toBe(0)
  })

  it("party-cmd-select with out-of-range index leaves state unchanged", () => {
    const s = applyPartyCommand(
      base,
      { type: "party-cmd-select", queueIndex: 5, atMs: 100 },
      "@me",
    )
    expect(s).toBe(base)
  })

  it("party-cmd-play sets status=playing", () => {
    const s = applyPartyCommand(base, { type: "party-cmd-play", atMs: 50 }, "@me")
    expect(s.status).toBe("playing")
    expect(s.positionAtMs).toBe(50)
  })

  it("party-cmd-pause sets status=paused", () => {
    const playing: SyncState = { ...base, status: "playing", positionAtMs: 10 }
    const s = applyPartyCommand(playing, { type: "party-cmd-pause", atMs: 75 }, "@me")
    expect(s.status).toBe("paused")
    expect(s.positionAtMs).toBe(75)
  })

  it("party-cmd-next advances cursor when in range", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "a", addedBy: "@x", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "b", addedBy: "@x", atMs: 2 },
      "@me",
    )
    s = applyPartyCommand(s, { type: "party-cmd-select", queueIndex: 0, atMs: 3 }, "@me")
    s = applyPartyCommand(s, { type: "party-cmd-next", atMs: 4 }, "@me")
    expect(s.queueCursor).toBe(1)
    expect(s.itemId).toBe("b")
  })

  it("party-cmd-next is a no-op past end of queue", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "a", addedBy: "@x", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(s, { type: "party-cmd-select", queueIndex: 0, atMs: 2 }, "@me")
    const before = s
    s = applyPartyCommand(s, { type: "party-cmd-next", atMs: 3 }, "@me")
    expect(s).toBe(before)
  })

  it("party-cmd-prev moves cursor backward when >= 0", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "a", addedBy: "@x", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(
      s,
      { type: "party-cmd-queue-add", itemId: "b", addedBy: "@x", atMs: 2 },
      "@me",
    )
    s = applyPartyCommand(s, { type: "party-cmd-select", queueIndex: 1, atMs: 3 }, "@me")
    s = applyPartyCommand(s, { type: "party-cmd-prev", atMs: 4 }, "@me")
    expect(s.queueCursor).toBe(0)
    expect(s.itemId).toBe("a")
  })

  it("party-cmd-prev is a no-op below 0", () => {
    let s = applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "a", addedBy: "@x", atMs: 1 },
      "@me",
    )
    s = applyPartyCommand(s, { type: "party-cmd-select", queueIndex: 0, atMs: 2 }, "@me")
    const before = s
    s = applyPartyCommand(s, { type: "party-cmd-prev", atMs: 3 }, "@me")
    expect(s).toBe(before)
  })

  it("does not mutate the input state", () => {
    const before: SyncState = { ...base, queue: [...base.queue] }
    applyPartyCommand(
      base,
      { type: "party-cmd-queue-add", itemId: "x", addedBy: "@y", atMs: 1 },
      "@me",
    )
    expect(base).toEqual(before)
  })
})
