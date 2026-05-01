// NOTE: tests authored same-session as feature — see PLAN.md INS-009 entry; cold-reader pass needed before declaring production-ready.

import { describe, expect, it } from "vitest"
import { mountPartyTV } from "../party-tv"
import { AuthSession, MediaItem } from "../../engine/types"

const session: AuthSession = {
  baseUrl: "https://o.example",
  userId: "u",
  accessToken: "tok-xyz",
  serverId: "srv",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.2.0",
  deviceName: "Concord",
}

const itemA: MediaItem = { id: "it-A", name: "Movie A", type: "Movie" }
const itemB: MediaItem = { id: "it-B", name: "Movie B", type: "Movie" }

describe("mountPartyTV (v0.2.0)", () => {
  it("renders the waiting banner before any command arrives", () => {
    const root = document.createElement("div")
    const tv = mountPartyTV(root, {
      session,
      participantId: "@me",
      hostId: "@me",
    })
    const banner = root.querySelector(".orrdia-party-tv-banner")
    expect(banner?.textContent).toMatch(/waiting/i)
    tv.unmount()
  })

  it("swaps the video src when a select command arrives via applyExternalCommand", () => {
    const root = document.createElement("div")
    const tv = mountPartyTV(root, {
      session,
      participantId: "@me",
      hostId: "@me",
      itemLookup: (id) => (id === "it-A" ? itemA : id === "it-B" ? itemB : undefined),
    })
    tv.applyExternalCommand({
      type: "party-cmd-queue-add",
      itemId: "it-A",
      addedBy: "@alice",
      atMs: 1,
    })
    tv.applyExternalCommand({ type: "party-cmd-select", queueIndex: 0, atMs: 2 })

    const video = root.querySelector("video") as HTMLVideoElement
    expect(video.src).toContain("/Videos/it-A/stream")
    expect(video.src).toContain("api_key=tok-xyz")

    const state = tv.getState()
    expect(state.itemId).toBe("it-A")
    expect(state.queueCursor).toBe(0)
    expect(state.queue).toHaveLength(1)

    const banner = root.querySelector(".orrdia-party-tv-banner")
    expect(banner?.textContent).toContain("Movie A")
    tv.unmount()
  })

  it("getState reflects queue length and cursor as commands accumulate", () => {
    const root = document.createElement("div")
    const tv = mountPartyTV(root, {
      session,
      participantId: "@me",
      hostId: "@me",
    })
    tv.applyExternalCommand({
      type: "party-cmd-queue-add",
      itemId: "it-A",
      addedBy: "@a",
      atMs: 1,
    })
    tv.applyExternalCommand({
      type: "party-cmd-queue-add",
      itemId: "it-B",
      addedBy: "@a",
      atMs: 2,
    })
    expect(tv.getState().queue).toHaveLength(2)
    expect(tv.getState().queueCursor).toBe(-1)
    tv.applyExternalCommand({ type: "party-cmd-select", queueIndex: 1, atMs: 3 })
    expect(tv.getState().queueCursor).toBe(1)
    tv.unmount()
  })
})
