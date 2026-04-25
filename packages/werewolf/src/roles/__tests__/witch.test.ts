import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { witch } from '../witch'
import { GameState, PlayerState } from '../../engine/types'
import {
  applyEffects,
  MARKED_FOR_DEATH,
  WITCH_HEAL_USED,
  WITCH_KILL_USED,
} from '../../engine/effects'

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
    roleset: 'classic-7',
    phase: 'night',
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('Witch', () => {
  it('no effects when no targets stamped', () => {
    const players = [p('self', { role: 'witch' }), p('v1')]
    const s = state(players)
    expect(witch.night(s, players[0], mulberry32(1))).toEqual([])
  })

  it('heals a marked player and consumes heal potion', () => {
    const players = [
      p('self', { role: 'witch', statuses: ['heal_target:v1'] }),
      p('v1', { statuses: [MARKED_FOR_DEATH] }),
    ]
    const s = state(players)
    const effects = witch.night(s, players[0], mulberry32(1))
    const applied = applyEffects(s, effects)
    expect(applied.players.find((x) => x.id === 'v1')?.statuses).not.toContain(MARKED_FOR_DEATH)
    expect(applied.players.find((x) => x.id === 'self')?.statuses).toContain(WITCH_HEAL_USED)
  })

  it('kills targeted player and consumes kill potion', () => {
    const players = [
      p('self', { role: 'witch', statuses: ['kill_target:v1'] }),
      p('v1'),
    ]
    const s = state(players)
    const effects = witch.night(s, players[0], mulberry32(1))
    const applied = applyEffects(s, effects)
    expect(applied.players.find((x) => x.id === 'v1')?.alive).toBe(false)
    expect(applied.players.find((x) => x.id === 'self')?.statuses).toContain(WITCH_KILL_USED)
  })

  it('refuses to use heal potion if already used', () => {
    const players = [
      p('self', {
        role: 'witch',
        statuses: ['heal_target:v1', WITCH_HEAL_USED],
      }),
      p('v1', { statuses: [MARKED_FOR_DEATH] }),
    ]
    const s = state(players)
    const effects = witch.night(s, players[0], mulberry32(1))
    expect(effects).toEqual([])
  })

  it('refuses to use kill potion if already used', () => {
    const players = [
      p('self', {
        role: 'witch',
        statuses: ['kill_target:v1', WITCH_KILL_USED],
      }),
      p('v1'),
    ]
    const s = state(players)
    const effects = witch.night(s, players[0], mulberry32(1))
    expect(effects).toEqual([])
  })

  it('refuses to kill self', () => {
    const players = [
      p('self', { role: 'witch', statuses: ['kill_target:self'] }),
      p('v1'),
    ]
    const s = state(players)
    expect(witch.night(s, players[0], mulberry32(1))).toEqual([])
  })

  it('can heal AND kill in the same night', () => {
    const players = [
      p('self', { role: 'witch', statuses: ['heal_target:v1', 'kill_target:v2'] }),
      p('v1', { statuses: [MARKED_FOR_DEATH] }),
      p('v2'),
    ]
    const s = state(players)
    const effects = witch.night(s, players[0], mulberry32(1))
    const applied = applyEffects(s, effects)
    expect(applied.players.find((x) => x.id === 'v1')?.statuses).not.toContain(MARKED_FOR_DEATH)
    expect(applied.players.find((x) => x.id === 'v2')?.alive).toBe(false)
    expect(applied.players.find((x) => x.id === 'self')?.statuses).toContain(WITCH_HEAL_USED)
    expect(applied.players.find((x) => x.id === 'self')?.statuses).toContain(WITCH_KILL_USED)
  })

  it('dead witch emits nothing', () => {
    const players = [
      p('self', { role: 'witch', alive: false, statuses: ['kill_target:v1'] }),
      p('v1'),
    ]
    const s = state(players)
    expect(witch.night(s, players[0], mulberry32(1))).toEqual([])
  })
})
