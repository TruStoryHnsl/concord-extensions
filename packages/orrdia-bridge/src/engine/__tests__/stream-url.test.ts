import { describe, expect, it } from "vitest"
import { directStreamUrl, hlsStreamUrl } from "../stream-url"
import { AuthSession } from "../types"

const session: AuthSession = {
  baseUrl: "https://o.example",
  userId: "user-1",
  accessToken: "tok-1",
  serverId: "srv-1",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.1.0",
  deviceName: "Concord",
}

describe("directStreamUrl", () => {
  it("contains /Videos/{itemId}/stream, Static=true, api_key", () => {
    const u = new URL(directStreamUrl(session, "it-1"))
    expect(u.pathname).toBe("/Videos/it-1/stream")
    expect(u.searchParams.get("Static")).toBe("true")
    expect(u.searchParams.get("api_key")).toBe("tok-1")
  })

  it("includes MediaSourceId when supplied", () => {
    const u = new URL(directStreamUrl(session, "it-1", { mediaSourceId: "ms-1" }))
    expect(u.searchParams.get("MediaSourceId")).toBe("ms-1")
  })

  it("escapes special characters in itemId", () => {
    const u = new URL(directStreamUrl(session, "it 1?x"))
    expect(u.pathname).toBe("/Videos/it%201%3Fx/stream")
  })
})

describe("hlsStreamUrl", () => {
  it("contains /main.m3u8, VideoCodec, AudioCodec, api_key, PlaySessionId", () => {
    const u = new URL(hlsStreamUrl(session, "it-1", { playSessionId: "ps-1" }))
    expect(u.pathname).toBe("/Videos/it-1/main.m3u8")
    expect(u.searchParams.get("VideoCodec")).toBe("h264")
    expect(u.searchParams.get("AudioCodec")).toBe("aac,mp3")
    expect(u.searchParams.get("api_key")).toBe("tok-1")
    expect(u.searchParams.get("PlaySessionId")).toBe("ps-1")
    expect(u.searchParams.get("deviceId")).toBe("dev-1")
  })

  it("auto-generates a PlaySessionId when missing", () => {
    const u = new URL(hlsStreamUrl(session, "it-1"))
    const psid = u.searchParams.get("PlaySessionId")
    expect(psid).toBeTruthy()
    expect(psid?.length).toBeGreaterThan(5)
  })

  it("respects custom codecs", () => {
    const u = new URL(hlsStreamUrl(session, "it-1", { videoCodec: "h265", audioCodec: "opus" }))
    expect(u.searchParams.get("VideoCodec")).toBe("h265")
    expect(u.searchParams.get("AudioCodec")).toBe("opus")
  })
})
