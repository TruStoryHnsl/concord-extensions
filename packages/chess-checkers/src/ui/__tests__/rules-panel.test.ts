// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  mountRulesPanel,
  readCollapsedFlag,
  writeCollapsedFlag,
} from "../rules-panel"
import { RULES as CHESS_RULES } from "../../engine/chess/rules-doc"
import { RULES as CHECKERS_RULES } from "../../engine/checkers/rules-doc"

describe("rules-panel — localStorage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("defaults to expanded (false) when key is absent", () => {
    expect(readCollapsedFlag("chess")).toBe(false)
  })

  it("round-trips collapsed state", () => {
    writeCollapsedFlag("chess", true)
    expect(readCollapsedFlag("chess")).toBe(true)
    writeCollapsedFlag("chess", false)
    expect(readCollapsedFlag("chess")).toBe(false)
  })

  it("uses the chessCheckers prefix and is keyed per game", () => {
    writeCollapsedFlag("chess", true)
    expect(localStorage.getItem("chessCheckers.rulesCollapsed.chess")).toBe("1")
    expect(readCollapsedFlag("checkers")).toBe(false)
  })
})

describe("rules-panel — mount", () => {
  let root: HTMLElement
  beforeEach(() => {
    localStorage.clear()
    root = document.createElement("div")
    document.body.appendChild(root)
  })
  afterEach(() => {
    root.remove()
  })

  it("renders the panel and the game-area column", () => {
    const handle = mountRulesPanel(root, CHESS_RULES, "chess")
    expect(handle.gameArea.dataset.role).toBe("game-area")
    expect(handle.rulesPanel.dataset.role).toBe("rules-panel")
    expect(handle.rulesPanel.dataset.gameId).toBe("chess")
  })

  it("renders every section heading + body in the DOM", () => {
    mountRulesPanel(root, CHESS_RULES, "chess")
    const text = root.textContent || ""
    for (const s of CHESS_RULES.sections) {
      expect(text).toContain(s.heading)
      // First sentence of body is enough — full body lengths are huge.
      expect(text).toContain(s.body.slice(0, 40))
    }
  })

  it("starts expanded by default and toggles on click", () => {
    const handle = mountRulesPanel(root, CHECKERS_RULES, "checkers")
    expect(handle.rulesPanel.dataset.collapsed).toBe("false")
    const toggle = handle.rulesPanel.querySelector(
      '[data-role="rules-toggle"]',
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    toggle.click()
    expect(handle.rulesPanel.dataset.collapsed).toBe("true")
    expect(localStorage.getItem("chessCheckers.rulesCollapsed.checkers")).toBe("1")
    toggle.click()
    expect(handle.rulesPanel.dataset.collapsed).toBe("false")
    expect(localStorage.getItem("chessCheckers.rulesCollapsed.checkers")).toBeNull()
  })

  it("re-mounts collapsed when a previously-collapsed game is reopened", () => {
    writeCollapsedFlag("chess", true)
    const handle = mountRulesPanel(root, CHESS_RULES, "chess")
    expect(handle.rulesPanel.dataset.collapsed).toBe("true")
  })

  it("destroy() detaches the wrapper from the DOM", () => {
    const handle = mountRulesPanel(root, CHESS_RULES, "chess")
    expect(root.querySelector('[data-role="rules-wrapper"]')).toBeTruthy()
    handle.destroy()
    expect(root.querySelector('[data-role="rules-wrapper"]')).toBeFalsy()
  })
})
