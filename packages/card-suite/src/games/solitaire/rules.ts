/**
 * Klondike Solitaire rules — pure state machine.
 * Spec: INS-006 §5.1.
 *
 * Rules implemented:
 *   - 7 tableau piles (cards dealt 1..7, top card face-up).
 *   - 4 foundations (one per suit, build up A..K in-suit).
 *   - Stock + waste; draw-3 variant uses count=3, draw-1 uses count=1.
 *   - Tableau builds down in alternating color.
 *   - Only Kings can move onto empty tableau piles.
 *   - Waste->tableau, waste->foundation, tableau->foundation, tableau->tableau,
 *     foundation->tableau, stock->waste, recycle-waste->stock.
 *   - Terminal: win when all four foundations top at K.
 */

import { Card, Rank, color, rankValue, Suit } from '../../engine/card'
import { standardDeck, shuffle, Deck } from '../../engine/deck'
import { RNG } from '../../engine/rng'
import { GameRuleModule, PlayerId, TerminalStatus, UXMode } from '../../engine/types'

// ---------- State types ---------------------------------------------------

export interface TableauPile {
  /** Face-down cards, last = closest to face-up. */
  readonly faceDown: readonly Card[]
  /** Face-up cards, last = top (visible, playable). */
  readonly faceUp: readonly Card[]
}

export interface Foundation {
  readonly suit: Suit
  /** Bottom = A, top = highest placed. Empty means no cards yet. */
  readonly cards: readonly Card[]
}

export interface SolitaireState {
  readonly tableau: readonly TableauPile[] // always length 7
  readonly foundations: readonly Foundation[] // always length 4 (one per suit)
  readonly stock: readonly Card[] // last index = top, face-down
  readonly waste: readonly Card[] // last index = top, face-up
  readonly drawCount: 1 | 3
  readonly moves: number
}

export interface SolitaireInitOpts {
  drawCount?: 1 | 3
}

// ---------- Action types --------------------------------------------------

export type SolitaireAction =
  | { kind: 'draw-from-stock' }
  | { kind: 'recycle-waste' }
  | {
      kind: 'move'
      from:
        | { type: 'tableau'; index: number }
        | { type: 'waste' }
        | { type: 'foundation'; suit: Suit }
      to:
        | { type: 'tableau'; index: number }
        | { type: 'foundation'; suit: Suit }
      /** Number of cards to move (tableau-to-tableau can move a run). Defaults to 1. */
      count?: number
    }
  | { kind: 'auto-complete' }

// ---------- Helpers -------------------------------------------------------

const SUIT_ORDER: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'] as const

function emptyTableau(): TableauPile {
  return { faceDown: [], faceUp: [] }
}

function topFaceUp(p: TableauPile): Card | null {
  return p.faceUp.length > 0 ? p.faceUp[p.faceUp.length - 1] : null
}

function isRankOneBelow(lower: Rank, higher: Rank): boolean {
  // lower should be exactly one less than higher (A=1 .. K=13).
  return rankValue(higher) - rankValue(lower) === 1
}

function canStackOnTableau(moving: Card, dest: TableauPile): boolean {
  const top = topFaceUp(dest)
  if (top === null) {
    // Empty pile only accepts a King.
    return moving.rank === 'K'
  }
  // Must be alternating color and one rank below the destination top.
  return color(moving.suit) !== color(top.suit) && isRankOneBelow(moving.rank, top.rank)
}

function canPlaceOnFoundation(moving: Card, foundation: Foundation): boolean {
  if (moving.suit !== foundation.suit) return false
  if (foundation.cards.length === 0) return moving.rank === 'A'
  const top = foundation.cards[foundation.cards.length - 1]
  return isRankOneBelow(top.rank, moving.rank)
}

function findFoundation(
  foundations: readonly Foundation[],
  suit: Suit,
): { idx: number; foundation: Foundation } {
  const idx = foundations.findIndex((f) => f.suit === suit)
  if (idx < 0) throw new Error(`solitaire: no foundation for suit ${suit}`)
  return { idx, foundation: foundations[idx] }
}

function replaceAt<T>(arr: readonly T[], idx: number, value: T): T[] {
  const out = [...arr]
  out[idx] = value
  return out
}

function flipTopIfNeeded(p: TableauPile): TableauPile {
  if (p.faceUp.length > 0) return p
  if (p.faceDown.length === 0) return p
  const fd = [...p.faceDown]
  const flipped = fd.pop()!
  return { faceDown: fd, faceUp: [flipped] }
}

// ---------- Initial deal --------------------------------------------------

export function makeInitial(opts: SolitaireInitOpts, rng: RNG): SolitaireState {
  const drawCount: 1 | 3 = opts.drawCount === 1 ? 1 : 3
  const shuffled: Deck = shuffle(standardDeck(), rng)
  const deck = [...shuffled.cards]

  const tableau: TableauPile[] = []
  for (let pileIdx = 0; pileIdx < 7; pileIdx++) {
    const pileSize = pileIdx + 1
    const cards: Card[] = []
    for (let i = 0; i < pileSize; i++) {
      const card = deck.pop()
      if (!card) throw new Error('solitaire: deck exhausted during deal')
      cards.push(card)
    }
    // All but the last are face-down; last card becomes the top face-up.
    const faceDown = cards.slice(0, -1)
    const faceUp = cards.slice(-1)
    tableau.push({ faceDown, faceUp })
  }

  const foundations: Foundation[] = SUIT_ORDER.map((suit) => ({ suit, cards: [] }))

  // Remaining deck becomes stock (face-down, top = last index).
  const stock = deck

  return {
    tableau,
    foundations,
    stock,
    waste: [],
    drawCount,
    moves: 0,
  }
}

// ---------- Legal actions -------------------------------------------------

export function legalActions(state: SolitaireState, _by: PlayerId): SolitaireAction[] {
  const acts: SolitaireAction[] = []

  if (state.stock.length > 0) acts.push({ kind: 'draw-from-stock' })
  else if (state.waste.length > 0) acts.push({ kind: 'recycle-waste' })

  // Waste top -> foundation / tableau
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1]
    for (const f of state.foundations) {
      if (canPlaceOnFoundation(top, f)) {
        acts.push({ kind: 'move', from: { type: 'waste' }, to: { type: 'foundation', suit: f.suit } })
      }
    }
    for (let i = 0; i < state.tableau.length; i++) {
      if (canStackOnTableau(top, state.tableau[i])) {
        acts.push({ kind: 'move', from: { type: 'waste' }, to: { type: 'tableau', index: i } })
      }
    }
  }

  // Tableau top -> foundation (single card only)
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i]
    const top = topFaceUp(pile)
    if (!top) continue
    for (const f of state.foundations) {
      if (canPlaceOnFoundation(top, f)) {
        acts.push({ kind: 'move', from: { type: 'tableau', index: i }, to: { type: 'foundation', suit: f.suit }, count: 1 })
      }
    }
  }

  // Tableau run -> another tableau pile (any face-up suffix)
  for (let i = 0; i < state.tableau.length; i++) {
    const src = state.tableau[i]
    for (let startIdx = 0; startIdx < src.faceUp.length; startIdx++) {
      const movingBottom = src.faceUp[startIdx]
      // Validate the run is internally legal (alternating color + descending rank).
      let runValid = true
      for (let k = startIdx + 1; k < src.faceUp.length; k++) {
        const prev = src.faceUp[k - 1]
        const cur = src.faceUp[k]
        if (color(prev.suit) === color(cur.suit) || !isRankOneBelow(cur.rank, prev.rank)) {
          runValid = false
          break
        }
      }
      if (!runValid) continue
      for (let j = 0; j < state.tableau.length; j++) {
        if (j === i) continue
        if (canStackOnTableau(movingBottom, state.tableau[j])) {
          acts.push({
            kind: 'move',
            from: { type: 'tableau', index: i },
            to: { type: 'tableau', index: j },
            count: src.faceUp.length - startIdx,
          })
        }
      }
    }
  }

  // Foundation -> tableau (dig-back)
  for (const f of state.foundations) {
    if (f.cards.length === 0) continue
    const top = f.cards[f.cards.length - 1]
    for (let i = 0; i < state.tableau.length; i++) {
      if (canStackOnTableau(top, state.tableau[i])) {
        acts.push({
          kind: 'move',
          from: { type: 'foundation', suit: f.suit },
          to: { type: 'tableau', index: i },
          count: 1,
        })
      }
    }
  }

  // Auto-complete — only when all face-down piles are exhausted and stock/waste empty.
  const allFaceUp =
    state.tableau.every((p) => p.faceDown.length === 0) &&
    state.stock.length === 0 &&
    state.waste.length === 0
  if (allFaceUp && !isWin(state)) acts.push({ kind: 'auto-complete' })

  return acts
}

// ---------- applyAction ---------------------------------------------------

export function applyAction(
  state: SolitaireState,
  action: SolitaireAction,
  _rng: RNG,
): SolitaireState {
  switch (action.kind) {
    case 'draw-from-stock': {
      if (state.stock.length === 0) throw new Error('solitaire: stock is empty')
      const n = Math.min(state.drawCount, state.stock.length)
      const drawn: Card[] = []
      const newStock = [...state.stock]
      for (let i = 0; i < n; i++) {
        const c = newStock.pop()
        if (!c) break
        drawn.push(c)
      }
      // Flip onto waste (reverse so the most-recently-drawn is on top).
      const newWaste = [...state.waste, ...drawn]
      return { ...state, stock: newStock, waste: newWaste, moves: state.moves + 1 }
    }

    case 'recycle-waste': {
      if (state.stock.length !== 0) throw new Error('solitaire: cannot recycle while stock has cards')
      if (state.waste.length === 0) throw new Error('solitaire: waste is empty, nothing to recycle')
      // Put waste back into stock in reverse order (so first-drawn is on top again).
      const newStock = [...state.waste].reverse()
      return { ...state, stock: newStock, waste: [], moves: state.moves + 1 }
    }

    case 'move': {
      const count = action.count ?? 1
      if (count < 1) throw new Error(`solitaire: move count must be >= 1`)
      return applyMove(state, action, count)
    }

    case 'auto-complete': {
      // Repeatedly move every tableau top / waste top onto foundations until none fit.
      let s = state
      let safety = 200
      while (safety-- > 0) {
        let moved = false
        // Try waste top
        if (s.waste.length > 0) {
          const top = s.waste[s.waste.length - 1]
          const fIdx = s.foundations.findIndex((f) => canPlaceOnFoundation(top, f))
          if (fIdx >= 0) {
            s = applyMove(s, {
              kind: 'move',
              from: { type: 'waste' },
              to: { type: 'foundation', suit: s.foundations[fIdx].suit },
            }, 1)
            moved = true
            continue
          }
        }
        for (let i = 0; i < s.tableau.length; i++) {
          const top = topFaceUp(s.tableau[i])
          if (!top) continue
          const fIdx = s.foundations.findIndex((f) => canPlaceOnFoundation(top, f))
          if (fIdx >= 0) {
            s = applyMove(s, {
              kind: 'move',
              from: { type: 'tableau', index: i },
              to: { type: 'foundation', suit: s.foundations[fIdx].suit },
              count: 1,
            }, 1)
            moved = true
            break
          }
        }
        if (!moved) break
      }
      return s
    }
  }
}

function applyMove(
  state: SolitaireState,
  action: Extract<SolitaireAction, { kind: 'move' }>,
  count: number,
): SolitaireState {
  // Collect the moving cards from the source.
  let movingCards: Card[] = []
  let newTableau = state.tableau
  let newFoundations = state.foundations
  let newWaste = state.waste
  let newStock = state.stock

  if (action.from.type === 'waste') {
    if (count !== 1) throw new Error('solitaire: waste move must be single card')
    if (newWaste.length === 0) throw new Error('solitaire: waste empty')
    movingCards = [newWaste[newWaste.length - 1]]
    newWaste = newWaste.slice(0, -1)
  } else if (action.from.type === 'tableau') {
    const idx = action.from.index
    const src = newTableau[idx]
    if (count > src.faceUp.length) throw new Error(`solitaire: only ${src.faceUp.length} face-up in pile ${idx}`)
    movingCards = src.faceUp.slice(src.faceUp.length - count)
    // Verify the run is legal.
    for (let k = 1; k < movingCards.length; k++) {
      const prev = movingCards[k - 1]
      const cur = movingCards[k]
      if (color(prev.suit) === color(cur.suit) || !isRankOneBelow(cur.rank, prev.rank)) {
        throw new Error('solitaire: illegal multi-card run in source pile')
      }
    }
    const updatedSrc: TableauPile = {
      faceDown: src.faceDown,
      faceUp: src.faceUp.slice(0, src.faceUp.length - count),
    }
    newTableau = replaceAt(newTableau, idx, flipTopIfNeeded(updatedSrc))
  } else {
    // foundation
    if (count !== 1) throw new Error('solitaire: foundation move must be single card')
    const { idx, foundation } = findFoundation(newFoundations, action.from.suit)
    if (foundation.cards.length === 0) throw new Error('solitaire: empty foundation')
    movingCards = [foundation.cards[foundation.cards.length - 1]]
    newFoundations = replaceAt(newFoundations, idx, {
      suit: foundation.suit,
      cards: foundation.cards.slice(0, -1),
    })
  }

  // Place onto destination.
  if (action.to.type === 'tableau') {
    const destIdx = action.to.index
    const dest = newTableau[destIdx]
    if (!canStackOnTableau(movingCards[0], dest)) {
      throw new Error('solitaire: illegal stack onto tableau')
    }
    const updatedDest: TableauPile = {
      faceDown: dest.faceDown,
      faceUp: [...dest.faceUp, ...movingCards],
    }
    newTableau = replaceAt(newTableau, destIdx, updatedDest)
  } else {
    // foundation
    if (movingCards.length !== 1) throw new Error('solitaire: foundation accepts one card at a time')
    const { idx, foundation } = findFoundation(newFoundations, action.to.suit)
    if (!canPlaceOnFoundation(movingCards[0], foundation)) {
      throw new Error('solitaire: illegal place on foundation')
    }
    newFoundations = replaceAt(newFoundations, idx, {
      suit: foundation.suit,
      cards: [...foundation.cards, movingCards[0]],
    })
  }

  return {
    ...state,
    tableau: newTableau,
    foundations: newFoundations,
    stock: newStock,
    waste: newWaste,
    moves: state.moves + 1,
  }
}

// ---------- Terminal ------------------------------------------------------

export function isWin(state: SolitaireState): boolean {
  return state.foundations.every(
    (f) => f.cards.length === 13 && f.cards[f.cards.length - 1].rank === 'K',
  )
}

export function terminalStatus(state: SolitaireState): TerminalStatus {
  return isWin(state) ? 'win' : 'playing'
}

// ---------- GameRuleModule export ----------------------------------------

export const gameId = 'solitaire' as const
export const displayName = 'Klondike Solitaire' as const
export const supportedModes: readonly UXMode[] = ['party', 'display', 'service'] as const
export const minPlayers = 1
export const maxPlayers = 1

export const solitaireRules: GameRuleModule<SolitaireState, SolitaireAction, SolitaireInitOpts> = {
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
