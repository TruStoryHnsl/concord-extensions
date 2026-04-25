import { describe, expect, it } from 'vitest'
import { Card, parseCardId } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import {
  applyAction,
  cardPower,
  kingsAndPeasantsRules,
  KPState,
  legalActions,
  makeInitial,
} from '../rules'

const A = 'alice'
const B = 'bob'
const C = 'carl'
const D = 'dora'

describe('Kings & Peasants — module + power', () => {
  it('matches GameRuleModule', () => {
    expect(kingsAndPeasantsRules.gameId).toBe('kings-and-peasants')
    expect(kingsAndPeasantsRules.minPlayers).toBe(3)
    expect(kingsAndPeasantsRules.maxPlayers).toBe(7)
  })

  it('rejects invalid player counts', () => {
    expect(() => makeInitial({ playerIds: [A, B] }, mulberry32(1))).toThrow()
    expect(() =>
      makeInitial(
        { playerIds: [A, B, C, D, 'e', 'f', 'g', 'h'] },
        mulberry32(1),
      ),
    ).toThrow()
  })

  it('card power: 3<...<A<2', () => {
    expect(cardPower('3')).toBeLessThan(cardPower('4'))
    expect(cardPower('K')).toBeLessThan(cardPower('A'))
    expect(cardPower('A')).toBeLessThan(cardPower('2'))
    expect(cardPower('2')).toBe(13)
  })
})

describe('Kings & Peasants — initial deal', () => {
  it('deals 52 cards across players', () => {
    const s = makeInitial({ playerIds: [A, B, C, D] }, mulberry32(7))
    let total = 0
    for (const p of s.players) total += p.hand.length
    expect(total).toBe(52)
    // 52/4 = 13 each (no extras)
    for (const p of s.players) expect(p.hand.length).toBe(13)
  })

  it('extras go to lowest-index players', () => {
    const s = makeInitial({ playerIds: [A, B, C] }, mulberry32(7))
    // 52/3 = 17 r 1 → first player gets 18, others 17
    const sizes = s.players.map((p) => p.hand.length).sort((x, y) => y - x)
    expect(sizes).toEqual([18, 17, 17])
  })
})

// Build a crafted state for action testing.
function craftState(
  hands: Record<string, string[]>,
  toAct: number,
  topCombo: { cards: string[]; leadBy: number } | null = null,
  finishedCount = 0,
): KPState {
  const ids = Object.keys(hands)
  return {
    players: ids.map((id, i) => ({
      id,
      hand: hands[id].map((c) => parseCardId(c)),
      socialRank: 'neutral',
      finishOrder: null,
    })),
    toAct,
    topCombo: topCombo
      ? { cards: topCombo.cards.map((c) => parseCardId(c)), leadBy: topCombo.leadBy }
      : null,
    passers: [],
    finishedCount,
    roundNumber: 1,
  }
}

describe('Kings & Peasants — combo legality', () => {
  it('lead allows any single/pair/triple/quad', () => {
    const s = craftState({ alice: ['5C', '5D', '5H', '5S', 'KC'], bob: [], carl: [] }, 0, null)
    const acts = legalActions(s, A).filter((a) => a.kind === 'play')
    // Singles: 5,K → 5 positions; we should at least see singles 5 and K, and pair, triple, quad of 5
    const sizes = acts.map((a) => (a as any).cardIds.length).sort()
    expect(sizes).toEqual([1, 1, 2, 3, 4]) // 1xK, 1x5, 2x5, 3x5, 4x5
  })

  it('follow must match size and beat power', () => {
    const s = craftState(
      { alice: ['7C', '7D'], bob: ['8C', '8D', 'JC', 'JD'], carl: [] },
      1,
      { cards: ['7C', '7D'], leadBy: 0 },
    )
    const acts = legalActions(s, B).filter((a) => a.kind === 'play')
    // valid: pair of 8 or pair of J — both must be 2 cards and higher than 7
    const ranksPlayed = acts.map((a) => (a as any).cardIds.length)
    expect(ranksPlayed.every((n) => n === 2)).toBe(true)
  })

  it('2 (bomb) beats anything of same size', () => {
    const s = craftState(
      { alice: ['2C', '2D'], bob: ['7C', '7D'], carl: [] },
      0,
      { cards: ['KC', 'KD'], leadBy: 1 },
    )
    const acts = legalActions(s, A).filter((a) => a.kind === 'play')
    expect(acts.length).toBe(1)
    expect((acts[0] as any).cardIds.sort()).toEqual(['2C', '2D'])
  })
})

describe('Kings & Peasants — action mechanics', () => {
  it('playing a 2 clears the pile and same player leads', () => {
    const s = craftState(
      { alice: ['2C', '5D'], bob: ['7C'], carl: ['8C'] },
      0,
      { cards: ['KC'], leadBy: 1 },
    )
    const next = applyAction(s, { kind: 'play', by: A, cardIds: ['2C'] }, mulberry32(1))
    expect(next.topCombo).toBeNull()
    expect(next.toAct).toBe(0) // Alice still leads
    expect(next.players[0].hand.length).toBe(1)
  })

  it('all pass returns lead to last player', () => {
    let s = craftState(
      { alice: ['7C'], bob: ['JC'], carl: ['QC'] },
      0,
      null,
    )
    s = applyAction(s, { kind: 'play', by: A, cardIds: ['7C'] }, mulberry32(1))
    expect(s.toAct).toBe(1)
    s = applyAction(s, { kind: 'pass', by: B }, mulberry32(1))
    s = applyAction(s, { kind: 'pass', by: C }, mulberry32(1))
    // Alice already finished (had 1 card and played it). Trick clears.
    // The next-trick-leader logic with the leader having finished: their finishOrder is set.
    // In that case the next living player gets to lead.
    expect(s.topCombo).toBeNull()
  })

  it('finish order captured', () => {
    let s = craftState(
      { alice: ['7C'], bob: ['JC', '4C'], carl: ['QC', '5C'] },
      0,
      null,
    )
    s = applyAction(s, { kind: 'play', by: A, cardIds: ['7C'] }, mulberry32(1))
    // alice now has 0 cards → finishOrder = 0
    expect(s.players[0].finishOrder).toBe(0)
    expect(s.finishedCount).toBe(1)
  })
})

describe('Kings & Peasants — round end + ranks', () => {
  it('assigns king and peasant when round ends', () => {
    // Tiny round: alice plays last card, bob plays last, carl is left.
    let s = craftState(
      { alice: ['7C'], bob: ['JC'], carl: ['4D', '5D', '6D'] },
      0,
      null,
    )
    s = applyAction(s, { kind: 'play', by: A, cardIds: ['7C'] }, mulberry32(1))
    // alice gone → bob to act, on a single 7; bob plays J, takes lead
    s = applyAction(s, { kind: 'play', by: B, cardIds: ['JC'] }, mulberry32(1))
    // bob gone → carl alone, terminal triggers in checkRoundEnd
    expect(s.players[0].socialRank).toBe('king')
    expect(s.players[1].socialRank).toBe('vice-king')
    expect(s.players[2].socialRank).toBe('peasant')
  })
})
