/**
 * Vote tally — pure.
 *
 * Rules:
 *   - Only living players vote (no ghost vote in classic Werewolf).
 *   - Nominee needs votes >= ceil(alive / 2) to be eligible for lynch.
 *   - On tie with an existing eligible nominee this day: nobody is eligible.
 *   - At most one lynch per day.
 */

import { DayVote, GameState, PlayerId, VoteResult } from './types'

export interface VoterRecord {
  readonly id: PlayerId
  readonly yes: boolean
}

/** Compute the raw tally for a single nomination. No game-level tiebreaking. */
export function tallyVote(
  nominee: PlayerId,
  voters: readonly VoterRecord[],
  aliveCount: number,
): VoteResult {
  let yesVotes = 0
  for (const v of voters) {
    if (v.yes) yesVotes++
  }
  const requiredVotes = Math.ceil(aliveCount / 2)
  const eligibleForLynch = yesVotes >= requiredVotes

  return {
    nominee,
    yesVotes,
    requiredVotes,
    eligibleForLynch,
  }
}

/**
 * Resolve a new nomination against the day's existing nominations.
 * Returns the nomination with a filled-in `resolution` plus a state-level
 * decision: which player (if any) is now eligible for lynch.
 *
 * Tiebreaking: if this nomination ties the current leader, nobody is eligible.
 */
export interface NominationOutcome {
  readonly nomination: DayVote
  readonly currentLeader: PlayerId | null
  readonly leaderVotes: number
}

export function resolveNomination(
  nomination: DayVote,
  priorNominations: readonly DayVote[],
  aliveCount: number,
): NominationOutcome {
  const tally = tallyVote(nomination.nominee, nomination.votes, aliveCount)
  const resolved: DayVote = {
    ...nomination,
    resolved: true,
    resolution: tally,
  }

  let leader: PlayerId | null = null
  let leaderVotes = 0
  for (const prior of priorNominations) {
    if (!prior.resolved || !prior.resolution) continue
    if (!prior.resolution.eligibleForLynch) continue
    if (prior.resolution.yesVotes > leaderVotes) {
      leader = prior.nominee
      leaderVotes = prior.resolution.yesVotes
    }
  }

  if (!tally.eligibleForLynch) {
    return { nomination: resolved, currentLeader: leader, leaderVotes }
  }

  if (leader === null || tally.yesVotes > leaderVotes) {
    return { nomination: resolved, currentLeader: tally.nominee, leaderVotes: tally.yesVotes }
  }

  if (tally.yesVotes === leaderVotes) {
    // Tie with prior leader — both cleared.
    return { nomination: resolved, currentLeader: null, leaderVotes: 0 }
  }

  return { nomination: resolved, currentLeader: leader, leaderVotes }
}

/** Count alive players. */
export function countAlive(state: GameState): number {
  return state.players.reduce((n, p) => (p.alive ? n + 1 : n), 0)
}

/** Whether the table can still lynch today. Spec: max one lynch/day. */
export function canLynchToday(state: GameState): boolean {
  return state.lynchesToday === 0
}
