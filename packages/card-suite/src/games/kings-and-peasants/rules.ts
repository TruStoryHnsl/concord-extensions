/**
 * Kings & Peasants — Asshole/President/Scum 4-7 player variant.
 *
 * Spec: INS-006 §5.5.
 * Standard rules used:
 *   - 52-card deck dealt evenly; lowest-rank players take any extras.
 *   - Card power: 3 lowest, then 4..K, A, 2 highest. (2 acts as a "bomb" reset.)
 *   - Round flow: lowest-social-rank player leads any combo size 1..4 of one rank.
 *     Each subsequent player must play same combo size with strictly higher rank
 *     OR pass. Once everyone but the last player passes, that player leads next.
 *   - Bombs: a 2 (any combo size) can be played onto anything; clears the pile,
 *     same player leads again.
 *   - Finishing: as players run out of cards, they're assigned positions:
 *     King > Vice-King > middle (Neutral) > Vice-Peasant > Peasant.
 *   - Card-passing at next-round start: King takes Peasant's 2 best, gives 2 worst;
 *     Vice-King <-> Vice-Peasant exchange 1 each.
 *
 * State machine: a "round" plays until all but one player has finished.
 * After settle(), social ranks are remembered for the next round.
 */

import { Card, Rank, rankValue, Suit } from '../../engine/card'
import { Deck, shuffle, standardDeck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'

export type SocialRank =
  | 'king'
  | 'vice-king'
  | 'neutral'
  | 'vice-peasant'
  | 'peasant'

export interface KPPlayer {
  readonly id: PlayerId
  readonly hand: readonly Card[]
  /** Carries between rounds. */
  readonly socialRank: SocialRank
  /** Order finished within the current round (0 = first/king, etc.). null until they've gone out. */
  readonly finishOrder: number | null
}

export interface KPState {
  readonly players: readonly KPPlayer[]
  /** Index of player whose turn it is. Wraps around skipping finished and passers. */
  readonly toAct: number
  /**
   * Top combo on the trick pile, if any. After a clear (bomb or all-pass)
   * this is null and toAct may lead any combo.
   */
  readonly topCombo: { readonly cards: readonly Card[]; readonly leadBy: number } | null
  /** Players who have passed since the last clear. Resets on clear. */
  readonly passers: readonly number[]
  /** Total players who have finished this round (0 = none gone out). */
  readonly finishedCount: number
  readonly roundNumber: number
}

export interface KPInitOpts {
  readonly playerIds: readonly PlayerId[]
}

export type KPAction =
  | {
      kind: 'play'
      by: PlayerId
      cardIds: readonly string[] // 1..4 cards of the same rank
    }
  | { kind: 'pass'; by: PlayerId }
  | { kind: 'start-round' } // performed at game-end to deal next round with passes

// ---------- Power ranking -------------------------------------------------

/** 3 = 1 (lowest), ..., A = 12, 2 = 13 (highest). */
export function cardPower(rank: Rank): number {
  if (rank === '2') return 13
  if (rank === 'A') return 12
  if (rank === 'K') return 11
  if (rank === 'Q') return 10
  if (rank === 'J') return 9
  // 3..10 → 1..8
  return rankValue(rank) - 2
}

// ---------- Helpers -------------------------------------------------------

function replacePlayer(
  players: readonly KPPlayer[],
  idx: number,
  patch: Partial<KPPlayer>,
): KPPlayer[] {
  const out = [...players]
  out[idx] = { ...out[idx], ...patch }
  return out
}

function indexById(state: KPState, id: PlayerId): number {
  const idx = state.players.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`kings-and-peasants: no player ${id}`)
  return idx
}

function sortByPower(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => cardPower(a.rank) - cardPower(b.rank))
}

function sameRankCount(cards: readonly Card[]): { rank: Rank; count: number } | null {
  if (cards.length === 0) return null
  const r = cards[0].rank
  for (const c of cards) if (c.rank !== r) return null
  return { rank: r, count: cards.length }
}

function nextLivingIndex(state: KPState, from: number): number {
  const n = state.players.length
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n
    if (state.players[i].finishOrder === null) return i
  }
  return -1
}

// ---------- Initial deal --------------------------------------------------

export function makeInitial(opts: KPInitOpts, rng: RNG): KPState {
  const n = opts.playerIds.length
  if (n < 3 || n > 7) throw new Error('kings-and-peasants: requires 3-7 players')
  const deck: Deck = shuffle(standardDeck(), rng)
  const cards = [...deck.cards]
  // Distribute round-robin starting from the LAST player so that any extras
  // accrue to the first players (the lowest-rank seats once we set up the
  // first round). For round 1 nobody has a rank yet, so we just set every
  // player to 'neutral' and rely on round-2 ranking.
  const hands: Card[][] = Array.from({ length: n }, () => [])
  let i = 0
  while (cards.length > 0) {
    hands[i].push(cards.pop()!)
    i = (i + 1) % n
  }
  // For round 1, lowest-index leads (deterministic). The "lowest-rank player
  // leads" rule only matters from round 2 onward.
  const players: KPPlayer[] = opts.playerIds.map((id, idx) => ({
    id,
    hand: sortByPower(hands[idx]),
    socialRank: 'neutral',
    finishOrder: null,
  }))
  return {
    players,
    toAct: 0,
    topCombo: null,
    passers: [],
    finishedCount: 0,
    roundNumber: 1,
  }
}

// ---------- Card-passing helper (called between rounds) ------------------

/**
 * Re-deal the deck and apply card-passing per social ranks.
 * Returns a fresh state for the new round, preserving roundNumber+1.
 */
export function startNextRound(state: KPState, rng: RNG): KPState {
  // Re-deal
  const ids = state.players.map((p) => p.id)
  const fresh = makeInitial({ playerIds: ids }, rng)
  // Restore social ranks
  let players = fresh.players.map((p, i) => ({
    ...p,
    socialRank: state.players[i].socialRank,
  }))

  // Card-passing
  const findIdx = (rk: SocialRank) => players.findIndex((p) => p.socialRank === rk)
  const kingIdx = findIdx('king')
  const peasantIdx = findIdx('peasant')
  const viceKingIdx = findIdx('vice-king')
  const vicePeasantIdx = findIdx('vice-peasant')

  if (kingIdx >= 0 && peasantIdx >= 0) {
    const peasantHand = sortByPower(players[peasantIdx].hand)
    // 2 best of peasant go to king
    const give = peasantHand.slice(-2)
    const peasantRest = peasantHand.slice(0, -2)
    const kingHand = sortByPower(players[kingIdx].hand)
    // 2 worst of king go to peasant
    const giveBack = kingHand.slice(0, 2)
    const kingRest = kingHand.slice(2)
    players = replacePlayer(players, peasantIdx, {
      hand: sortByPower([...peasantRest, ...giveBack]),
    })
    players = replacePlayer(players, kingIdx, {
      hand: sortByPower([...kingRest, ...give]),
    })
  }
  if (viceKingIdx >= 0 && vicePeasantIdx >= 0) {
    const vp = sortByPower(players[vicePeasantIdx].hand)
    const give = vp.slice(-1)
    const vpRest = vp.slice(0, -1)
    const vk = sortByPower(players[viceKingIdx].hand)
    const giveBack = vk.slice(0, 1)
    const vkRest = vk.slice(1)
    players = replacePlayer(players, vicePeasantIdx, {
      hand: sortByPower([...vpRest, ...giveBack]),
    })
    players = replacePlayer(players, viceKingIdx, {
      hand: sortByPower([...vkRest, ...give]),
    })
  }

  // First lead = peasant (lowest social rank); fall back to first if unset
  let leadIdx = peasantIdx >= 0 ? peasantIdx : 0
  return {
    ...fresh,
    players,
    toAct: leadIdx,
    roundNumber: state.roundNumber + 1,
  }
}

// ---------- Legal actions -------------------------------------------------

export function legalActions(state: KPState, by: PlayerId): KPAction[] {
  const idx = state.players.findIndex((p) => p.id === by)
  if (idx < 0 || idx !== state.toAct) return []
  const me = state.players[idx]
  if (me.finishOrder !== null) return []
  const acts: KPAction[] = []
  // Pass is always legal except when leading (no top combo to follow).
  if (state.topCombo !== null) acts.push({ kind: 'pass', by })
  // Compute legal plays.
  const grouped = groupByRank(me.hand)
  if (state.topCombo === null) {
    // Lead: any combo size 1..count for any rank
    for (const [rank, cards] of grouped) {
      for (let k = 1; k <= cards.length; k++) {
        acts.push({ kind: 'play', by, cardIds: cards.slice(0, k).map((c) => c.id) })
      }
      void rank
    }
  } else {
    // Follow: same size, strictly higher power. OR a 2 (bomb) of equal size.
    const need = state.topCombo.cards.length
    const topPower = cardPower(state.topCombo.cards[0].rank)
    for (const [rank, cards] of grouped) {
      if (cards.length < need) continue
      const myPower = cardPower(rank)
      if (rank === '2' || myPower > topPower) {
        acts.push({ kind: 'play', by, cardIds: cards.slice(0, need).map((c) => c.id) })
      }
    }
  }
  return acts
}

function groupByRank(hand: readonly Card[]): Map<Rank, Card[]> {
  const m = new Map<Rank, Card[]>()
  for (const c of hand) {
    const list = m.get(c.rank)
    if (list) list.push(c)
    else m.set(c.rank, [c])
  }
  return m
}

// ---------- applyAction ---------------------------------------------------

export function applyAction(state: KPState, action: KPAction, rng: RNG): KPState {
  if (action.kind === 'start-round') {
    return startNextRound(state, rng)
  }

  const idx = indexById(state, action.by)
  if (idx !== state.toAct) throw new Error('kings-and-peasants: not your turn')
  const me = state.players[idx]
  if (me.finishOrder !== null) throw new Error('kings-and-peasants: already finished')

  if (action.kind === 'pass') {
    if (state.topCombo === null) throw new Error('kings-and-peasants: cannot pass when leading')
    const passers = [...state.passers, idx]
    let s: KPState = { ...state, passers }
    return advanceTurn(s)
  }

  // 'play'
  const cards = action.cardIds.map((id) => {
    const c = me.hand.find((x) => x.id === id)
    if (!c) throw new Error(`kings-and-peasants: ${id} not in hand`)
    return c
  })
  const sr = sameRankCount(cards)
  if (!sr) throw new Error('kings-and-peasants: combo must be same rank')
  if (sr.count < 1 || sr.count > 4) throw new Error('kings-and-peasants: combo size 1-4')

  // Validate against top
  const isBomb = sr.rank === '2'
  if (state.topCombo) {
    if (sr.count !== state.topCombo.cards.length) {
      throw new Error('kings-and-peasants: must match combo size')
    }
    if (!isBomb) {
      const topPower = cardPower(state.topCombo.cards[0].rank)
      if (cardPower(sr.rank) <= topPower) {
        throw new Error('kings-and-peasants: must beat top combo')
      }
    }
  }

  // Remove from hand
  const newHand = me.hand.filter((c) => !action.cardIds.includes(c.id))
  let players = replacePlayer(state.players, idx, { hand: newHand })

  // Just-finished?
  let finishedCount = state.finishedCount
  if (newHand.length === 0) {
    finishedCount += 1
    players = replacePlayer(players, idx, { finishOrder: finishedCount - 1 })
  }

  let s: KPState = {
    ...state,
    players,
    finishedCount,
    topCombo: { cards: [...cards], leadBy: idx },
    passers: [],
  }

  // If bomb, clear the pile and same player leads again.
  if (isBomb) {
    s = { ...s, topCombo: null, passers: [] }
    // Same player leads, unless they just finished.
    if (s.players[idx].finishOrder !== null) {
      s = { ...s, toAct: nextLivingIndex(s, idx) }
    }
    return checkRoundEnd(s)
  }

  // Else: advance turn
  s = advanceTurn(s)
  return checkRoundEnd(s)
}

function advanceTurn(state: KPState): KPState {
  const n = state.players.length
  // If the leader just played (topCombo set, leadBy = toAct), advance to next living.
  // Use number of "still in trick" players: living count minus passers count.
  const living = state.players.filter((p) => p.finishOrder === null)
  if (living.length <= 1) return state
  const passersSet = new Set(state.passers)
  // After this action, find next living non-passer.
  for (let step = 1; step <= n; step++) {
    const i = (state.toAct + step) % n
    const p = state.players[i]
    if (p.finishOrder !== null) continue
    if (passersSet.has(i)) continue
    if (state.topCombo && i === state.topCombo.leadBy) {
      // Action returned to leader → trick is over, leader leads again with no top.
      return { ...state, toAct: i, topCombo: null, passers: [] }
    }
    return { ...state, toAct: i }
  }
  // Everyone passed except leader → trick clears
  if (state.topCombo) {
    return { ...state, toAct: state.topCombo.leadBy, topCombo: null, passers: [] }
  }
  return state
}

function checkRoundEnd(state: KPState): KPState {
  const livingCount = state.players.filter((p) => p.finishOrder === null).length
  if (livingCount > 1) return state
  // Only one (or zero) left — assign last spot, set social ranks.
  const newPlayers = [...state.players]
  if (livingCount === 1) {
    const lastIdx = newPlayers.findIndex((p) => p.finishOrder === null)
    newPlayers[lastIdx] = { ...newPlayers[lastIdx], finishOrder: state.players.length - 1 }
  }
  // Assign social ranks by finishOrder
  const sorted = [...newPlayers].sort((a, b) => (a.finishOrder ?? 99) - (b.finishOrder ?? 99))
  const N = sorted.length
  const ranked: Record<PlayerId, SocialRank> = {}
  sorted.forEach((p, i) => {
    let rank: SocialRank
    if (i === 0) rank = 'king'
    else if (i === 1) rank = 'vice-king'
    else if (i === N - 1) rank = 'peasant'
    else if (i === N - 2) rank = 'vice-peasant'
    else rank = 'neutral'
    ranked[p.id] = rank
  })
  const updated = newPlayers.map((p) => ({ ...p, socialRank: ranked[p.id] }))
  return { ...state, players: updated }
}

// ---------- Terminal ------------------------------------------------------

export function terminalStatus(state: KPState): TerminalStatus {
  const livingCount = state.players.filter((p) => p.finishOrder === null).length
  if (livingCount <= 1) return 'win'
  return 'playing'
}

// ---------- Module export -------------------------------------------------

export const gameId = 'kings-and-peasants' as const
export const displayName = 'Kings & Peasants' as const
export const supportedModes: readonly UXMode[] = ['party', 'hybrid'] as const
export const minPlayers = 3
export const maxPlayers = 7

export const kingsAndPeasantsRules: GameRuleModule<KPState, KPAction, KPInitOpts> = {
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

// Re-exports for tests
export type { Suit }
