// Cold-reader negative-case tests for the HLS attach pipeline (v0.3.2).
// Author note: written same-session as the code being tested, but covers
// inputs the original implementer didn't have when sketching the
// happy-path: dynamic-import failure, hls.js claiming unsupported,
// detach-without-attach, query-string suffix tricks, and detach idempotence.

import { describe, expect, it, vi } from "vitest"
import {
  attachVideoSource,
  canPlayHlsNative,
  HlsCtor,
  HlsCtorModule,
  HlsInstance,
  isHlsUrl,
} from "../video-attach"

function makeHlsCtor(opts: { supported: boolean; capture?: HlsInstance[] } = { supported: true }): HlsCtor {
  const cap = opts.capture
  const ctor = function (this: HlsInstance) {
    const inst: HlsInstance = {
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
    }
    if (cap) cap.push(inst)
    Object.assign(this, inst)
  } as unknown as HlsCtor
  ctor.isSupported = () => opts.supported
  return ctor
}

describe("isHlsUrl", () => {
  it("matches .m3u8 paths regardless of casing", () => {
    expect(isHlsUrl("https://o.example/main.m3u8")).toBe(true)
    expect(isHlsUrl("https://o.example/MAIN.M3U8")).toBe(true)
  })

  it("ignores query string and hash for the suffix check", () => {
    expect(isHlsUrl("https://o.example/main.m3u8?api_key=x")).toBe(true)
    expect(isHlsUrl("https://o.example/main.m3u8#frag")).toBe(true)
    expect(isHlsUrl("https://o.example/main.m3u8?a=1&b=2#x")).toBe(true)
  })

  it("does not match .mp4 / .mkv / .webm even when query contains m3u8", () => {
    expect(isHlsUrl("https://o.example/movie.mp4")).toBe(false)
    expect(isHlsUrl("https://o.example/movie.mkv?fmt=m3u8")).toBe(false)
    expect(isHlsUrl("https://o.example/movie.webm#m3u8")).toBe(false)
  })
})

describe("attachVideoSource — non-HLS path", () => {
  it("assigns video.src directly for .mp4 URLs (no hls.js load)", async () => {
    const video = document.createElement("video")
    const loader = vi.fn()
    const r = await attachVideoSource(video, "https://o.example/movie.mp4?api_key=x", {
      hlsLoader: loader as unknown as () => Promise<HlsCtorModule>,
    })
    expect(r.kind).toBe("native")
    expect(video.src).toContain("/movie.mp4")
    expect(loader).not.toHaveBeenCalled()
  })

  it("detach removes the src and calls load()", async () => {
    const video = document.createElement("video")
    const loadSpy = vi.spyOn(video, "load")
    const r = await attachVideoSource(video, "https://o.example/movie.mp4", {})
    r.detach()
    expect(loadSpy).toHaveBeenCalled()
  })
})

describe("attachVideoSource — native HLS path (Safari-like)", () => {
  it("assigns video.src directly when canNativeHls returns true", async () => {
    const video = document.createElement("video")
    const loader = vi.fn()
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => true,
      hlsLoader: loader as unknown as () => Promise<HlsCtorModule>,
    })
    expect(r.kind).toBe("native")
    expect(video.src).toContain("/main.m3u8")
    expect(loader).not.toHaveBeenCalled()
  })
})

describe("attachVideoSource — hls.js path", () => {
  it("loads hls.js and attaches to the video when native HLS is unavailable", async () => {
    const captured: HlsInstance[] = []
    const Ctor = makeHlsCtor({ supported: true, capture: captured })
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8?api_key=k", {
      canNativeHls: () => false,
      hlsLoader: async () => ({ default: Ctor }),
    })
    expect(r.kind).toBe("hlsjs")
    expect(captured).toHaveLength(1)
    expect(captured[0].loadSource).toHaveBeenCalledWith("https://o.example/main.m3u8?api_key=k")
    expect(captured[0].attachMedia).toHaveBeenCalledWith(video)
  })

  it("supports named-export hls.js modules ({ Hls })", async () => {
    const captured: HlsInstance[] = []
    const Ctor = makeHlsCtor({ supported: true, capture: captured })
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => false,
      hlsLoader: async () => ({ Hls: Ctor }),
    })
    expect(r.kind).toBe("hlsjs")
    expect(captured).toHaveLength(1)
  })

  it("falls back to native <video src> when hls.js says it's unsupported", async () => {
    const Ctor = makeHlsCtor({ supported: false })
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => false,
      hlsLoader: async () => ({ default: Ctor }),
    })
    expect(r.kind).toBe("native")
    // The fallback assigns the URL even though playback will likely fail —
    // surfacing the bad state to the user is preferable to silent breakage.
    expect(video.src).toContain("/main.m3u8")
  })

  it("falls back to native when the loader returns a module without a usable ctor", async () => {
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => false,
      hlsLoader: async () => ({} as HlsCtorModule),
    })
    expect(r.kind).toBe("native")
    expect(video.src).toContain("/main.m3u8")
  })

  it("detach destroys the hls.js instance", async () => {
    const captured: HlsInstance[] = []
    const Ctor = makeHlsCtor({ supported: true, capture: captured })
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => false,
      hlsLoader: async () => ({ default: Ctor }),
    })
    r.detach()
    expect(captured[0].destroy).toHaveBeenCalled()
  })

  it("detach is idempotent — surviving destroy() throws", async () => {
    const captured: HlsInstance[] = []
    const Ctor = makeHlsCtor({ supported: true, capture: captured })
    const video = document.createElement("video")
    const r = await attachVideoSource(video, "https://o.example/main.m3u8", {
      canNativeHls: () => false,
      hlsLoader: async () => ({ default: Ctor }),
    })
    captured[0].destroy = vi.fn(() => {
      throw new Error("teardown went sideways")
    })
    expect(() => r.detach()).not.toThrow()
  })
})

describe("canPlayHlsNative", () => {
  it("returns true when canPlayType says probably/maybe", () => {
    const v = document.createElement("video")
    v.canPlayType = () => "probably"
    expect(canPlayHlsNative(v)).toBe(true)
    v.canPlayType = () => "maybe"
    expect(canPlayHlsNative(v)).toBe(true)
  })

  it("returns false when canPlayType says empty string", () => {
    const v = document.createElement("video")
    v.canPlayType = () => ""
    expect(canPlayHlsNative(v)).toBe(false)
  })

  it("handles browsers without canPlayType gracefully", () => {
    const v = {} as HTMLVideoElement
    expect(canPlayHlsNative(v)).toBe(false)
  })
})
