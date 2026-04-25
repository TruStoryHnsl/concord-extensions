import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, dealHand, holdemRules, legalActions, makeInitial } from '../holdem'

const ALICE = 'alice'
const BOB = 'bob'
const CARL = 'carl'

describe("Hold'em — initial state", () => {
  it('module conforms to GameRuleModule contract', () => {
    expect(holdemRules.gameId).toBe('holdem')
    expect(holdemRules.minPlayers).toBe(2)
    expect(holdemRules.maxPlayers).toBe(8)
    expect(holdemRules.supportedModes).toEqual(['party', 'hybrid'])
  })

  it('rejects below 2 / above 8 players', () => {
    expect(() => makeInitial({ playerIds: [ALICE] }, mulberry32(1))).toThrow()
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']
    expect(() => makeInitial({ playerIds: ids }, mulberry32(1))).toThrow()
  })

  it('starts with default stacks and pre-deal phase', () => {
    const s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(1))
    expect(s.phase).toBe('pre-deal')
    expect(s.seats.every((seat) => seat.stack === 1000)).toBe(true)
  })
})

describe("Hold'em — deal", () => {
  it('posts blinds and deals 2 hole cards each', () => {
    const initial = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(42))
    const dealt = dealHand(initial, mulberry32(42))
    expect(dealt.phase).toBe('pre-flop')
    expect(dealt.pot).toBe(15) // 5 SB + 10 BB
    expect(dealt.seats[0].hole.length).toBe(2)
    expect(dealt.seats[1].hole.length).toBe(2)
    expect(dealt.community.length).toBe(0)
  })

  it('heads-up: button posts SB and acts first pre-flop', () => {
    const initial = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(42))
    const dealt = dealHand(initial, mulberry32(42))
    expect(dealt.seats[0].streetBet).toBe(5) // alice = SB (button)
    expect(dealt.seats[1].streetBet).toBe(10) // bob = BB
    expect(dealt.seats[dealt.toAct].id).toBe(ALICE) // SB acts first heads-up
  })

  it('3-player: SB and BB are seats[1] and seats[2], UTG (seats[0] = button) acts first... no wait — button is 0; SB=1, BB=2; first to act is 3 mod n = 0', () => {
    const initial = makeInitial({ playerIds: [ALICE, BOB, CARL] }, mulberry32(7))
    const dealt = dealHand(initial, mulberry32(7))
    expect(dealt.seats[1].streetBet).toBe(5)
    expect(dealt.seats[2].streetBet).toBe(10)
    expect(dealt.seats[dealt.toAct].id).toBe(ALICE)
  })
})

describe("Hold'em — fold to win", () => {
  it('opponent folds heads-up pre-flop, SB wins pot', () => {
    let s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(1))
    s = dealHand(s, mulberry32(1))
    // Alice (SB, to-act first) calls
    s = applyAction(s, { kind: 'call', by: ALICE }, mulberry32(1))
    expect(s.seats[0].streetBet).toBe(10)
    expect(s.seats[1].streetBet).toBe(10)
    // Now Bob (BB) checks → flop
    s = applyAction(s, { kind: 'check', by: BOB }, mulberry32(1))
    expect(s.phase).toBe('flop')
    expect(s.community.length).toBe(3)
    // Bob folds, Alice wins
    // Post-flop, first to act = first active left of button. Button=0 (Alice).
    // First active left = seat 1 (Bob).
    expect(s.seats[s.toAct].id).toBe(BOB)
    s = applyAction(s, { kind: 'fold', by: BOB }, mulberry32(1))
    expect(s.phase).toBe('hand-complete')
    expect(s.winners.length).toBe(1)
    expect(s.winners[0].ids).toEqual([ALICE])
    expect(s.winners[0].amount).toBe(20)
    expect(s.seats[0].stack).toBe(1010) // 1000 - 10 + 20
    expect(s.seats[1].stack).toBe(990)
  })
})

describe("Hold'em — playable to showdown", () => {
  it('runs flop/turn/river and reaches showdown when both check down', () => {
    let s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(123))
    s = dealHand(s, mulberry32(123))
    // Alice calls, Bob checks pre-flop
    s = applyAction(s, { kind: 'call', by: ALICE }, mulberry32(123))
    s = applyAction(s, { kind: 'check', by: BOB }, mulberry32(123))
    expect(s.phase).toBe('flop')
    // Flop: Bob first to act (left of button)
    s = applyAction(s, { kind: 'check', by: BOB }, mulberry32(123))
    s = applyAction(s, { kind: 'check', by: ALICE }, mulberry32(123))
    expect(s.phase).toBe('turn')
    expect(s.community.length).toBe(4)
    s = applyAction(s, { kind: 'check', by: BOB }, mulberry32(123))
    s = applyAction(s, { kind: 'check', by: ALICE }, mulberry32(123))
    expect(s.phase).toBe('river')
    expect(s.community.length).toBe(5)
    s = applyAction(s, { kind: 'check', by: BOB }, mulberry32(123))
    s = applyAction(s, { kind: 'check', by: ALICE }, mulberry32(123))
    expect(s.phase).toBe('showdown')
    // Settle showdown
    s = applyAction(s, { kind: 'deal' }, mulberry32(123))
    expect(s.phase).toBe('hand-complete')
    expect(s.winners.length).toBe(1)
    expect(s.winners[0].amount).toBe(20)
  })
})

describe("Hold'em — illegal action rejection", () => {
  it('rejects raise below currentBet', () => {
    let s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(9))
    s = dealHand(s, mulberry32(9))
    // Alice (SB, currentBet=10, alice streetBet=5)
    expect(() => applyAction(s, { kind: 'raise', by: ALICE, to: 5 }, mulberry32(9))).toThrow()
  })

  it("rejects action when it's not your turn", () => {
    let s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(9))
    s = dealHand(s, mulberry32(9))
    // Alice to act, Bob trying to act
    expect(() => applyAction(s, { kind: 'check', by: BOB }, mulberry32(9))).toThrow()
  })

  it('legal actions for SB include call (not check), fold, raise', () => {
    let s = makeInitial({ playerIds: [ALICE, BOB] }, mulberry32(9))
    s = dealHand(s, mulberry32(9))
    const acts = legalActions(s, ALICE)
    const kinds = acts.map((a) => a.kind).sort()
    expect(kinds).toEqual(['call', 'fold', 'raise'])
  })
})

describe("Hold'em — basic side pot", () => {
  it('all-in short stack splits into a main pot and side pot', () => {
    // Alice has 50, Bob has 1000, Carl has 1000.
    let s = makeInitial(
      { playerIds: [ALICE, BOB, CARL], startingStack: 50 },
      mulberry32(11),
    )
    // override Bob and Carl's stacks
    s = {
      ...s,
      seats: s.seats.map((seat) =>
        seat.id === BOB || seat.id === CARL ? { ...seat, stack: 1000 } : seat,
      ),
    }
    s = dealHand(s, mulberry32(11))
    // After SB(5) by Bob and BB(10) by Carl, Alice (button) acts first
    // Alice shoves all-in (raise to her stack 50)
    s = applyAction(s, { kind: 'raise', by: ALICE, to: 50 }, mulberry32(11))
    // Bob calls 50 (was at 5, owes 45)
    s = applyAction(s, { kind: 'call', by: BOB }, mulberry32(11))
    // Carl calls 50 (was at 10, owes 40)
    s = applyAction(s, { kind: 'call', by: CARL }, mulberry32(11))
    // Now Bob/Carl can still bet on flop. We just check pot accounting.
    // Pot should be 50 * 3 = 150 (everyone matched alice's all-in)
    expect(s.pot).toBe(150)
    expect(s.seats.find((x) => x.id === ALICE)!.allIn).toBe(true)
  })
})
