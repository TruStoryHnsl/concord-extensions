import { describe, expect, it } from 'vitest'
import { Card, parseCardId } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import { applyAction, legalActions, makeInitial, warRules, WarState } from '../rules'

const A = 'alice'
const B = 'bob'

describe('War — module', () => {
  it('matches GameRuleModule', () => {
    expect(warRules.gameId).toBe('war')
    expect(warRules.minPlayers).toBe(2)
    expect(warRules.maxPlayers).toBe(2)
    expect(warRules.supportedModes).toEqual(['display', 'party', 'hybrid'])
  })

  it('initial deal splits 26/26', () => {
    const s = makeInitial({ playerIds: [A, B] }, mulberry32(7))
    expect(s.players[0].deck.length).toBe(26)
    expect(s.players[1].deck.length).toBe(26)
  })
})

function craftState(aDeck: string[], bDeck: string[]): WarState {
  return {
    players: [
      { id: A, deck: aDeck.map((id) => parseCardId(id)) },
      { id: B, deck: bDeck.map((id) => parseCardId(id)) },
    ],
    lastReveal: null,
    lastWarDepth: 0,
    winner: null,
    step: 0,
  }
}

describe('War — single round', () => {
  it('higher rank wins both cards', () => {
    // Top of deck = last index.
    const s = craftState(['KH'], ['5C'])
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.players[0].deck.length).toBe(2)
    expect(next.players[1].deck.length).toBe(0)
    expect(next.winner).toBe(A)
  })

  it('Ace beats King (Ace high)', () => {
    const s = craftState(['AC'], ['KH'])
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.winner).toBe(A)
  })
})

describe('War — tie triggers war', () => {
  it('tie + 3 face-down + 1 face-up resolves correctly', () => {
    // Top is last index. Tie on 7s, then face-up at indices [-4]
    // Alice deck (top last): bury3 [2C, 3C, 4C], faceup AC at top, war card at -4 = 7C
    // Layout per index 0..n: [..., faceup_for_war, fd3, fd2, fd1, top_for_first_flip]
    // We want: first flip = 7 vs 7 (tie). Then 3 face-down each. Then face-up: alice AC vs bob 5C.
    // Alice wins all 8.
    const aDeck = ['AC', '4C', '3C', '2C', '7C'] // top = 7C
    const bDeck = ['5C', '8D', '8H', '8S', '7H'] // top = 7H
    const s = craftState(aDeck, bDeck)
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.lastWarDepth).toBe(1)
    // Alice wins all 10 cards (her 5 + bob's 5)
    expect(next.players[0].deck.length).toBe(10)
    expect(next.players[1].deck.length).toBe(0)
    // Bob is winner-less, alice is winner.
    expect(next.winner).toBe(A)
  })

  it('recursive war on repeat tie', () => {
    // First tie 7 vs 7, then face-up tie 8 vs 8, then face-up alice K vs bob 5 → alice wins.
    // Layout (top = last index):
    // alice: [KC, 8H, 4C, 3C, 2C, 7C]   draws 7C, then 3 face-down (2C,3C,4C), face-up 8H, tie
    //                                   then 3 face-down (need ≥1 to keep) — only 1 left (KC)
    //                                   actually deckA after first round = 5 cards (KC,8H,4C,3C,2C)
    //                                   wait let me recompute
    // Actually after first flip: deckA = [KC, 8H, 4C, 3C, 2C] (5 cards)
    // After 3 face-down: pops 2C, 3C, 4C → deckA = [KC, 8H] (2 cards)
    // Face-up: pops 8H → deckA = [KC]
    // Compare 8H vs 8X (both 8) → tie again
    // 3 face-down: aDownCount = min(3, 1-1) = 0. Both have only 1 card left.
    // Edge handler kicks in: deckA=[KC] not empty.
    // Actually the code says: aDownCount = max(0, min(3, deckA.length - 1)).
    //   deckA.length=1, so aDownCount = 0. Same for b.
    // Then check: both still have 1 card. flipOne again → deckA=[], reveals KC.
    // KC vs bob's last face-up. If bob's last = something < K, alice wins.
    const aDeck = ['KC', '8H', '4C', '3C', '2C', '7C']
    const bDeck = ['5C', '8D', 'JD', 'QD', '6D', '7H']
    const s = craftState(aDeck, bDeck)
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.lastWarDepth).toBeGreaterThanOrEqual(2)
    // Alice should win the whole stack because K > J on the second war
    expect(next.players[0].deck.length).toBe(12)
    expect(next.players[1].deck.length).toBe(0)
  })
})

describe('War — out-of-cards edges', () => {
  it('player with 0 cards loses outright', () => {
    const s = craftState([], ['5C'])
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.winner).toBe(B)
  })

  it('player runs out mid-war: opponent wins remaining pot', () => {
    // Tie on 7s, then alice has only 1 card left, bob has 4. Alice can't ante.
    const aDeck = ['7C'] // 1 card
    const bDeck = ['5C', '8D', '8H', '8S', '7H']
    const s = craftState(aDeck, bDeck)
    const next = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(next.winner).toBe(B)
  })
})

describe('War — determinism', () => {
  it('same seed produces identical winner', () => {
    const s1 = makeInitial({ playerIds: [A, B] }, mulberry32(42))
    const s2 = makeInitial({ playerIds: [A, B] }, mulberry32(42))
    let st1: WarState = s1
    let st2: WarState = s2
    let safety = 5000
    while (!st1.winner && safety-- > 0) {
      st1 = applyAction(st1, { kind: 'flip' }, mulberry32(0))
    }
    safety = 5000
    while (!st2.winner && safety-- > 0) {
      st2 = applyAction(st2, { kind: 'flip' }, mulberry32(0))
    }
    expect(st1.winner).toBeTruthy()
    expect(st1.winner).toBe(st2.winner)
  })
})

describe('War — legalActions', () => {
  it('flip available while game in progress', () => {
    const s = craftState(['KC'], ['5C'])
    expect(legalActions(s, A)).toEqual([{ kind: 'flip' }])
  })

  it('no actions after winner declared', () => {
    let s: WarState = craftState(['KC'], ['5C'])
    s = applyAction(s, { kind: 'flip' }, mulberry32(1))
    expect(legalActions(s, A)).toEqual([])
  })
})
