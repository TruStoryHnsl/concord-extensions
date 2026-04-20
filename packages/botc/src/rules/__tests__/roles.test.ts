import { describe, expect, it } from 'vitest'
import { applyEffect, applyEffects, Effect } from '../effects'
import { mulberry32 } from '../rng'
import {
  imp,
  IMP_ID,
  investigator,
  librarian,
  poisoner,
  washerwoman,
} from '../roles/trouble-brewing'
import { TROUBLE_BREWING_PILOT } from '../scripts'
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

function state(players: PlayerState[]): GameState {
  return {
    script: 'trouble-brewing',
    phase: 'first_night',
    day: 0,
    players,
    nominations: [],
    executionsToday: 0,
    demonBluffs: [],
    winner: null,
  }
}

describe('applyEffect — Effect ADT', () => {
  it('status_set adds status to target', () => {
    const s = state([p('a')])
    const out = applyEffect(s, { kind: 'status_set', target: 'a', status: 'poisoned' })
    expect(out.players[0].statuses).toEqual(['poisoned'])
  })

  it('status_set is idempotent', () => {
    const s = state([p('a', { statuses: ['poisoned'] })])
    const out = applyEffect(s, { kind: 'status_set', target: 'a', status: 'poisoned' })
    expect(out.players[0].statuses).toEqual(['poisoned'])
  })

  it('status_clear removes named status only', () => {
    const s = state([p('a', { statuses: ['poisoned', 'drunk'] })])
    const out = applyEffect(s, { kind: 'status_clear', target: 'a', status: 'poisoned' })
    expect(out.players[0].statuses).toEqual(['drunk'])
  })

  it('kill sets alive to false', () => {
    const s = state([p('a')])
    const out = applyEffect(s, { kind: 'kill', target: 'a', source: 'demon' })
    expect(out.players[0].alive).toBe(false)
  })

  it('whisper / info_grant / role_info do not change state', () => {
    const s = state([p('a')])
    expect(applyEffect(s, { kind: 'whisper', to: 'a', text: 'hello' })).toBe(s)
    expect(applyEffect(s, { kind: 'info_grant', to: 'a', payload: { x: 1 } })).toBe(s)
    expect(applyEffect(s, { kind: 'role_info', to: 'a', roles: ['imp'] })).toBe(s)
  })
})

describe('Washerwoman — firstNight', () => {
  it('produces info_grant with exactly one townsfolk + one bluff', () => {
    const players = [
      p('self', { role: 'washerwoman', team: 'townsfolk' }),
      p('ww2', { role: 'empath', team: 'townsfolk' }), // real townsfolk target
      p('imp1', { role: 'imp', team: 'demon', alignment: 'evil' }),
      p('outsider1', { role: 'saint', team: 'outsider' }),
    ]
    const s = state(players)
    const self = players[0]
    const effects = washerwoman.firstNight(s, self, mulberry32(1))
    const infoGrants = effects.filter((e) => e.kind === 'info_grant') as Extract<Effect, { kind: 'info_grant' }>[]
    expect(infoGrants.length).toBe(1)
    const grant = infoGrants[0]
    expect(grant.to).toBe('self')
    const candidates = grant.payload.candidates as string[]
    expect(candidates.length).toBe(2)
    // Exactly one of the candidates should be the real townsfolk.
    const realTownsfolkIds = players.filter((x) => x.team === 'townsfolk' && x.id !== 'self').map((x) => x.id)
    const overlap = candidates.filter((c) => realTownsfolkIds.includes(c))
    expect(overlap.length).toBe(1)
    expect(typeof grant.payload.role).toBe('string')
  })
})

describe('Librarian — firstNight', () => {
  it('produces zeroOutsiders info_grant when no outsiders in play', () => {
    const players = [
      p('self', { role: 'librarian' }),
      p('t2', { team: 'townsfolk' }),
      p('imp1', { team: 'demon', alignment: 'evil' }),
    ]
    const s = state(players)
    const effects = librarian.firstNight(s, players[0], mulberry32(1))
    expect(effects.length).toBe(1)
    const grant = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    expect(grant.payload.zeroOutsiders).toBe(true)
    expect(grant.payload.candidates).toEqual([])
  })

  it('picks an outsider + bluff when outsiders exist', () => {
    const players = [
      p('self', { role: 'librarian' }),
      p('out1', { role: 'saint', team: 'outsider' }),
      p('t1', { team: 'townsfolk' }),
      p('t2', { team: 'townsfolk' }),
    ]
    const s = state(players)
    const effects = librarian.firstNight(s, players[0], mulberry32(1))
    const grant = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    const candidates = grant.payload.candidates as string[]
    expect(candidates).toContain('out1')
    expect(candidates.length).toBe(2)
    expect(grant.payload.role).toBe('saint')
  })
})

describe('Investigator — firstNight', () => {
  it('picks a minion + bluff', () => {
    const players = [
      p('self', { role: 'investigator' }),
      p('m1', { role: 'poisoner', team: 'minion', alignment: 'evil' }),
      p('t1', { team: 'townsfolk' }),
      p('t2', { team: 'townsfolk' }),
    ]
    const s = state(players)
    const effects = investigator.firstNight(s, players[0], mulberry32(1))
    const grant = effects[0] as Extract<Effect, { kind: 'info_grant' }>
    const candidates = grant.payload.candidates as string[]
    expect(candidates).toContain('m1')
    expect(grant.payload.role).toBe('poisoner')
  })

  it('returns no effects when no minions in play', () => {
    const players = [
      p('self', { role: 'investigator' }),
      p('t1', { team: 'townsfolk' }),
      p('imp1', { team: 'demon', alignment: 'evil' }),
    ]
    const s = state(players)
    expect(investigator.firstNight(s, players[0], mulberry32(1))).toEqual([])
  })
})

describe('Imp — night', () => {
  it('emits a kill effect for the stamped target', () => {
    const players = [
      p('self', { role: 'imp', team: 'demon', alignment: 'evil', statuses: ['target:victim'] }),
      p('victim', { team: 'townsfolk' }),
      p('t2', { team: 'townsfolk' }),
    ]
    const s = state(players)
    const effects = imp.night(s, players[0], mulberry32(1))
    expect(effects).toEqual([{ kind: 'kill', target: 'victim', source: 'demon' }])
  })

  it('auto-picks a non-demon target when no target stamped', () => {
    const players = [
      p('self', { role: 'imp', team: 'demon', alignment: 'evil' }),
      p('victim1', { team: 'townsfolk' }),
      p('victim2', { team: 'townsfolk' }),
    ]
    const s = state(players)
    const effects = imp.night(s, players[0], mulberry32(42))
    expect(effects.length).toBe(1)
    expect(effects[0].kind).toBe('kill')
    if (effects[0].kind === 'kill') {
      expect(['victim1', 'victim2']).toContain(effects[0].target)
    }
  })

  it('Imp does not act on first night', () => {
    const players = [
      p('self', { role: 'imp', team: 'demon', alignment: 'evil', statuses: ['target:victim'] }),
      p('victim', { team: 'townsfolk' }),
    ]
    const s = state(players)
    expect(imp.firstNight(s, players[0], mulberry32(1))).toEqual([])
  })

  it('dead Imp produces no effects', () => {
    const players = [
      p('self', { role: 'imp', team: 'demon', alignment: 'evil', alive: false, statuses: ['target:victim'] }),
      p('victim'),
    ]
    const s = state(players)
    expect(imp.night(s, players[0], mulberry32(1))).toEqual([])
  })
})

describe('Poisoner — night', () => {
  it('stamps poisoned on the target', () => {
    const players = [
      p('self', { role: 'poisoner', team: 'minion', alignment: 'evil', statuses: ['target:victim'] }),
      p('victim', { team: 'townsfolk' }),
      p('t2'),
    ]
    const s = state(players)
    const effects = poisoner.night(s, players[0], mulberry32(1))
    expect(effects.some((e) => e.kind === 'status_set' && e.status === 'poisoned' && e.target === 'victim')).toBe(true)
  })

  it('clears previous poison before stamping new one', () => {
    const players = [
      p('self', { role: 'poisoner', team: 'minion', alignment: 'evil', statuses: ['target:new_victim'] }),
      p('prev_victim', { statuses: ['poisoned'] }),
      p('new_victim'),
    ]
    const s = state(players)
    const effects = poisoner.night(s, players[0], mulberry32(1))
    const applied = applyEffects(s, effects)
    expect(applied.players.find((x) => x.id === 'prev_victim')?.statuses).toEqual([])
    expect(applied.players.find((x) => x.id === 'new_victim')?.statuses).toEqual(['poisoned'])
  })
})

describe('Script composition', () => {
  it('Trouble Brewing pilot exposes the 5 pilot roles', () => {
    expect(Object.keys(TROUBLE_BREWING_PILOT.roles).sort()).toEqual([
      'imp',
      'investigator',
      'librarian',
      'poisoner',
      'washerwoman',
    ])
  })

  it('firstNightOrder excludes Imp and includes Poisoner first', () => {
    expect(TROUBLE_BREWING_PILOT.firstNightOrder).not.toContain(IMP_ID)
    expect(TROUBLE_BREWING_PILOT.firstNightOrder[0]).toBe('poisoner')
  })

  it('nightOrder includes Imp', () => {
    expect(TROUBLE_BREWING_PILOT.nightOrder).toContain(IMP_ID)
  })
})
