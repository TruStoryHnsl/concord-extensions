import { describe, expect, it } from 'vitest'
import { advanceCanonical, advanceToPhase, legalNextPhases } from '../phases'
import { GameState, PlayerState } from '../types'

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    roleset: 'classic-5',
    phase: 'setup',
    day: 0,
    players: [],
    nominations: [],
    lynchesToday: 0,
    winner: null,
    ...overrides,
  }
}

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    seat: 0,
    role: 'villager',
    team: 'village',
    alive: true,
    statuses: [],
    ...overrides,
  }
}

describe('legalNextPhases', () => {
  it('setup → first_night', () => {
    expect(legalNextPhases('setup')).toEqual(['first_night'])
  })
  it('first_night → day', () => {
    expect(legalNextPhases('first_night')).toEqual(['day'])
  })
  it('day → night | over', () => {
    expect(legalNextPhases('day')).toEqual(['night', 'over'])
  })
  it('night → day | over', () => {
    expect(legalNextPhases('night')).toEqual(['day', 'over'])
  })
  it('over is terminal', () => {
    expect(legalNextPhases('over')).toEqual([])
  })
})

describe('advanceToPhase', () => {
  it('rejects illegal transitions', () => {
    const s = makeState({ phase: 'setup' })
    expect(() => advanceToPhase(s, 'day')).toThrow()
    expect(() => advanceToPhase(s, 'over')).toThrow()
  })

  it('day transition bumps day and clears nominations + lynches', () => {
    const s = makeState({
      phase: 'night',
      day: 2,
      nominations: [{ nominator: 'a', nominee: 'b', votes: [], resolved: true, resolution: null }],
      lynchesToday: 1,
      players: [makePlayer('w', { team: 'werewolves', role: 'werewolf' }), makePlayer('v1'), makePlayer('v2'), makePlayer('v3')],
    })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('day')
    expect(next.day).toBe(3)
    expect(next.nominations).toEqual([])
    expect(next.lynchesToday).toBe(0)
  })

  it('first_night does NOT bump day', () => {
    const s = makeState({ phase: 'setup', day: 0 })
    const next = advanceToPhase(s, 'first_night')
    expect(next.phase).toBe('first_night')
    expect(next.day).toBe(0)
  })

  it('first_night → day bumps day to 1', () => {
    const s = makeState({
      phase: 'first_night',
      day: 0,
      players: [makePlayer('w', { team: 'werewolves', role: 'werewolf' }), makePlayer('v1'), makePlayer('v2'), makePlayer('v3')],
    })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('day')
    expect(next.day).toBe(1)
  })

  it('transitions into over when win condition met', () => {
    const players = [
      makePlayer('w', { team: 'werewolves', role: 'werewolf', alive: false }),
      makePlayer('v1'),
      makePlayer('v2'),
      makePlayer('v3'),
    ]
    const s = makeState({ phase: 'night', day: 1, players })
    const next = advanceToPhase(s, 'day')
    expect(next.phase).toBe('over')
    expect(next.winner).toBe('village')
  })

  it('setup → first_night does not run win check', () => {
    const players = [
      makePlayer('w', { team: 'werewolves', role: 'werewolf', alive: false }),
      makePlayer('v1'),
      makePlayer('v2'),
      makePlayer('v3'),
    ]
    const s = makeState({ phase: 'setup', day: 0, players })
    const next = advanceToPhase(s, 'first_night')
    expect(next.phase).toBe('first_night')
    expect(next.winner).toBeNull()
  })
})

describe('advanceCanonical', () => {
  it('runs setup → first_night → day(1) → night → day(2)', () => {
    let s = makeState({
      phase: 'setup',
      day: 0,
      players: [makePlayer('w', { team: 'werewolves', role: 'werewolf' }), makePlayer('v1'), makePlayer('v2'), makePlayer('v3')],
    })
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
    const s = makeState({ phase: 'over', winner: 'village' })
    expect(advanceCanonical(s)).toBe(s)
  })
})
