import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { villager } from '../villager'
import { GameState, PlayerState } from '../../engine/types'

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
    phase: 'first_night',
    day: 0,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('Villager', () => {
  it('emits no effects on first night', () => {
    const s = state([p('self', { role: 'villager' })])
    expect(villager.firstNight(s, s.players[0], mulberry32(1))).toEqual([])
  })

  it('emits no effects on subsequent nights', () => {
    const s = state([p('self')])
    expect(villager.night(s, s.players[0], mulberry32(1))).toEqual([])
  })

  it('emits no effects on death', () => {
    const s = state([p('self')])
    expect(villager.onDeath(s, s.players[0])).toEqual([])
  })
})
