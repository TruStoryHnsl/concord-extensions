/**
 * Pure URL builders for media streaming.
 *
 *   directStreamUrl(session, itemId)       — /Videos/{id}/stream?...
 *   hlsStreamUrl(session, itemId, opts?)   — /Videos/{id}/main.m3u8?...
 *
 * Spec section 6. Both embed `api_key=` in the query because <video src=>
 * GETs can't carry custom auth headers.
 */

import { AuthSession } from "./types"

export interface DirectStreamOpts {
  mediaSourceId?: string
  static?: boolean
}

export interface HlsStreamOpts {
  mediaSourceId?: string
  videoCodec?: string
  audioCodec?: string
  playSessionId?: string
  transcodingMaxAudioChannels?: number
}

const DEFAULT_VIDEO_CODEC = "h264"
const DEFAULT_AUDIO_CODEC = "aac,mp3"
const DEFAULT_TRANSCODING_MAX_AUDIO_CHANNELS = 2

function newPlaySessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `ps-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Direct (Static=true) stream URL — file pass-through. */
export function directStreamUrl(
  session: AuthSession,
  itemId: string,
  opts: DirectStreamOpts = {},
): string {
  const params = new URLSearchParams()
  params.set("Static", String(opts.static ?? true))
  if (opts.mediaSourceId) params.set("MediaSourceId", opts.mediaSourceId)
  params.set("api_key", session.accessToken)
  return (
    `${session.baseUrl}/Videos/${encodeURIComponent(itemId)}/stream?` +
    params.toString()
  )
}

/** HLS-transcoded stream URL — `/main.m3u8`. */
export function hlsStreamUrl(
  session: AuthSession,
  itemId: string,
  opts: HlsStreamOpts = {},
): string {
  const params = new URLSearchParams()
  if (opts.mediaSourceId) params.set("MediaSourceId", opts.mediaSourceId)
  params.set("deviceId", session.deviceId)
  params.set("api_key", session.accessToken)
  params.set("PlaySessionId", opts.playSessionId ?? newPlaySessionId())
  params.set("VideoCodec", opts.videoCodec ?? DEFAULT_VIDEO_CODEC)
  params.set("AudioCodec", opts.audioCodec ?? DEFAULT_AUDIO_CODEC)
  params.set(
    "TranscodingMaxAudioChannels",
    String(opts.transcodingMaxAudioChannels ?? DEFAULT_TRANSCODING_MAX_AUDIO_CHANNELS),
  )
  return (
    `${session.baseUrl}/Videos/${encodeURIComponent(itemId)}/main.m3u8?` +
    params.toString()
  )
}
