import { describe, expect, it } from 'vitest'
import { advanceCanonical, advanceToPhase, legalNextPhases } from '../phases'
import { GameState, PlayerState } from '../types'

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    script: 'trouble-brewing',
    phase: 'setup',
    day: 0,
    players: [],
    nominations: [],
    executionsToday: 0,
    demonBluffs: [],
    winner: null,
  }
  return { ...base, ...overrides }
}

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    seat: 0,
    role: 'washerwoman',
    alignment: 'good',
    team: 'townsfolk',
    alive: true,
    ghost_vote_used: false,
    statuses: [],
    ...overrides,
  }
}

describe('phases — legalNextPhases', () => {
  it('setup only transitions to first_night', () => {
    expect(legalNextPhases('setup')).toEqual(['first_night'])
  })

  it('first_night only transitions to day', () => {
    expect(legalNextPhases('first_night')).toEqual(['day'])
  })

  it('day can transition to night or over', () => {
    expect(legalNextPhases('day')).toEqual(['night', 'over'])
  })

  it('night can transition to day or over', () => {
    expect(legalNextPhases('night')).toEqual(['day', 'over'])
  })

  it('over is terminal', () => {
    expect(legalNextPhases('over')).toEqual([])
  })
})

describe('phases — advanceToPhase', () => {
  it('rejects illegal transitions', () => {
    const s = makeState({ phase: 'setup' })
    expect(() => advanceToPhase(s, 'day')).toThrow()
    expect(() => advanceToPhase(s, 'over')).toThrow()
  })

  it('day transition bumps day counter and clears nominations/executions', () => {
    const s = makeState({
      phase: 'night',
      day: 2,
      nominations: [{ nominator: 'a', nominee: 'b', votes: [], resolved: true, resolution: null }],
      executionsToday: 1,
    })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('day')
    expect(next.day).toBe(3)
    expect(next.nominations).toEqual([])
    expect(next.executionsToday).toBe(0)
  })

  it('first_night does NOT bump day', () => {
    const s = makeState({ phase: 'setup', day: 0 })
    const next = advanceToPhase(s, 'first_night')
    expect(next.phase).toBe('first_night')
    expect(next.day).toBe(0)
  })

  it('first_night → day bumps day to 1', () => {
    const s = makeState({ phase: 'first_night', day: 0 })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('day')
    expect(next.day).toBe(1)
  })

  it('transition into over stays over (terminal)', () => {
    const players = [
      makePlayer('a', { team: 'demon', alignment: 'evil', alive: false }),
      makePlayer('b', { team: 'townsfolk', alignment: 'good' }),
      makePlayer('c', { team: 'townsfolk', alignment: 'good' }),
      makePlayer('d', { team: 'townsfolk', alignment: 'good' }),
    ]
    // Demon is dead → good wins on the first post-setup transition.
    const s = makeState({ phase: 'night', day: 1, players })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('over')
    expect(next.winner).toBe('good')
  })

  it('setup → first_night does not run win check', () => {
    const players = [
      makePlayer('a', { team: 'demon', alignment: 'evil', alive: false }),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ]
    const s = makeState({ phase: 'setup', day: 0, players })
    const next = advanceToPhase(s, 'first_night')
    expect(next.phase).toBe('first_night')
    expect(next.winner).toBeNull()
  })
})

describe('phases — advanceCanonical', () => {
  it('runs setup → first_night → day(1) → night → day(2)', () => {
    let s = makeState({ phase: 'setup', day: 0 })
    s = advanceCanonical(s)
    expect(s.phase).toBe('first_night')
    s = advanceCanonical(s)
    expect(s.phase).toBe('day')
    expect(s.day).toBe(1)
    s = advanceCanonical(s)
    expect(s.phase).toBe('night')
    s = advanceCanonical(s)
    expect(s.phase).toBe('day')
    expect(s.day).toBe(2)
  })

  it('no-ops on terminal phase', () => {
    const s = makeState({ phase: 'over', winner: 'good' })
    expect(advanceCanonical(s)).toBe(s)
  })
})
