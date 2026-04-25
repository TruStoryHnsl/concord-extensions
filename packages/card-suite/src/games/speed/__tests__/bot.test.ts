/**
 * Speed bot tests.
 *
 * The bot is a deterministic legal-play scanner. We construct synthetic
 * SpeedStates with known hands and tops to verify it picks the right card
 * onto the right pile, falls through to reveal-stuck when stuck, etc.
 */
import { describe, expect, it } from 'vitest'
import { makeCard, Rank, Suit } from '../../../engine/card'
import { mulberry32 } from '../../../engine/rng'
import { pickAction } from '../bot'
import { applyAction, legalActions, makeInitial, SpeedState } from '../rules'

const ME = '@bot:x'
const HUMAN = '@me:x'

function card(suit: Suit, rank: Rank) {
  return makeCard(suit, rank)
}

function buildState(opts: {
  myHand?: ReturnType<typeof card>[]
  myDraw?: ReturnType<typeof card>[]
  mySide?: ReturnType<typeof card>[]
  oppHand?: ReturnType<typeof card>[]
  oppDraw?: ReturnType<typeof card>[]
  oppSide?: ReturnType<typeof card>[]
  pile0Top: ReturnType<typeof card>
  pile1Top: ReturnType<typeof card>
}): SpeedState {
  return {
    players: [
      {
        id: ME,
        hand: opts.myHand ?? [],
        draw: opts.myDraw ?? [],
        sideStack: opts.mySide ?? [],
      },
      {
        id: HUMAN,
        hand: opts.oppHand ?? [],
        draw: opts.oppDraw ?? [],
        sideStack: opts.oppSide ?? [],
      },
    ],
    discards: [[opts.pile0Top], [opts.pile1Top]],
    winner: null,
  }
}

describe('Speed bot — finds a legal play when one exists', () => {
  it("plays the first legal card onto pile 0 when adjacent", () => {
    // Pile0 top = 7H. Bot has [4D, 8C, KS]. 8 is one above 7 → legal on pile0.
    const state = buildState({
      myHand: [card('diamonds', '4'), card('clubs', '8'), card('spades', 'K')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '10'), // unrelated
    })
    const action = pickAction(state, ME, mulberry32(1))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.cardId).toBe(card('clubs', '8').id)
      expect(action.toPile).toBe(0)
    }
  })

  it('uses Ace-King wrap', () => {
    // Pile0 top = K, bot has Ace → adjacent via wrap.
    const state = buildState({
      myHand: [card('spades', 'A')],
      pile0Top: card('hearts', 'K'),
      pile1Top: card('diamonds', '5'),
    })
    const action = pickAction(state, ME, mulberry32(2))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.cardId).toBe(card('spades', 'A').id)
    }
  })

  it('scans hand left-to-right and prefers pile 0 over pile 1 for the same card', () => {
    // Card 8 is legal on both piles (pile0 top=7, pile1 top=9). Bot
    // should pick pile 0 (lower index in the inner loop).
    const state = buildState({
      myHand: [card('clubs', '8')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '9'),
    })
    const action = pickAction(state, ME, mulberry32(3))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.toPile).toBe(0)
    }
  })

  it('picks the first legal card by hand index when multiple are legal', () => {
    // Hand=[6, 8]. Pile0 top=7. Both 6 (one below) and 8 (one above) legal.
    // Bot picks 6 first (left-to-right scan).
    const state = buildState({
      myHand: [card('clubs', '6'), card('hearts', '8')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '2'), // adjacent to A, not 6 or 8
    })
    const action = pickAction(state, ME, mulberry32(4))
    expect(action.kind).toBe('play')
    if (action.kind === 'play') {
      expect(action.cardId).toBe(card('clubs', '6').id)
    }
  })
})

describe('Speed bot — no legal play falls through to reveal-stuck', () => {
  it('returns reveal-stuck when neither player has a move', () => {
    // Tops are 7 and J. Bot hand: 2,3,4. Human hand: K,Q,4.
    // None of these are adjacent to 7 or J. Both stuck.
    const state = buildState({
      myHand: [card('clubs', '2'), card('hearts', '3'), card('diamonds', '4')],
      oppHand: [card('clubs', 'K'), card('hearts', 'Q'), card('spades', '4')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', 'J'),
    })
    const action = pickAction(state, ME, mulberry32(5))
    expect(action.kind).toBe('reveal-stuck')
  })

  it("returns no-op-equivalent when bot is stuck but human isn't (we still return reveal-stuck as a sentinel)", () => {
    // Bot hand: [2]. Human hand: [8]. Pile0 top = 7. Bot can't play.
    // legalActions for bot returns [] (since opp has a move). Bot module
    // returns reveal-stuck fallback as a sentinel — caller handles.
    const state = buildState({
      myHand: [card('clubs', '2')],
      oppHand: [card('hearts', '8')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', 'J'),
    })
    const action = pickAction(state, ME, mulberry32(6))
    // Bot has no scan-legal play (2 vs 7 = diff 5; 2 vs J also far),
    // and reveal-stuck isn't legal (human has a move). Bot returns
    // reveal-stuck sentinel.
    expect(action.kind).toBe('reveal-stuck')
  })
})

describe('Speed bot — determinism', () => {
  it('same state produces the same action across rng seeds', () => {
    const state = buildState({
      myHand: [card('clubs', '6'), card('hearts', '8')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '9'),
    })
    const a1 = pickAction(state, ME, mulberry32(1))
    const a2 = pickAction(state, ME, mulberry32(99))
    expect(a1).toEqual(a2)
  })
})

describe('Speed bot — full bot-vs-bot game makes progress', () => {
  it('two bots playing each other reduce hand size or end the game', () => {
    const rng = mulberry32(7)
    // Use the rules engine's makeInitial to get a real deck shuffle.
    // Then alternate bot actions between the two seats. This is not a
    // race condition test — we're just verifying the bots reach a
    // terminal state or otherwise progress.
    let state = makeInitial(
      { playerIds: ['@bot1:x', '@bot2:x'] },
      rng,
    )
    let progress = 0
    const initialTotalHand =
      state.players[0].hand.length + state.players[1].hand.length +
      state.players[0].draw.length + state.players[1].draw.length
    let safety = 0
    while (!state.winner && safety < 2000) {
      // Try each bot in turn. If neither has a play, fire reveal-stuck.
      let anyMoved = false
      for (const seat of [0, 1] as const) {
        const id = state.players[seat].id
        const action = pickAction(state, id, rng)
        if (action.kind === 'play') {
          try {
            state = applyAction(state, action, rng)
            progress++
            anyMoved = true
            break
          } catch {
            /* card no longer in hand or pile changed — try the other seat */
          }
        }
      }
      if (!anyMoved) {
        // Both stuck — try reveal-stuck.
        const acts = legalActions(state, state.players[0].id)
        const stuck = acts.find((a) => a.kind === 'reveal-stuck')
        if (stuck) {
          state = applyAction(state, stuck, rng)
        } else {
          // No legal action at all — done.
          break
        }
      }
      safety++
    }
    // Either a winner emerged, or the bots made non-trivial progress.
    const finalTotalHand =
      state.players[0].hand.length + state.players[1].hand.length +
      state.players[0].draw.length + state.players[1].draw.length
    expect(state.winner !== null || finalTotalHand < initialTotalHand).toBe(
      true,
    )
    expect(progress).toBeGreaterThan(0)
    expect(safety).toBeLessThan(2000)
  })
})

describe('Speed bot — applied via the rules engine', () => {
  it('produces an action that the rules engine accepts and progresses state', () => {
    const state = buildState({
      myHand: [card('clubs', '8')],
      myDraw: [card('clubs', '5'), card('hearts', '4')],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '2'),
    })
    const rng = mulberry32(7)
    const action = pickAction(state, ME, rng)
    if (action.kind !== 'play') throw new Error('expected play')
    const next = applyAction(state, action, rng)
    // Pile 0 top should now be 8C
    expect(next.discards[0][next.discards[0].length - 1].id).toBe(
      card('clubs', '8').id,
    )
    // Bot hand should refill from draw pile (had 1 card, draw 2 left → hand
    // can grow up to 5 from draw; refills to 3 since draw only has 2 cards
    // remaining post-play).
    expect(next.players[0].hand.length).toBe(2)
  })

  it('throws on a state where the game is already won', () => {
    const state: SpeedState = buildState({
      myHand: [],
      pile0Top: card('hearts', '7'),
      pile1Top: card('diamonds', '2'),
    })
    const won: SpeedState = { ...state, winner: HUMAN }
    expect(() => pickAction(won, ME, mulberry32(1))).toThrow()
  })
})
