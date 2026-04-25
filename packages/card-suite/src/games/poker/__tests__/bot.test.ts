/**
 * Hold'em bot tests.
 *
 * These tests construct synthetic HoldemStates directly so we can probe
 * the bot under specific conditions (premium pre-flop hand, trash hand,
 * post-flop made hands, etc.) without dealing through the full state
 * machine and getting random hole cards.
 */
import { describe, expect, it } from 'vitest'
import { makeCard, Rank, Suit } from '../../../engine/card'
import { standardDeck } from '../../../engine/deck'
import { mulberry32 } from '../../../engine/rng'
import { pickAction, preflopStrength, scoreHandForBot } from '../bot'
import { HoldemState, PlayerSeat } from '../holdem'

const ME = '@bot:x'
const HUMAN = '@me:x'

function card(suit: Suit, rank: Rank) {
  return makeCard(suit, rank)
}

/** Construct a HoldemState fixture for bot scenarios. */
function buildState(opts: {
  myHole: [ReturnType<typeof card>, ReturnType<typeof card>]
  oppHole?: [ReturnType<typeof card>, ReturnType<typeof card>]
  community?: ReturnType<typeof card>[]
  phase: HoldemState['phase']
  /** Money the human has put in this street (defines current bet). */
  currentBet?: number
  /** Money the bot has put in this street. */
  myStreetBet?: number
  /** Pot total. */
  pot?: number
  /** Min raise. */
  minRaise?: number
  /** Stack remaining for both players. */
  stack?: number
}): HoldemState {
  const stack = opts.stack ?? 1000
  const currentBet = opts.currentBet ?? 0
  const myStreetBet = opts.myStreetBet ?? 0
  const oppStreetBet = currentBet
  const seatBot: PlayerSeat = {
    id: ME,
    stack,
    hole: opts.myHole,
    committed: myStreetBet,
    streetBet: myStreetBet,
    folded: false,
    allIn: false,
  }
  const seatHuman: PlayerSeat = {
    id: HUMAN,
    stack,
    hole: opts.oppHole ?? [card('diamonds', '4'), card('clubs', '7')],
    committed: oppStreetBet,
    streetBet: oppStreetBet,
    folded: false,
    allIn: false,
  }
  return {
    seats: [seatBot, seatHuman],
    community: opts.community ?? [],
    deck: standardDeck(),
    phase: opts.phase,
    button: 0,
    toAct: 0, // bot to act
    smallBlind: 5,
    bigBlind: 10,
    currentBet,
    minRaise: opts.minRaise ?? 10,
    pot: opts.pot ?? currentBet + myStreetBet,
    handNumber: 1,
    lastRaiser: -1,
    actedThisRound: [],
    winners: [],
  }
}

describe('Hold\'em bot — preflopStrength', () => {
  it('classifies AA / KK / QQ / JJ as premium (4)', () => {
    expect(preflopStrength([card('spades', 'A'), card('hearts', 'A')])).toBe(4)
    expect(preflopStrength([card('spades', 'K'), card('hearts', 'K')])).toBe(4)
    expect(preflopStrength([card('spades', 'Q'), card('hearts', 'Q')])).toBe(4)
    expect(preflopStrength([card('spades', 'J'), card('hearts', 'J')])).toBe(4)
  })

  it('AK = strong (3), 22 = playable (2), 7-2 offsuit = trash (0)', () => {
    expect(
      preflopStrength([card('spades', 'A'), card('hearts', 'K')]),
    ).toBe(3)
    expect(
      preflopStrength([card('spades', '2'), card('hearts', '2')]),
    ).toBe(2)
    expect(
      preflopStrength([card('clubs', '7'), card('diamonds', '2')]),
    ).toBe(0)
  })
})

describe('Hold\'em bot — pre-flop fold case', () => {
  it("folds 7-2 offsuit when facing a raise", () => {
    // Bot: 7-2 offsuit. Human just raised to 60. Bot's streetBet = 10 (BB).
    // Owed = 50, pot = 65. Pot odds ~ 0.43 — way above the 0.25 threshold
    // for marginal hands and the bucket is 0 anyway.
    const state = buildState({
      myHole: [card('clubs', '7'), card('diamonds', '2')],
      phase: 'pre-flop',
      currentBet: 60,
      myStreetBet: 10,
      pot: 75,
      minRaise: 50,
    })
    const action = pickAction(state, ME, mulberry32(1))
    expect(action.kind).toBe('fold')
  })

  it('folds 9-3 offsuit faced with a raise (trash)', () => {
    const state = buildState({
      myHole: [card('hearts', '9'), card('clubs', '3')],
      phase: 'pre-flop',
      currentBet: 80,
      myStreetBet: 10,
      pot: 95,
      minRaise: 70,
    })
    const action = pickAction(state, ME, mulberry32(7))
    expect(action.kind).toBe('fold')
  })
})

describe('Hold\'em bot — pre-flop call/raise case', () => {
  it('raises with KK pre-flop facing a bet', () => {
    const state = buildState({
      myHole: [card('spades', 'K'), card('hearts', 'K')],
      phase: 'pre-flop',
      currentBet: 30,
      myStreetBet: 10,
      pot: 45,
      minRaise: 20,
    })
    const action = pickAction(state, ME, mulberry32(2))
    // Premium pair → raise
    expect(action.kind).toBe('raise')
  })

  it('raises with AA pre-flop unraised pot too', () => {
    // SB faces BB call/check; default policy: AA premium → raise.
    const state = buildState({
      myHole: [card('spades', 'A'), card('hearts', 'A')],
      phase: 'pre-flop',
      currentBet: 10,
      myStreetBet: 5,
      pot: 15,
      minRaise: 10,
    })
    const action = pickAction(state, ME, mulberry32(3))
    expect(action.kind).toBe('raise')
  })
})

describe('Hold\'em bot — post-flop made hand', () => {
  it('raises or calls with two-pair on the flop', () => {
    // Bot AsAh, board has Ad-Kc-7s. That's three-of-a-kind aces.
    // Strong made hand → raise (most of the time) or call.
    const state = buildState({
      myHole: [card('spades', 'A'), card('hearts', 'A')],
      community: [
        card('diamonds', 'A'),
        card('clubs', 'K'),
        card('spades', '7'),
      ],
      phase: 'flop',
      currentBet: 30,
      myStreetBet: 0,
      pot: 60,
      minRaise: 30,
    })
    const action = pickAction(state, ME, mulberry32(5))
    expect(['raise', 'call']).toContain(action.kind)
  })

  it('checks with high-card / no draw when free', () => {
    // 9-3 offsuit on a J-7-2 rainbow. No pair. Free check.
    const state = buildState({
      myHole: [card('hearts', '9'), card('clubs', '3')],
      community: [
        card('spades', 'J'),
        card('diamonds', '7'),
        card('hearts', '2'),
      ],
      phase: 'flop',
      currentBet: 0,
      myStreetBet: 0,
      pot: 20,
      minRaise: 10,
    })
    const action = pickAction(state, ME, mulberry32(8))
    expect(action.kind).toBe('check')
  })

  it('folds high-card to a big bet (no pair, expensive call)', () => {
    // 9-3 offsuit on J-7-2. Human bets 200 into pot of 30. Pot odds awful.
    const state = buildState({
      myHole: [card('hearts', '9'), card('clubs', '3')],
      community: [
        card('spades', 'J'),
        card('diamonds', '7'),
        card('hearts', '2'),
      ],
      phase: 'flop',
      currentBet: 200,
      myStreetBet: 0,
      pot: 230,
      minRaise: 200,
    })
    const action = pickAction(state, ME, mulberry32(11))
    expect(action.kind).toBe('fold')
  })
})

describe('Hold\'em bot — pot odds tilt borderline calls', () => {
  it('calls with a pair if the call is cheap relative to the pot', () => {
    // Bot has 9-9 (pair on a J-7-2 board → just a pair of 9s underpair).
    // Human bets 10 into pot of 100 — pot odds 10/110 ~ 0.09. Easy call.
    const state = buildState({
      myHole: [card('hearts', '9'), card('clubs', '9')],
      community: [
        card('spades', 'J'),
        card('diamonds', '7'),
        card('hearts', '2'),
      ],
      phase: 'flop',
      currentBet: 10,
      myStreetBet: 0,
      pot: 110,
      minRaise: 10,
    })
    const action = pickAction(state, ME, mulberry32(13))
    // Pair + cheap call → call (or raise but raise should be rare).
    expect(['call', 'raise']).toContain(action.kind)
  })
})

describe('Hold\'em bot — determinism', () => {
  it('same (state, playerId, rng-seed) produces the same action', () => {
    // Construct a borderline pre-flop state where rng influences decision
    // (strength = 2 with raise option, 1-in-4 odds of raising).
    const state = buildState({
      myHole: [card('spades', '8'), card('hearts', '8')],
      phase: 'pre-flop',
      currentBet: 10,
      myStreetBet: 5,
      pot: 15,
      minRaise: 10,
    })
    const a1 = pickAction(state, ME, mulberry32(99))
    const a2 = pickAction(state, ME, mulberry32(99))
    expect(a1).toEqual(a2)
  })

  it('different rng seeds CAN produce different borderline actions', () => {
    // Run a borderline scenario across many seeds and confirm at least one
    // varies — proves the rng is actually being consulted.
    const state = buildState({
      myHole: [card('spades', '8'), card('hearts', '8')],
      phase: 'pre-flop',
      currentBet: 10,
      myStreetBet: 5,
      pot: 15,
      minRaise: 10,
    })
    const kinds = new Set<string>()
    for (let i = 0; i < 50; i++) {
      kinds.add(pickAction(state, ME, mulberry32(i)).kind)
    }
    // We expect at least 2 distinct outcomes across 50 seeds for a 1-in-4
    // randomization on an 8s playable hand.
    expect(kinds.size).toBeGreaterThanOrEqual(2)
  })
})

describe('Hold\'em bot — passive when free', () => {
  it("checks the BB option when nothing is owed", () => {
    // Bot is BB, human (SB) called rather than raising. currentBet=10,
    // bot's streetBet=10 → owed=0, free check.
    const state = buildState({
      myHole: [card('clubs', '7'), card('diamonds', '2')],
      phase: 'pre-flop',
      currentBet: 10,
      myStreetBet: 10,
      pot: 20,
      minRaise: 10,
    })
    const action = pickAction(state, ME, mulberry32(4))
    expect(action.kind).toBe('check')
  })
})

describe("Hold'em bot — scoreHandForBot smoke test", () => {
  it('returns null when fewer than 5 cards visible', () => {
    expect(
      scoreHandForBot([card('spades', 'A'), card('hearts', 'A')], []),
    ).toBeNull()
  })

  it('detects a pair on the flop', () => {
    const score = scoreHandForBot(
      [card('spades', 'A'), card('hearts', 'A')],
      [card('diamonds', '4'), card('clubs', '7'), card('spades', 'K')],
    )
    expect(score?.category).toBe('pair')
  })

  it('detects three-of-a-kind on the flop', () => {
    const score = scoreHandForBot(
      [card('spades', 'A'), card('hearts', 'A')],
      [card('diamonds', 'A'), card('clubs', '7'), card('spades', 'K')],
    )
    expect(score?.category).toBe('three-of-a-kind')
  })
})
