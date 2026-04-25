import { describe, expect, it } from 'vitest'
import { canLynchToday, countAlive, resolveNomination, tallyVote, VoterRecord } from '../votes'
import { DayVote, GameState } from '../types'

function voter(id: string, yes: boolean): VoterRecord {
  return { id, yes }
}

describe('tallyVote — majority math', () => {
  it('6 alive requires 3 yes votes', () => {
    const voters = [voter('a', true), voter('b', true), voter('c', true)]
    const r = tallyVote('nom', voters, 6)
    expect(r.requiredVotes).toBe(3)
    expect(r.yesVotes).toBe(3)
    expect(r.eligibleForLynch).toBe(true)
  })

  it('7 alive requires 4 yes votes', () => {
    const voters = [voter('a', true), voter('b', true), voter('c', true)]
    const r = tallyVote('nom', voters, 7)
    expect(r.requiredVotes).toBe(4)
    expect(r.eligibleForLynch).toBe(false)
  })

  it('5 alive needs 3 yes votes', () => {
    const voters = [voter('a', true), voter('b', true), voter('c', true)]
    const r = tallyVote('nom', voters, 5)
    expect(r.requiredVotes).toBe(3)
    expect(r.eligibleForLynch).toBe(true)
  })

  it('below threshold not eligible', () => {
    const r = tallyVote('nom', [voter('a', true)], 5)
    expect(r.eligibleForLynch).toBe(false)
  })

  it('counts only yes votes', () => {
    const r = tallyVote('nom', [voter('a', true), voter('b', false), voter('c', true)], 4)
    expect(r.yesVotes).toBe(2)
  })
})

describe('resolveNomination — leader handling', () => {
  function n(id: string, nominee: string, yesVotes: number): DayVote {
    return {
      nominator: `nominator-${id}`,
      nominee,
      votes: Array.from({ length: yesVotes }, (_, i) => voter(`v${id}${i}`, true)),
      resolved: false,
      resolution: null,
    }
  }

  it('first eligible nomination becomes leader', () => {
    const out = resolveNomination(n('1', 'alice', 3), [], 6)
    expect(out.currentLeader).toBe('alice')
    expect(out.leaderVotes).toBe(3)
  })

  it('higher tally replaces leader', () => {
    const first: DayVote = {
      ...n('1', 'alice', 3),
      resolved: true,
      resolution: { nominee: 'alice', yesVotes: 3, requiredVotes: 3, eligibleForLynch: true },
    }
    const out = resolveNomination(n('2', 'bob', 4), [first], 6)
    expect(out.currentLeader).toBe('bob')
    expect(out.leaderVotes).toBe(4)
  })

  it('tie clears both', () => {
    const first: DayVote = {
      ...n('1', 'alice', 3),
      resolved: true,
      resolution: { nominee: 'alice', yesVotes: 3, requiredVotes: 3, eligibleForLynch: true },
    }
    const out = resolveNomination(n('2', 'bob', 3), [first], 6)
    expect(out.currentLeader).toBeNull()
    expect(out.leaderVotes).toBe(0)
  })

  it('below-threshold nom does not displace', () => {
    const first: DayVote = {
      ...n('1', 'alice', 4),
      resolved: true,
      resolution: { nominee: 'alice', yesVotes: 4, requiredVotes: 3, eligibleForLynch: true },
    }
    const out = resolveNomination(n('2', 'bob', 2), [first], 6)
    expect(out.currentLeader).toBe('alice')
  })

  it('lower-vote new nom does not displace bigger leader', () => {
    const first: DayVote = {
      ...n('1', 'alice', 5),
      resolved: true,
      resolution: { nominee: 'alice', yesVotes: 5, requiredVotes: 3, eligibleForLynch: true },
    }
    const out = resolveNomination(n('2', 'bob', 3), [first], 6)
    expect(out.currentLeader).toBe('alice')
    expect(out.leaderVotes).toBe(5)
  })
})

describe('countAlive + canLynchToday', () => {
  function makeState(opts: Partial<GameState> = {}): GameState {
    return {
      roleset: 'classic-5',
      phase: 'day',
      day: 1,
      players: [],
      nominations: [],
      lynchesToday: 0,
      winner: null,
      ...opts,
    }
  }

  it('counts alive players', () => {
    const s = makeState({
      players: [
        { id: 'a', seat: 0, role: 'villager', team: 'village', alive: true, statuses: [] },
        { id: 'b', seat: 1, role: 'villager', team: 'village', alive: false, statuses: [] },
        { id: 'c', seat: 2, role: 'villager', team: 'village', alive: true, statuses: [] },
      ],
    })
    expect(countAlive(s)).toBe(2)
  })

  it('canLynchToday false after a lynch', () => {
    const s = makeState({ lynchesToday: 1 })
    expect(canLynchToday(s)).toBe(false)
  })

  it('canLynchToday true with no lynches yet', () => {
    const s = makeState({ lynchesToday: 0 })
    expect(canLynchToday(s)).toBe(true)
  })
})
