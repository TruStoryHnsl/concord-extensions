import { describe, expect, it } from 'vitest'
import { makeCard } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import {
  applyAction,
  Foundation,
  isWin,
  legalActions,
  makeInitial,
  solitaireRules,
  SolitaireState,
  TableauPile,
  terminalStatus,
} from '../rules'

const PLAYER = 'alice' as const

function countCards(s: SolitaireState): number {
  let total = s.stock.length + s.waste.length
  for (const t of s.tableau) total += t.faceDown.length + t.faceUp.length
  for (const f of s.foundations) total += f.cards.length
  return total
}

describe('Solitaire — initial deal', () => {
  it('deals 28 tableau cards with correct pile sizes', () => {
    const s = makeInitial({}, mulberry32(1))
    expect(s.tableau.length).toBe(7)
    for (let i = 0; i < 7; i++) {
      const total = s.tableau[i].faceDown.length + s.tableau[i].faceUp.length
      expect(total).toBe(i + 1)
      expect(s.tableau[i].faceUp.length).toBe(1) // top card always face-up after deal
    }
    // 52 - 28 = 24 cards in stock
    expect(s.stock.length).toBe(24)
    expect(s.waste.length).toBe(0)
    expect(countCards(s)).toBe(52)
  })

  it('is deterministic for a given seed', () => {
    const a = makeInitial({}, mulberry32(42))
    const b = makeInitial({}, mulberry32(42))
    for (let i = 0; i < 7; i++) {
      expect(a.tableau[i].faceUp[0].id).toBe(b.tableau[i].faceUp[0].id)
    }
    expect(a.stock.map((c) => c.id)).toEqual(b.stock.map((c) => c.id))
  })

  it('initial foundations are empty, one per suit', () => {
    const s = makeInitial({}, mulberry32(1))
    expect(s.foundations.length).toBe(4)
    const suits = s.foundations.map((f) => f.suit).sort()
    expect(suits).toEqual(['clubs', 'diamonds', 'hearts', 'spades'])
    for (const f of s.foundations) expect(f.cards.length).toBe(0)
  })
})

describe('Solitaire — draw-from-stock / recycle-waste', () => {
  it('draws drawCount cards onto waste', () => {
    const s0 = makeInitial({ drawCount: 3 }, mulberry32(5))
    const s1 = applyAction(s0, { kind: 'draw-from-stock' }, mulberry32(0))
    expect(s1.stock.length).toBe(s0.stock.length - 3)
    expect(s1.waste.length).toBe(3)
    expect(countCards(s1)).toBe(52)
  })

  it('draw-1 variant draws exactly 1', () => {
    const s0 = makeInitial({ drawCount: 1 }, mulberry32(11))
    const s1 = applyAction(s0, { kind: 'draw-from-stock' }, mulberry32(0))
    expect(s1.stock.length).toBe(s0.stock.length - 1)
    expect(s1.waste.length).toBe(1)
  })

  it('recycle-waste moves waste back to stock when stock is empty', () => {
    // Craft a state with empty stock and some waste.
    const state: SolitaireState = {
      tableau: Array.from({ length: 7 }, () => ({ faceDown: [], faceUp: [] } as TableauPile)),
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [makeCard('clubs', '2'), makeCard('hearts', '5'), makeCard('spades', 'A')],
      drawCount: 3,
      moves: 0,
    }
    const out = applyAction(state, { kind: 'recycle-waste' }, mulberry32(0))
    expect(out.waste.length).toBe(0)
    expect(out.stock.length).toBe(3)
    // Reversing keeps the original first-drawn on top again.
    expect(out.stock[out.stock.length - 1].id).toBe('2C')
  })

  it('recycle-waste throws when stock still has cards', () => {
    const s = makeInitial({}, mulberry32(3))
    expect(() => applyAction(s, { kind: 'recycle-waste' }, mulberry32(0))).toThrow()
  })
})

describe('Solitaire — move validation', () => {
  it('rejects moving a non-King onto an empty tableau pile', () => {
    const state: SolitaireState = {
      tableau: [
        { faceDown: [], faceUp: [makeCard('spades', '5')] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    expect(() =>
      applyAction(
        state,
        { kind: 'move', from: { type: 'tableau', index: 0 }, to: { type: 'tableau', index: 1 }, count: 1 },
        mulberry32(0),
      ),
    ).toThrow()
  })

  it('accepts a King onto an empty tableau pile', () => {
    const state: SolitaireState = {
      tableau: [
        { faceDown: [], faceUp: [makeCard('hearts', 'K')] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    const out = applyAction(
      state,
      { kind: 'move', from: { type: 'tableau', index: 0 }, to: { type: 'tableau', index: 1 }, count: 1 },
      mulberry32(0),
    )
    expect(out.tableau[0].faceUp.length).toBe(0)
    expect(out.tableau[1].faceUp[0].id).toBe('KH')
  })

  it('enforces alternating color + descending rank on tableau stacks', () => {
    const state: SolitaireState = {
      tableau: [
        { faceDown: [], faceUp: [makeCard('clubs', '7')] }, // black 7
        { faceDown: [], faceUp: [makeCard('spades', '6')] }, // black 6 — SAME color => illegal
        { faceDown: [], faceUp: [makeCard('hearts', '6')] }, // red 6 — legal
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    // illegal: spades 6 onto clubs 7
    expect(() =>
      applyAction(
        state,
        { kind: 'move', from: { type: 'tableau', index: 1 }, to: { type: 'tableau', index: 0 } },
        mulberry32(0),
      ),
    ).toThrow()
    // legal: hearts 6 onto clubs 7
    const out = applyAction(
      state,
      { kind: 'move', from: { type: 'tableau', index: 2 }, to: { type: 'tableau', index: 0 } },
      mulberry32(0),
    )
    expect(out.tableau[0].faceUp.map((c) => c.id)).toEqual(['7C', '6H'])
  })

  it('enforces foundation ascending by suit from Ace', () => {
    const state: SolitaireState = {
      tableau: [
        { faceDown: [], faceUp: [makeCard('spades', 'A')] },
        { faceDown: [], faceUp: [makeCard('spades', '2')] },
        { faceDown: [], faceUp: [makeCard('hearts', '2')] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    // move AS -> foundation(spades)
    const s1 = applyAction(
      state,
      { kind: 'move', from: { type: 'tableau', index: 0 }, to: { type: 'foundation', suit: 'spades' } },
      mulberry32(0),
    )
    const spadesIdx = s1.foundations.findIndex((f) => f.suit === 'spades')
    expect(s1.foundations[spadesIdx].cards.map((c) => c.id)).toEqual(['AS'])

    // 2H onto spades foundation: wrong suit => throws
    expect(() =>
      applyAction(
        s1,
        { kind: 'move', from: { type: 'tableau', index: 2 }, to: { type: 'foundation', suit: 'spades' } },
        mulberry32(0),
      ),
    ).toThrow()

    // 2S onto spades foundation: legal
    const s2 = applyAction(
      s1,
      { kind: 'move', from: { type: 'tableau', index: 1 }, to: { type: 'foundation', suit: 'spades' } },
      mulberry32(0),
    )
    expect(s2.foundations[spadesIdx].cards.map((c) => c.id)).toEqual(['AS', '2S'])
  })

  it('flips the next face-down card after moving the last face-up off a tableau pile', () => {
    const state: SolitaireState = {
      tableau: [
        { faceDown: [makeCard('diamonds', '9')], faceUp: [makeCard('spades', 'A')] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [] },
        { suit: 'diamonds', cards: [] },
        { suit: 'hearts', cards: [] },
        { suit: 'spades', cards: [] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    const out = applyAction(
      state,
      { kind: 'move', from: { type: 'tableau', index: 0 }, to: { type: 'foundation', suit: 'spades' } },
      mulberry32(0),
    )
    expect(out.tableau[0].faceDown.length).toBe(0)
    expect(out.tableau[0].faceUp.length).toBe(1)
    expect(out.tableau[0].faceUp[0].id).toBe('9D')
  })
})

describe('Solitaire — terminal state', () => {
  function craftWinState(): SolitaireState {
    const suitCards = (suit: 'clubs' | 'diamonds' | 'hearts' | 'spades') => {
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
      return ranks.map((r) => makeCard(suit, r))
    }
    return {
      tableau: Array.from({ length: 7 }, () => ({ faceDown: [], faceUp: [] } as TableauPile)),
      foundations: [
        { suit: 'clubs', cards: suitCards('clubs') },
        { suit: 'diamonds', cards: suitCards('diamonds') },
        { suit: 'hearts', cards: suitCards('hearts') },
        { suit: 'spades', cards: suitCards('spades') },
      ],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
  }

  it('isWin recognizes all-K foundations', () => {
    expect(isWin(craftWinState())).toBe(true)
    expect(terminalStatus(craftWinState())).toBe('win')
    expect(solitaireRules.terminalStatus(craftWinState())).toBe('win')
  })

  it('isWin false for partial foundations', () => {
    const s = craftWinState()
    const mutilated: SolitaireState = {
      ...s,
      foundations: s.foundations.map((f, i) =>
        i === 0 ? { suit: f.suit, cards: f.cards.slice(0, -1) } : f,
      ),
    }
    expect(isWin(mutilated)).toBe(false)
    expect(terminalStatus(mutilated)).toBe('playing')
  })

  it('auto-complete finishes a fully-face-up, empty-stock state onto foundations', () => {
    // Craft a state where every suit has A already on foundations and the 2s are
    // the face-up top of four tableau piles.
    const state: SolitaireState = {
      tableau: [
        { faceDown: [], faceUp: [makeCard('clubs', '2')] },
        { faceDown: [], faceUp: [makeCard('diamonds', '2')] },
        { faceDown: [], faceUp: [makeCard('hearts', '2')] },
        { faceDown: [], faceUp: [makeCard('spades', '2')] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
        { faceDown: [], faceUp: [] },
      ] as TableauPile[],
      foundations: [
        { suit: 'clubs', cards: [makeCard('clubs', 'A')] },
        { suit: 'diamonds', cards: [makeCard('diamonds', 'A')] },
        { suit: 'hearts', cards: [makeCard('hearts', 'A')] },
        { suit: 'spades', cards: [makeCard('spades', 'A')] },
      ] as Foundation[],
      stock: [],
      waste: [],
      drawCount: 3,
      moves: 0,
    }
    const out = applyAction(state, { kind: 'auto-complete' }, mulberry32(0))
    for (const f of out.foundations) {
      expect(f.cards.length).toBe(2)
      expect(f.cards[f.cards.length - 1].rank).toBe('2')
    }
  })
})

describe('Solitaire — rule-module interface', () => {
  it('exposes the GameRuleModule contract', () => {
    expect(solitaireRules.gameId).toBe('solitaire')
    expect(solitaireRules.minPlayers).toBe(1)
    expect(solitaireRules.maxPlayers).toBe(1)
    expect(solitaireRules.supportedModes).toContain('service')
  })

  it('legalActions returns at least a draw-from-stock at start', () => {
    const s = makeInitial({}, mulberry32(123))
    const acts = legalActions(s, PLAYER)
    expect(acts.some((a) => a.kind === 'draw-from-stock')).toBe(true)
  })
})
