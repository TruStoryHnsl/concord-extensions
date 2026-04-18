import { describe, it, expect } from "vitest"
import { assignColors, colorOf } from "../session/pairing"
import { makeInitialSelector, pickGame, toggleBot, setTier, isReady } from "../session/game-selector"

describe("pairing: assignColors", () => {
  it("first two non-observer participants take white then black", () => {
    const a = assignColors([
      { id: "@a:x", seat: "host" },
      { id: "@b:x", seat: "participant" },
      { id: "@c:x", seat: "participant" },
    ])
    expect(a.white).toBe("@a:x")
    expect(a.black).toBe("@b:x")
    expect(a.observers).toEqual(["@c:x"])
  })

  it("observers are never assigned a color", () => {
    const a = assignColors([
      { id: "@a:x", seat: "observer" },
      { id: "@b:x", seat: "participant" },
      { id: "@c:x", seat: "participant" },
    ])
    expect(a.white).toBe("@b:x")
    expect(a.black).toBe("@c:x")
    expect(a.observers).toContain("@a:x")
  })

  it("colorOf returns white / black / null correctly", () => {
    const a = assignColors([
      { id: "@a:x", seat: "host" },
      { id: "@b:x", seat: "participant" },
    ])
    expect(colorOf(a, "@a:x")).toBe("white")
    expect(colorOf(a, "@b:x")).toBe("black")
    expect(colorOf(a, "@nobody:x")).toBeNull()
  })
})

describe("game-selector", () => {
  it("starts unready", () => {
    expect(isReady(makeInitialSelector())).toBe(false)
  })
  it("picking a game marks it ready", () => {
    expect(isReady(pickGame(makeInitialSelector(), "chess"))).toBe(true)
  })
  it("toggle bot flips vsBot", () => {
    const s = toggleBot(makeInitialSelector())
    expect(s.vsBot).toBe(true)
  })
  it("setTier updates botTier immutably", () => {
    const a = makeInitialSelector()
    const b = setTier(a, "expert")
    expect(b.botTier).toBe("expert")
    expect(a.botTier).toBe("casual")
  })
})
