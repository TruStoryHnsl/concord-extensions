import { describe, expect, it } from 'vitest'
import {
  ALL_ROLESETS,
  CLASSIC_5,
  CLASSIC_6,
  CLASSIC_7,
  getRoleset,
} from '../setups'

describe('setups — rolesets', () => {
  it('classic-5 ships 1 werewolf, 1 seer, 3 villagers', () => {
    expect(CLASSIC_5.playerCount).toBe(5)
    const counts = countRoles(CLASSIC_5.roles)
    expect(counts.werewolf).toBe(1)
    expect(counts.seer).toBe(1)
    expect(counts.villager).toBe(3)
  })

  it('classic-6 ships 1 werewolf, 1 seer, 1 doctor, 3 villagers', () => {
    expect(CLASSIC_6.playerCount).toBe(6)
    const counts = countRoles(CLASSIC_6.roles)
    expect(counts.werewolf).toBe(1)
    expect(counts.seer).toBe(1)
    expect(counts.doctor).toBe(1)
    expect(counts.villager).toBe(3)
  })

  it('classic-7 ships 2 werewolves, 1 seer, 1 doctor, 1 witch, 2 villagers', () => {
    expect(CLASSIC_7.playerCount).toBe(7)
    const counts = countRoles(CLASSIC_7.roles)
    expect(counts.werewolf).toBe(2)
    expect(counts.seer).toBe(1)
    expect(counts.doctor).toBe(1)
    expect(counts.witch).toBe(1)
    expect(counts.villager).toBe(2)
  })

  it('every roleset has roles.length === playerCount', () => {
    for (const r of ALL_ROLESETS) {
      expect(r.roles.length).toBe(r.playerCount)
    }
  })

  it('night order resolves Werewolf → Doctor → Witch → Seer', () => {
    for (const r of ALL_ROLESETS) {
      const i = (id: string) => r.nightOrder.indexOf(id as never)
      // Werewolf must come first; doctor before witch; witch before seer.
      expect(i('werewolf')).toBeGreaterThanOrEqual(0)
      expect(i('werewolf')).toBeLessThan(i('doctor'))
      expect(i('doctor')).toBeLessThan(i('witch'))
      expect(i('witch')).toBeLessThan(i('seer'))
    }
  })

  it('first-night order excludes werewolf', () => {
    for (const r of ALL_ROLESETS) {
      expect(r.firstNightOrder).not.toContain('werewolf')
    }
  })

  it('getRoleset returns the matching def', () => {
    expect(getRoleset('classic-5')).toBe(CLASSIC_5)
    expect(getRoleset('classic-6')).toBe(CLASSIC_6)
    expect(getRoleset('classic-7')).toBe(CLASSIC_7)
  })
})

function countRoles(roles: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of roles) out[r] = (out[r] ?? 0) + 1
  return out
}
