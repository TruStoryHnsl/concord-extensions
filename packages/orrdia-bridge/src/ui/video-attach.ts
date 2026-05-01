/**
 * Video src attachment helper. Spec section 6 (HLS playback path).
 *
 * Two playback paths:
 *   1. Native HLS (Safari / iOS): the browser handles `.m3u8` directly via
 *      `<video src="...">`. We detect this with
 *      MediaSource.isTypeSupported('application/vnd.apple.mpegurl') and
 *      `video.canPlayType('application/vnd.apple.mpegurl')`.
 *   2. MediaSource HLS (Chromium / Firefox / Edge / non-Safari): we
 *      lazy-load `hls.js` (only when the URL is HLS) and attach it to the
 *      <video> element via the standard hls.js MediaSource pipeline.
 *
 * Non-HLS URLs (.mp4, .mkv, .webm — i.e. directStreamUrl) always use a
 * plain `<video src=>` assignment — no hls.js cost.
 *
 * The lazy import keeps hls.js out of the main bundle when nothing has
 * been queued yet. First HLS playback pays the cost; subsequent calls
 * reuse the cached module.
 */

export interface AttachVideoSourceResult {
  /** Detach handler — call before unmounting <video> or swapping src. */
  detach: () => void
  /** "native" if the browser handled HLS (or non-HLS); "hlsjs" if hls.js attached. */
  kind: "native" | "hlsjs"
}

export interface AttachVideoSourceOpts {
  /** Pluggable hls.js loader so tests can inject a fake. */
  hlsLoader?: () => Promise<{ default: HlsCtor } | { Hls: HlsCtor } | HlsCtorModule>
  /** Override URL detection — defaults to .m3u8 suffix in pathname. */
  isHls?: (url: string) => boolean
  /** Override native-HLS detection — defaults to canPlayType check. */
  canNativeHls?: (video: HTMLVideoElement) => boolean
}

/** Minimal subset of hls.js's interface we use. */
export interface HlsInstance {
  loadSource(url: string): void
  attachMedia(video: HTMLVideoElement): void
  destroy(): void
}

export interface HlsCtor {
  new (config?: Record<string, unknown>): HlsInstance
  isSupported(): boolean
}

/** Module shape for hls.js — handles both default-export + named-export styles. */
export interface HlsCtorModule {
  default?: HlsCtor
  Hls?: HlsCtor
}

/** Detect whether a URL points at an HLS playlist. */
export function isHlsUrl(url: string): boolean {
  // Strip query string + hash before suffix check.
  const path = url.split("?")[0].split("#")[0]
  return /\.m3u8$/i.test(path)
}

/** Detect whether the browser plays HLS natively. */
export function canPlayHlsNative(video: HTMLVideoElement): boolean {
  if (typeof video.canPlayType !== "function") return false
  const v = video.canPlayType("application/vnd.apple.mpegurl")
  return v === "probably" || v === "maybe"
}

/**
 * Attach a stream URL to a <video> element. Picks native vs hls.js based
 * on URL + capability detection. Returns a handle whose `detach()` must
 * be called before reusing the video element with a different source.
 */
export async function attachVideoSource(
  video: HTMLVideoElement,
  url: string,
  opts: AttachVideoSourceOpts = {},
): Promise<AttachVideoSourceResult> {
  const isHls = (opts.isHls ?? isHlsUrl)(url)
  const native = (opts.canNativeHls ?? canPlayHlsNative)(video)

  // Non-HLS or native-HLS browser: plain <video src=>.
  if (!isHls || native) {
    video.src = url
    return {
      kind: "native",
      detach: () => {
        try {
          video.removeAttribute("src")
          video.load()
        } catch {
          // jsdom or hostile environments — best-effort.
        }
      },
    }
  }

  // MediaSource path: lazy-load hls.js.
  const loader = opts.hlsLoader ?? defaultHlsLoader
  const mod = await loader()
  const HlsCtor = resolveHlsCtor(mod)
  if (!HlsCtor) {
    // Loader returned something we can't use. Fall back to native — the
    // browser will likely fail to play, but we won't throw.
    video.src = url
    return {
      kind: "native",
      detach: () => {
        try {
          video.removeAttribute("src")
          video.load()
        } catch {
          // best-effort
        }
      },
    }
  }
  if (!HlsCtor.isSupported()) {
    // hls.js says it can't run here. Same fallback as above.
    video.src = url
    return {
      kind: "native",
      detach: () => {
        try {
          video.removeAttribute("src")
          video.load()
        } catch {
          // best-effort
        }
      },
    }
  }

  const hls = new HlsCtor()
  hls.loadSource(url)
  hls.attachMedia(video)
  return {
    kind: "hlsjs",
    detach: () => {
      try {
        hls.destroy()
      } catch {
        // hls.js destroy is best-effort during teardown.
      }
    },
  }
}

function resolveHlsCtor(mod: { default?: HlsCtor } | { Hls?: HlsCtor } | HlsCtorModule): HlsCtor | null {
  const m = mod as HlsCtorModule
  if (m.default) return m.default
  if (m.Hls) return m.Hls
  return null
}

async function defaultHlsLoader(): Promise<HlsCtorModule> {
  // The /* @vite-ignore */ keeps Vite from trying to resolve at build time
  // — hls.js is a real package but the dynamic import keeps it out of the
  // main bundle. Vite will still chunk-split it.
  const mod = await import(/* @vite-ignore */ "hls.js")
  return mod as HlsCtorModule
}
