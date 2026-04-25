/**
 * End-to-end engine integration tests. Runs scripted Werewolf games
 * through the phase machine + role night actions + dawn resolution +
 * vote tally, and asserts the win condition triggers within a bounded
 * number of turns.
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/rng'
import { advanceCanonical } from '../engine/phases'
import { applyDeath, checkWinCondition } from '../engine/deaths'
import { applyEffects } from '../engine/effects'
import { resolveDawn } from '../engine/dawn'
import { ALL_ROLES } from '../roles'
import { GameState, PlayerState } from '../engine/types'

function p(id: string, role: PlayerState['role'], team: PlayerState['team'], statuses: string[] = []): PlayerState {
  return {
    id,
    seat: 0,
    role,
    team,
    alive: true,
    statuses,
  }
}

function makeGame(players: PlayerState[]): GameState {
  return {
    roleset: 'classic-5',
    phase: 'setup',
    day: 0,
    players: players.map((pl, idx) => ({ ...pl, seat: idx })),
    nominations: [],
    lynchesToday: 0,
    winner: null,
  }
}

/**
 * Process a night: run each role's night action in a defined order,
 * commit all emitted effects, then resolve dawn.
 */
function runNight(state: GameState, rng: ReturnType<typeof mulberry32>): GameState {
  let s = state
  // Role-action order: werewolves → doctor → witch → seer.
  const order: PlayerState['role'][] = ['werewolf', 'doctor', 'witch', 'seer']
  for (const roleId of order) {
    for (const player of s.players) {
      if (player.role !== roleId || !player.alive) continue
      const def = ALL_ROLES[roleId]
      const effects =
        s.phase === 'first_night' ? def.firstNight(s, player, rng) : def.night(s, player, rng)
      s = applyEffects(s, effects)
    }
  }
  const dawn = resolveDawn(s)
  return dawn.state
}

describe('full 5-player game — village wins via lynch', () => {
  it('village wins when the lone werewolf is lynched on day 1', () => {
    let s = makeGame([
      p('w', 'werewolf', 'werewolves'),
      p('seer', 'seer', 'village'),
      p('v1', 'villager', 'village'),
      p('v2', 'villager', 'village'),
      p('v3', 'villager', 'village'),
    ])
    s = advanceCanonical(s) // setup → first_night
    const rng = mulberry32(1)
    s = runNight(s, rng)
    s = advanceCanonical(s) // first_night → day(1)

    // Day 1: the seer learned `w` is werewolves; lynch them.
    s = applyDeath(s, 'w', { source: 'lynch', dayNumber: s.day })
    expect(checkWinCondition(s)).toBe('village')
  })
})

describe('full 5-player game — werewolves win when ratio flips', () => {
  it('werewolves win when villager pool drops to 1 against the lone wolf', () => {
    let s = makeGame([
      p('w', 'werewolf', 'werewolves'),
      p('seer', 'seer', 'village'),
      p('v1', 'villager', 'village'),
      p('v2', 'villager', 'village'),
      p('v3', 'villager', 'village'),
    ])
    s = advanceCanonical(s)
    const rng = mulberry32(2)
    // Fast-forward by killing villagers one per night until 1 remains.
    s = applyDeath(s, 'v1', { source: 'werewolves', dayNumber: 1 })
    s = applyDeath(s, 'v2', { source: 'werewolves', dayNumber: 2 })
    s = applyDeath(s, 'v3', { source: 'werewolves', dayNumber: 3 })
    expect(checkWinCondition(s)).toBe('werewolves')
    void rng
  })
})

describe('runs to completion in finite turns', () => {
  it('headless 5p game terminates within bounded steps', () => {
    let s = makeGame([
      p('w', 'werewolf', 'werewolves', ['target:v3']),
      p('seer', 'seer', 'village'),
      p('v1', 'villager', 'village'),
      p('v2', 'villager', 'village'),
      p('v3', 'villager', 'village'),
    ])
    const rng = mulberry32(11)
    s = advanceCanonical(s)
    let safety = 0
    while (s.phase !== 'over' && safety < 50) {
      if (s.phase === 'first_night' || s.phase === 'night') {
        s = runNight(s, rng)
      }
      s = advanceCanonical(s)
      // On day, simulate a coordinated lynch of the werewolf if alive.
      if (s.phase === 'day') {
        const w = s.players.find((p) => p.role === 'werewolf' && p.alive)
        if (w) {
          s = applyDeath(s, w.id, { source: 'lynch', dayNumber: s.day })
        }
      }
      safety++
    }
    expect(s.phase).toBe('over')
    expect(s.winner).not.toBeNull()
    expect(safety).toBeLessThan(50)
  })
})
