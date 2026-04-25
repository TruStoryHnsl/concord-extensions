/**
 * Blackjack — pure round state machine.
 *
 * Spec: INS-006 §5.3.
 * Rules: 1–7 players against a house dealer. H17 (dealer hits soft 17).
 * Player options on each turn: hit / stand / double / split / surrender.
 * Blackjack natural pays 3:2; tie with dealer = push (stake returned).
 *
 * State machine phases:
 *   pre-bet      — players post bets
 *   dealing      — initial deal sequence (handled atomically in makeInitial / nextHand)
 *   players-turn — each player plays each of their hands in seat order
 *   dealer-turn  — dealer plays per dealerPolicy
 *   settle       — payouts assigned to seats
 *   complete     — final state for this round
 */

import { Card } from '../../engine/card'
import { Deck, draw, shuffle, standardDeck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'
import { dealerPolicy, scoreHand } from './dealer-ai'

export type Phase = 'pre-bet' | 'players-turn' | 'dealer-turn' | 'settle' | 'complete'

export interface PlayerHand {
  readonly cards: readonly Card[]
  readonly bet: number
  readonly doubled: boolean
  readonly stood: boolean
  readonly busted: boolean
  readonly surrendered: boolean
  /** True for the second of two split hands. */
  readonly fromSplit: boolean
  /** Resolved at settle: 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'. */
  readonly result: BlackjackHandResult | null
  /** Net chip change (positive on win, negative on loss). */
  readonly payout: number
}

export type BlackjackHandResult = 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'

export interface BlackjackPlayer {
  readonly id: PlayerId
  readonly stack: number
  readonly hands: readonly PlayerHand[]
  /** Index of the hand currently being played. */
  readonly activeHand: number
}

export interface BlackjackState {
  readonly players: readonly BlackjackPlayer[]
  readonly dealer: { readonly cards: readonly Card[] }
  readonly deck: Deck
  readonly phase: Phase
  /** Index of player whose turn it is during 'players-turn'. */
  readonly toAct: number
  readonly initialBet: number
}

export interface BlackjackInitOpts {
  readonly playerIds: readonly PlayerId[]
  readonly startingStack?: number
  readonly initialBet?: number
}

export type BlackjackAction =
  | { kind: 'hit'; by: PlayerId }
  | { kind: 'stand'; by: PlayerId }
  | { kind: 'double'; by: PlayerId }
  | { kind: 'split'; by: PlayerId }
  | { kind: 'surrender'; by: PlayerId }
  /** Driver action: dealer plays per policy until done; then settle. */
  | { kind: 'dealer-play' }

const DEFAULT_STACK = 1000
const DEFAULT_BET = 50

// ---------- Helpers -------------------------------------------------------

function replacePlayer(
  players: readonly BlackjackPlayer[],
  idx: number,
  patch: Partial<BlackjackPlayer>,
): BlackjackPlayer[] {
  const out = [...players]
  out[idx] = { ...out[idx], ...patch }
  return out
}

function replaceHand(
  hands: readonly PlayerHand[],
  idx: number,
  patch: Partial<PlayerHand>,
): PlayerHand[] {
  const out = [...hands]
  out[idx] = { ...out[idx], ...patch }
  return out
}

function findPlayer(state: BlackjackState, id: PlayerId): { idx: number; player: BlackjackPlayer } {
  const idx = state.players.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`blackjack: no player ${id}`)
  return { idx, player: state.players[idx] }
}

// ---------- Initial deal --------------------------------------------------

export function makeInitial(opts: BlackjackInitOpts, rng: RNG): BlackjackState {
  if (opts.playerIds.length < 1) throw new Error('blackjack: need at least 1 player')
  if (opts.playerIds.length > 7) throw new Error('blackjack: max 7 players')
  const startingStack = opts.startingStack ?? DEFAULT_STACK
  const initialBet = opts.initialBet ?? DEFAULT_BET
  if (initialBet > startingStack) {
    throw new Error('blackjack: initial bet exceeds starting stack')
  }

  let deck = shuffle(standardDeck(), rng)
  const players: BlackjackPlayer[] = opts.playerIds.map((id) => ({
    id,
    stack: startingStack - initialBet,
    hands: [
      {
        cards: [],
        bet: initialBet,
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
  }))

  // Standard deal: two passes around the table; dealer takes 1 card per pass too.
  const dealerCards: Card[] = []
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < players.length; i++) {
      const { drawn, remaining } = draw(deck, 1)
      deck = remaining
      const hand = players[i].hands[0]
      players[i] = {
        ...players[i],
        hands: replaceHand(players[i].hands, 0, { cards: [...hand.cards, drawn[0]] }),
      }
    }
    const { drawn, remaining } = draw(deck, 1)
    deck = remaining
    dealerCards.push(drawn[0])
  }

  // Auto-resolve naturals: any player with blackjack auto-stands now.
  for (let i = 0; i < players.length; i++) {
    const h0 = players[i].hands[0]
    if (scoreHand(h0.cards).blackjack) {
      players[i] = {
        ...players[i],
        hands: replaceHand(players[i].hands, 0, { stood: true }),
      }
    }
  }

  const state: BlackjackState = {
    players,
    dealer: { cards: dealerCards },
    deck,
    phase: 'players-turn',
    toAct: 0,
    initialBet,
  }
  // Skip players already done.
  return advanceTurnIfNeeded(state)
}

// ---------- legalActions --------------------------------------------------

export function legalActions(state: BlackjackState, by: PlayerId): BlackjackAction[] {
  if (state.phase === 'dealer-turn') {
    if (by === state.players[0].id) return [{ kind: 'dealer-play' }]
    return []
  }
  if (state.phase !== 'players-turn') return []
  if (state.toAct < 0) return []
  const player = state.players[state.toAct]
  if (player.id !== by) return []
  const hand = player.hands[player.activeHand]
  if (handTerminal(hand)) return []

  const acts: BlackjackAction[] = [
    { kind: 'hit', by },
    { kind: 'stand', by },
  ]
  // Surrender only allowed on first action of an unsplit hand (2 cards, not from split, not doubled).
  if (
    hand.cards.length === 2 &&
    !hand.fromSplit &&
    !hand.doubled &&
    !hand.surrendered &&
    !hand.stood
  ) {
    acts.push({ kind: 'surrender', by })
  }
  // Double down: only on first action (2 cards) and stack ≥ bet.
  if (hand.cards.length === 2 && player.stack >= hand.bet) {
    acts.push({ kind: 'double', by })
  }
  // Split: only with 2 cards of equal rank, and on the first hand of a split chain.
  if (
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank &&
    player.stack >= hand.bet &&
    player.hands.length < 4 // cap split depth
  ) {
    acts.push({ kind: 'split', by })
  }
  return acts
}

function handTerminal(h: PlayerHand): boolean {
  return h.stood || h.busted || h.surrendered
}

// ---------- applyAction ---------------------------------------------------

export function applyAction(
  state: BlackjackState,
  action: BlackjackAction,
  _rng: RNG,
): BlackjackState {
  if (action.kind === 'dealer-play') {
    if (state.phase !== 'dealer-turn') {
      throw new Error(`blackjack: cannot dealer-play in phase ${state.phase}`)
    }
    return runDealerToCompletion(state)
  }

  if (state.phase !== 'players-turn') throw new Error('blackjack: not in players-turn')
  const { idx: pIdx, player } = findPlayer(state, action.by)
  if (pIdx !== state.toAct) throw new Error('blackjack: not your turn')
  const handIdx = player.activeHand
  const hand = player.hands[handIdx]
  if (handTerminal(hand)) throw new Error('blackjack: hand already terminal')

  let s = state
  switch (action.kind) {
    case 'hit': {
      const { drawn, remaining } = draw(s.deck, 1)
      const cards = [...hand.cards, drawn[0]]
      const sc = scoreHand(cards)
      const updatedHand: Partial<PlayerHand> = {
        cards,
        busted: sc.bust,
        stood: sc.bust ? false : hand.stood,
      }
      const newHands = replaceHand(player.hands, handIdx, updatedHand)
      s = {
        ...s,
        deck: remaining,
        players: replacePlayer(s.players, pIdx, { hands: newHands }),
      }
      // 21 auto-stands.
      if (sc.total === 21 && !sc.bust) {
        s = {
          ...s,
          players: replacePlayer(s.players, pIdx, {
            hands: replaceHand(s.players[pIdx].hands, handIdx, { stood: true }),
          }),
        }
      }
      break
    }
    case 'stand': {
      const newHands = replaceHand(player.hands, handIdx, { stood: true })
      s = { ...s, players: replacePlayer(s.players, pIdx, { hands: newHands }) }
      break
    }
    case 'double': {
      if (hand.cards.length !== 2) throw new Error('blackjack: can only double on 2 cards')
      if (player.stack < hand.bet) throw new Error('blackjack: insufficient stack to double')
      const { drawn, remaining } = draw(s.deck, 1)
      const cards = [...hand.cards, drawn[0]]
      const sc = scoreHand(cards)
      const newHands = replaceHand(player.hands, handIdx, {
        cards,
        bet: hand.bet * 2,
        doubled: true,
        stood: !sc.bust, // doubled forces stand; busted overrides
        busted: sc.bust,
      })
      s = {
        ...s,
        deck: remaining,
        players: replacePlayer(s.players, pIdx, {
          stack: player.stack - hand.bet,
          hands: newHands,
        }),
      }
      break
    }
    case 'split': {
      if (hand.cards.length !== 2) throw new Error('blackjack: split requires 2 cards')
      if (hand.cards[0].rank !== hand.cards[1].rank) {
        throw new Error('blackjack: split requires equal ranks')
      }
      if (player.stack < hand.bet) throw new Error('blackjack: insufficient stack to split')
      const [c1, c2] = hand.cards
      // Replace the existing hand with a single-card version + insert a new hand.
      const left: PlayerHand = {
        cards: [c1],
        bet: hand.bet,
        doubled: false,
        stood: false,
        busted: false,
        surrendered: false,
        fromSplit: true,
        result: null,
        payout: 0,
      }
      const right: PlayerHand = {
        cards: [c2],
        bet: hand.bet,
        doubled: false,
        stood: false,
        busted: false,
        surrendered: false,
        fromSplit: true,
        result: null,
        payout: 0,
      }
      // Deal one card to each
      let deck = s.deck
      const d1 = draw(deck, 1)
      deck = d1.remaining
      const d2 = draw(deck, 1)
      deck = d2.remaining
      const leftFilled: PlayerHand = { ...left, cards: [c1, d1.drawn[0]] }
      const rightFilled: PlayerHand = { ...right, cards: [c2, d2.drawn[0]] }
      const newHands = [
        ...player.hands.slice(0, handIdx),
        leftFilled,
        rightFilled,
        ...player.hands.slice(handIdx + 1),
      ]
      s = {
        ...s,
        deck,
        players: replacePlayer(s.players, pIdx, {
          stack: player.stack - hand.bet,
          hands: newHands,
        }),
      }
      break
    }
    case 'surrender': {
      const newHands = replaceHand(player.hands, handIdx, { surrendered: true })
      s = { ...s, players: replacePlayer(s.players, pIdx, { hands: newHands }) }
      break
    }
  }

  return advanceTurnIfNeeded(s)
}

function advanceTurnIfNeeded(state: BlackjackState): BlackjackState {
  let s = state
  // While current player's active hand is terminal, advance.
  let safety = 50
  while (safety-- > 0) {
    if (s.phase !== 'players-turn') return s
    const player = s.players[s.toAct]
    const hand = player.hands[player.activeHand]
    if (!handTerminal(hand)) return s
    // Move to next hand
    if (player.activeHand + 1 < player.hands.length) {
      s = {
        ...s,
        players: replacePlayer(s.players, s.toAct, { activeHand: player.activeHand + 1 }),
      }
      continue
    }
    // Move to next player
    if (s.toAct + 1 < s.players.length) {
      s = { ...s, toAct: s.toAct + 1 }
      continue
    }
    // All players done — dealer's turn.
    return { ...s, phase: 'dealer-turn', toAct: -1 }
  }
  return s
}

function runDealerToCompletion(state: BlackjackState): BlackjackState {
  // Determine if any non-surrendered, non-busted hands remain that are not blackjack.
  // The dealer still plays unless every player surrendered or busted; in those
  // cases payouts are already determinable but the dealer is required to draw
  // to a final hand for spectator clarity (cheap to run, doesn't change result).
  let dealerCards: Card[] = [...state.dealer.cards]
  let deck = state.deck
  while (dealerPolicy(dealerCards) === 'hit') {
    const { drawn, remaining } = draw(deck, 1)
    dealerCards = [...dealerCards, drawn[0]]
    deck = remaining
  }
  const settled = settleAll({ ...state, dealer: { cards: dealerCards }, deck })
  return { ...settled, phase: 'complete' }
}

function settleAll(state: BlackjackState): BlackjackState {
  const dealerScore = scoreHand(state.dealer.cards)
  const newPlayers: BlackjackPlayer[] = state.players.map((p) => {
    const newHands: PlayerHand[] = p.hands.map((h) => settleHand(h, dealerScore))
    let stackDelta = 0
    for (const h of newHands) stackDelta += h.payout
    return { ...p, stack: p.stack + stackDelta, hands: newHands }
  })
  return { ...state, players: newPlayers, phase: 'settle' }
}

function settleHand(
  h: PlayerHand,
  dealerScore: { total: number; bust: boolean; blackjack: boolean },
): PlayerHand {
  if (h.surrendered) {
    // Lose half the bet; recover other half. payout = -bet/2 (relative to 0 baseline)
    return { ...h, result: 'surrender', payout: Math.floor(h.bet / 2) }
  }
  const ps = scoreHand(h.cards)
  if (h.busted) {
    return { ...h, result: 'loss', payout: 0 }
  }
  // Natural blackjack (only on initial 2-card non-split hand)
  if (ps.blackjack && !h.fromSplit) {
    if (dealerScore.blackjack) {
      // push: return original bet (payout = bet)
      return { ...h, result: 'push', payout: h.bet }
    }
    // 3:2 + return bet → payout = bet + bet*1.5 = 2.5*bet (we use floor(bet*1.5) for clean integers)
    return { ...h, result: 'blackjack', payout: h.bet + Math.floor(h.bet * 1.5) }
  }
  if (dealerScore.bust) {
    return { ...h, result: 'win', payout: h.bet * 2 }
  }
  if (ps.total > dealerScore.total) {
    return { ...h, result: 'win', payout: h.bet * 2 }
  }
  if (ps.total < dealerScore.total) {
    return { ...h, result: 'loss', payout: 0 }
  }
  return { ...h, result: 'push', payout: h.bet }
}

// ---------- terminalStatus ------------------------------------------------

export function terminalStatus(state: BlackjackState): TerminalStatus {
  if (state.phase === 'complete' || state.phase === 'settle') {
    // From a single-player POV: if at least one hand won → win.
    // For multiplayer, treat as 'win' if any player came out positive total.
    const totalPayouts = state.players.flatMap((p) => p.hands.map((h) => h.payout - h.bet))
    const sum = totalPayouts.reduce((a, b) => a + b, 0)
    if (sum > 0) return 'win'
    if (sum < 0) return 'loss'
    return 'draw'
  }
  return 'playing'
}

// ---------- Module export -------------------------------------------------

export const gameId = 'blackjack' as const
export const displayName = 'Blackjack' as const
export const supportedModes: readonly UXMode[] = ['party', 'display', 'service', 'hybrid'] as const
export const minPlayers = 1
export const maxPlayers = 7

export const blackjackRules: GameRuleModule<BlackjackState, BlackjackAction, BlackjackInitOpts> = {
  gameId,
  displayName,
  supportedModes,
  minPlayers,
  maxPlayers,
  makeInitial,
  legalActions,
  applyAction,
  terminalStatus,
}
