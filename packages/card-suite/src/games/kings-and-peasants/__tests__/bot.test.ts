/**
 * Kings & Peasants bot tests.
 */
import { describe, expect, it } from 'vitest'
import { makeCard, Rank, Suit } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import { pickAction } from '../bot'
import { applyAction, KPState, makeInitial } from '../rules'

const ME = '@bot:x'

function card(suit: Suit, rank: Rank) {
  return makeCard(suit, rank)
}

function buildState(opts: {
  myHand: ReturnType<typeof card>[]
  topCombo?: ReturnType<typeof card>[]
  toAct?: number
  passers?: number[]
  otherHands?: ReturnType<typeof card>[][]
}): KPState {
  const others = opts.otherHands ?? [[], []]
  const players = [
    {
      id: ME,
      hand: opts.myHand,
      socialRank: 'neutral' as const,
      finishOrder: null,
    },
    ...others.map((hand, i) => ({
      id: `@p${i + 1}:x`,
      hand,
      socialRank: 'neutral' as const,
      finishOrder: null,
    })),
  ]
  return {
    players,
    toAct: opts.toAct ?? 0,
    topCombo: opts.topCombo
      ? { cards: opts.topCombo, leadBy: 1 }
      : null,
    passers: opts.passers ?? [],
    finishedCount: 0,
    roundNumber: 1,
  }
}

describe('K&P bot — leading', () => {
  it('leads with the lowest singleton', () => {
    // Hand has a 3, a 5, and a pair of Jacks. Lowest singleton is 3.
    const state = buildState({
      myHand: [
        card('clubs', '3'),
        card('hearts', '5'),
        card('spades', 'J'),
        card('diamonds', 'J'),
      ],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(1))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.cardIds.length).toBe(1)
      const c = state.players[0].hand.find((x) => x.id === action.cardIds[0])
      expect(c?.rank).toBe('3')
    }
  })

  it('still leads (does not pass) when topCombo is null even with a tough hand', () => {
    const state = buildState({
      myHand: [card('clubs', 'A'), card('spades', 'K'), card('hearts', '2')],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(2))
    expect(action.kind).toBe('play')
  })
})

describe('K&P bot — following', () => {
  it('passes when no card beats the top combo', () => {
    // Top is a single Ace. Bot has 3, 4, 5 — none can beat it (only a 2 could).
    const state = buildState({
      myHand: [card('clubs', '3'), card('hearts', '4'), card('diamonds', '5')],
      topCombo: [card('spades', 'A')],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(3))
    expect(action.kind).toBe('pass')
  })

  it('plays the lowest card that beats the top', () => {
    // Top is a single 5. Bot has 6, 7, K. Should play 6 (lowest beats 5).
    const state = buildState({
      myHand: [
        card('clubs', '6'),
        card('hearts', '7'),
        card('spades', 'K'),
      ],
      topCombo: [card('diamonds', '5')],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(4))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      const c = state.players[0].hand.find((x) => x.id === action.cardIds[0])
      expect(c?.rank).toBe('6')
    }
  })

  it('plays a 2-bomb only if no cheaper play beats the top (2 always legal)', () => {
    // Top is K. Bot has [2, 3]. Only 2 beats K (3 doesn't, K doesn't).
    // Bot plays the 2.
    const state = buildState({
      myHand: [card('clubs', '2'), card('hearts', '3')],
      topCombo: [card('spades', 'K')],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(5))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      const c = state.players[0].hand.find((x) => x.id === action.cardIds[0])
      expect(c?.rank).toBe('2')
    }
  })

  it('matches combo size: pair vs pair top', () => {
    // Top is 7-7. Bot has [8, 8, 9]. Must play 8-8 (pair).
    const state = buildState({
      myHand: [
        card('clubs', '8'),
        card('hearts', '8'),
        card('spades', '9'),
      ],
      topCombo: [card('clubs', '7'), card('hearts', '7')],
      otherHands: [[card('clubs', '4')]],
    })
    const action = pickAction(state, ME, mulberry32(6))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.cardIds.length).toBe(2)
      const cards = action.cardIds
        .map((id) => state.players[0].hand.find((x) => x.id === id))
        .filter(Boolean)
      expect(cards.every((c) => c?.rank === '8')).toBe(true)
    }
  })
})

describe('K&P bot — determinism', () => {
  it('same state produces the same action across rng seeds', () => {
    const state = buildState({
      myHand: [
        card('clubs', '6'),
        card('hearts', '7'),
        card('spades', 'K'),
      ],
      topCombo: [card('diamonds', '5')],
      otherHands: [[card('clubs', '4')]],
    })
    const a1 = pickAction(state, ME, mulberry32(1))
    const a2 = pickAction(state, ME, mulberry32(99999))
    expect(a1).toEqual(a2)
  })
})

describe('K&P bot — full all-bot game converges', () => {
  it('a 4-bot table plays the round to terminal status', () => {
    const rng = mulberry32(2024)
    let state = makeInitial(
      { playerIds: ['@bot1:x', '@bot2:x', '@bot3:x', '@bot4:x'] },
      rng,
    )
    let safety = 0
    while (
      state.players.filter((p) => p.finishOrder === null).length > 1 &&
      safety < 1000
    ) {
      const acting = state.players[state.toAct]
      const action = pickAction(state, acting.id, rng)
      state = applyAction(state, action, rng)
      safety++
    }
    expect(safety).toBeLessThan(1000) // didn't hit the safety bound
    const finishedCount = state.players.filter((p) => p.finishOrder !== null)
      .length
    // At least 3 of 4 bots must have finished (terminal: livingCount <= 1).
    expect(finishedCount).toBeGreaterThanOrEqual(3)
  })
})

describe('K&P bot — integration with rules engine', () => {
  it('plays an action that the rules engine accepts', () => {
    const rng = mulberry32(42)
    const state = makeInitial(
      { playerIds: [ME, '@p1:x', '@p2:x'] },
      rng,
    )
    // Bot is index 0, leading. Get its action and apply.
    const action = pickAction(state, ME, rng)
    const next = applyAction(state, action, rng)
    // Bot's hand should have shrunk by however many cards it played.
    const before = state.players[0].hand.length
    const after = next.players[0].hand.length
    expect(before).toBeGreaterThan(after)
  })

  it("throws when called for a player who isn't to-act", () => {
    const state = buildState({
      myHand: [card('clubs', '3')],
      toAct: 1,
      otherHands: [[card('clubs', '4')]],
    })
    expect(() => pickAction(state, ME, mulberry32(1))).toThrow()
  })
})
