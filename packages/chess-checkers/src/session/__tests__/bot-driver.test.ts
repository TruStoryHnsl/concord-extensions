import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BOT_TURN_DELAY_MS, isBotId, PendingTimers } from "../bot-driver"

describe("isBotId", () => {
  it("identifies @bot-prefixed ids", () => {
    expect(isBotId("@bot:dev")).toBe(true)
    expect(isBotId("@bot2:dev")).toBe(true)
  })
  it("rejects human ids", () => {
    expect(isBotId("@alice:matrix")).toBe(false)
    expect(isBotId("@dev:local")).toBe(false)
    expect(isBotId("")).toBe(false)
  })
})

describe("BOT_TURN_DELAY_MS", () => {
  it("is a positive number with a noticeable delay", () => {
    expect(BOT_TURN_DELAY_MS).toBeGreaterThanOrEqual(300)
  })
})

describe("PendingTimers", () => {
  let timers: PendingTimers
  beforeEach(() => {
    vi.useFakeTimers()
    timers = new PendingTimers()
  })
  afterEach(() => {
    timers.cancelAll()
    vi.useRealTimers()
  })

  it("schedule() runs the callback after the delay", () => {
    const fn = vi.fn()
    timers.schedule(fn, 500)
    expect(timers.size()).toBe(1)
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(fn).toHaveBeenCalledOnce()
    expect(timers.size()).toBe(0)
  })

  it("cancel returned from schedule() prevents fire", () => {
    const fn = vi.fn()
    const cancel = timers.schedule(fn, 500)
    cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
    expect(timers.size()).toBe(0)
  })

  it("cancelAll() clears every pending handle", () => {
    timers.schedule(() => {}, 100)
    timers.schedule(() => {}, 200)
    expect(timers.size()).toBe(2)
    timers.cancelAll()
    expect(timers.size()).toBe(0)
  })

  it("swallows errors in scheduled callbacks (does not throw)", () => {
    timers.schedule(() => {
      throw new Error("oops")
    }, 100)
    expect(() => vi.advanceTimersByTime(101)).not.toThrow()
    expect(timers.size()).toBe(0)
  })
})
