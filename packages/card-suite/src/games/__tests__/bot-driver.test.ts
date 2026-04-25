/**
 * @vitest-environment jsdom
 *
 * Bot wiring tests — verify that each bot-driven game's renderer actually
 * fires bot actions through `onAction` when a bot seat is next-to-act,
 * and cancels pending bot timers on destroy.
 *
 * We use vitest's fake timers to make the BOT_TURN_DELAY_MS tick fire
 * synchronously, then assert on the captured actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { isBotId, PendingTimers } from '../bot-driver'
import { renderHoldem } from '../poker/ui'
import { dealHand, makeInitial as holdemMakeInitial } from '../poker/holdem'
import { renderSpeed } from '../speed/ui'
import { makeInitial as speedMakeInitial } from '../speed/rules'
import { renderKingsAndPeasants } from '../kings-and-peasants/ui'
import { makeInitial as kpMakeInitial } from '../kings-and-peasants/rules'

beforeEach(() => {
  vi.useFakeTimers()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

afterEach(() => {
  vi.useRealTimers()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('isBotId', () => {
  it('detects @bot: prefix variants', () => {
    expect(isBotId('@bot:x')).toBe(true)
    expect(isBotId('@bot2:x')).toBe(true)
    expect(isBotId('@me:x')).toBe(false)
    expect(isBotId('@alice:server')).toBe(false)
  })
})

describe('PendingTimers', () => {
  it('cancels all pending timers on cancelAll()', () => {
    const t = new PendingTimers()
    let fired = 0
    t.schedule(() => fired++, 100)
    t.schedule(() => fired++, 200)
    expect(t.size()).toBe(2)
    t.cancelAll()
    expect(t.size()).toBe(0)
    vi.advanceTimersByTime(500)
    expect(fired).toBe(0)
  })
})

describe("Hold'em bot driver", () => {
  it('schedules a bot action when next-to-act is a bot', () => {
    const root = document.createElement('div')
    const rng = mulberry32(11)
    // Bot seated first → bot is to-act on initial deal.
    const initial = holdemMakeInitial(
      { playerIds: ['@bot:x', '@me:x', '@bot2:x'] },
      rng,
    )
    const dealt = dealHand(initial, rng)
    const fired: unknown[] = []
    const handle = renderHoldem({
      root,
      initialState: dealt,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    // Advance past the bot turn delay
    vi.advanceTimersByTime(2000)
    // Bot should have fired at least one action.
    expect(fired.length).toBeGreaterThan(0)
    handle.destroy()
  })

  it('does not schedule a bot action when human is to act', () => {
    const root = document.createElement('div')
    const rng = mulberry32(11)
    // Human seated first → human is to-act on initial deal pre-flop SB.
    const initial = holdemMakeInitial(
      { playerIds: ['@me:x', '@bot:x'] },
      rng,
    )
    const dealt = dealHand(initial, rng)
    const fired: unknown[] = []
    const handle = renderHoldem({
      root,
      initialState: dealt,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    vi.advanceTimersByTime(2000)
    // No actions because we're waiting on the human.
    expect(fired.length).toBe(0)
    handle.destroy()
  })

  it('cancels pending bot timers on destroy', () => {
    const root = document.createElement('div')
    const rng = mulberry32(11)
    const initial = holdemMakeInitial(
      { playerIds: ['@bot:x', '@me:x'] },
      rng,
    )
    const dealt = dealHand(initial, rng)
    const fired: unknown[] = []
    const handle = renderHoldem({
      root,
      initialState: dealt,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    // Destroy before timer fires.
    handle.destroy()
    vi.advanceTimersByTime(2000)
    expect(fired.length).toBe(0)
  })
})

describe('Speed bot driver', () => {
  it('schedules a bot tick after mount', () => {
    const root = document.createElement('div')
    const rng = mulberry32(7)
    const initial = speedMakeInitial(
      { playerIds: ['@me:x', '@bot:x'] },
      rng,
    )
    const fired: unknown[] = []
    const handle = renderSpeed({
      root,
      initialState: initial,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    vi.advanceTimersByTime(2000)
    // The bot may have a legal play or may not depending on the deal,
    // but the timer should have either fired (with a play) or no-op'd.
    // We assert that no exception was thrown and that any fired action
    // is a 'play' or 'reveal-stuck'.
    for (const a of fired) {
      expect((a as { kind: string }).kind === 'play' || (a as { kind: string }).kind === 'reveal-stuck').toBe(true)
    }
    handle.destroy()
  })

  it('cancels pending bot tick on destroy', () => {
    const root = document.createElement('div')
    const rng = mulberry32(7)
    const initial = speedMakeInitial(
      { playerIds: ['@me:x', '@bot:x'] },
      rng,
    )
    const fired: unknown[] = []
    const handle = renderSpeed({
      root,
      initialState: initial,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    handle.destroy()
    vi.advanceTimersByTime(5000)
    expect(fired.length).toBe(0)
  })
})

describe('K&P bot driver', () => {
  it('schedules a bot action when next-to-act is a bot', () => {
    const root = document.createElement('div')
    const rng = mulberry32(13)
    // Bot seated at index 0 → leads first.
    const initial = kpMakeInitial(
      { playerIds: ['@bot:x', '@me:x', '@bot2:x'] },
      rng,
    )
    const fired: unknown[] = []
    const handle = renderKingsAndPeasants({
      root,
      initialState: initial,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    vi.advanceTimersByTime(2000)
    expect(fired.length).toBeGreaterThan(0)
    handle.destroy()
  })

  it('does not fire when human is to act', () => {
    const root = document.createElement('div')
    const rng = mulberry32(13)
    const initial = kpMakeInitial(
      { playerIds: ['@me:x', '@bot:x', '@bot2:x'] },
      rng,
    )
    const fired: unknown[] = []
    const handle = renderKingsAndPeasants({
      root,
      initialState: initial,
      variant: 'shared-controller',
      selfPlayerId: '@me:x',
      onAction: (a) => fired.push(a),
    })
    vi.advanceTimersByTime(2000)
    expect(fired.length).toBe(0)
    handle.destroy()
  })
})
