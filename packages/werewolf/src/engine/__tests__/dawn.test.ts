import { describe, expect, it } from 'vitest'
import { resolveDawn } from '../dawn'
import { MARKED_FOR_DEATH, PROTECTED } from '../effects'
import { GameState, PlayerState } from '../types'

function p(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
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

function state(players: PlayerState[]): GameState {
  return {
    roleset: 'classic-5',
    phase: 'night',
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('resolveDawn', () => {
  it('marked + unprotected → killed', () => {
    const s = state([p('a', { statuses: [MARKED_FOR_DEATH] }), p('b')])
    const r = resolveDawn(s)
    expect(r.killed).toEqual(['a'])
    expect(r.saved).toEqual([])
    expect(r.state.players.find((x) => x.id === 'a')?.alive).toBe(false)
    expect(r.state.players.find((x) => x.id === 'a')?.statuses).not.toContain(MARKED_FOR_DEATH)
  })

  it('marked + protected → saved', () => {
    const s = state([p('a', { statuses: [MARKED_FOR_DEATH, PROTECTED] }), p('b')])
    const r = resolveDawn(s)
    expect(r.killed).toEqual([])
    expect(r.saved).toEqual(['a'])
    expect(r.state.players.find((x) => x.id === 'a')?.alive).toBe(true)
    // Both statuses should be cleared.
    expect(r.state.players.find((x) => x.id === 'a')?.statuses).not.toContain(MARKED_FOR_DEATH)
    expect(r.state.players.find((x) => x.id === 'a')?.statuses).not.toContain(PROTECTED)
  })

  it('unmarked + protected → status cleared, alive', () => {
    const s = state([p('a', { statuses: [PROTECTED] }), p('b')])
    const r = resolveDawn(s)
    expect(r.killed).toEqual([])
    expect(r.saved).toEqual([])
    expect(r.state.players.find((x) => x.id === 'a')?.alive).toBe(true)
    expect(r.state.players.find((x) => x.id === 'a')?.statuses).not.toContain(PROTECTED)
  })

  it('multiple kills resolve in order', () => {
    const s = state([
      p('a', { statuses: [MARKED_FOR_DEATH] }),
      p('b', { statuses: [MARKED_FOR_DEATH] }),
      p('c'),
    ])
    const r = resolveDawn(s)
    expect([...r.killed].sort()).toEqual(['a', 'b'])
    expect(r.state.players.filter((x) => !x.alive).map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('persistent statuses (witch_*_used, doctor_last:*) survive dawn', () => {
    const s = state([
      p('w', {
        role: 'witch',
        statuses: ['witch_heal_used', 'witch_kill_used'],
      }),
      p('d', {
        role: 'doctor',
        statuses: ['doctor_last:b', PROTECTED],
      }),
      p('b'),
    ])
    const r = resolveDawn(s)
    expect(r.state.players.find((x) => x.id === 'w')?.statuses).toContain('witch_heal_used')
    expect(r.state.players.find((x) => x.id === 'w')?.statuses).toContain('witch_kill_used')
    expect(r.state.players.find((x) => x.id === 'd')?.statuses).toContain('doctor_last:b')
    expect(r.state.players.find((x) => x.id === 'd')?.statuses).not.toContain(PROTECTED)
  })
})
