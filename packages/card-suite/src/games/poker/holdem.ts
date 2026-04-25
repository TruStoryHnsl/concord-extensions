/**
 * Texas Hold'em — pure round state machine.
 *
 * Spec: INS-006 §5.2.
 * Standard No-Limit Texas Hold'em betting: small blind, big blind, hole cards,
 * pre-flop, flop (3 community), turn (4th), river (5th), showdown.
 *
 * Actions per active player on their turn: check (if no bet to call),
 * call, raise (must be ≥ minRaise), fold. All-in is implicit when stack = 0.
 *
 * Side pots are computed at showdown by stratifying contributions; this
 * implementation supports the basic case of one or more all-in players plus
 * any others who matched the highest stake.
 *
 * Chip stacks are session-scoped — no real money. No tournament features.
 */

import { Card } from '../../engine/card'
import { Deck, draw, shuffle, standardDeck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'
import { compareHandRank, evaluate5of7, HandRank } from './hand-eval'

export type Phase =
  | 'pre-deal'
  | 'pre-flop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'hand-complete'

export interface PlayerSeat {
  readonly id: PlayerId
  readonly stack: number
  /** Hole cards if dealt. */
  readonly hole: readonly Card[]
  /** Total contributed to the pot this hand. */
  readonly committed: number
  /** Amount committed in the current betting round (resets each phase). */
  readonly streetBet: number
  readonly folded: boolean
  /** True once stack hits 0 mid-hand. */
  readonly allIn: boolean
}

export interface HoldemState {
  readonly seats: readonly PlayerSeat[]
  readonly community: readonly Card[]
  readonly deck: Deck
  readonly phase: Phase
  /** Index of the dealer button. */
  readonly button: number
  /** Index of the player whose turn it is. -1 between phases. */
  readonly toAct: number
  readonly smallBlind: number
  readonly bigBlind: number
  /** Highest streetBet in the current betting round. */
  readonly currentBet: number
  /** Minimum legal raise increment for this round. */
  readonly minRaise: number
  /** Total pot (committed across all players). */
  readonly pot: number
  /** Hand counter for telemetry. */
  readonly handNumber: number
  /** Last raiser in the round; closes the round when action returns here. */
  readonly lastRaiser: number
  /** Indices of seats that have acted (check/call/raise/fold) this round. Reset each street. */
  readonly actedThisRound: readonly number[]
  /** Per-pot winners after showdown. Empty until phase = hand-complete. */
  readonly winners: readonly { ids: readonly PlayerId[]; amount: number }[]
}

export interface HoldemInitOpts {
  readonly playerIds: readonly PlayerId[]
  readonly startingStack?: number
  readonly smallBlind?: number
  readonly bigBlind?: number
}

export type HoldemAction =
  | { kind: 'check'; by: PlayerId }
  | { kind: 'call'; by: PlayerId }
  | { kind: 'raise'; by: PlayerId; to: number } // total streetBet to raise to
  | { kind: 'fold'; by: PlayerId }
  | { kind: 'deal' } // bookkeeping: advance phase + deal

const DEFAULT_STARTING_STACK = 1000
const DEFAULT_SB = 5
const DEFAULT_BB = 10

// ---------- Helpers -------------------------------------------------------

function activeSeats(state: HoldemState): PlayerSeat[] {
  return state.seats.filter((s) => !s.folded)
}

function activeIndices(state: HoldemState): number[] {
  const out: number[] = []
  state.seats.forEach((s, i) => {
    if (!s.folded) out.push(i)
  })
  return out
}

function nextActiveIndex(state: HoldemState, from: number): number {
  const n = state.seats.length
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n
    const s = state.seats[idx]
    if (!s.folded && !s.allIn) return idx
  }
  return -1
}

function replaceSeat(seats: readonly PlayerSeat[], idx: number, patch: Partial<PlayerSeat>): PlayerSeat[] {
  const out = [...seats]
  out[idx] = { ...out[idx], ...patch }
  return out
}

function findSeat(state: HoldemState, by: PlayerId): { idx: number; seat: PlayerSeat } {
  const idx = state.seats.findIndex((s) => s.id === by)
  if (idx < 0) throw new Error(`holdem: no seat for ${by}`)
  return { idx, seat: state.seats[idx] }
}

function postContribution(seats: readonly PlayerSeat[], idx: number, amount: number): PlayerSeat[] {
  const seat = seats[idx]
  const real = Math.min(amount, seat.stack)
  return replaceSeat(seats, idx, {
    stack: seat.stack - real,
    streetBet: seat.streetBet + real,
    committed: seat.committed + real,
    allIn: seat.stack - real === 0,
  })
}

// ---------- Initial / deal ------------------------------------------------

export function makeInitial(opts: HoldemInitOpts, _rng: RNG): HoldemState {
  if (opts.playerIds.length < 2) throw new Error('holdem: need at least 2 players')
  if (opts.playerIds.length > 8) throw new Error('holdem: max 8 players')
  const startingStack = opts.startingStack ?? DEFAULT_STARTING_STACK
  const sb = opts.smallBlind ?? DEFAULT_SB
  const bb = opts.bigBlind ?? DEFAULT_BB

  const seats: PlayerSeat[] = opts.playerIds.map((id) => ({
    id,
    stack: startingStack,
    hole: [],
    committed: 0,
    streetBet: 0,
    folded: false,
    allIn: false,
  }))

  return {
    seats,
    community: [],
    deck: standardDeck(),
    phase: 'pre-deal',
    button: 0,
    toAct: -1,
    smallBlind: sb,
    bigBlind: bb,
    currentBet: 0,
    minRaise: bb,
    pot: 0,
    handNumber: 0,
    lastRaiser: -1,
    actedThisRound: [],
    winners: [],
  }
}

/** Deal a hand: shuffle, post blinds, deal 2 hole cards each, set toAct. */
export function dealHand(state: HoldemState, rng: RNG): HoldemState {
  if (state.phase !== 'pre-deal' && state.phase !== 'hand-complete') {
    throw new Error(`holdem: cannot deal in phase ${state.phase}`)
  }
  // Reset per-hand seat state
  let seats: PlayerSeat[] = state.seats.map((s) => ({
    ...s,
    hole: [],
    committed: 0,
    streetBet: 0,
    folded: s.stack === 0, // out-of-chips players sit out
    allIn: false,
  }))
  const n = seats.length
  // Shift button forward (button = state.button for first hand, then +1)
  const button = state.handNumber === 0 ? state.button : (state.button + 1) % n

  // Determine SB and BB seats (heads-up: button = SB, opponent = BB)
  const inHand = (s: PlayerSeat) => !s.folded
  const liveIndices: number[] = []
  for (let i = 0; i < n; i++) {
    const idx = (button + i) % n
    if (inHand(seats[idx])) liveIndices.push(idx)
  }
  if (liveIndices.length < 2) throw new Error('holdem: not enough chipped players to deal')

  let sbIdx: number
  let bbIdx: number
  if (liveIndices.length === 2) {
    sbIdx = liveIndices[0] // button posts SB heads-up
    bbIdx = liveIndices[1]
  } else {
    sbIdx = liveIndices[1]
    bbIdx = liveIndices[2]
  }

  // Post blinds
  seats = postContribution(seats, sbIdx, state.smallBlind)
  seats = postContribution(seats, bbIdx, state.bigBlind)

  // Shuffle and deal 2 hole cards each (in order, two passes)
  let deck = shuffle(state.deck, rng)
  for (let pass = 0; pass < 2; pass++) {
    for (const idx of liveIndices) {
      const { drawn, remaining } = draw(deck, 1)
      deck = remaining
      seats = replaceSeat(seats, idx, { hole: [...seats[idx].hole, drawn[0]] })
    }
  }

  // First to act pre-flop is left of BB. If BB is last among 2 players, SB acts first.
  let firstToAct: number
  if (liveIndices.length === 2) {
    firstToAct = sbIdx // heads-up: SB acts first pre-flop
  } else {
    const bbPos = liveIndices.indexOf(bbIdx)
    firstToAct = liveIndices[(bbPos + 1) % liveIndices.length]
  }

  return {
    ...state,
    seats,
    deck,
    community: [],
    phase: 'pre-flop',
    button,
    toAct: firstToAct,
    currentBet: state.bigBlind,
    minRaise: state.bigBlind,
    pot: state.smallBlind + state.bigBlind,
    handNumber: state.handNumber + 1,
    lastRaiser: bbIdx, // BB is the implicit last raiser pre-flop
    actedThisRound: [], // BB hasn't taken their option yet
    winners: [],
  }
}

// ---------- legalActions --------------------------------------------------

export function legalActions(state: HoldemState, by: PlayerId): HoldemAction[] {
  if (state.phase === 'pre-deal' || state.phase === 'hand-complete') {
    if (by === state.seats[0].id) return [{ kind: 'deal' }]
    return []
  }
  if (state.phase === 'showdown') {
    if (by === state.seats[0].id) return [{ kind: 'deal' }]
    return []
  }
  if (state.toAct < 0) return []
  if (state.seats[state.toAct].id !== by) return []
  const seat = state.seats[state.toAct]
  if (seat.folded || seat.allIn) return []

  const acts: HoldemAction[] = []
  const owed = state.currentBet - seat.streetBet
  acts.push({ kind: 'fold', by })
  if (owed === 0) {
    acts.push({ kind: 'check', by })
  } else {
    acts.push({ kind: 'call', by })
  }
  // Raise: minimum total streetBet must be currentBet + minRaise (or all-in)
  const minRaiseTo = state.currentBet + state.minRaise
  const maxRaiseTo = seat.streetBet + seat.stack
  if (maxRaiseTo > state.currentBet) {
    // can either go to minRaiseTo if allowed, or shove all-in if shorter
    const target = Math.min(minRaiseTo, maxRaiseTo)
    acts.push({ kind: 'raise', by, to: target })
  }
  return acts
}

// ---------- applyAction ---------------------------------------------------

export function applyAction(state: HoldemState, action: HoldemAction, rng: RNG): HoldemState {
  if (action.kind === 'deal') {
    if (state.phase === 'pre-deal' || state.phase === 'hand-complete') {
      return dealHand(state, rng)
    }
    if (state.phase === 'showdown') {
      // Settle showdown then transition to hand-complete
      return settleShowdown(state)
    }
    throw new Error(`holdem: cannot 'deal' in phase ${state.phase}`)
  }

  if (state.toAct < 0) throw new Error('holdem: no active turn')
  const acting = state.seats[state.toAct]
  if (acting.id !== action.by) throw new Error(`holdem: not ${action.by}'s turn`)
  if (acting.folded || acting.allIn) throw new Error('holdem: player cannot act')

  let s = state
  // Mark this seat as having acted this round.
  const recordActed = (st: HoldemState): HoldemState => {
    if (st.actedThisRound.includes(st.toAct)) return st
    return { ...st, actedThisRound: [...st.actedThisRound, st.toAct] }
  }
  switch (action.kind) {
    case 'fold': {
      s = { ...s, seats: replaceSeat(s.seats, s.toAct, { folded: true }) }
      break
    }
    case 'check': {
      const owed = s.currentBet - acting.streetBet
      if (owed !== 0) throw new Error('holdem: cannot check, owed > 0')
      break
    }
    case 'call': {
      const owed = s.currentBet - acting.streetBet
      if (owed <= 0) throw new Error('holdem: nothing to call')
      const seats = postContribution(s.seats, s.toAct, owed)
      const realPaid = seats[s.toAct].streetBet - acting.streetBet
      s = { ...s, seats, pot: s.pot + realPaid }
      break
    }
    case 'raise': {
      const target = action.to
      if (target <= s.currentBet) throw new Error('holdem: raise must exceed currentBet')
      const owed = target - acting.streetBet
      if (owed > acting.stack) throw new Error('holdem: insufficient stack to raise')
      const incrementOverCurrent = target - s.currentBet
      const minIncrement = s.minRaise
      const isAllIn = owed === acting.stack
      // Standard NLHE: an all-in below minRaise does NOT reopen action.
      // For simplicity we allow it but only reopen if increment >= minRaise.
      const seats = postContribution(s.seats, s.toAct, owed)
      const newCurrent = seats[s.toAct].streetBet
      const reopens = incrementOverCurrent >= minIncrement
      s = {
        ...s,
        seats,
        pot: s.pot + owed,
        currentBet: newCurrent,
        minRaise: reopens ? incrementOverCurrent : s.minRaise,
        lastRaiser: reopens ? s.toAct : s.lastRaiser,
      }
      // If non-reopening all-in, lastRaiser unchanged
      void isAllIn
      break
    }
  }

  // Record that this seat has acted (after applying the action).
  s = recordActed(s)

  // If raise reopened action, clear acted-set except the raiser themselves.
  if (action.kind === 'raise' && s.lastRaiser === s.toAct) {
    s = { ...s, actedThisRound: [s.toAct] }
  }

  // Check fold-to-win: if only one active player remains, hand ends.
  const activeIdx = activeIndices(s)
  if (activeIdx.length === 1) {
    const winner = s.seats[activeIdx[0]]
    const newSeats = replaceSeat(s.seats, activeIdx[0], { stack: winner.stack + s.pot })
    return {
      ...s,
      seats: newSeats,
      pot: 0,
      phase: 'hand-complete',
      toAct: -1,
      winners: [{ ids: [winner.id], amount: s.pot }],
    }
  }

  // Advance turn or close the betting round.
  s = advanceAction(s)
  return s
}

function advanceAction(state: HoldemState): HoldemState {
  // Find next eligible to act
  const next = nextActiveIndex(state, state.toAct)
  if (next === -1) {
    // Everyone is all-in or folded. Run out the streets without further betting.
    return roundClose(state)
  }
  // Round closes when every still-eligible seat has both acted this round
  // and matched the currentBet. (allIn seats are skipped; folded seats are
  // skipped; the subset to check is "non-folded, non-allIn".)
  const eligible: number[] = []
  state.seats.forEach((s, i) => {
    if (!s.folded && !s.allIn) eligible.push(i)
  })
  const allActed = eligible.every((i) => state.actedThisRound.includes(i))
  const allMatched = eligible.every((i) => state.seats[i].streetBet === state.currentBet)
  if (allActed && allMatched) return roundClose(state)
  return { ...state, toAct: next }
}

function roundClose(state: HoldemState): HoldemState {
  // Reset streetBet on all seats; advance phase.
  const seats = state.seats.map((s) => ({ ...s, streetBet: 0 }))
  state = { ...state, actedThisRound: [] }
  switch (state.phase) {
    case 'pre-flop': {
      const { drawn, remaining } = burnAndDeal(state.deck, 3)
      return openStreet({ ...state, seats, deck: remaining, community: [...state.community, ...drawn] }, 'flop')
    }
    case 'flop': {
      const { drawn, remaining } = burnAndDeal(state.deck, 1)
      return openStreet({ ...state, seats, deck: remaining, community: [...state.community, ...drawn] }, 'turn')
    }
    case 'turn': {
      const { drawn, remaining } = burnAndDeal(state.deck, 1)
      return openStreet({ ...state, seats, deck: remaining, community: [...state.community, ...drawn] }, 'river')
    }
    case 'river': {
      return { ...state, seats, phase: 'showdown', toAct: -1 }
    }
    case 'showdown':
    case 'hand-complete':
    case 'pre-deal':
      return state
  }
}

function burnAndDeal(deck: Deck, n: number): { drawn: Card[]; remaining: Deck } {
  // Burn 1
  const burn = draw(deck, 1)
  return draw(burn.remaining, n)
}

function openStreet(state: HoldemState, phase: Phase): HoldemState {
  // First to act post-flop is first active seat left of button.
  const n = state.seats.length
  let firstActive = -1
  for (let i = 1; i <= n; i++) {
    const idx = (state.button + i) % n
    if (!state.seats[idx].folded && !state.seats[idx].allIn) {
      firstActive = idx
      break
    }
  }
  if (firstActive < 0) {
    // Everyone is all-in; deal more streets without action
    return roundClose({
      ...state,
      phase,
      toAct: -1,
      currentBet: 0,
      minRaise: state.bigBlind,
      lastRaiser: -1,
    })
  }
  return {
    ...state,
    phase,
    toAct: firstActive,
    currentBet: 0,
    minRaise: state.bigBlind,
    lastRaiser: firstActive, // first to act is implicit "last raiser"; once they act and round circles back, it closes
    actedThisRound: [],
  }
}

// ---------- Showdown -------------------------------------------------------

function settleShowdown(state: HoldemState): HoldemState {
  if (state.community.length !== 5) throw new Error('holdem: showdown without 5 community cards')
  const contenders = activeIndices(state)
  if (contenders.length === 0) throw new Error('holdem: showdown with no contenders')

  // Side-pot stratification: sort contenders by committed asc, layer pots.
  // Each layer = (next committed level - prior level) * (count of seats meeting that level).
  const allSeatsByCommit = [...state.seats].map((s, i) => ({ idx: i, seat: s }))
  // Distinct commit levels (ascending, only positive)
  const commitLevels = [...new Set(state.seats.map((s) => s.committed))].filter((v) => v > 0).sort((a, b) => a - b)

  let prior = 0
  const winners: { ids: PlayerId[]; amount: number }[] = []
  // Track payouts to apply at the end
  const payouts = new Map<number, number>()

  for (const lvl of commitLevels) {
    const layerSeats = allSeatsByCommit.filter((x) => x.seat.committed >= lvl)
    const layerAmount = (lvl - prior) * layerSeats.length
    prior = lvl
    if (layerAmount <= 0) continue
    // Eligible to win this layer = non-folded contenders who contributed at least lvl
    const eligible = layerSeats.filter((x) => !x.seat.folded)
    if (eligible.length === 0) continue
    const evals: Array<{ idx: number; rank: HandRank }> = eligible.map((x) => ({
      idx: x.idx,
      rank: evaluate5of7(
        [x.seat.hole[0], x.seat.hole[1]],
        state.community,
      ),
    }))
    // Find best
    let best = evals[0].rank
    for (const e of evals) if (compareHandRank(e.rank, best) > 0) best = e.rank
    const tied = evals.filter((e) => compareHandRank(e.rank, best) === 0)
    const share = Math.floor(layerAmount / tied.length)
    const remainder = layerAmount - share * tied.length
    tied.forEach((t, k) => {
      const got = share + (k < remainder ? 1 : 0)
      payouts.set(t.idx, (payouts.get(t.idx) ?? 0) + got)
    })
    winners.push({ ids: tied.map((t) => state.seats[t.idx].id), amount: layerAmount })
  }

  let newSeats = state.seats
  for (const [idx, amount] of payouts) {
    newSeats = replaceSeat(newSeats, idx, { stack: newSeats[idx].stack + amount })
  }
  return {
    ...state,
    seats: newSeats,
    pot: 0,
    phase: 'hand-complete',
    toAct: -1,
    winners,
  }
}

// ---------- terminalStatus ------------------------------------------------

export function terminalStatus(state: HoldemState): TerminalStatus {
  // The "terminal" of a hold'em session is when only one player has chips.
  const withChips = state.seats.filter((s) => s.stack > 0)
  if (withChips.length <= 1) return 'win'
  return 'playing'
}

// ---------- Module export -------------------------------------------------

export const gameId = 'holdem' as const
export const displayName = "Texas Hold'em" as const
export const supportedModes: readonly UXMode[] = ['party', 'hybrid'] as const
export const minPlayers = 2
export const maxPlayers = 8

export const holdemRules: GameRuleModule<HoldemState, HoldemAction, HoldemInitOpts> = {
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
