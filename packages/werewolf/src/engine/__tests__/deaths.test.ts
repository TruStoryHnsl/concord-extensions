import { describe, expect, it } from 'vitest'
import { applyDeath, checkWinCondition } from '../deaths'
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

function state(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    roleset: 'classic-5',
    phase: 'day',
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
    ...overrides,
  }
}

describe('applyDeath', () => {
  it('marks target dead', () => {
    const s = state([p('a'), p('b')])
    const out = applyDeath(s, 'a', { source: 'werewolves', dayNumber: 1 })
    expect(out.players.find((x) => x.id === 'a')?.alive).toBe(false)
    expect(out.players.find((x) => x.id === 'b')?.alive).toBe(true)
  })

  it('lynch bumps lynchesToday', () => {
    const s = state([p('a')])
    const out = applyDeath(s, 'a', { source: 'lynch', dayNumber: 1 })
    expect(out.lynchesToday).toBe(1)
  })

  it('werewolves kill does NOT bump lynchesToday', () => {
    const s = state([p('a')])
    const out = applyDeath(s, 'a', { source: 'werewolves', dayNumber: 1 })
    expect(out.lynchesToday).toBe(0)
  })

  it('witch kill does NOT bump lynchesToday', () => {
    const s = state([p('a')])
    const out = applyDeath(s, 'a', { source: 'witch', dayNumber: 1 })
    expect(out.lynchesToday).toBe(0)
  })

  it('killing already-dead is idempotent', () => {
    const s = state([p('a', { alive: false })])
    const out = applyDeath(s, 'a', { source: 'werewolves', dayNumber: 1 })
    expect(out.players[0].alive).toBe(false)
    expect(out).toEqual(s)
  })
})

describe('checkWinCondition', () => {
  it('village wins when all werewolves dead', () => {
    const s = state([
      p('w', { team: 'werewolves', role: 'werewolf', alive: false }),
      p('v1'),
      p('v2'),
    ])
    expect(checkWinCondition(s)).toBe('village')
  })

  it('werewolves win when wolves >= village', () => {
    const s = state([
      p('w', { team: 'werewolves', role: 'werewolf' }),
      p('v1'),
    ])
    expect(checkWinCondition(s)).toBe('werewolves')
  })

  it('werewolves win when wolves outnumber village', () => {
    const s = state([
      p('w1', { team: 'werewolves', role: 'werewolf' }),
      p('w2', { team: 'werewolves', role: 'werewolf' }),
      p('v1'),
    ])
    expect(checkWinCondition(s)).toBe('werewolves')
  })

  it('game in progress when wolves alive but outnumbered', () => {
    const s = state([
      p('w', { team: 'werewolves', role: 'werewolf' }),
      p('v1'),
      p('v2'),
      p('v3'),
    ])
    expect(checkWinCondition(s)).toBeNull()
  })

  it('null when no werewolves in roster (game not started)', () => {
    const s = state([p('v1'), p('v2')])
    expect(checkWinCondition(s)).toBeNull()
  })
})
