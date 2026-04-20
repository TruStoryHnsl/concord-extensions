import { describe, expect, it } from 'vitest'
import { countAlive, resolveNomination, tallyVote, VoterRecord } from '../votes'
import { GameState, Nomination } from '../types'

function voter(id: string, yes: boolean, alive = true, ghostVoteUsed = false): VoterRecord {
  return { id, yes, alive, ghostVoteUsed }
}

describe('tallyVote — majority math', () => {
  it('6 alive requires 3 yes votes', () => {
    // alive=6 → ceil(6/2) = 3
    const voters = [voter('a', true), voter('b', true), voter('c', true), voter('d', false), voter('e', false), voter('f', false)]
    const r = tallyVote('nom', voters, 6)
    expect(r.yesVotes).toBe(3)
    expect(r.requiredVotes).toBe(3)
    expect(r.eligibleForExecution).toBe(true)
  })

  it('7 alive requires 4 yes votes', () => {
    // ceil(7/2) = 4
    const voters = Array.from({ length: 3 }, (_, i) => voter(`y${i}`, true))
    const r = tallyVote('nom', voters, 7)
    expect(r.requiredVotes).toBe(4)
    expect(r.eligibleForExecution).toBe(false)
  })

  it('meets exact threshold is eligible', () => {
    const r = tallyVote('nom', [voter('a', true), voter('b', true)], 3)
    // ceil(3/2) = 2
    expect(r.requiredVotes).toBe(2)
    expect(r.yesVotes).toBe(2)
    expect(r.eligibleForExecution).toBe(true)
  })

  it('below threshold is ineligible', () => {
    const r = tallyVote('nom', [voter('a', true)], 4)
    // ceil(4/2) = 2
    expect(r.requiredVotes).toBe(2)
    expect(r.yesVotes).toBe(1)
    expect(r.eligibleForExecution).toBe(false)
  })
})

describe('tallyVote — ghost votes', () => {
  it('dead voter with unused ghost vote counts once', () => {
    const voters = [
      voter('alive1', true),
      voter('dead1', true, false, false), // dead, ghost vote unused
      voter('alive2', false),
    ]
    const r = tallyVote('nom', voters, 2) // 2 alive
    expect(r.yesVotes).toBe(2)
    expect(r.ghostVotesSpent).toEqual(['dead1'])
  })

  it('dead voter with used ghost vote is discarded', () => {
    const voters = [
      voter('alive1', true),
      voter('dead1', true, false, true), // dead, ghost vote ALREADY used
    ]
    const r = tallyVote('nom', voters, 2)
    expect(r.yesVotes).toBe(1)
    expect(r.ghostVotesSpent).toEqual([])
  })

  it('dead "no" voter does not spend ghost vote', () => {
    const voters = [voter('dead1', false, false, false)]
    const r = tallyVote('nom', voters, 2)
    expect(r.yesVotes).toBe(0)
    expect(r.ghostVotesSpent).toEqual([])
  })
})

describe('resolveNomination — tie handling', () => {
  function n(id: string, nominee: string, yesVotes: number): Nomination {
    const voters: VoterRecord[] = Array.from({ length: yesVotes }, (_, i) => voter(`v${id}${i}`, true))
    return {
      nominator: `nominator-${id}`,
      nominee,
      votes: voters,
      resolved: false,
      resolution: null,
    }
  }

  it('new leader replaces old leader with more votes', () => {
    const first = { ...n('1', 'alice', 3), resolved: true, resolution: { nominee: 'alice', yesVotes: 3, requiredVotes: 3, eligibleForExecution: true, ghostVotesSpent: [] } } as Nomination
    const second = n('2', 'bob', 4)
    const out = resolveNomination(second, [first], 6)
    expect(out.currentLeader).toBe('bob')
    expect(out.leaderVotes).toBe(4)
  })

  it('tie with existing leader clears both', () => {
    const first = { ...n('1', 'alice', 3), resolved: true, resolution: { nominee: 'alice', yesVotes: 3, requiredVotes: 3, eligibleForExecution: true, ghostVotesSpent: [] } } as Nomination
    const second = n('2', 'bob', 3)
    const out = resolveNomination(second, [first], 6)
    expect(out.currentLeader).toBeNull()
    expect(out.leaderVotes).toBe(0)
    expect(out.nomination.resolution?.eligibleForExecution).toBe(true)
  })

  it('below-threshold nomination does not displace leader', () => {
    const first = { ...n('1', 'alice', 4), resolved: true, resolution: { nominee: 'alice', yesVotes: 4, requiredVotes: 3, eligibleForExecution: true, ghostVotesSpent: [] } } as Nomination
    const second = n('2', 'bob', 2) // ceil(6/2)=3, 2 < 3 not eligible
    const out = resolveNomination(second, [first], 6)
    expect(out.currentLeader).toBe('alice')
    expect(out.leaderVotes).toBe(4)
  })

  it('first nomination with enough votes sets leader', () => {
    const first = n('1', 'alice', 3)
    const out = resolveNomination(first, [], 6)
    expect(out.currentLeader).toBe('alice')
    expect(out.leaderVotes).toBe(3)
  })
})

describe('countAlive + canExecuteToday', () => {
  it('counts alive players', () => {
    const state: GameState = {
      script: 'trouble-brewing',
      phase: 'day',
      day: 1,
      players: [
        { id: 'a', seat: 0, role: 'x', alignment: 'good', team: 'townsfolk', alive: true, ghost_vote_used: false, statuses: [] },
        { id: 'b', seat: 1, role: 'x', alignment: 'good', team: 'townsfolk', alive: false, ghost_vote_used: false, statuses: [] },
        { id: 'c', seat: 2, role: 'x', alignment: 'good', team: 'townsfolk', alive: true, ghost_vote_used: false, statuses: [] },
      ],
      nominations: [],
      executionsToday: 0,
      demonBluffs: [],
      winner: null,
    }
    expect(countAlive(state)).toBe(2)
  })
})
