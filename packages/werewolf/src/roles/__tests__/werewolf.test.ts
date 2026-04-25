import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { werewolf } from '../werewolf'
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
    phase: 'night',
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('Werewolf — first night', () => {
  it('does not act on first night', () => {
    const s = state([
      p('self', { role: 'werewolf', team: 'werewolves', statuses: ['target:victim'] }),
      p('victim'),
    ])
    expect(werewolf.firstNight(s, s.players[0], mulberry32(1))).toEqual([])
  })
})

describe('Werewolf — night kill', () => {
  it('emits mark_for_death for the stamped target', () => {
    const players = [
      p('self', { role: 'werewolf', team: 'werewolves', statuses: ['target:victim'] }),
      p('victim'),
      p('extra'),
    ]
    const s = state(players)
    const effects = werewolf.night(s, players[0], mulberry32(1))
    expect(effects).toEqual([{ kind: 'mark_for_death', target: 'victim', source: 'werewolves' }])
  })

  it('auto-picks a non-werewolf target when none stamped', () => {
    const players = [
      p('self', { role: 'werewolf', team: 'werewolves' }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    const effects = werewolf.night(s, players[0], mulberry32(42))
    expect(effects.length).toBe(1)
    expect(effects[0].kind).toBe('mark_for_death')
    if (effects[0].kind === 'mark_for_death') {
      expect(['v1', 'v2']).toContain(effects[0].target)
    }
  })

  it('dead werewolf produces no effects', () => {
    const players = [
      p('self', { role: 'werewolf', team: 'werewolves', alive: false, statuses: ['target:v1'] }),
      p('v1'),
    ]
    const s = state(players)
    expect(werewolf.night(s, players[0], mulberry32(1))).toEqual([])
  })

  it('no eligible target → no effects', () => {
    const players = [p('self', { role: 'werewolf', team: 'werewolves' })]
    const s = state(players)
    expect(werewolf.night(s, players[0], mulberry32(1))).toEqual([])
  })

  it('does not target a dead player even if stamped', () => {
    const players = [
      p('self', { role: 'werewolf', team: 'werewolves', statuses: ['target:dead'] }),
      p('dead', { alive: false }),
      p('alive'),
    ]
    const s = state(players)
    const effects = werewolf.night(s, players[0], mulberry32(1))
    expect(effects).toEqual([])
  })
})
