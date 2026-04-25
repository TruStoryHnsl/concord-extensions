import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { seer } from '../seer'
import { GameState, PlayerState } from '../../engine/types'
import { Effect } from '../../engine/effects'

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

function state(players: PlayerState[], phase: GameState['phase'] = 'first_night'): GameState {
  return {
    roleset: 'classic-5',
    phase,
    day: 0,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('Seer', () => {
  it('first-night peek reveals targeted team (village)', () => {
    const players = [
      p('self', { role: 'seer' }),
      p('v1'),
      p('w', { team: 'werewolves', role: 'werewolf' }),
    ]
    // Stamp v1 as the peek target.
    players[0] = { ...players[0], statuses: ['target:v1'] }
    const s = state(players)
    const effects = seer.firstNight(s, players[0], mulberry32(1))
    expect(effects.length).toBe(1)
    const e = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    expect(e.kind).toBe('info_grant')
    expect(e.to).toBe('self')
    expect(e.payload).toMatchObject({ peekedTarget: 'v1', learnedTeam: 'village' })
  })

  it('first-night peek reveals targeted team (werewolves)', () => {
    const players = [
      p('self', { role: 'seer', statuses: ['target:w'] }),
      p('w', { team: 'werewolves', role: 'werewolf' }),
    ]
    const s = state(players)
    const effects = seer.firstNight(s, players[0], mulberry32(1))
    const e = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    expect(e.payload).toMatchObject({ peekedTarget: 'w', learnedTeam: 'werewolves' })
  })

  it('subsequent-night peek emits info_grant', () => {
    const players = [
      p('self', { role: 'seer', statuses: ['target:v1'] }),
      p('v1'),
    ]
    const s = state(players, 'night')
    const effects = seer.night(s, players[0], mulberry32(1))
    expect(effects.length).toBe(1)
  })

  it('without target, picks a random non-self', () => {
    const players = [
      p('self', { role: 'seer' }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    const effects = seer.firstNight(s, players[0], mulberry32(7))
    expect(effects.length).toBe(1)
    const e = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    expect(['v1', 'v2']).toContain(e.payload.peekedTarget)
  })

  it('dead seer emits nothing', () => {
    const players = [p('self', { role: 'seer', alive: false, statuses: ['target:v1'] }), p('v1')]
    const s = state(players)
    expect(seer.night(s, players[0], mulberry32(1))).toEqual([])
  })
})
