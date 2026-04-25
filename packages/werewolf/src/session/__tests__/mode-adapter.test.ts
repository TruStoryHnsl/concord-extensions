import { describe, expect, it } from 'vitest'
import { mapSdkModeToUxMode, pickViewVariant } from '../mode-adapter'

describe('pickViewVariant', () => {
  it('chat → shared-controller regardless of seat', () => {
    expect(pickViewVariant('chat', 'host')).toBe('shared-controller')
    expect(pickViewVariant('chat', 'participant')).toBe('shared-controller')
    expect(pickViewVariant('chat', 'observer')).toBe('shared-controller')
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
})

describe('mapSdkModeToUxMode', () => {
  it('shared / shared_readonly / shared_admin_input → party', () => {
    expect(mapSdkModeToUxMode('shared', ['party'])).toBe('party')
    expect(mapSdkModeToUxMode('shared_readonly', ['party'])).toBe('party')
    expect(mapSdkModeToUxMode('shared_admin_input', ['party'])).toBe('party')
  })

  it('per_user → chat', () => {
    expect(mapSdkModeToUxMode('per_user', ['chat', 'party'])).toBe('chat')
  })

  it('hybrid → hybrid', () => {
    expect(mapSdkModeToUxMode('hybrid', ['hybrid', 'party'])).toBe('hybrid')
  })

  it('falls back to first supported mode when natural is unsupported', () => {
    expect(mapSdkModeToUxMode('hybrid', ['party'])).toBe('party')
    expect(mapSdkModeToUxMode('per_user', ['party', 'hybrid'])).toBe('party')
  })

  it('throws when no supported modes', () => {
    expect(() => mapSdkModeToUxMode('shared', [])).toThrow()
  })
})
