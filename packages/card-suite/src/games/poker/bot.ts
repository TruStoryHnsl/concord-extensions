/**
 * Hold'em bot — pure tiered policy.
 *
 * Contract (matches spec):
 *   pickAction(state, playerId, rng): HoldemAction
 *
 * Pure / deterministic given the same (state, playerId, rng). Caller decides
 * when to invoke. Returns a "pass-equivalent" (`check` if legal, otherwise
 * `fold`) when no decision is required.
 *
 * Policy:
 *   Pre-flop: tight — fold to raises with anything below pair-of-tens or
 *     AK; otherwise call/check. Pairs and big-broadway hands raise.
 *   Post-flop: rank-bucket the made hand. Pair or better → call any bet,
 *     raise small with two-pair+. High-card with no draw → fold to
 *     pressure, check otherwise.
 *   Pot odds tilt borderline calls: if the call price is small relative
 *     to the pot, bots are more willing to chase.
 *   Random tie-breaks via rng.nextInt() so two bots with identical reads
 *     don't always do exactly the same thing.
 *
 * The bot is intentionally rather simple — it gives a solo player something
 * to play against, not a world-class opponent.
 */

import { Card, rankValue } from '../../engine/card'
import { RNG } from '../../engine/rng'
import { PlayerId } from '../../engine/types'
import { compareHandRank, evaluate5, HandCategory, HandRank } from './hand-eval'
import { HoldemAction, HoldemState, legalActions } from './holdem'

/** Top-level decision entry point. Pure. */
export function pickAction(
  state: HoldemState,
  playerId: PlayerId,
  rng: RNG,
): HoldemAction {
  const acts = legalActions(state, playerId)
  if (acts.length === 0) {
    // Not the bot's turn (or no decision required). Return a benign default
    // so the caller can detect a no-op. We can't legally play this; this
    // mirrors "pass-equivalent".
    return { kind: 'fold', by: playerId }
  }

  const idx = state.seats.findIndex((s) => s.id === playerId)
  if (idx < 0) throw new Error(`bot: no seat for ${playerId}`)
  const seat = state.seats[idx]

  // Phase-specific evaluation
  const evalScore = scoreHandForBot(seat.hole, state.community)
  const owed = state.currentBet - seat.streetBet
  const potOdds = owed > 0 ? owed / (state.pot + owed) : 0

  // Convenience: pull legal actions by kind
  const foldAct = acts.find((a) => a.kind === 'fold') as
    | Extract<HoldemAction, { kind: 'fold' }>
    | undefined
  const checkAct = acts.find((a) => a.kind === 'check') as
    | Extract<HoldemAction, { kind: 'check' }>
    | undefined
  const callAct = acts.find((a) => a.kind === 'call') as
    | Extract<HoldemAction, { kind: 'call' }>
    | undefined
  const raiseAct = acts.find((a) => a.kind === 'raise') as
    | Extract<HoldemAction, { kind: 'raise' }>
    | undefined

  // ---- Pre-flop policy ---------------------------------------------------
  if (state.phase === 'pre-flop') {
    const strength = preflopStrength(seat.hole as readonly Card[])
    // strength: 0 trash, 1 marginal, 2 playable, 3 strong, 4 premium
    if (strength >= 3 && raiseAct) {
      // Premium pairs / AK → raise.
      return raiseAct
    }
    if (strength >= 2) {
      // Playable: call/check, occasionally raise (1-in-4) for variety.
      if (raiseAct && rng.nextInt(4) === 0) return raiseAct
      if (checkAct) return checkAct
      if (callAct) return callAct
    }
    if (strength === 1) {
      // Marginal: free see → check, small bet → call (cheap), big bet → fold.
      if (checkAct) return checkAct
      if (callAct && potOdds <= 0.25) return callAct
      if (foldAct) return foldAct
    }
    // strength 0: trash. Free walk → check; anything else → fold.
    if (checkAct) return checkAct
    if (foldAct) return foldAct
    return acts[0]
  }

  // ---- Post-flop policy --------------------------------------------------
  // We evaluate the bot's best made hand from hole + community. Bucket and
  // act accordingly.
  const cat = evalScore?.category ?? null

  // Strong made hand (two-pair+)
  if (cat && rankOf(cat) >= rankOf('two-pair')) {
    if (raiseAct && rng.nextInt(3) !== 0) return raiseAct
    if (callAct) return callAct
    if (checkAct) return checkAct
  }

  // Pair: call any reasonable bet, check otherwise.
  if (cat === 'pair') {
    if (checkAct) return checkAct
    if (callAct) {
      // Call up to ~33% pot odds (pair beats most random hands).
      if (potOdds <= 0.34) return callAct
      // Heavy pressure with just a pair: occasional fold.
      if (rng.nextInt(2) === 0 && foldAct) return foldAct
      return callAct
    }
  }

  // High-card / no pair: passive.
  if (checkAct) return checkAct
  if (callAct) {
    // Chase only if very cheap (drawing prices).
    if (potOdds <= 0.15) return callAct
    if (foldAct) return foldAct
    return callAct
  }
  if (foldAct) return foldAct

  // Last resort — return any legal action.
  return acts[0]
}

// ---------- Pre-flop strength buckets ------------------------------------

/**
 * Pre-flop strength bucket: 0 trash → 4 premium. Pure function of hole cards.
 *
 * Buckets:
 *   4: AA, KK, QQ, JJ (premium pocket pairs)
 *   3: TT, AK (incl. suited/offsuit), AQ suited
 *   2: 99-22, AQo, AJ, KQ, suited connectors with a 10+, suited aces
 *   1: anything else with a face card or pair-potential
 *   0: trash (e.g. 7-2 offsuit)
 */
export function preflopStrength(hole: readonly Card[]): number {
  if (hole.length !== 2) return 0
  const [c1, c2] = hole
  const r1 = rankValue(c1.rank)
  const r2 = rankValue(c2.rank)
  // Use ace-high for comparison
  const v1 = c1.rank === 'A' ? 14 : r1
  const v2 = c2.rank === 'A' ? 14 : r2
  const high = Math.max(v1, v2)
  const low = Math.min(v1, v2)
  const suited = c1.suit === c2.suit
  const pair = c1.rank === c2.rank

  if (pair) {
    if (high >= 11) return 4 // JJ+
    if (high >= 9) return 3 // 99-TT
    return 2 // 22-88
  }
  // AK (regardless of suit)
  if (high === 14 && low === 13) return 3
  // AQ suited = 3, AQo = 2
  if (high === 14 && low === 12) return suited ? 3 : 2
  // AJ, AT
  if (high === 14 && (low === 11 || low === 10)) return 2
  // KQ
  if (high === 13 && low === 12) return 2
  // KJ
  if (high === 13 && low === 11) return suited ? 2 : 1
  // Suited connectors with high 10+
  if (suited && high - low === 1 && high >= 10) return 2
  // Any face-card combo or pair-potential ≥ 1
  if (high >= 11) return 1
  // Otherwise trash
  return 0
}

// ---------- Post-flop hand scoring ----------------------------------------

const CAT_TO_RANK: Record<HandCategory, number> = {
  'high-card': 1,
  pair: 2,
  'two-pair': 3,
  'three-of-a-kind': 4,
  straight: 5,
  flush: 6,
  'full-house': 7,
  'four-of-a-kind': 8,
  'straight-flush': 9,
}

function rankOf(c: HandCategory): number {
  return CAT_TO_RANK[c]
}

/**
 * Score the bot's best made hand from hole + community. Returns null if not
 * enough cards are visible yet (e.g. hole only, no community).
 */
export function scoreHandForBot(
  hole: readonly Card[],
  community: readonly Card[],
): HandRank | null {
  const cards = [...hole, ...community]
  if (cards.length < 5) return null
  // Pick best 5-card hand by enumerating C(n,5).
  let best: HandRank | null = null
  const idxs: number[] = []
  enumerate(cards.length, 5, idxs, (combo) => {
    const five = combo.map((i) => cards[i])
    const ev = evaluate5(five)
    if (best === null || compareHandRank(ev, best) > 0) best = ev
  })
  return best
}

function enumerate(
  n: number,
  k: number,
  buf: number[],
  emit: (combo: number[]) => void,
  start = 0,
): void {
  if (buf.length === k) {
    emit(buf)
    return
  }
  for (let i = start; i < n; i++) {
    buf.push(i)
    enumerate(n, k, buf, emit, i + 1)
    buf.pop()
  }
}
