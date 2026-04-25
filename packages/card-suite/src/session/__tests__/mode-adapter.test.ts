import { describe, expect, it } from 'vitest'
import { mapSdkModeToUxMode, pickViewVariant } from '../mode-adapter'

describe('pickViewVariant', () => {
  it('service → solo regardless of seat', () => {
    expect(pickViewVariant('service', 'host')).toBe('solo')
    expect(pickViewVariant('service', 'participant')).toBe('solo')
    expect(pickViewVariant('service', 'observer')).toBe('solo')
  })

  it('display → shared-display regardless of seat', () => {
    expect(pickViewVariant('display', 'host')).toBe('shared-display')
    expect(pickViewVariant('display', 'participant')).toBe('shared-display')
    expect(pickViewVariant('display', 'spectator')).toBe('shared-display')
  })

  it('party splits host / participant', () => {
    expect(pickViewVariant('party', 'host')).toBe('shared-display')
    expect(pickViewVariant('party', 'observer')).toBe('shared-display')
    expect(pickViewVariant('party', 'spectator')).toBe('shared-display')
    expect(pickViewVariant('party', 'participant')).toBe('shared-controller')
  })

  it('hybrid splits host / participant', () => {
    expect(pickViewVariant('hybrid', 'host')).toBe('hybrid-public')
    expect(pickViewVariant('hybrid', 'spectator')).toBe('hybrid-public')
    expect(pickViewVariant('hybrid', 'participant')).toBe('hybrid-private')
  })

  it('chat → shared-controller', () => {
    expect(pickViewVariant('chat', 'host')).toBe('shared-controller')
    expect(pickViewVariant('chat', 'participant')).toBe('shared-controller')
  })
})

describe('mapSdkModeToUxMode', () => {
  it('maps shared / shared_readonly → display when supported', () => {
    expect(mapSdkModeToUxMode('shared', ['display', 'party'])).toBe('display')
    expect(mapSdkModeToUxMode('shared_readonly', ['display'])).toBe('display')
  })

  it('maps shared_admin_input → party when supported', () => {
    expect(mapSdkModeToUxMode('shared_admin_input', ['party', 'display'])).toBe('party')
  })

  it('maps per_user → service when supported', () => {
    expect(mapSdkModeToUxMode('per_user', ['service', 'party'])).toBe('service')
  })

  it('maps hybrid → hybrid when supported', () => {
    expect(mapSdkModeToUxMode('hybrid', ['hybrid', 'party'])).toBe('hybrid')
  })

  it('falls back to first supported mode when natural match is not supported', () => {
    // Solitaire example: doesn't support hybrid; fall back to first supported (party).
    expect(mapSdkModeToUxMode('hybrid', ['party', 'display', 'service'])).toBe('party')
    // Speed only supports party.
    expect(mapSdkModeToUxMode('per_user', ['party'])).toBe('party')
  })

  it('throws when game lists no supported modes', () => {
    expect(() => mapSdkModeToUxMode('shared', [])).toThrow()
  })
})
