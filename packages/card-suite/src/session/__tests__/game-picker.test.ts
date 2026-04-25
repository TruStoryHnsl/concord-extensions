import { describe, expect, it } from 'vitest'
import { filterGamesByMode, gameById, gameCompatList, GAMES } from '../game-picker'

describe('Game picker — registry', () => {
  it('exposes exactly 6 games', () => {
    expect(GAMES.length).toBe(6)
  })

  it('every game implements the GameRuleModule contract', () => {
    for (const g of GAMES) {
      expect(typeof g.gameId).toBe('string')
      expect(typeof g.displayName).toBe('string')
      expect(Array.isArray(g.supportedModes)).toBe(true)
      expect(g.minPlayers).toBeGreaterThan(0)
      expect(g.maxPlayers).toBeGreaterThanOrEqual(g.minPlayers)
      expect(typeof g.makeInitial).toBe('function')
      expect(typeof g.legalActions).toBe('function')
      expect(typeof g.applyAction).toBe('function')
      expect(typeof g.terminalStatus).toBe('function')
    }
  })

  it('gameId values are unique', () => {
    const ids = GAMES.map((g) => g.gameId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains the expected gameIds', () => {
    const ids = GAMES.map((g) => g.gameId).sort()
    expect(ids).toEqual([
      'blackjack',
      'holdem',
      'kings-and-peasants',
      'solitaire',
      'speed',
      'war',
    ])
  })
})

describe('Game picker — gameById', () => {
  it('returns the matching game', () => {
    const g = gameById('blackjack')
    expect(g).toBeDefined()
    expect(g!.displayName).toBe('Blackjack')
  })

  it('returns undefined for unknown ids', () => {
    expect(gameById('does-not-exist')).toBeUndefined()
  })
})

describe('Game picker — filterGamesByMode', () => {
  it('filters to party-mode games', () => {
    const games = filterGamesByMode('party')
    // All 6 games support 'party'
    expect(games.length).toBe(6)
  })

  it('filters to display-mode games', () => {
    const games = filterGamesByMode('display')
    // Solitaire, Blackjack, War support display
    const ids = games.map((g) => g.gameId).sort()
    expect(ids).toEqual(['blackjack', 'solitaire', 'war'])
  })

  it('filters to service-mode games', () => {
    const games = filterGamesByMode('service')
    // Solitaire, Blackjack support service
    const ids = games.map((g) => g.gameId).sort()
    expect(ids).toEqual(['blackjack', 'solitaire'])
  })

  it('filters to hybrid-mode games', () => {
    const games = filterGamesByMode('hybrid')
    // Hold'em, Blackjack, Kings & Peasants, War support hybrid
    const ids = games.map((g) => g.gameId).sort()
    expect(ids).toEqual(['blackjack', 'holdem', 'kings-and-peasants', 'war'])
  })
})

describe('Game picker — gameCompatList', () => {
  it('annotates compatibility against a mode', () => {
    const list = gameCompatList('service')
    expect(list.length).toBe(6)
    const incompatible = list.filter((c) => !c.compatible).map((c) => c.game.gameId).sort()
    expect(incompatible).toEqual(['holdem', 'kings-and-peasants', 'speed', 'war'])
  })
})
