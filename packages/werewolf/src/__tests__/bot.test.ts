import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/rng'
import { pickAction, maybeScheduleBotTurn } from '../bot'
import { GameState, PlayerState } from '../engine/types'
import { MARKED_FOR_DEATH, WITCH_HEAL_USED, WITCH_KILL_USED } from '../engine/effects'

function p(
  id: string,
  role: PlayerState['role'],
  team: PlayerState['team'],
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    id,
    seat: 0,
    role,
    team,
    alive: true,
    statuses: [],
    ...overrides,
  }
}

function state(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    roleset: 'classic-5',
    phase: 'night',
    day: 1,
    players,
    nominations: [],
    lynchesToday: 0,
    winner: null,
    ...overrides,
  }
}

describe('bot.pickAction — villager (day)', () => {
  it('votes against the loudest seer-claim accusation', () => {
    const s = state(
      [
        p('@bot1:x', 'villager', 'village', { statuses: ['seer_claim:w'] }),
        p('w', 'werewolf', 'werewolves'),
        p('@bot2:x', 'villager', 'village'),
      ],
      {
        phase: 'day',
        nominations: [
          {
            nominator: '@bot1:x',
            nominee: 'w',
            votes: [],
            resolved: false,
            resolution: null,
          },
        ],
      },
    )
    const a = pickAction(s, '@bot2:x', mulberry32(1))
    expect(a.kind).toBe('vote')
    if (a.kind === 'vote') {
      expect(a.target).toBe('w')
      expect(a.yes).toBe(true)
    }
  })

  it('never votes to lynch self', () => {
    const s = state(
      [p('@bot1:x', 'villager', 'village'), p('@bot2:x', 'villager', 'village')],
      {
        phase: 'day',
        nominations: [
          {
            nominator: '@bot2:x',
            nominee: '@bot1:x',
            votes: [],
            resolved: false,
            resolution: null,
          },
        ],
      },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('vote')
    if (a.kind === 'vote') {
      expect(a.yes).toBe(false)
    }
  })

  it('proposes a nomination when no open one', () => {
    const s = state(
      [p('@bot1:x', 'villager', 'village'), p('w', 'werewolf', 'werewolves')],
      { phase: 'day' },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('nominate')
  })
})

describe('bot.pickAction — werewolf (night)', () => {
  it('targets lowest-id alive non-werewolf', () => {
    const s = state([
      p('@bot1:x', 'werewolf', 'werewolves'),
      p('aaa', 'villager', 'village'),
      p('zzz', 'villager', 'village'),
    ])
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('wolf-kill')
    if (a.kind === 'wolf-kill') {
      expect(a.target).toBe('aaa')
    }
  })

  it('two werewolves converge on the same target', () => {
    const s = state([
      p('@bot1:x', 'werewolf', 'werewolves'),
      p('@bot2:x', 'werewolf', 'werewolves'),
      p('aaa', 'villager', 'village'),
      p('bbb', 'villager', 'village'),
    ])
    const a1 = pickAction(s, '@bot1:x', mulberry32(1))
    const a2 = pickAction(s, '@bot2:x', mulberry32(99))
    expect(a1.kind).toBe('wolf-kill')
    expect(a2.kind).toBe('wolf-kill')
    if (a1.kind === 'wolf-kill' && a2.kind === 'wolf-kill') {
      expect(a1.target).toBe(a2.target)
    }
  })

  it('does not act on first night', () => {
    const s = state(
      [p('@bot1:x', 'werewolf', 'werewolves'), p('v', 'villager', 'village')],
      { phase: 'first_night', day: 0 },
    )
    expect(pickAction(s, '@bot1:x', mulberry32(1)).kind).toBe('noop')
  })

  it('no living non-werewolf → noop', () => {
    const s = state([
      p('@bot1:x', 'werewolf', 'werewolves'),
      p('@bot2:x', 'werewolf', 'werewolves'),
    ])
    expect(pickAction(s, '@bot1:x', mulberry32(1)).kind).toBe('noop')
  })
})

describe('bot.pickAction — seer (night)', () => {
  it('peeks at a non-self alive player', () => {
    const s = state([
      p('@bot1:x', 'seer', 'village'),
      p('a', 'villager', 'village'),
      p('b', 'villager', 'village'),
    ])
    const a = pickAction(s, '@bot1:x', mulberry32(2))
    expect(a.kind).toBe('seer-peek')
    if (a.kind === 'seer-peek') {
      expect(a.target).not.toBe('@bot1:x')
    }
  })

  it('is deterministic with the same seed and state', () => {
    const s = state([
      p('@bot1:x', 'seer', 'village'),
      p('a', 'villager', 'village'),
      p('b', 'villager', 'village'),
    ])
    const a1 = pickAction(s, '@bot1:x', mulberry32(7))
    const a2 = pickAction(s, '@bot1:x', mulberry32(7))
    expect(a1).toEqual(a2)
  })
})

describe('bot.pickAction — doctor (night)', () => {
  it('protects a non-self', () => {
    const s = state([
      p('@bot1:x', 'doctor', 'village'),
      p('a', 'villager', 'village'),
    ])
    const a = pickAction(s, '@bot1:x', mulberry32(2))
    expect(a.kind).toBe('doctor-protect')
    if (a.kind === 'doctor-protect') {
      expect(a.target).not.toBe('@bot1:x')
    }
  })

  it('avoids same target as last night', () => {
    const s = state([
      p('@bot1:x', 'doctor', 'village', { statuses: ['doctor_last:a'] }),
      p('a', 'villager', 'village'),
      p('b', 'villager', 'village'),
    ])
    // Run several seeds; never pick 'a'.
    for (let seed = 1; seed < 20; seed++) {
      const a = pickAction(s, '@bot1:x', mulberry32(seed))
      if (a.kind === 'doctor-protect') {
        expect(a.target).not.toBe('a')
      }
    }
  })

  it('falls back when only the last-target is available', () => {
    const s = state([
      p('@bot1:x', 'doctor', 'village', { statuses: ['doctor_last:a'] }),
      p('a', 'villager', 'village'),
    ])
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('doctor-protect')
  })

  it('is deterministic', () => {
    const s = state([
      p('@bot1:x', 'doctor', 'village'),
      p('a', 'villager', 'village'),
      p('b', 'villager', 'village'),
    ])
    const a1 = pickAction(s, '@bot1:x', mulberry32(3))
    const a2 = pickAction(s, '@bot1:x', mulberry32(3))
    expect(a1).toEqual(a2)
  })
})

describe('bot.pickAction — witch (night)', () => {
  it('holds both potions on day 1 with full table', () => {
    const s = state(
      [
        p('@bot1:x', 'witch', 'village'),
        p('a', 'villager', 'village'),
        p('b', 'villager', 'village'),
        p('c', 'villager', 'village'),
        p('w', 'werewolf', 'werewolves'),
      ],
      { day: 1 },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('witch-act')
    if (a.kind === 'witch-act') {
      expect(a.heal).toBeNull()
      expect(a.kill).toBeNull()
    }
  })

  it('heals a marked village player when ready', () => {
    const s = state(
      [
        p('@bot1:x', 'witch', 'village'),
        p('a', 'villager', 'village', { statuses: [MARKED_FOR_DEATH] }),
        p('w', 'werewolf', 'werewolves'),
      ],
      { day: 3 },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('witch-act')
    if (a.kind === 'witch-act') {
      expect(a.heal).toBe('a')
    }
  })

  it('kills a public seer-accused werewolf', () => {
    const s = state(
      [
        p('@bot1:x', 'witch', 'village', { statuses: ['seer_claim:w'] }),
        p('w', 'werewolf', 'werewolves'),
      ],
      { day: 3 },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('witch-act')
    if (a.kind === 'witch-act') {
      expect(a.kill).toBe('w')
    }
  })

  it('does not use already-spent potions', () => {
    const s = state(
      [
        p('@bot1:x', 'witch', 'village', {
          statuses: [WITCH_HEAL_USED, WITCH_KILL_USED, 'seer_claim:w'],
        }),
        p('a', 'villager', 'village', { statuses: [MARKED_FOR_DEATH] }),
        p('w', 'werewolf', 'werewolves'),
      ],
      { day: 5 },
    )
    const a = pickAction(s, '@bot1:x', mulberry32(1))
    expect(a.kind).toBe('witch-act')
    if (a.kind === 'witch-act') {
      expect(a.heal).toBeNull()
      expect(a.kill).toBeNull()
    }
  })
})

describe('bot.pickAction — meta', () => {
  it('throws on unknown player', () => {
    const s = state([p('a', 'villager', 'village')])
    expect(() => pickAction(s, 'no-such', mulberry32(1))).toThrow()
  })

  it('returns noop for dead player', () => {
    const s = state([p('a', 'villager', 'village', { alive: false })])
    expect(pickAction(s, 'a', mulberry32(1)).kind).toBe('noop')
  })

  it('full determinism: same state + same seed → same result', () => {
    const s = state([
      p('@bot1:x', 'werewolf', 'werewolves'),
      p('a', 'villager', 'village'),
      p('b', 'villager', 'village'),
    ])
    const a1 = pickAction(s, '@bot1:x', mulberry32(101))
    const a2 = pickAction(s, '@bot1:x', mulberry32(101))
    expect(a1).toEqual(a2)
  })
})

describe('maybeScheduleBotTurn', () => {
  it('schedules the first non-noop bot', () => {
    const s = state([
      p('@bot1:x', 'werewolf', 'werewolves'),
      p('a', 'villager', 'village'),
    ])
    const calls: number[] = []
    let scheduledFn: (() => void) | null = null
    const setTimer = (fn: () => void, _ms: number) => {
      scheduledFn = fn
      return () => {
        calls.push(0)
      }
    }
    maybeScheduleBotTurn({
      state: s,
      isBot: (id) => id.startsWith('@bot'),
      rng: mulberry32(1),
      apply: () => calls.push(1),
      delayMs: 600,
      setTimer,
    })
    expect(scheduledFn).toBeTruthy()
    if (scheduledFn) (scheduledFn as () => void)()
    expect(calls).toContain(1)
  })

  it('skips bots whose action is noop', () => {
    const s = state(
      [
        p('@bot1:x', 'werewolf', 'werewolves'),
        p('a', 'villager', 'village'),
      ],
      { phase: 'first_night', day: 0 }, // werewolf is noop on first night
    )
    let scheduledFn: (() => void) | null = null
    const setTimer = (fn: () => void) => {
      scheduledFn = fn
      return () => {}
    }
    maybeScheduleBotTurn({
      state: s,
      isBot: (id) => id.startsWith('@bot'),
      rng: mulberry32(1),
      apply: () => {},
      delayMs: 600,
      setTimer,
    })
    // First-night werewolf is noop; no bot scheduled.
    expect(scheduledFn).toBeNull()
  })
})
