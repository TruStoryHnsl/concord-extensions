import { describe, expect, it } from 'vitest'
import { applyDeath, checkWinCondition } from '../deaths'
import { GameState, PlayerState } from '../types'

function p(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    seat: 0,
    role: 'x',
    alignment: 'good',
    team: 'townsfolk',
    alive: true,
    ghost_vote_used: false,
    statuses: [],
    ...overrides,
  }
}

function state(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    script: 'trouble-brewing',
    phase: 'day',
    day: 1,
    players,
    nominations: [],
    executionsToday: 0,
    demonBluffs: [],
    winner: null,
    ...overrides,
  }
}

describe('applyDeath', () => {
  it('marks target dead', () => {
    const s = state([p('a'), p('b')])
    const out = applyDeath(s, 'a', { source: 'demon', dayNumber: 1 })
    expect(out.players.find((x) => x.id === 'a')?.alive).toBe(false)
    expect(out.players.find((x) => x.id === 'b')?.alive).toBe(true)
  })

  it('execution bumps executionsToday', () => {
    const s = state([p('a')])
    const out = applyDeath(s, 'a', { source: 'execution', dayNumber: 1 })
    expect(out.executionsToday).toBe(1)
  })

  it('demon kill does NOT bump executionsToday', () => {
    const s = state([p('a')])
    const out = applyDeath(s, 'a', { source: 'demon', dayNumber: 1 })
    expect(out.executionsToday).toBe(0)
  })

  it('killing an already-dead player is idempotent', () => {
    const s = state([p('a', { alive: false })])
    const out = applyDeath(s, 'a', { source: 'demon', dayNumber: 1 })
    expect(out.players[0].alive).toBe(false)
    expect(out).toEqual(s) // no other changes
  })
})

describe('checkWinCondition', () => {
  it('good wins when demon is dead', () => {
    const s = state([
      p('demon', { team: 'demon', alignment: 'evil', alive: false }),
      p('t1'),
      p('t2'),
      p('t3'),
    ])
    expect(checkWinCondition(s)).toBe('good')
  })

  it('evil wins when fewer than 3 good players remain', () => {
    const s = state([
      p('demon', { team: 'demon', alignment: 'evil', alive: true }),
      p('t1', { alive: true }),
      p('t2', { alive: false }),
      p('t3', { alive: false }),
    ])
    // 1 alive good < 3 → evil wins (demon still alive)
    expect(checkWinCondition(s)).toBe('evil')
  })

  it('game not over when demon alive and 3+ good alive', () => {
    const s = state([
      p('demon', { team: 'demon', alignment: 'evil', alive: true }),
      p('t1'),
      p('t2'),
      p('t3'),
    ])
    expect(checkWinCondition(s)).toBeNull()
  })
})
