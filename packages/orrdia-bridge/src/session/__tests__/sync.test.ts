import { describe, expect, it } from "vitest"
import {
  applyEvent,
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
