import { describe, expect, it } from "vitest"
import { mountDisplay } from "../display"
import { AuthSession, MediaItem } from "../../engine/types"

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
})
