import { describe, expect, it } from "vitest"
import { RULES as CHESS_RULES } from "../engine/chess/rules-doc"
import { RULES as CHECKERS_RULES } from "../engine/checkers/rules-doc"
import { totalBodyLength } from "../games/rules-doc-types"

describe("rules-doc — chess", () => {
  it("has a non-empty title", () => {
    expect(CHESS_RULES.title.length).toBeGreaterThan(0)
  })
  it("has at least 4 sections", () => {
    expect(CHESS_RULES.sections.length).toBeGreaterThanOrEqual(4)
  })
  it("every section has a heading and body", () => {
    for (const s of CHESS_RULES.sections) {
      expect(s.heading.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(20)
    }
  })
  it("body total length is substantial (> 1000 chars)", () => {
    expect(totalBodyLength(CHESS_RULES)).toBeGreaterThan(1000)
  })
  it("mentions checkmate", () => {
    const text = CHESS_RULES.sections.map((s) => s.body).join(" ")
    expect(text.toLowerCase()).toContain("checkmate")
  })
})

describe("rules-doc — checkers", () => {
  it("has a non-empty title", () => {
    expect(CHECKERS_RULES.title.length).toBeGreaterThan(0)
  })
  it("has at least 4 sections", () => {
    expect(CHECKERS_RULES.sections.length).toBeGreaterThanOrEqual(4)
  })
  it("every section has a heading and body", () => {
    for (const s of CHECKERS_RULES.sections) {
      expect(s.heading.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(20)
    }
  })
  it("body total length is substantial (> 800 chars)", () => {
    expect(totalBodyLength(CHECKERS_RULES)).toBeGreaterThan(800)
  })
  it("mentions forced captures (the rule that distinguishes checkers)", () => {
    const text = CHECKERS_RULES.sections.map((s) => s.body).join(" ")
    expect(text.toLowerCase()).toContain("capture")
  })
})
