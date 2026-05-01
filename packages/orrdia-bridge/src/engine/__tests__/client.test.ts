import { describe, expect, it, vi } from "vitest"
import { imageUrl, listItems, listLibraries } from "../client"
import { AuthSession, OrrdiaClientError } from "../types"

function mockJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

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

describe("listLibraries", () => {
  it("hits /Users/{userId}/Views and parses Items", async () => {
    const fetchImpl = vi.fn(async () =>
      mockJson(200, {
        Items: [
          { Id: "lib-1", Name: "Movies", CollectionType: "movies", ImageTags: { Primary: "tag1" } },
          { Id: "lib-2", Name: "Shows", CollectionType: "tvshows" },
        ],
      }),
    )
    const views = await listLibraries(session, { fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://o.example/Users/user-1/Views")
    const headers = init.headers as Record<string, string>
    expect(headers["X-Emby-Token"]).toBe("tok-1")
    expect(views).toEqual([
      { id: "lib-1", name: "Movies", collectionType: "movies", imageTags: { Primary: "tag1" } },
      { id: "lib-2", name: "Shows", collectionType: "tvshows", imageTags: undefined },
    ])
  })

  it("surfaces OrrdiaClientError on non-200", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }))
    await expect(listLibraries(session, { fetchImpl })).rejects.toBeInstanceOf(OrrdiaClientError)
  })
})

describe("listItems", () => {
  it("builds query string with ParentId, Limit, IncludeItemTypes, Fields", async () => {
    const fetchImpl = vi.fn(async () => mockJson(200, { Items: [] }))
    await listItems(session, { fetchImpl, parentId: "lib-1", limit: 50 })
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    const u = new URL(url)
    expect(u.pathname).toBe("/Users/user-1/Items")
    expect(u.searchParams.get("ParentId")).toBe("lib-1")
    expect(u.searchParams.get("Limit")).toBe("50")
    expect(u.searchParams.get("Recursive")).toBe("false")
    expect(u.searchParams.get("IncludeItemTypes")).toContain("Movie")
    expect(u.searchParams.get("Fields")).toContain("Overview")
  })

  it("maps RawItem -> MediaItem including media sources", async () => {
    const fetchImpl = vi.fn(async () =>
      mockJson(200, {
        Items: [
          {
            Id: "it-1",
            Name: "Movie A",
            Type: "Movie",
            ParentId: "lib-1",
            RunTimeTicks: 60000000,
            Overview: "x",
            ImageTags: { Primary: "p", Backdrop: "b" },
            IsFolder: false,
            MediaSources: [{ Id: "ms-1", Container: "mkv", Size: 100, Path: "/p", Protocol: "File" }],
          },
        ],
      }),
    )
    const items = await listItems(session, { fetchImpl, parentId: "lib-1" })
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("it-1")
    expect(items[0].mediaSources?.[0].id).toBe("ms-1")
    expect(items[0].mediaSources?.[0].container).toBe("mkv")
    expect(items[0].imageTags).toEqual({ Primary: "p", Backdrop: "b" })
  })
})

describe("imageUrl", () => {
  it("includes api_key, tag, and dimensions", () => {
    const u = imageUrl(session, "it-1", { fillHeight: 300, fillWidth: 200, tag: "abc" })
    const url = new URL(u)
    expect(url.pathname).toBe("/Items/it-1/Images/Primary")
    expect(url.searchParams.get("api_key")).toBe("tok-1")
    expect(url.searchParams.get("tag")).toBe("abc")
    expect(url.searchParams.get("fillHeight")).toBe("300")
  })
})
