import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng'
import { doctor } from '../doctor'
import { GameState, PlayerState } from '../../engine/types'
import { applyEffects, DOCTOR_LAST_TARGET_PREFIX, PROTECTED } from '../../engine/effects'

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

function state(players: PlayerState[], phase: GameState['phase'] = 'night'): GameState {
  return {
    roleset: 'classic-6',
    phase,
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('Doctor', () => {
  it('protects targeted player', () => {
    const players = [
      p('self', { role: 'doctor', statuses: ['target:v1'] }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    const effects = doctor.night(s, players[0], mulberry32(1))
    expect(effects.some((e) => e.kind === 'status_set' && e.target === 'v1' && e.status === PROTECTED)).toBe(true)
    expect(
      effects.some(
        (e) => e.kind === 'status_set' && e.target === 'self' && e.status === `${DOCTOR_LAST_TARGET_PREFIX}v1`,
      ),
    ).toBe(true)
  })

  it('refuses to protect same player two nights in a row', () => {
    const players = [
      p('self', {
        role: 'doctor',
        statuses: ['target:v1', `${DOCTOR_LAST_TARGET_PREFIX}v1`],
      }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    expect(doctor.night(s, players[0], mulberry32(1))).toEqual([])
  })

  it('clears previous doctor_last before stamping new one', () => {
    const players = [
      p('self', {
        role: 'doctor',
        statuses: ['target:v2', `${DOCTOR_LAST_TARGET_PREFIX}v1`],
      }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    const effects = doctor.night(s, players[0], mulberry32(1))
    const applied = applyEffects(s, effects)
    const self = applied.players.find((x) => x.id === 'self')
    expect(self?.statuses).toContain(`${DOCTOR_LAST_TARGET_PREFIX}v2`)
    expect(self?.statuses).not.toContain(`${DOCTOR_LAST_TARGET_PREFIX}v1`)
  })

  it('auto-picks a non-self when no target stamped', () => {
    const players = [
      p('self', { role: 'doctor' }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    const effects = doctor.night(s, players[0], mulberry32(3))
    expect(effects.length).toBeGreaterThan(0)
  })

  it('auto-pick avoids last-target', () => {
    const players = [
      p('self', { role: 'doctor', statuses: [`${DOCTOR_LAST_TARGET_PREFIX}v1`] }),
      p('v1'),
      p('v2'),
    ]
    const s = state(players)
    // Run several seeds and verify v1 is never the protected target.
    for (let seed = 1; seed < 20; seed++) {
      const effects = doctor.night(s, players[0], mulberry32(seed))
      const protectEff = effects.find(
        (e) => e.kind === 'status_set' && e.status === PROTECTED,
      ) as { target: string } | undefined
      if (protectEff) expect(protectEff.target).not.toBe('v1')
    }
  })

  it('dead doctor emits nothing', () => {
    const players = [
      p('self', { role: 'doctor', alive: false, statuses: ['target:v1'] }),
      p('v1'),
    ]
    const s = state(players)
    expect(doctor.night(s, players[0], mulberry32(1))).toEqual([])
  })
})
