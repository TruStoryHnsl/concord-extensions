import { describe, it, expect } from "vitest"
import { parseGameDocument } from "../parser/document"
import { start, chooseOption, handleMessage, tick, evalExpr, makeInitialSession } from "../engine/interpreter"
import { makeRng } from "../engine/dice"
import { readPath, writePath, parsePath } from "../engine/state"

describe("state path ops", () => {
  it("parses dotted and indexed paths", () => {
    expect(parsePath("a.b[0].c")).toEqual([
      { kind: "key", key: "a" },
      { kind: "key", key: "b" },
      { kind: "index", index: 0 },
      { kind: "key", key: "c" },
    ])
  })

  it("reads a nested value", () => {
    const t = { suspects: [{ name: "A", alive: true }] }
    expect(readPath(t, "suspects[0].name")).toBe("A")
    expect(readPath(t, "suspects[0].alive")).toBe(true)
  })

  it("writes immutably", () => {
    const t = { a: { b: 1 } }
    const u = writePath(t, "a.b", 2)
    expect(u.a).toEqual({ b: 2 })
    expect(t.a.b).toBe(1) // original untouched
  })

  it("grows arrays on write", () => {
    const t = { xs: [] }
    const u = writePath(t, "xs[2]", "hit")
    expect((u.xs as unknown as Array<string | null>)).toEqual([null, null, "hit"])
  })
})

describe("evalExpr", () => {
  const doc = parseGameDocument(
    `===== HEADER =====\ntitle: T\nauthor: A\nversion: 1\nmode: chat\n` +
      `===== STATE =====\nx: 10\ny: hello\n` +
      `===== SCRIPT =====\nphase p:\n  say "x"\n`,
  )
  const session = { ...makeInitialSession(doc), vars: { check: 15 } }

  it("reads a state path", () => {
    expect(evalExpr({ kind: "path", path: "x" }, session)).toBe(10)
  })

  it("reads a local var", () => {
    expect(evalExpr({ kind: "path", path: "check" }, session)).toBe(15)
  })

  it("evaluates arithmetic", () => {
    expect(
      evalExpr({ kind: "binop", op: "+", left: { kind: "path", path: "x" }, right: { kind: "literal", value: 5 } }, session),
    ).toBe(15)
  })

  it("evaluates comparisons and logic", () => {
    const e = { kind: "binop", op: ">=", left: { kind: "path", path: "check" }, right: { kind: "literal", value: 15 } } as const
    expect(evalExpr(e, session)).toBe(true)
  })

  it("reads well-known clock and phase names", () => {
    expect(evalExpr({ kind: "path", path: "clock" }, session)).toBe(0)
    expect(evalExpr({ kind: "path", path: "phase" }, session)).toBeNull()
  })
})

// End-to-end: Murder at Ravensmoor mini-scenario

const MURDER = `===== HEADER =====
title: Murder at Ravensmoor
author: J. Marlowe
version: 1.0.0
mode: chat
clock_unit: turn

===== STATE =====
suspects:
  - name: Ashford
    alive: true
    clues_found: 0
  - name: Marsh
    alive: true
    clues_found: 0

===== SCRIPT =====
on start:
  say "The rain hammers the windows of Ravensmoor Manor."
  advance to phase:intro

phase intro:
  say "You are gathered in the drawing room."
  option "Examine the body":
    roll d20 + 3 as check
    if check >= 10:
      say "You notice the broken cufflink."
      inc suspects[0].clues_found
    else:
      say "Nothing catches your eye."
  option "Question the butler":
    say "The butler stammers."

phase accusation:
  say "Make your accusation."
  end with outcome:unsolved

on clock >= 3:
  advance to phase:accusation

on message contains "I accuse":
  end with outcome:accused
`

describe("interpreter — start()", () => {
  it("runs the on start block and enters phase:intro", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    const { next, events } = start(doc, rng)
    expect(next.phase).toBe("intro")
    const sayTexts = events.filter((e) => e.kind === "say").map((e) => (e as { text: string }).text)
    expect(sayTexts[0]).toContain("rain hammers")
    expect(sayTexts).toContain("You are gathered in the drawing room.")
    const presented = events.filter((e) => e.kind === "option_presented").map((e) => (e as { label: string }).label)
    expect(presented).toEqual(["Examine the body", "Question the butler"])
  })
})

describe("interpreter — chooseOption()", () => {
  it("runs the option body, produces a roll transcript, and mutates state", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(42)
    const s0 = start(doc, rng).next
    const r = chooseOption(doc, s0, "Examine the body", rng)
    const transcript = r.events.find((e) => e.kind === "roll_transcript")
    expect(transcript).toBeDefined()
    // With the specific seed the check may or may not clear 10, but in EITHER
    // branch we should have mutated state or produced a deterministic say.
    const sayTexts = r.events.filter((e) => e.kind === "say").map((e) => (e as { text: string }).text)
    expect(sayTexts.length).toBeGreaterThan(0)
    expect(r.next.clock).toBe(1) // clock_unit=turn advanced once
  })

  it("is deterministic under a fixed seed", () => {
    const doc = parseGameDocument(MURDER)
    const rA = makeRng(999)
    const rB = makeRng(999)
    const sA = start(doc, rA).next
    const sB = start(doc, rB).next
    const cA = chooseOption(doc, sA, "Examine the body", rA)
    const cB = chooseOption(doc, sB, "Examine the body", rB)
    expect(cA.events.map((e) => e.kind)).toEqual(cB.events.map((e) => e.kind))
    expect(cA.next.state).toEqual(cB.next.state)
  })

  it("errors when choosing an unknown option", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    const s0 = start(doc, rng).next
    const r = chooseOption(doc, s0, "Nope", rng)
    expect(r.events.find((e) => e.kind === "error")).toBeDefined()
  })
})

describe("interpreter — global clock handler", () => {
  it("fires `on clock >= N` when the clock crosses the threshold", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    let s = start(doc, rng).next
    s = chooseOption(doc, s, "Question the butler", rng).next
    s = chooseOption(doc, s, "Question the butler", rng).next
    const r = chooseOption(doc, s, "Question the butler", rng)
    // After the third option, clock=3 → advances to accusation → end outcome
    expect(r.events.some((e) => e.kind === "phase_entered" && e.phase === "accusation")).toBe(true)
    expect(r.next.ended).toBe(true)
    expect(r.next.outcome).toBe("unsolved")
  })
})

describe("interpreter — handleMessage()", () => {
  it("fires `on message contains` handler", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    const s0 = start(doc, rng).next
    const r = handleMessage(doc, s0, "I accuse the butler!", rng)
    expect(r.next.ended).toBe(true)
    expect(r.next.outcome).toBe("accused")
  })

  it("ignores unrelated messages", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    const s0 = start(doc, rng).next
    const r = handleMessage(doc, s0, "hello", rng)
    expect(r.next.ended).toBe(false)
  })
})

describe("interpreter — tick()", () => {
  it("advances the clock and fires any matching clock handler", () => {
    const doc = parseGameDocument(MURDER)
    const rng = makeRng(1)
    let s = start(doc, rng).next
    for (let i = 0; i < 3; i++) s = tick(doc, s, rng).next
    expect(s.clock).toBe(3)
    // The handler on clock >= 3 should have ended the game via accusation phase
    expect(s.ended).toBe(true)
  })
})
