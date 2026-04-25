/**
 * War — pure 2-player state machine.
 *
 * Spec: INS-006 §5.6.
 * Standard rules:
 *   - Shuffle a 52-card deck and split 26/26.
 *   - Each step: both players reveal their top card. Higher rank wins both
 *     cards into the bottom of their own deck (in some canonical order to
 *     keep determinism — see addToBottom).
 *   - Tie ("war"): each player places 3 face-down + 1 face-up. Higher
 *     face-up wins all 8. Recursive on a repeat tie.
 *   - If a player runs out of cards mid-war, they use whatever they have
 *     (incl. all remaining face-down). If a player has 0 cards entering a
 *     step, they lose.
 *
 * Ace is high (rank 14). All other ranks compare by their numeric values.
 *
 * The single action 'flip' advances one full step (a single duel, possibly
 * including recursive wars). No decisions for the player.
 */

import { Card, Rank, rankValue } from '../../engine/card'
import { Deck, shuffle, standardDeck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'

// Ace high: rank 14.
function warRankValue(r: Rank): number {
  return r === 'A' ? 14 : rankValue(r)
}

export interface WarPlayer {
  readonly id: PlayerId
  /** Last index = top (next to flip). */
  readonly deck: readonly Card[]
}

export interface WarState {
  readonly players: readonly [WarPlayer, WarPlayer]
  /** History of revealed cards on the most recent step (cleared each step). */
  readonly lastReveal: {
    readonly p0: readonly Card[]
    readonly p1: readonly Card[]
    readonly winner: 0 | 1 | 'tie' | null
  } | null
  /** Number of recursive war rounds in the most recent step. */
  readonly lastWarDepth: number
  readonly winner: PlayerId | null
  /** Step counter for UI/animation. */
  readonly step: number
}

export interface WarInitOpts {
  readonly playerIds: readonly [PlayerId, PlayerId]
}

export type WarAction = { kind: 'flip' }

// ---------- Initial setup -------------------------------------------------

export function makeInitial(opts: WarInitOpts, rng: RNG): WarState {
  const [a, b] = opts.playerIds
  const shuffled = shuffle(standardDeck(), rng)
  const all = [...shuffled.cards]
  const deckA = all.slice(0, 26)
  const deckB = all.slice(26)
  return {
    players: [
      { id: a, deck: deckA },
      { id: b, deck: deckB },
    ],
    lastReveal: null,
    lastWarDepth: 0,
    winner: null,
    step: 0,
  }
}

// ---------- Helpers -------------------------------------------------------

/** Pop n cards off the top (last index) of the deck. */
function topN(deck: readonly Card[], n: number): { taken: Card[]; remaining: Card[] } {
  const real = Math.min(n, deck.length)
  const taken = deck.slice(deck.length - real)
  const remaining = deck.slice(0, deck.length - real)
  return { taken, remaining }
}

/** Add cards to the bottom (front) of a deck. Order: pot is shuffled-ordered for determinism. */
function addToBottom(deck: readonly Card[], cards: readonly Card[]): Card[] {
  return [...cards, ...deck]
}

// ---------- Actions -------------------------------------------------------

export function legalActions(state: WarState, by: PlayerId): WarAction[] {
  if (state.winner) return []
  // Either player can drive flip; we accept either as proxy (no decisions).
  if (state.players[0].id === by || state.players[1].id === by) return [{ kind: 'flip' }]
  return []
}

export function applyAction(state: WarState, action: WarAction, _rng: RNG): WarState {
  if (action.kind !== 'flip') throw new Error('war: unknown action')
  if (state.winner) throw new Error('war: game already won')

  let deckA = [...state.players[0].deck]
  let deckB = [...state.players[1].deck]

  // If anyone is out, the other wins outright.
  if (deckA.length === 0) return finishWith(state, 0, deckA, deckB)
  if (deckB.length === 0) return finishWith(state, 1, deckA, deckB)

  // Reveal one each.
  let revealedA: Card[] = []
  let revealedB: Card[] = []
  let warDepth = 0

  const flipOne = () => {
    const a = deckA.pop()!
    const b = deckB.pop()!
    revealedA.push(a)
    revealedB.push(b)
  }

  flipOne()

  // Resolve, with recursive wars on ties.
  while (true) {
    const a = revealedA[revealedA.length - 1]
    const b = revealedB[revealedB.length - 1]
    const va = warRankValue(a.rank)
    const vb = warRankValue(b.rank)
    if (va > vb) {
      // Player 0 wins all
      const pot = [...revealedA, ...revealedB]
      // Deterministic ordering: sort pot by id so a replay produces identical decks.
      pot.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      deckA = addToBottom(deckA, pot)
      const winner = computeWinner(deckA, deckB, state)
      return {
        ...state,
        players: [
          { ...state.players[0], deck: deckA },
          { ...state.players[1], deck: deckB },
        ],
        lastReveal: { p0: revealedA, p1: revealedB, winner: 0 },
        lastWarDepth: warDepth,
        step: state.step + 1,
        winner,
      }
    } else if (vb > va) {
      const pot = [...revealedA, ...revealedB]
      pot.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      deckB = addToBottom(deckB, pot)
      const winner = computeWinner(deckA, deckB, state)
      return {
        ...state,
        players: [
          { ...state.players[0], deck: deckA },
          { ...state.players[1], deck: deckB },
        ],
        lastReveal: { p0: revealedA, p1: revealedB, winner: 1 },
        lastWarDepth: warDepth,
        step: state.step + 1,
        winner,
      }
    } else {
      // Tie → war.
      warDepth += 1
      // Each player places 3 face-down + 1 face-up.
      // If they don't have enough, they place all remaining; the rule we use:
      // a player with 0 cards can't ante, so they lose immediately.
      if (deckA.length === 0 && deckB.length === 0) {
        // Both empty mid-war: whichever has more accumulated cards wins.
        // Deterministic tiebreak: player 0 wins if equal.
        const winner: 0 | 1 = revealedA.length >= revealedB.length ? 0 : 1
        const pot = [...revealedA, ...revealedB]
        pot.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
        if (winner === 0) deckA = addToBottom(deckA, pot)
        else deckB = addToBottom(deckB, pot)
        const w = computeWinner(deckA, deckB, state)
        return {
          ...state,
          players: [
            { ...state.players[0], deck: deckA },
            { ...state.players[1], deck: deckB },
          ],
          lastReveal: { p0: revealedA, p1: revealedB, winner },
          lastWarDepth: warDepth,
          step: state.step + 1,
          winner: w,
        }
      }
      if (deckA.length === 0) return finishWith(state, 0, deckA, deckB, revealedA, revealedB)
      if (deckB.length === 0) return finishWith(state, 1, deckA, deckB, revealedA, revealedB)

      // Place 3 face-down (or as many as available, leaving at least 1 for face-up)
      const aDownCount = Math.max(0, Math.min(3, deckA.length - 1))
      const bDownCount = Math.max(0, Math.min(3, deckB.length - 1))
      for (let k = 0; k < aDownCount; k++) revealedA.push(deckA.pop()!)
      for (let k = 0; k < bDownCount; k++) revealedB.push(deckB.pop()!)

      // Check again — both must still have at least 1 for the new face-up.
      if (deckA.length === 0 && deckB.length === 0) {
        // Edge: both ran out depositing face-down. Treat last revealed as comparison.
        // We resolve by deterministic tiebreak: player with greater current revealed cards wins.
        const winnerEdge: 0 | 1 = revealedA.length >= revealedB.length ? 0 : 1
        const pot = [...revealedA, ...revealedB]
        pot.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
        if (winnerEdge === 0) deckA = addToBottom(deckA, pot)
        else deckB = addToBottom(deckB, pot)
        const w = computeWinner(deckA, deckB, state)
        return {
          ...state,
          players: [
            { ...state.players[0], deck: deckA },
            { ...state.players[1], deck: deckB },
          ],
          lastReveal: { p0: revealedA, p1: revealedB, winner: winnerEdge },
          lastWarDepth: warDepth,
          step: state.step + 1,
          winner: w,
        }
      }
      if (deckA.length === 0) return finishWith(state, 0, deckA, deckB, revealedA, revealedB)
      if (deckB.length === 0) return finishWith(state, 1, deckA, deckB, revealedA, revealedB)

      // Reveal new face-up.
      flipOne()
      // Loop continues; comparison happens at top of while.
    }
  }
}

function computeWinner(
  deckA: readonly Card[],
  deckB: readonly Card[],
  state: WarState,
): PlayerId | null {
  if (deckA.length === 0) return state.players[1].id
  if (deckB.length === 0) return state.players[0].id
  return null
}

function finishWith(
  state: WarState,
  loser: 0 | 1,
  deckA: Card[],
  deckB: Card[],
  revealedA: Card[] = [],
  revealedB: Card[] = [],
): WarState {
  // Awards all revealed and remaining cards to the non-loser.
  const winner = loser === 0 ? 1 : 0
  const pot = [...revealedA, ...revealedB]
  pot.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  if (winner === 0) {
    deckA = addToBottom(deckA, pot)
    deckA = [...deckB, ...deckA] // absorb opponent's remaining (none expected)
    deckB = []
  } else {
    deckB = addToBottom(deckB, pot)
    deckB = [...deckA, ...deckB]
    deckA = []
  }
  return {
    ...state,
    players: [
      { ...state.players[0], deck: deckA },
      { ...state.players[1], deck: deckB },
    ],
    lastReveal: { p0: revealedA, p1: revealedB, winner },
    lastWarDepth: state.lastWarDepth,
    step: state.step + 1,
    winner: state.players[winner].id,
  }
}

// ---------- Terminal ------------------------------------------------------

export function terminalStatus(state: WarState): TerminalStatus {
  return state.winner ? 'win' : 'playing'
}

// ---------- Module export -------------------------------------------------

export const gameId = 'war' as const
export const displayName = 'War' as const
export const supportedModes: readonly UXMode[] = ['display', 'party', 'hybrid'] as const
export const minPlayers = 2
export const maxPlayers = 2

export const warRules: GameRuleModule<WarState, WarAction, WarInitOpts> = {
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
