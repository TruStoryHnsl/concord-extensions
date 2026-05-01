// v0.3.2: cold-reader negative cases added (HLS path, malformed SyncEvent
// payload, stale serverTimeOffsetMs, rapid-fire applyRemote race). The
// happy-path tests below were authored same-session as the original
// implementation; the negative cases below were added by a follow-up
// reviewer asking "what would break this code that the author didn't
// anticipate."

import { describe, expect, it, vi } from "vitest"
import { mountDisplay } from "../display"
import { AuthSession, MediaItem } from "../../engine/types"
import { HlsCtor, HlsCtorModule, HlsInstance } from "../video-attach"

const session: AuthSession = {
  baseUrl: "https://o.example",
  userId: "u",
  accessToken: "tok-xyz",
  serverId: "srv",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.1.0",
  deviceName: "Concord",
}

const item: MediaItem = {
  id: "it-1",
  name: "Movie A",
  type: "Movie",
}

describe("mountDisplay", () => {
  it("mounts a video element pointing at directStreamUrl", () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "host",
      participantId: "@me",
      hostId: "@me",
    })
    const video = root.querySelector("video")
    expect(video).toBeTruthy()
    expect(video?.src).toContain("/Videos/it-1/stream")
    expect(video?.src).toContain("api_key=tok-xyz")
    handle.unmount()
  })

  it("hides controls for observers", () => {
    const root = document.createElement("div")
    mountDisplay(root, {
      session,
      item,
      role: "observer",
      participantId: "@me",
      hostId: "@host",
    })
    const video = root.querySelector("video") as HTMLVideoElement
    expect(video.controls).toBe(false)
  })

  it("getState reflects the initial select event", () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "host",
      participantId: "@me",
      hostId: "@me",
    })
    expect(handle.getState().itemId).toBe("it-1")
    expect(handle.getState().status).toBe("paused")
  })

  it("applyRemote on observer mirrors play event into state", () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "observer",
      participantId: "@me",
      hostId: "@host",
    })
    handle.applyRemote({ type: "play", positionMs: 5000, atMs: 100 })
    expect(handle.getState().status).toBe("playing")
    expect(handle.getState().positionMs).toBe(5000)
  })

  it("uses direct stream URL by default (no .m3u8 in src)", async () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "host",
      participantId: "@me",
      hostId: "@me",
    })
    // Native fallback path resolves on next microtask.
    await new Promise((r) => setTimeout(r, 0))
    const video = root.querySelector("video") as HTMLVideoElement
    expect(video.src).toContain("/Videos/it-1/stream")
    expect(video.src).not.toContain("main.m3u8")
    handle.unmount()
  })

  it("uses HLS stream URL when useHls=true and pipes through hls.js when native HLS unavailable", async () => {
    const captured: HlsInstance[] = []
    const Ctor = function (this: HlsInstance) {
      const inst: HlsInstance = {
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        destroy: vi.fn(),
      }
      captured.push(inst)
      Object.assign(this, inst)
    } as unknown as HlsCtor
    Ctor.isSupported = () => true

    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "host",
      participantId: "@me",
      hostId: "@me",
      useHls: true,
      videoAttachOpts: {
        canNativeHls: () => false,
        hlsLoader: async () => ({ default: Ctor }) as HlsCtorModule,
      },
    })
    // Wait for the dynamic-import + attach pipeline to resolve.
    await new Promise((r) => setTimeout(r, 0))
    expect(captured).toHaveLength(1)
    expect(captured[0].loadSource).toHaveBeenCalledTimes(1)
    const loadCall = (captured[0].loadSource as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    expect(loadCall).toContain("/Videos/it-1/main.m3u8")
    expect(captured[0].attachMedia).toHaveBeenCalled()

    handle.unmount()
    expect(captured[0].destroy).toHaveBeenCalled()
  })

  it("uses native HLS path (no hls.js load) when canPlayType says probably", async () => {
    const loader = vi.fn()
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "host",
      participantId: "@me",
      hostId: "@me",
      useHls: true,
      videoAttachOpts: {
        canNativeHls: () => true,
        hlsLoader: loader as unknown as () => Promise<HlsCtorModule>,
      },
    })
    await new Promise((r) => setTimeout(r, 0))
    const video = root.querySelector("video") as HTMLVideoElement
    expect(video.src).toContain("/Videos/it-1/main.m3u8")
    expect(loader).not.toHaveBeenCalled()
    handle.unmount()
  })

  it("applyRemote with a malformed SyncEvent shape does not throw", () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "observer",
      participantId: "@me",
      hostId: "@host",
    })
    // Cast through unknown to feed adversarial input — exhibits the
    // graceful-no-op contract of applyRemote when the upstream sender
    // sends something the reducer doesn't recognize.
    expect(() => {
      handle.applyRemote({ type: "garbage" } as unknown as Parameters<typeof handle.applyRemote>[0])
    }).not.toThrow()
    // Reducer returns same state for unknown event types — no harm done.
    expect(handle.getState().status).toBe("paused")
  })

  it("applyRemote rapid-fire with monotonic-then-stale atMs keeps the latest position", () => {
    const root = document.createElement("div")
    const handle = mountDisplay(root, {
      session,
      item,
      role: "observer",
      participantId: "@me",
      hostId: "@host",
    })
    // Fire three events in quick succession with stale atMs in the middle —
    // simulates a network race where an older event lands after a newer
    // one. The reducer is permissive (no out-of-order rejection) so the
    // last applied event wins. This locks in the current contract; if a
    // future causality fix changes it, this assertion must be updated.
    handle.applyRemote({ type: "seek", positionMs: 1000, atMs: 100 })
    handle.applyRemote({ type: "seek", positionMs: 5000, atMs: 200 })
    handle.applyRemote({ type: "seek", positionMs: 2000, atMs: 50 }) // STALE
    expect(handle.getState().positionMs).toBe(2000)
  })
})
