import { describe, it, expect } from "vitest"
import { parseGameDocument, parseHeader, parseState, splitSections, ParseError } from "../parser/document"
import { parseScript, parseDiceExpr, parseExpr } from "../parser/script"

const SAMPLE = `===== HEADER =====
title: Murder at Ravensmoor
author: J. Marlowe
version: 1.0.0
min_players: 3
max_players: 6
mode: chat
tags: mystery, one-shot

===== STATE =====
suspects:
  - name: Lord Ashford
    alive: true
    clues_found: 0
  - name: Lady Marsh
    alive: true
    clues_found: 0
clock: 0
phase: intro

===== SCRIPT =====
on start:
  say "The rain hammers the windows of Ravensmoor Manor..."
  advance to phase:intro

phase intro:
  say "You are gathered in the drawing room. Who speaks first?"
  advance to phase:investigation

phase investigation:
  option "Examine the body":
    roll d20 + 3 as check
    if check >= 15:
      say "You notice the broken cufflink."
      inc suspects[0].clues_found
    else:
      say "Nothing obvious catches your eye."
  option "Question the butler":
    say "The butler stammers..."
  on clock >= 5:
    advance to phase:accusation

phase accusation:
  say "Make your accusation."
  end with outcome:unsolved
`

describe("splitSections", () => {
  it("splits a well-formed document", () => {
    const s = splitSections(SAMPLE)
    expect(s.header).toContain("title: Murder at Ravensmoor")
    expect(s.state).toContain("suspects:")
    expect(s.script).toContain("phase intro:")
  })

  it("rejects missing HEADER", () => {
    expect(() => splitSections("===== STATE =====\nfoo: 1\n===== SCRIPT =====\n")).toThrow(ParseError)
  })

  it("rejects out-of-order sections", () => {
    const src = "===== STATE =====\nfoo: 1\n===== HEADER =====\ntitle: x\nauthor: y\nversion: 1\nmode: chat\n===== SCRIPT =====\n"
    expect(() => splitSections(src)).toThrow(/out of order/)
  })

  it("rejects duplicate sections", () => {
    const src = "===== HEADER =====\na: 1\n===== HEADER =====\na: 2\n"
    expect(() => splitSections(src)).toThrow(/duplicate/)
  })
})

describe("parseHeader", () => {
  it("parses required keys + tags list + integer types", () => {
    const h = parseHeader(
      "title: T\nauthor: A\nversion: 1.0.0\nmode: chat\nmin_players: 3\ntags: a, b, c\n",
    )
    expect(h.title).toBe("T")
    expect(h.min_players).toBe(3)
    expect(h.tags).toEqual(["a", "b", "c"])
  })

  it("rejects missing required key", () => {
    expect(() => parseHeader("title: T\nauthor: A\nversion: 1\n")).toThrow(/missing required/)
  })

  it("rejects invalid mode", () => {
    expect(() => parseHeader("title: T\nauthor: A\nversion: 1\nmode: party\n")).toThrow(/mode must be/)
  })
})

describe("parseState", () => {
  it("parses nested mapping with list-of-maps", () => {
    const s = parseState(
      "suspects:\n  - name: Alice\n    alive: true\n  - name: Bob\n    alive: false\nclock: 0\n",
    )
    expect(Array.isArray(s.suspects)).toBe(true)
    expect((s.suspects as unknown as Array<{ name: string }>)[0].name).toBe("Alice")
    expect(s.clock).toBe(0)
  })

  it("parses booleans and numbers", () => {
    const s = parseState("alive: true\ndead: false\nnum: 42\n")
    expect(s.alive).toBe(true)
    expect(s.dead).toBe(false)
    expect(s.num).toBe(42)
  })
})

describe("parseScript", () => {
  it("collects phases and on start handler", () => {
    const script = parseScript(
      `on start:\n  say "hi"\n\nphase a:\n  say "in a"\n\nphase b:\n  end with outcome:done\n`,
    )
    expect(script.start?.length).toBe(1)
    expect(script.phases.has("a")).toBe(true)
    expect(script.phases.has("b")).toBe(true)
  })

  it("parses option blocks with nested if/else", () => {
    const src = `phase p:\n  option "yes":\n    if clock >= 5:\n      say "late"\n    else:\n      say "early"\n`
    const script = parseScript(src)
    const phase = script.phases.get("p")!
    expect(phase.body[0].kind).toBe("option")
    const opt = phase.body[0] as Extract<typeof phase.body[number], { kind: "option" }>
    expect(opt.body[0].kind).toBe("if")
  })

  it("collects top-level on clock handlers as globalHandlers", () => {
    const src = `on clock >= 5:\n  say "late"\n\nphase p:\n  say "hi"\n`
    const script = parseScript(src)
    expect(script.globalHandlers.length).toBe(1)
    expect(script.globalHandlers[0].event.kind).toBe("clock")
  })

  it("rejects non-multiple-of-2 indentation", () => {
    expect(() => parseScript("phase a:\n   say \"x\"\n")).toThrow(/multiples of 2/)
  })
})

describe("parseDiceExpr", () => {
  it("parses d20", () => {
    const d = parseDiceExpr("d20", 1)
    expect(d.count).toBe(1)
    expect(d.sides).toBe(20)
  })

  it("parses 2d6+3 with literal modifier", () => {
    const d = parseDiceExpr("2d6+3", 1)
    expect(d.count).toBe(2)
    expect(d.sides).toBe(6)
    expect(d.modifier).toEqual({ kind: "literal", value: 3 })
  })

  it("parses 4d6 keep highest 3", () => {
    const d = parseDiceExpr("4d6 keep highest 3", 1)
    expect(d.keep).toEqual({ mode: "highest", count: 3 })
  })

  it("parses d20 + perception (expression modifier)", () => {
    const d = parseDiceExpr("d20 + perception", 1)
    expect(d.modifier?.kind).toBe("path")
  })
})

describe("parseExpr", () => {
  it("parses a comparison with path", () => {
    const e = parseExpr("check >= 15", 1)
    expect(e.kind).toBe("binop")
  })

  it("parses logical and/or with precedence", () => {
    const e = parseExpr("a and b or c", 1)
    expect(e.kind).toBe("binop")
    if (e.kind === "binop") expect(e.op).toBe("or")
  })

  it("parses parentheses", () => {
    const e = parseExpr("(1 + 2) * 3", 1)
    expect(e.kind).toBe("binop")
  })
})

describe("parseGameDocument (integration)", () => {
  it("parses the Murder at Ravensmoor sample end-to-end", () => {
    const doc = parseGameDocument(SAMPLE)
    expect(doc.header.title).toBe("Murder at Ravensmoor")
    expect(doc.header.mode).toBe("chat")
    expect(doc.script.phases.size).toBe(3)
    expect(doc.script.start?.length).toBe(2)
    const suspects = doc.state.suspects as unknown as Array<{ name: string }>
    expect(suspects[0].name).toBe("Lord Ashford")
  })
})
