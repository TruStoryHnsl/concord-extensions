import { describe, it, expect, beforeEach } from 'vitest'
import {
  isConcordShellMessage,
  canIncrement,
  canReset,
  displayName,
  applyInit,
  applyParticipantJoin,
  applyParticipantLeave,
  applyHostTransfer,
  makeInitialState,
} from '../index'
import type { WorldviewState } from '../index'

describe('isConcordShellMessage', () => {
  it('accepts a valid concord:init message', () => {
    expect(isConcordShellMessage({ type: 'concord:init', payload: {}, version: 1 })).toBe(true)
  })
  it('rejects a non-concord type prefix', () => {
    expect(isConcordShellMessage({ type: 'other:thing', payload: {}, version: 1 })).toBe(false)
  })
  it('rejects version !== 1', () => {
    expect(isConcordShellMessage({ type: 'concord:init', payload: {}, version: 2 })).toBe(false)
  })
  it('rejects null', () => {
    expect(isConcordShellMessage(null)).toBe(false)
  })
  it('rejects missing type field', () => {
    expect(isConcordShellMessage({ payload: {}, version: 1 })).toBe(false)
  })
})

describe('displayName', () => {
  it('strips @ and server part from a full Matrix user ID', () => {
    expect(displayName('@alice:concord.app')).toBe('alice')
  })
  it('strips @ from a local-only ID', () => {
    expect(displayName('@bob')).toBe('bob')
  })
})

describe('canIncrement', () => {
  let base: WorldviewState
  beforeEach(() => { base = makeInitialState() })

  it('returns true for a participant in shared mode', () => {
    expect(canIncrement({ ...base, mySeat: 'participant', mode: 'shared' })).toBe(true)
  })
  it('returns false for an observer', () => {
    expect(canIncrement({ ...base, mySeat: 'observer', mode: 'shared' })).toBe(false)
  })
  it('returns false for a spectator', () => {
    expect(canIncrement({ ...base, mySeat: 'spectator', mode: 'shared' })).toBe(false)
  })
  it('returns false in shared_readonly mode even for host', () => {
    expect(canIncrement({ ...base, mySeat: 'host', mode: 'shared_readonly' })).toBe(false)
  })
  it('returns false for non-host in shared_admin_input mode', () => {
    expect(canIncrement({ ...base, mySeat: 'participant', mode: 'shared_admin_input' })).toBe(false)
  })
  it('returns true for host in shared_admin_input mode', () => {
    expect(canIncrement({ ...base, mySeat: 'host', mode: 'shared_admin_input' })).toBe(true)
  })
})

describe('canReset', () => {
  let base: WorldviewState
  beforeEach(() => { base = makeInitialState() })

  it('returns true for the host', () => {
    expect(canReset({ ...base, mySeat: 'host' })).toBe(true)
  })
  it('returns false for a participant', () => {
    expect(canReset({ ...base, mySeat: 'participant' })).toBe(false)
  })
  it('returns false for an observer', () => {
    expect(canReset({ ...base, mySeat: 'observer' })).toBe(false)
  })
})

describe('applyInit', () => {
  it('sets sessionId, mode, participantId, seat, and records participant', () => {
    const result = applyInit(makeInitialState(), {
      sessionId: 's1', extensionId: 'ext1', mode: 'shared',
      participantId: '@alice:concord.app', seat: 'host', surfaces: [],
    })
    expect(result.sessionId).toBe('s1')
    expect(result.mode).toBe('shared')
    expect(result.myParticipantId).toBe('@alice:concord.app')
    expect(result.mySeat).toBe('host')
    expect(result.participants.get('@alice:concord.app')).toBe('host')
  })
  it('does not mutate the previous state', () => {
    const base = makeInitialState()
    applyInit(base, {
      sessionId: 's1', extensionId: 'ext1', mode: 'shared',
      participantId: '@alice:concord.app', seat: 'host', surfaces: [],
    })
    expect(base.sessionId).toBeNull()
  })
})

describe('applyParticipantJoin', () => {
  it('adds a participant to the map', () => {
    const result = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'participant' })
    expect(result.participants.get('@bob:concord.app')).toBe('participant')
  })
  it('sets the host field when the joining seat is host', () => {
    const result = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'host' })
    expect(result.host).toBe('@bob:concord.app')
  })
  it('does not mutate the previous state', () => {
    const base = makeInitialState()
    applyParticipantJoin(base, { participantId: '@bob:concord.app', seat: 'participant' })
    expect(base.participants.size).toBe(0)
  })
})

describe('applyParticipantLeave', () => {
  it('removes the participant from the map', () => {
    const withBob = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'participant' })
    const result = applyParticipantLeave(withBob, { participantId: '@bob:concord.app' })
    expect(result.participants.has('@bob:concord.app')).toBe(false)
  })
  it('clears the host field when the current host leaves', () => {
    const base = { ...makeInitialState(), host: '@bob:concord.app' }
    const result = applyParticipantLeave(base, { participantId: '@bob:concord.app' })
    expect(result.host).toBeNull()
  })
  it('does not clear the host field when a non-host leaves', () => {
    const base = { ...makeInitialState(), host: '@alice:concord.app' }
    const result = applyParticipantLeave(base, { participantId: '@bob:concord.app' })
    expect(result.host).toBe('@alice:concord.app')
  })
})

describe('applyHostTransfer', () => {
  it('updates the host field and swaps seat values', () => {
    const base: WorldviewState = {
      ...makeInitialState(),
      host: '@alice:concord.app',
      participants: new Map([['@alice:concord.app', 'host'], ['@bob:concord.app', 'participant']]),
    }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.host).toBe('@bob:concord.app')
    expect(result.participants.get('@bob:concord.app')).toBe('host')
    expect(result.participants.get('@alice:concord.app')).toBe('participant')
  })
  it('promotes mySeat to host when I am the new host', () => {
    const base: WorldviewState = { ...makeInitialState(), myParticipantId: '@bob:concord.app', mySeat: 'participant' }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.mySeat).toBe('host')
  })
  it('demotes mySeat to participant when I was the previous host', () => {
    const base: WorldviewState = { ...makeInitialState(), myParticipantId: '@alice:concord.app', mySeat: 'host' }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.mySeat).toBe('participant')
  })
})
