/**
 * Per-role AI bots — deterministic given the same state and seeded RNG.
 *
 * The bots are intentionally simple. They keep games progressing in solo /
 * short-table sessions; they're not strategic adversaries. Tests assert
 * determinism (same state + same seed → same Action), and that werewolf
 * bots converge on the same target so the pack vote is consistent.
 *
 * Action types are role-scoped:
 *   - 'vote'         (Villager / any village by day) → vote yes/no on a nominee
 *   - 'nominate'     → propose someone for lynch
 *   - 'wolf-kill'    (Werewolf night) → vote which player the pack should kill
 *   - 'seer-peek'    (Seer night) → pick a player to learn the team of
 *   - 'doctor-protect' (Doctor night) → pick a player to protect
 *   - 'witch-act'    (Witch night) → optionally heal and/or kill
 *   - 'noop'         → do nothing this turn (e.g. dead, out of potions)
 */

import { RNG } from './engine/rng'
import { GameState, PlayerId, PlayerState, RoleId } from './engine/types'
import {
  MARKED_FOR_DEATH,
  WITCH_HEAL_USED,
  WITCH_KILL_USED,
} from './engine/effects'
import { DOCTOR_LAST_TARGET_PREFIX } from './engine/effects'

export type Action =
  | { kind: 'noop' }
  | { kind: 'nominate'; by: PlayerId; target: PlayerId }
  | { kind: 'vote'; by: PlayerId; target: PlayerId; yes: boolean }
  | { kind: 'wolf-kill'; by: PlayerId; target: PlayerId }
  | { kind: 'seer-peek'; by: PlayerId; target: PlayerId }
  | { kind: 'doctor-protect'; by: PlayerId; target: PlayerId }
  | {
      kind: 'witch-act'
      by: PlayerId
      heal: PlayerId | null
      kill: PlayerId | null
    }

/** Sort by id for deterministic iteration. */
function sortedAlive(state: GameState, exclude: ReadonlySet<PlayerId> = new Set()): PlayerState[] {
  return state.players
    .filter((p) => p.alive && !exclude.has(p.id))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Find players the table is currently "claiming" are werewolves. We treat
 * any open `seer_claim:<target>` status on a living player as a public
 * accusation. (The moderator UI / chat parser can stamp those statuses
 * when the Seer voices an accusation in chat.)
 *
 * If no claims, returns null.
 */
function loudestSeerAccusation(state: GameState): PlayerId | null {
  const counts = new Map<PlayerId, number>()
  for (const p of state.players) {
    if (!p.alive) continue
    for (const s of p.statuses) {
      if (s.startsWith('seer_claim:')) {
        const target = s.slice('seer_claim:'.length)
        counts.set(target, (counts.get(target) ?? 0) + 1)
      }
    }
  }
  if (counts.size === 0) return null
  let best: PlayerId | null = null
  let bestCount = 0
  // Sort entries by id for deterministic tiebreak.
  const sortedEntries = Array.from(counts.entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )
  for (const [target, count] of sortedEntries) {
    if (count > bestCount) {
      best = target
      bestCount = count
    }
  }
  return best
}

/** Villager bot — by day, votes against the loudest accused, else random. */
function villagerAction(state: GameState, self: PlayerState, rng: RNG): Action {
  // Day-only role. If it's not day, no action.
  if (state.phase !== 'day') return { kind: 'noop' }

  // Open nomination needing a vote? Vote against the most-accused (or a
  // simple yes if the bot has no info).
  const openNom = state.nominations.find((n) => !n.resolved)
  if (openNom) {
    if (openNom.nominee === self.id) {
      // Don't vote to lynch yourself.
      return { kind: 'vote', by: self.id, target: openNom.nominee, yes: false }
    }
    const accused = loudestSeerAccusation(state)
    const yes = accused !== null ? openNom.nominee === accused : rng.next() > 0.5
    return { kind: 'vote', by: self.id, target: openNom.nominee, yes }
  }

  // No open nomination — propose one against the most-accused (else random
  // alive non-self).
  const pool = sortedAlive(state, new Set([self.id]))
  if (pool.length === 0) return { kind: 'noop' }
  const accused = loudestSeerAccusation(state)
  const target =
    accused !== null && pool.some((p) => p.id === accused)
      ? accused
      : pool[rng.nextInt(pool.length)].id
  return { kind: 'nominate', by: self.id, target }
}

/**
 * Werewolf bot — at night, target the lowest-id alive non-werewolf for
 * deterministic pack convergence. Multiple wolves running this policy
 * pick the same id (the rng tiebreak only fires when there are equal
 * candidates, which can't happen on string-sorted ids).
 *
 * The `rng` argument is unused by the deterministic policy but kept in
 * the signature so callers can pass the seeded RNG uniformly.
 */
function werewolfAction(state: GameState, self: PlayerState, rng: RNG): Action {
  if (state.phase !== 'night' && state.phase !== 'first_night') return { kind: 'noop' }
  if (state.phase === 'first_night') return { kind: 'noop' }
  const candidates = sortedAlive(state).filter((p) => p.team !== 'werewolves')
  if (candidates.length === 0) return { kind: 'noop' }
  // Deterministic by id-sort; rng would only be consulted if multiple
  // candidates tied on every ranking criterion (they don't here).
  void rng
  return { kind: 'wolf-kill', by: self.id, target: candidates[0].id }
}

/** Seer bot — peek at a random non-self alive player. */
function seerAction(state: GameState, self: PlayerState, rng: RNG): Action {
  if (state.phase !== 'night' && state.phase !== 'first_night') return { kind: 'noop' }
  const pool = sortedAlive(state, new Set([self.id]))
  if (pool.length === 0) return { kind: 'noop' }
  const target = pool[rng.nextInt(pool.length)].id
  return { kind: 'seer-peek', by: self.id, target }
}

function doctorLastTarget(self: PlayerState): PlayerId | null {
  for (const s of self.statuses) {
    if (s.startsWith(DOCTOR_LAST_TARGET_PREFIX)) {
      return s.slice(DOCTOR_LAST_TARGET_PREFIX.length)
    }
  }
  return null
}

/** Doctor bot — protect a random non-self, never the same as last night. */
function doctorAction(state: GameState, self: PlayerState, rng: RNG): Action {
  if (state.phase !== 'night' && state.phase !== 'first_night') return { kind: 'noop' }
  const last = doctorLastTarget(self)
  const exclude = new Set<PlayerId>([self.id])
  if (last !== null) exclude.add(last)
  let pool = sortedAlive(state, exclude)
  if (pool.length === 0) {
    // Fallback: drop the "no repeats" constraint if it would leave nobody.
    pool = sortedAlive(state, new Set([self.id]))
  }
  if (pool.length === 0) return { kind: 'noop' }
  const target = pool[rng.nextInt(pool.length)].id
  return { kind: 'doctor-protect', by: self.id, target }
}

/**
 * Witch bot — hold both potions until day 3+ OR alive count drops to
 * <= 4, then spend them on heuristics.
 *
 *   - heal potion: if any living player is `marked_for_death` and that
 *     player is on the village team, heal them. Otherwise hold.
 *   - kill potion: if a public seer-accusation exists and the accused
 *     is alive, kill them; otherwise the lowest-id alive non-self
 *     non-village player; otherwise hold.
 *
 * The "hold until day 3+ or alive ≤ 4" gate prevents the bot from
 * spending both potions on day 1 in a long game.
 */
function witchAction(state: GameState, self: PlayerState, _rng: RNG): Action {
  if (state.phase !== 'night' && state.phase !== 'first_night') return { kind: 'noop' }
  const aliveCount = state.players.reduce((n, p) => (p.alive ? n + 1 : n), 0)
  const ready = state.day >= 3 || aliveCount <= 4
  const healUsed = self.statuses.includes(WITCH_HEAL_USED)
  const killUsed = self.statuses.includes(WITCH_KILL_USED)

  if (!ready) return { kind: 'witch-act', by: self.id, heal: null, kill: null }

  let heal: PlayerId | null = null
  let kill: PlayerId | null = null

  if (!healUsed) {
    const marked = state.players.find(
      (p) => p.alive && p.statuses.includes(MARKED_FOR_DEATH) && p.team === 'village',
    )
    if (marked) heal = marked.id
  }

  if (!killUsed) {
    const accused = loudestSeerAccusation(state)
    if (accused) {
      const target = state.players.find((p) => p.id === accused && p.alive && p.id !== self.id)
      if (target) kill = target.id
    }
    if (!kill) {
      // Fallback: lowest-id alive non-self, NON-village (i.e. werewolf).
      const candidate = sortedAlive(state, new Set([self.id])).find(
        (p) => p.team !== 'village',
      )
      if (candidate) kill = candidate.id
    }
  }

  void _rng
  return { kind: 'witch-act', by: self.id, heal, kill }
}

/** Dispatch table per role id. */
const ROLE_ACTIONS: Record<
  RoleId,
  (state: GameState, self: PlayerState, rng: RNG) => Action
> = {
  villager: villagerAction,
  werewolf: werewolfAction,
  seer: seerAction,
  doctor: doctorAction,
  witch: witchAction,
}

/**
 * Pick the next bot action for `playerId`. Throws if `playerId` is not in
 * the state. Returns `{ kind: 'noop' }` if the player is dead.
 */
export function pickAction(state: GameState, playerId: PlayerId, rng: RNG): Action {
  const self = state.players.find((p) => p.id === playerId)
  if (!self) throw new Error(`bot.pickAction: unknown playerId "${playerId}"`)
  if (!self.alive) return { kind: 'noop' }
  const fn = ROLE_ACTIONS[self.role]
  if (!fn) return { kind: 'noop' }
  return fn(state, self, rng)
}

/**
 * Schedule a single bot turn after `delayMs` if the next-to-act player is
 * a bot. Returns a cancel callback (no-op if no bot scheduled).
 *
 * Mirrors card-suite's `maybeScheduleBotTurn`. Renderer-level wiring; the
 * `apply` callback is the renderer's local action loop.
 */
export interface ScheduleArgs {
  state: GameState
  isBot: (id: PlayerId) => boolean
  rng: RNG
  apply: (action: Action) => void
  delayMs: number
  setTimer: (fn: () => void, ms: number) => () => void
}

export function maybeScheduleBotTurn(args: ScheduleArgs): () => void {
  const { state, isBot, rng, apply, delayMs, setTimer } = args
  // Pick the first alive bot whose role has a meaningful pending action
  // for the current phase. The renderer drives one bot at a time; for
  // multi-werewolf rolesets the loop calls maybeScheduleBotTurn again
  // after each bot resolves.
  for (const p of state.players) {
    if (!p.alive) continue
    if (!isBot(p.id)) continue
    const action = pickAction(state, p.id, rng)
    if (action.kind === 'noop') continue
    return setTimer(() => apply(action), delayMs)
  }
  return () => {}
}
