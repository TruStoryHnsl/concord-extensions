import { describe, expect, it } from 'vitest'
import { Card, parseCardId } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import {
  applyAction,
  legalActions,
  makeInitial,
  ranksAdjacent,
  resolveTick,
  speedRules,
  SpeedState,
} from '../rules'

const A = 'alice'
const B = 'bob'

describe('Speed — module + adjacency', () => {
  it('matches GameRuleModule', () => {
    expect(speedRules.gameId).toBe('speed')
    expect(speedRules.minPlayers).toBe(2)
    expect(speedRules.maxPlayers).toBe(2)
    expect(speedRules.supportedModes).toEqual(['party'])
  })

  it('ranks adjacent simple cases', () => {
    expect(ranksAdjacent('5', '6')).toBe(true)
    expect(ranksAdjacent('6', '5')).toBe(true)
    expect(ranksAdjacent('A', '2')).toBe(true)
    expect(ranksAdjacent('A', 'K')).toBe(true) // wrap
    expect(ranksAdjacent('K', 'A')).toBe(true)
    expect(ranksAdjacent('5', '7')).toBe(false)
    expect(ranksAdjacent('Q', 'K')).toBe(true)
    expect(ranksAdjacent('J', 'Q')).toBe(true)
  })
})

describe('Speed — initial deal', () => {
  it('distributes cards correctly', () => {
    const s = makeInitial({ playerIds: [A, B] }, mulberry32(123))
    // Each player: 5 hand + 15 draw + 5 sideStack (one peeled to discard)
    expect(s.players[0].hand.length).toBe(5)
    expect(s.players[1].hand.length).toBe(5)
    expect(s.players[0].draw.length).toBe(15)
    expect(s.players[1].draw.length).toBe(15)
    expect(s.players[0].sideStack.length).toBe(5)
    expect(s.players[1].sideStack.length).toBe(5)
    expect(s.discards[0].length).toBe(1)
    expect(s.discards[1].length).toBe(1)
    // total cards 52
    let total = 0
    for (const p of s.players) total += p.hand.length + p.draw.length + p.sideStack.length
    total += s.discards[0].length + s.discards[1].length
    expect(total).toBe(52)
  })
})

// Build a crafted state to exercise specific scenarios.
function craftState(opts: {
  aHand: string[]
  bHand: string[]
  aDraw?: string[]
  bDraw?: string[]
  aSide?: string[]
  bSide?: string[]
  d0: string
  d1: string
}): SpeedState {
  const ids = (xs: string[]): Card[] => xs.map((id) => parseCardId(id))
  return {
    players: [
      { id: A, hand: ids(opts.aHand), draw: ids(opts.aDraw ?? []), sideStack: ids(opts.aSide ?? []) },
      { id: B, hand: ids(opts.bHand), draw: ids(opts.bDraw ?? []), sideStack: ids(opts.bSide ?? []) },
    ],
    discards: [[parseCardId(opts.d0)], [parseCardId(opts.d1)]],
    winner: null,
  }
}

describe('Speed — legality', () => {
  it('detects legal plays for adjacent and wrap ranks', () => {
    const s = craftState({
      aHand: ['5C', 'KH', '2D'],
      bHand: ['7C'],
      d0: '6S',
      d1: 'AH',
    })
    const acts = legalActions(s, A).filter((a) => a.kind === 'play')
    // 5C → pile 0 (5↔6) and... pile 1? 5 vs A no.
    // KH → pile 0 (K vs 6 no), pile 1 (K↔A wrap yes)
    // 2D → pile 0 (2 vs 6 no), pile 1 (2↔A yes)
    const legals = acts.map((a) => `${(a as any).cardId}@${(a as any).toPile}`).sort()
    expect(legals).toEqual(['2D@1', '5C@0', 'KH@1'].sort())
  })

  it('reveal-stuck offered when neither has any move', () => {
    const s = craftState({
      aHand: ['7C', '7D'],
      bHand: ['7H', '7S'],
      d0: '2S',
      d1: 'JC',
    })
    const aActs = legalActions(s, A)
    const bActs = legalActions(s, B)
    expect(aActs.some((a) => a.kind === 'reveal-stuck')).toBe(true)
    expect(bActs.some((a) => a.kind === 'reveal-stuck')).toBe(true)
  })
})

describe('Speed — applyAction', () => {
  it('plays a card and refills hand from draw', () => {
    const s = craftState({
      aHand: ['5C', 'KH'],
      bHand: ['10C'],
      aDraw: ['9H'],
      d0: '6S',
      d1: 'AH',
    })
    const next = applyAction(s, { kind: 'play', by: A, cardId: '5C', toPile: 0 }, mulberry32(1))
    // 5C moved to pile 0
    expect(next.discards[0][next.discards[0].length - 1].id).toBe('5C')
    // Hand reduced by 1, but Speed says refill up to 5; with only KH left + 9H drawn, hand size stays 2.
    expect(next.players[0].hand.map((c) => c.id).sort()).toEqual(['9H', 'KH'])
    expect(next.players[0].draw.length).toBe(0)
  })

  it('rejects illegal play', () => {
    const s = craftState({
      aHand: ['5C'],
      bHand: ['7C'],
      d0: 'KH',
      d1: '8H',
    })
    expect(() =>
      applyAction(s, { kind: 'play', by: A, cardId: '5C', toPile: 0 }, mulberry32(1)),
    ).toThrow()
  })

  it('reveal-stuck advances both discards', () => {
    const s = craftState({
      aHand: ['7C', '7D'],
      bHand: ['7H', '7S'],
      aSide: ['8C'],
      bSide: ['9D'],
      d0: '2S',
      d1: 'JC',
    })
    const next = applyAction(s, { kind: 'reveal-stuck' }, mulberry32(1))
    expect(next.discards[0][next.discards[0].length - 1].id).toBe('8C')
    expect(next.discards[1][next.discards[1].length - 1].id).toBe('9D')
    expect(next.players[0].sideStack.length).toBe(0)
    expect(next.players[1].sideStack.length).toBe(0)
  })

  it('detects winner when hand and draw both empty', () => {
    const s = craftState({
      aHand: ['5C'],
      bHand: ['10C'],
      d0: '6S',
      d1: 'JD',
    })
    const next = applyAction(s, { kind: 'play', by: A, cardId: '5C', toPile: 0 }, mulberry32(1))
    expect(next.winner).toBe(A)
  })
})

describe('Speed — resolveTick', () => {
  it('drops the second-by-id play when both target the same pile', () => {
    // Both play 6 onto a 5; alice's id ('alice') sorts first.
    const s = craftState({
      aHand: ['6C'],
      bHand: ['6D'],
      d0: '5S',
      d1: 'KC',
    })
    const r = resolveTick(
      s,
      [
        { kind: 'play', by: A, cardId: '6C', toPile: 0 },
        { kind: 'play', by: B, cardId: '6D', toPile: 0 },
      ],
      mulberry32(1),
    )
    expect(r.resolved.length).toBe(1)
    expect(r.resolved[0].by).toBe(A)
  })

  it('allows both plays to different piles', () => {
    // Both players still have draw piles so neither wins after the play.
    const s = craftState({
      aHand: ['6C', '2H'],
      bHand: ['QH', '3S'],
      aDraw: ['9C'],
      bDraw: ['10D'],
      d0: '5S',
      d1: 'JC',
    })
    const r = resolveTick(
      s,
      [
        { kind: 'play', by: A, cardId: '6C', toPile: 0 },
        { kind: 'play', by: B, cardId: 'QH', toPile: 1 },
      ],
      mulberry32(1),
    )
    expect(r.resolved.length).toBe(2)
  })
})
