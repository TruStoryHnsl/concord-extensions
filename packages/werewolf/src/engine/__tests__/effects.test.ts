import { describe, expect, it } from 'vitest'
import { applyEffect, applyEffects, MARKED_FOR_DEATH, PROTECTED } from '../effects'
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
    phase: 'first_night',
    day: 0,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

describe('applyEffect — Effect ADT', () => {
  it('status_set adds status to target', () => {
    const s = state([p('a')])
    const out = applyEffect(s, { kind: 'status_set', target: 'a', status: PROTECTED })
    expect(out.players[0].statuses).toEqual([PROTECTED])
  })

  it('status_set is idempotent', () => {
    const s = state([p('a', { statuses: [PROTECTED] })])
    const out = applyEffect(s, { kind: 'status_set', target: 'a', status: PROTECTED })
    expect(out.players[0].statuses).toEqual([PROTECTED])
  })

  it('status_clear removes named status only', () => {
    const s = state([p('a', { statuses: [PROTECTED, MARKED_FOR_DEATH] })])
    const out = applyEffect(s, { kind: 'status_clear', target: 'a', status: PROTECTED })
    expect(out.players[0].statuses).toEqual([MARKED_FOR_DEATH])
  })

  it('kill sets alive to false', () => {
    const s = state([p('a')])
    const out = applyEffect(s, { kind: 'kill', target: 'a', source: 'werewolves' })
    expect(out.players[0].alive).toBe(false)
  })

  it('mark_for_death stamps the marked status', () => {
    const s = state([p('a')])
    const out = applyEffect(s, { kind: 'mark_for_death', target: 'a', source: 'werewolves' })
    expect(out.players[0].statuses).toContain(MARKED_FOR_DEATH)
    expect(out.players[0].alive).toBe(true)
  })

  it('mark_for_death is idempotent', () => {
    const s = state([p('a', { statuses: [MARKED_FOR_DEATH] })])
    const out = applyEffect(s, { kind: 'mark_for_death', target: 'a', source: 'werewolves' })
    expect(out.players[0].statuses).toEqual([MARKED_FOR_DEATH])
  })

  it('whisper / info_grant do not change state', () => {
    const s = state([p('a')])
    expect(applyEffect(s, { kind: 'whisper', to: 'a', text: 'hello' })).toBe(s)
    expect(applyEffect(s, { kind: 'info_grant', to: 'a', payload: { x: 1 } })).toBe(s)
  })

  it('applyEffects composes a sequence', () => {
    const s = state([p('a')])
    const out = applyEffects(s, [
      { kind: 'status_set', target: 'a', status: PROTECTED },
      { kind: 'mark_for_death', target: 'a', source: 'werewolves' },
    ])
    expect(out.players[0].statuses).toContain(PROTECTED)
    expect(out.players[0].statuses).toContain(MARKED_FOR_DEATH)
  })
})
