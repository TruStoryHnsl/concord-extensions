/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShellBridge, INIT_FALLBACK_MS } from '../bridge'
import { CONCORD_SDK_VERSION } from '../sdk-types'

const goodInit = {
  type: 'concord:init',
  version: CONCORD_SDK_VERSION,
  payload: {
    sessionId: 's-1',
    extensionId: 'com.concord.werewolf',
    mode: 'shared' as const,
    participantId: '@alice:matrix',
    seat: 'host' as const,
    surfaces: [{ surface_id: 'main', type: 'panel' as const, anchor: 'center' as const }],
  },
}

function postFromOpaqueOrigin(data: unknown): void {
  window.postMessage(data, '*')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ShellBridge', () => {
  it('resolves getInit() from a real concord:init message', async () => {
    const b = new ShellBridge(window)
    const initPromise = b.getInit(50_000)
    postFromOpaqueOrigin(goodInit)
    const init = await initPromise
    expect(init.sessionId).toBe('s-1')
    expect(init.seat).toBe('host')
    b.destroy()
  })

  it('falls back to a synthesized dev init', async () => {
    vi.useFakeTimers()
    const b = new ShellBridge(window)
    const initPromise = b.getInit(INIT_FALLBACK_MS)
    vi.advanceTimersByTime(INIT_FALLBACK_MS + 5)
    const init = await initPromise
    expect(init.sessionId).toBe('dev')
    expect(init.extensionId).toBe('com.concord.werewolf')
    expect(init.seat).toBe('participant')
    expect(init.mode).toBe('shared_admin_input')
    b.destroy()
  })

  it('caches the resolved init across getInit() calls', async () => {
    const b = new ShellBridge(window)
    const p1 = b.getInit(50_000)
    postFromOpaqueOrigin(goodInit)
    await p1
    const init2 = await b.getInit(50_000)
    expect(init2.sessionId).toBe('s-1')
    b.destroy()
  })

  it('supports multi-handler subscribe / unsubscribe', async () => {
    const b = new ShellBridge(window)
    const a = vi.fn()
    const c = vi.fn()
    const offA = b.onParticipantJoin(a)
    b.onParticipantJoin(c)
    postFromOpaqueOrigin({
      type: 'concord:participant_join',
      version: CONCORD_SDK_VERSION,
      payload: { participantId: '@bob:matrix', seat: 'participant' },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(a).toHaveBeenCalledTimes(1)
    expect(c).toHaveBeenCalledTimes(1)
    offA()
    postFromOpaqueOrigin({
      type: 'concord:participant_join',
      version: CONCORD_SDK_VERSION,
      payload: { participantId: '@carol:matrix', seat: 'participant' },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(a).toHaveBeenCalledTimes(1)
    expect(c).toHaveBeenCalledTimes(2)
    b.destroy()
  })

  it('rejects messages with mismatched protocol version', async () => {
    const b = new ShellBridge(window)
    const handler = vi.fn()
    b.onParticipantJoin(handler)
    postFromOpaqueOrigin({
      type: 'concord:participant_join',
      version: 99,
      payload: { participantId: '@x:y', seat: 'participant' },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).not.toHaveBeenCalled()
    b.destroy()
  })

  it('ignores non-concord messages', async () => {
    const b = new ShellBridge(window)
    const join = vi.fn()
    b.onParticipantJoin(join)
    postFromOpaqueOrigin({ type: 'random:thing', payload: {} })
    postFromOpaqueOrigin('a string')
    postFromOpaqueOrigin(null)
    await new Promise((r) => setTimeout(r, 0))
    expect(join).not.toHaveBeenCalled()
    b.destroy()
  })

  it('destroy is idempotent', async () => {
    const b = new ShellBridge(window)
    b.destroy()
    expect(() => b.destroy()).not.toThrow()
  })
})
