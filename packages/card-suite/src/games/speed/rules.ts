/**
 * Speed (a.k.a. Spit) — pure 2-player state machine.
 *
 * Spec: INS-006 §5.4.
 * Setup (one canonical layout — many variants exist; we pick this one):
 *   - 52-card shuffled deck split 26/26 between the two players.
 *   - Each player has:
 *       - draw pile: 15 cards (face-down)
 *       - working hand: 5 cards (face-up to that player)
 *       - side stack: remaining 6 cards used to seed and replenish discards
 *   - Two center discard piles, each seeded with the top of one player's
 *     side stack (1 card each, face-up).
 *
 * Rules:
 *   - On any tick, either player may play one card from their working hand
 *     onto either discard pile if its rank is exactly one above OR one below
 *     the top discard. Ranks wrap: A↔K and A↔2 (Ace is adjacent to both 2 and K).
 *   - After a play, the player draws from their draw pile up to a 5-card hand.
 *   - Stuck state: if neither player has a legal move, both reveal one card
 *     from their side stack onto the matching discard. If a player's side
 *     stack is empty when needed, the unmatched discard simply doesn't change.
 *   - Win: first player to empty BOTH their working hand and draw pile.
 *
 * Note on "real-time": this module is the *state machine*. The renderer is
 * responsible for the 10Hz tick from the spec — but the rules module itself
 * is purely turn-based: any legal action resolves immediately. Conflicts
 * (two simultaneous plays in the same tick) are resolved deterministically
 * by player id ordering — see applyAction below.
 */

import { Card } from '../../engine/card'
import { Deck, shuffle, standardDeck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'

export interface SpeedPlayer {
  readonly id: PlayerId
  readonly hand: readonly Card[]
  readonly draw: readonly Card[]
  readonly sideStack: readonly Card[]
}

export interface SpeedState {
  readonly players: readonly [SpeedPlayer, SpeedPlayer]
  readonly discards: readonly [readonly Card[], readonly Card[]]
  readonly winner: PlayerId | null
}

export interface SpeedInitOpts {
  readonly playerIds: readonly [PlayerId, PlayerId]
}

export type SpeedAction =
  | { kind: 'play'; by: PlayerId; cardId: string; toPile: 0 | 1 }
  | { kind: 'reveal-stuck' } // both players each flip one side-stack card

const HAND_SIZE = 5

// ---------- Rank-wrap legality -------------------------------------------

const RANK_VALUES: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13,
}

/**
 * Cards are "adjacent" iff |a-b|==1 OR they form the wraparound A↔K pair.
 * Note: A↔2 is already adjacent (1 vs 2 = diff 1). The wrap is just A↔K.
 */
export function ranksAdjacent(a: string, b: string): boolean {
  const va = RANK_VALUES[a]
  const vb = RANK_VALUES[b]
  if (va === undefined || vb === undefined) return false
  if (Math.abs(va - vb) === 1) return true
  // A↔K wrap (1 vs 13)
  if ((va === 1 && vb === 13) || (va === 13 && vb === 1)) return true
  return false
}

function pileTop(p: readonly Card[]): Card | null {
  return p.length > 0 ? p[p.length - 1] : null
}

function findCardInHand(hand: readonly Card[], id: string): Card | null {
  return hand.find((c) => c.id === id) ?? null
}

// ---------- Initial deal --------------------------------------------------

export function makeInitial(opts: SpeedInitOpts, rng: RNG): SpeedState {
  const [pa, pb] = opts.playerIds
  if (pa === pb) throw new Error('speed: player ids must differ')
  const deck: Deck = shuffle(standardDeck(), rng)
  const cards = [...deck.cards]
  // Split 26/26
  const aCards = cards.slice(0, 26)
  const bCards = cards.slice(26)

  // For each player: working hand (5), draw pile (15), side stack (6)
  const aHand = aCards.slice(0, 5)
  const aDraw = aCards.slice(5, 20)
  const aSide = aCards.slice(20)
  const bHand = bCards.slice(0, 5)
  const bDraw = bCards.slice(5, 20)
  const bSide = bCards.slice(20)

  // Seed each discard from the top of each player's side stack
  // (top = last index). We pop one from each.
  const aSideMut = [...aSide]
  const bSideMut = [...bSide]
  const discardA = [aSideMut.pop()!]
  const discardB = [bSideMut.pop()!]

  return {
    players: [
      { id: pa, hand: aHand, draw: aDraw, sideStack: aSideMut },
      { id: pb, hand: bHand, draw: bDraw, sideStack: bSideMut },
    ],
    discards: [discardA, discardB],
    winner: null,
  }
}

// ---------- Legal actions -------------------------------------------------

export function legalActions(state: SpeedState, by: PlayerId): SpeedAction[] {
  if (state.winner) return []
  const acts: SpeedAction[] = []
  const idx = state.players.findIndex((p) => p.id === by)
  if (idx < 0) return acts
  const me = state.players[idx]
  const tops = [pileTop(state.discards[0]), pileTop(state.discards[1])]
  for (const card of me.hand) {
    for (const pile of [0, 1] as const) {
      const t = tops[pile]
      if (t && ranksAdjacent(card.rank, t.rank)) {
        acts.push({ kind: 'play', by, cardId: card.id, toPile: pile })
      }
    }
  }
  // The reveal-stuck action is offered when no player has any 'play' available.
  if (acts.length === 0) {
    const otherIdx = idx === 0 ? 1 : 0
    const other = state.players[otherIdx]
    let otherHasMove = false
    for (const card of other.hand) {
      for (const pile of [0, 1] as const) {
        const t = tops[pile]
        if (t && ranksAdjacent(card.rank, t.rank)) {
          otherHasMove = true
          break
        }
      }
      if (otherHasMove) break
    }
    if (!otherHasMove) acts.push({ kind: 'reveal-stuck' })
  }
  return acts
}

/** Internal: any-player legality check; used to detect global stuck. */
function anyPlayerHasMove(state: SpeedState): boolean {
  if (state.winner) return false
  const tops = [pileTop(state.discards[0]), pileTop(state.discards[1])]
  for (const p of state.players) {
    for (const c of p.hand) {
      for (const pile of [0, 1] as const) {
        const t = tops[pile]
        if (t && ranksAdjacent(c.rank, t.rank)) return true
      }
    }
  }
  return false
}

// ---------- applyAction ---------------------------------------------------

export function applyAction(state: SpeedState, action: SpeedAction, _rng: RNG): SpeedState {
  if (state.winner) throw new Error('speed: game already won')

  if (action.kind === 'reveal-stuck') {
    if (anyPlayerHasMove(state)) {
      throw new Error('speed: cannot reveal-stuck while a legal play exists')
    }
    // Both players reveal one from sideStack onto their discard.
    const newPlayers = state.players.map((p) => {
      const ss = [...p.sideStack]
      const top = ss.pop()
      return { ...p, sideStack: ss, _flipped: top ?? null }
    }) as Array<SpeedPlayer & { _flipped: Card | null }>
    const newDiscards: [Card[], Card[]] = [
      newPlayers[0]._flipped
        ? [...state.discards[0], newPlayers[0]._flipped!]
        : [...state.discards[0]],
      newPlayers[1]._flipped
        ? [...state.discards[1], newPlayers[1]._flipped!]
        : [...state.discards[1]],
    ]
    const cleanPlayers: [SpeedPlayer, SpeedPlayer] = [
      { id: newPlayers[0].id, hand: newPlayers[0].hand, draw: newPlayers[0].draw, sideStack: newPlayers[0].sideStack },
      { id: newPlayers[1].id, hand: newPlayers[1].hand, draw: newPlayers[1].draw, sideStack: newPlayers[1].sideStack },
    ]
    return { ...state, players: cleanPlayers, discards: newDiscards }
  }

  // 'play'
  const idx = state.players.findIndex((p) => p.id === action.by)
  if (idx < 0) throw new Error(`speed: no player ${action.by}`)
  const me = state.players[idx]
  const card = findCardInHand(me.hand, action.cardId)
  if (!card) throw new Error(`speed: card ${action.cardId} not in ${action.by}'s hand`)
  const top = pileTop(state.discards[action.toPile])
  if (!top) throw new Error(`speed: pile ${action.toPile} is empty`)
  if (!ranksAdjacent(card.rank, top.rank)) {
    throw new Error(`speed: ${card.rank} not adjacent to ${top.rank}`)
  }

  // Remove card from hand, refill from draw pile up to HAND_SIZE
  const newHand = me.hand.filter((c) => c.id !== card.id)
  const newDraw = [...me.draw]
  while (newHand.length < HAND_SIZE && newDraw.length > 0) {
    const top = newDraw.pop()
    if (top) newHand.push(top)
  }

  // Place onto target pile
  const newDiscards: [Card[], Card[]] = [
    [...state.discards[0]],
    [...state.discards[1]],
  ]
  newDiscards[action.toPile] = [...newDiscards[action.toPile], card]

  const updatedPlayer: SpeedPlayer = { ...me, hand: newHand, draw: newDraw }
  const players: [SpeedPlayer, SpeedPlayer] = idx === 0
    ? [updatedPlayer, state.players[1]]
    : [state.players[0], updatedPlayer]

  // Win check: empty hand AND empty draw pile
  let winner: PlayerId | null = null
  if (updatedPlayer.hand.length === 0 && updatedPlayer.draw.length === 0) {
    winner = updatedPlayer.id
  }

  return { ...state, players, discards: newDiscards, winner }
}

/**
 * Resolve simultaneous tick conflicts: takes a list of attempted plays from
 * a single tick, applies them in deterministic id order. If two plays target
 * the same pile in the same tick, the one whose player id sorts first wins;
 * the other is dropped.
 */
export function resolveTick(
  state: SpeedState,
  attempts: ReadonlyArray<Extract<SpeedAction, { kind: 'play' }>>,
  rng: RNG,
): { state: SpeedState; resolved: ReadonlyArray<Extract<SpeedAction, { kind: 'play' }>> } {
  const sorted = [...attempts].sort((a, b) => (a.by < b.by ? -1 : a.by > b.by ? 1 : 0))
  let s = state
  const resolved: Array<Extract<SpeedAction, { kind: 'play' }>> = []
  const usedPiles = new Set<number>()
  for (const a of sorted) {
    if (usedPiles.has(a.toPile)) continue
    try {
      s = applyAction(s, a, rng)
      usedPiles.add(a.toPile)
      resolved.push(a)
    } catch {
      // skip illegal
    }
  }
  return { state: s, resolved }
}

// ---------- Terminal ------------------------------------------------------

export function terminalStatus(state: SpeedState): TerminalStatus {
  if (state.winner) return 'win'
  return 'playing'
}

// ---------- Module export -------------------------------------------------

export const gameId = 'speed' as const
export const displayName = 'Speed' as const
export const supportedModes: readonly UXMode[] = ['party'] as const
export const minPlayers = 2
export const maxPlayers = 2

export const speedRules: GameRuleModule<SpeedState, SpeedAction, SpeedInitOpts> = {
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
