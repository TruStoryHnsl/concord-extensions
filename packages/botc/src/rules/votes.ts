/**
 * Vote tally — pure.
 * Spec: INS-004 §7.
 *
 * Rules:
 *   - Dead players vote once per game (ghost vote). A dead voter voting "yes"
 *     spends their ghost vote; "no" does not.
 *   - Nominee needs votes >= ceil(alive / 2) to be eligible for execution.
 *   - On tie with an existing nominee this day: nobody is eligible.
 *   - At most one execution per day.
 */

import { GameState, Nomination, PlayerId, VoteResult } from './types'

export interface VoterRecord {
  readonly id: PlayerId
  readonly yes: boolean
  readonly alive: boolean
  readonly ghostVoteUsed: boolean
}

/** Compute the raw tally for a single nomination. No game-level tiebreaking. */
export function tallyVote(
  nominee: PlayerId,
  voters: readonly VoterRecord[],
  aliveCount: number,
): VoteResult {
  let yesVotes = 0
  const ghostVotesSpent: PlayerId[] = []

  for (const v of voters) {
    if (!v.yes) continue
    if (v.alive) {
      yesVotes++
    } else if (!v.ghostVoteUsed) {
      yesVotes++
      ghostVotesSpent.push(v.id)
    }
    // Dead voters who already used their ghost vote: silently discarded.
  }

  const requiredVotes = Math.ceil(aliveCount / 2)
  const eligibleForExecution = yesVotes >= requiredVotes

  return {
    nominee,
    yesVotes,
    requiredVotes,
    eligibleForExecution,
    ghostVotesSpent,
  }
}

/**
 * Resolve a new nomination against the day's existing nominations.
 * Returns the nomination with a filled-in `resolution` plus a GameState-level
 * decision: which player (if any) is now eligible for execution.
 *
 * Tiebreaking: if this nomination ties the current leader, nobody is eligible
 * (both nominees are cleared).
 */
export interface NominationOutcome {
  readonly nomination: Nomination
  readonly currentLeader: PlayerId | null
  readonly leaderVotes: number
}

export function resolveNomination(
  nomination: Nomination,
  priorNominations: readonly Nomination[],
  aliveCount: number,
): NominationOutcome {
  const tally = tallyVote(nomination.nominee, nomination.votes, aliveCount)
  const resolved: Nomination = {
    ...nomination,
    resolved: true,
    resolution: tally,
  }

  // Find the highest prior threshold-passing tally.
  let leader: PlayerId | null = null
  let leaderVotes = 0
  for (const prior of priorNominations) {
    if (!prior.resolved || !prior.resolution) continue
    if (!prior.resolution.eligibleForExecution) continue
    if (prior.resolution.yesVotes > leaderVotes) {
      leader = prior.nominee
      leaderVotes = prior.resolution.yesVotes
    }
  }

  if (!tally.eligibleForExecution) {
    return { nomination: resolved, currentLeader: leader, leaderVotes }
  }

  if (leader === null || tally.yesVotes > leaderVotes) {
    return { nomination: resolved, currentLeader: tally.nominee, leaderVotes: tally.yesVotes }
  }

  if (tally.yesVotes === leaderVotes) {
    // Tie with prior leader — both cleared.
    return { nomination: resolved, currentLeader: null, leaderVotes: 0 }
  }

  // tally < leader: leader stays.
  return { nomination: resolved, currentLeader: leader, leaderVotes }
}

/** Count alive players in the state. */
export function countAlive(state: GameState): number {
  return state.players.reduce((n, p) => (p.alive ? n + 1 : n), 0)
}

/**
 * Whether the game can still execute today. Spec: max one execution/day.
 */
export function canExecuteToday(state: GameState): boolean {
  return state.executionsToday === 0
}
