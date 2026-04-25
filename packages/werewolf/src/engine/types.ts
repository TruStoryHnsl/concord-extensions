/**
 * Werewolf — core type definitions.
 *
 * Public-domain folk game (Davidoff, 1986). Two teams: Village vs Werewolves.
 * Village wins when all werewolves are dead; Werewolves win when their
 * count is greater than or equal to the number of remaining villagers.
 */

export type Team = 'village' | 'werewolves'
export type RoleId = 'villager' | 'werewolf' | 'seer' | 'doctor' | 'witch'
export type PlayerId = string

export type Phase =
  | 'setup'
  | 'first_night'
  | 'day'
  | 'night'
  | 'over'

/** Roleset id — chosen at table creation; defines who's in play. */
export type RolesetId = 'classic-5' | 'classic-6' | 'classic-7'

export interface PlayerState {
  readonly id: PlayerId
  /** 0..N-1, clockwise. */
  readonly seat: number
  readonly role: RoleId
  readonly team: Team
  readonly alive: boolean
  /** "protected", "marked_for_death", "doctor_protected_last:<id>", ... */
  readonly statuses: readonly string[]
}

export interface DayVote {
  readonly nominator: PlayerId
  readonly nominee: PlayerId
  /** yes/no, one record per voter. */
  readonly votes: readonly { id: PlayerId; yes: boolean }[]
  readonly resolved: boolean
  readonly resolution: VoteResult | null
}

export interface VoteResult {
  readonly nominee: PlayerId
  readonly yesVotes: number
  readonly requiredVotes: number
  /** Met the majority threshold (and not tied with prior leader). */
  readonly eligibleForLynch: boolean
}

export interface GameState {
  readonly roleset: RolesetId
  readonly phase: Phase
  /** 1-indexed; first day is 1 (after first_night). */
  readonly day: number
  readonly players: readonly PlayerState[]
  readonly nominations: readonly DayVote[]
  readonly lynchesToday: number
  readonly winner: Team | null
}
