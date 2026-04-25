// @vitest-environment jsdom

/**
 * End-to-end integration test for the chess-checkers picker + game mount.
 *
 * Uses an in-memory ShellBridge fed an init payload synthetically. Drives
 * a click on the chess tile, then a click on a piece + a target, then
 * lets the bot timer fire to confirm the bot replies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountSuite } from "../index"
import { ShellBridge } from "../shell/bridge"
import { CONCORD_SDK_VERSION } from "../shell/sdk-types"
import { BOT_TURN_DELAY_MS } from "../session/bot-driver"

function fakeInit(win: Window): void {
  win.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "concord:init",
        version: CONCORD_SDK_VERSION,
        payload: {
          sessionId: "test",
          extensionId: "com.concord.chess-checkers",
          mode: "shared_admin_input",
          participantId: "@me:test",
          seat: "participant",
          surfaces: [],
        },
      },
    }),
  )
}

describe("mountSuite — picker", () => {
  let root: HTMLElement
  let bridge: ShellBridge

  beforeEach(() => {
    localStorage.clear()
    root = document.createElement("div")
    root.id = "chess-checkers-root"
    document.body.appendChild(root)
    bridge = new ShellBridge(window)
  })

  afterEach(() => {
    bridge.destroy()
    root.remove()
  })

  it("renders the picker with chess + checkers tiles", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    const tiles = root.querySelectorAll('button[data-game-id]')
    expect(tiles.length).toBe(2)
    const ids = Array.from(tiles).map((t) => t.getAttribute("data-game-id"))
    expect(ids).toContain("chess")
    expect(ids).toContain("checkers")
  })

  it("picker shows the always-rendered Mode + Seat dropdowns", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    expect(root.querySelector('[data-role="session-mode"]')).toBeTruthy()
    expect(root.querySelector('[data-role="session-seat"]')).toBeTruthy()
    expect(root.querySelector('[data-role="bot-toggle"]')).toBeTruthy()
    expect(root.querySelector('[data-role="tier-select"]')).toBeTruthy()
  })

  it("each tile has a 'vs <tier> bot' subtitle", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    const subtitles = Array.from(
      root.querySelectorAll('[data-role="tile-subtitle"]'),
    )
    expect(subtitles.length).toBe(2)
    for (const s of subtitles) {
      expect(s.textContent).toMatch(/vs (beginner|casual|advanced|expert) bot/)
    }
  })

  it("clicking a tile mounts the rules panel + board", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    const chessTile = root.querySelector(
      'button[data-game-id="chess"]',
    ) as HTMLButtonElement
    chessTile.click()
    expect(root.querySelector('[data-role="rules-panel"]')).toBeTruthy()
    expect(root.querySelector('[data-role="game-mount"]')).toBeTruthy()
    expect(root.querySelector('[data-role="board"]')).toBeTruthy()
    expect(root.querySelector('[data-role="back"]')).toBeTruthy()
  })

  it("rules panel shows the chess title", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    ;(
      root.querySelector('button[data-game-id="chess"]') as HTMLButtonElement
    ).click()
    const title = root.querySelector('[data-role="rules-title"]')
    expect(title?.textContent).toContain("Chess")
  })

  it("back button returns to picker", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    ;(
      root.querySelector('button[data-game-id="chess"]') as HTMLButtonElement
    ).click()
    ;(root.querySelector('[data-role="back"]') as HTMLButtonElement).click()
    expect(root.querySelector('[data-role="picker-grid"]')).toBeTruthy()
  })
})

describe("mountSuite — bot loop fires after a human move", () => {
  let root: HTMLElement
  let bridge: ShellBridge

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    root = document.createElement("div")
    root.id = "chess-checkers-root"
    document.body.appendChild(root)
    bridge = new ShellBridge(window)
  })

  afterEach(() => {
    bridge.destroy()
    root.remove()
    vi.useRealTimers()
  })

  it("after human plays e2-e4, bot replies within BOT_TURN_DELAY_MS+slack", async () => {
    fakeInit(window)
    await mountSuite(root, bridge)
    ;(
      root.querySelector('button[data-game-id="chess"]') as HTMLButtonElement
    ).click()

    // Assert: status banner says it's white's turn
    const status = (): string =>
      root.querySelector('[data-role="status"]')?.textContent || ""
    expect(status().toLowerCase()).toContain("white")

    // Click e2 (file 4, rank 1).
    const board = root.querySelector('[data-role="board"]') as SVGSVGElement
    const e2 = board.querySelector(
      'rect[data-file="4"][data-rank="1"]',
    ) as SVGRectElement
    expect(e2).toBeTruthy()
    e2.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    // After the first click, status still says white's turn (selection,
    // not a move yet) and a highlight should be present on board.
    // Click e4 (file 4, rank 3).
    const board2 = root.querySelector('[data-role="board"]') as SVGSVGElement
    const e4 = board2.querySelector(
      'rect[data-file="4"][data-rank="3"]',
    ) as SVGRectElement
    expect(e4).toBeTruthy()
    e4.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    // Now it's black's turn (bot). Status should reflect that.
    expect(status().toLowerCase()).toContain("black")

    // Advance timers; bot should reply.
    vi.advanceTimersByTime(BOT_TURN_DELAY_MS + 200)

    // After bot move, status flips back to white.
    // Note: the bot's move is synchronous after the timer fires, but the
    // engine takes some real CPU time. We're using fake timers here, so
    // chooseMove runs in the test thread synchronously when the timer
    // callback fires. That happens during advanceTimersByTime above.
    expect(status().toLowerCase()).toContain("white")
  }, 30000)
})
