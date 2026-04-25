import { describe, expect, it } from 'vitest'
import { Card, parseCardId } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import {
  applyAction,
  blackjackRules,
  legalActions,
  makeInitial,
  BlackjackState,
} from '../rules'

const ALICE = 'alice'

function makeAt(...args: Parameters<typeof makeInitial>) {
  return makeInitial(...args)
}

describe('Blackjack — module + init', () => {
  it('matches GameRuleModule contract', () => {
    expect(blackjackRules.gameId).toBe('blackjack')
    expect(blackjackRules.minPlayers).toBe(1)
    expect(blackjackRules.maxPlayers).toBe(7)
    expect(blackjackRules.supportedModes).toContain('service')
  })

  it('rejects 0 / >7 players', () => {
    expect(() => makeInitial({ playerIds: [] }, mulberry32(1))).toThrow()
    expect(() =>
      makeInitial(
        { playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
        mulberry32(1),
      ),
    ).toThrow()
  })

  it('deals 2 cards to each player and to the dealer', () => {
    const s = makeAt({ playerIds: [ALICE] }, mulberry32(7))
    expect(s.players[0].hands[0].cards.length).toBe(2)
    expect(s.dealer.cards.length).toBe(2)
  })
})

// Build a synthetic state with chosen cards (handy for testing decisions).
function craftedState(
  playerCards: string[],
  dealerCards: string[],
  bet = 50,
  stack = 1000,
): BlackjackState {
  return {
    players: [
      {
        id: ALICE,
        stack: stack - bet,
        hands: [
          {
            cards: playerCards.map((id) => parseCardId(id)),
            bet,
            doubled: false,
            stood: false,
            busted: false,
            surrendered: false,
            fromSplit: false,
            result: null,
            payout: 0,
          },
        ],
        activeHand: 0,
      },
    ],
    dealer: { cards: dealerCards.map((id) => parseCardId(id)) },
    deck: { cards: [parseCardId('2C'), parseCardId('2D'), parseCardId('2H'), parseCardId('2S'), parseCardId('3C'), parseCardId('3D'), parseCardId('3H'), parseCardId('3S')] },
    phase: 'players-turn',
    toAct: 0,
    initialBet: bet,
  }
}

describe('Blackjack — actions', () => {
  it('hit adds a card and busts when over 21', () => {
    let s = craftedState(['10S', 'QC'], ['5H', '6D']) // player 20
    // override deck to deliver a King next
    s = { ...s, deck: { cards: [parseCardId('KC')] } }
    s = applyAction(s, { kind: 'hit', by: ALICE }, mulberry32(1))
    const h = s.players[0].hands[0]
    expect(h.busted).toBe(true)
    expect(h.cards.length).toBe(3)
  })

  it('stand ends the player turn', () => {
    let s = craftedState(['10S', '7C'], ['5H', '6D'])
    s = applyAction(s, { kind: 'stand', by: ALICE }, mulberry32(1))
    expect(s.players[0].hands[0].stood).toBe(true)
    // After all stand, phase becomes dealer-turn
    expect(s.phase).toBe('dealer-turn')
  })

  it('double doubles the bet and forces a single card', () => {
    let s = craftedState(['5S', '6C'], ['10H', '6D']) // 11 vs dealer 16
    s = { ...s, deck: { cards: [parseCardId('KC')] } }
    s = applyAction(s, { kind: 'double', by: ALICE }, mulberry32(1))
    const h = s.players[0].hands[0]
    expect(h.cards.length).toBe(3)
    expect(h.bet).toBe(100)
    expect(h.doubled).toBe(true)
    expect(h.stood).toBe(true)
  })

  it('split into two hands with equal bets', () => {
    let s = craftedState(['8S', '8C'], ['10H', '6D'])
    s = {
      ...s,
      deck: { cards: [parseCardId('3C'), parseCardId('5D')] },
    }
    s = applyAction(s, { kind: 'split', by: ALICE }, mulberry32(1))
    expect(s.players[0].hands.length).toBe(2)
    expect(s.players[0].hands[0].bet).toBe(50)
    expect(s.players[0].hands[1].bet).toBe(50)
    // both hands have 2 cards
    expect(s.players[0].hands[0].cards.length).toBe(2)
    expect(s.players[0].hands[1].cards.length).toBe(2)
  })

  it('surrender flags the hand and ends the turn', () => {
    let s = craftedState(['10S', '6C'], ['AH', '10D'])
    s = applyAction(s, { kind: 'surrender', by: ALICE }, mulberry32(1))
    expect(s.players[0].hands[0].surrendered).toBe(true)
  })

  it('legalActions does not include split when ranks differ', () => {
    const s = craftedState(['10S', '5C'], ['10H', '6D'])
    const acts = legalActions(s, ALICE).map((a) => a.kind).sort()
    expect(acts).toContain('hit')
    expect(acts).toContain('stand')
    expect(acts).toContain('double')
    expect(acts).toContain('surrender')
    expect(acts).not.toContain('split')
  })

  it('legalActions includes split for matching ranks', () => {
    const s = craftedState(['7S', '7C'], ['10H', '6D'])
    const acts = legalActions(s, ALICE).map((a) => a.kind)
    expect(acts).toContain('split')
  })
})

describe('Blackjack — settlement', () => {
  it('blackjack pays 3:2', () => {
    // Force a blackjack on initial deal by stacking the deck.
    // Deal order: p1 c1, dealer c1, p1 c2, dealer c2.
    // We want player to get AS + KS, dealer to get 5D + 7H.
    // shuffle takes from end; draw takes from end. So in deck.cards array,
    // last card pops first. Order of draws: p1.c1, dealer.c1, p1.c2, dealer.c2.
    // Our shuffle is determined by the rng seed; instead, build state directly.
    let s = craftedState(['AS', 'KS'], ['10H', '6D'])
    // Mark the player as already standing (natural BJ auto-stand) — it will be on init,
    // but here we crafted state manually.
    s = {
      ...s,
      players: [
        {
          ...s.players[0],
          hands: [{ ...s.players[0].hands[0], stood: true }],
        },
      ],
      phase: 'dealer-turn',
      toAct: -1,
    }
    s = applyAction(s, { kind: 'dealer-play' }, mulberry32(1))
    const h = s.players[0].hands[0]
    expect(h.result).toBe('blackjack')
    // 50 bet → 50 + 75 = 125 payout
    expect(h.payout).toBe(125)
  })

  it('push when both have non-blackjack 19', () => {
    let s = craftedState(['10S', '9D'], ['10H', '9C'])
    s = {
      ...s,
      players: [
        { ...s.players[0], hands: [{ ...s.players[0].hands[0], stood: true }] },
      ],
      phase: 'dealer-turn',
      toAct: -1,
    }
    s = applyAction(s, { kind: 'dealer-play' }, mulberry32(1))
    expect(s.players[0].hands[0].result).toBe('push')
    expect(s.players[0].hands[0].payout).toBe(50)
  })

  it('player wins when dealer busts', () => {
    let s = craftedState(['10S', '7C'], ['9H', '7D']) // dealer 16, must hit
    // Stack a 10 to bust dealer.
    s = {
      ...s,
      deck: { cards: [parseCardId('10C')] },
      players: [
        { ...s.players[0], hands: [{ ...s.players[0].hands[0], stood: true }] },
      ],
      phase: 'dealer-turn',
      toAct: -1,
    }
    s = applyAction(s, { kind: 'dealer-play' }, mulberry32(1))
    expect(s.players[0].hands[0].result).toBe('win')
    expect(s.players[0].hands[0].payout).toBe(100)
  })

  it('surrender returns half the bet', () => {
    let s = craftedState(['10S', '6C'], ['AH', '10D'])
    s = applyAction(s, { kind: 'surrender', by: ALICE }, mulberry32(1))
    s = applyAction(s, { kind: 'dealer-play' }, mulberry32(1))
    expect(s.players[0].hands[0].result).toBe('surrender')
    expect(s.players[0].hands[0].payout).toBe(25)
  })
})
