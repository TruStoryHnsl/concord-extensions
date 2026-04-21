/**
 * Blood on the Clocktower — core type definitions.
 * Spec: INS-004 §3.
 */

export type Alignment = 'good' | 'evil'
export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon'
export type RoleId = string
export type PlayerId = string

export type Phase =
  | 'setup'
  | 'first_night'
  | 'day'
  | 'night'
  | 'execution'
  | 'over'

export type ScriptId = 'trouble-brewing' | 'sects-and-violets' | 'bad-moon-rising'

export interface PlayerState {
  readonly id: PlayerId
  /** 0..N-1, clockwise. */
  readonly seat: number
  readonly role: RoleId
  readonly alignment: Alignment
  readonly team: Team
  readonly alive: boolean
  readonly ghost_vote_used: boolean
  /** "poisoned", "drunk", "mad", "red_herring", ... */
  readonly statuses: readonly string[]
}

export interface Nomination {
  readonly nominator: PlayerId
  readonly nominee: PlayerId
  /** Voters and their yes/no. Evaluated once voting closes. */
  readonly votes: readonly { id: PlayerId; yes: boolean; alive: boolean; ghostVoteUsed: boolean }[]
  /** Set true after tallyVote has produced a result. */
  readonly resolved: boolean
  /** Final resolution; null until resolved. */
  readonly resolution: VoteResult | null
}

export interface VoteResult {
  readonly nominee: PlayerId
  readonly yesVotes: number
  readonly requiredVotes: number
  /** True if the nominee meets the majority threshold. Ties eliminate. */
  readonly eligibleForExecution: boolean
  /** Ghost vote ids consumed by this tally (one per dead-yes voter). */
  readonly ghostVotesSpent: readonly PlayerId[]
}

export interface GameState {
  readonly script: ScriptId
  readonly phase: Phase
  /** 1-indexed. */
  readonly day: number
  readonly players: readonly PlayerState[]
  readonly nominations: readonly Nomination[]
  readonly executionsToday: number
  readonly demonBluffs: readonly RoleId[]
  readonly winner: Alignment | null
}
