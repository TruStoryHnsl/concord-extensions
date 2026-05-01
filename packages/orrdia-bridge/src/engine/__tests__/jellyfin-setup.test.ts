import { describe, expect, it, vi } from "vitest"
import {
  OrrdiaSetupError,
  probeStartupState,
  submitStartupComplete,
  submitStartupConfiguration,
  submitStartupRemoteAccess,
  submitStartupUser,
  submitVirtualFolder,
} from "../jellyfin-setup"
import type { AuthSession } from "../types"

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function textRes(status: number, body: string): Response {
  // jsdom's Response constructor rejects "null body" status codes (204/205/304).
  // Translate 204 → 200 with empty body since our setup-client only inspects
  // res.ok / res.status / res.text(), not the literal status number.
  const safeStatus = status === 204 ? 200 : status
  return new Response(body, { status: safeStatus })
}

const session: AuthSession = {
  baseUrl: "https://o.example/",
  userId: "u-1",
  accessToken: "tok-xyz",
  serverId: "srv",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.3.0",
  deviceName: "Concord",
}

describe("probeStartupState", () => {
  it("normalizes the public-info shape and detects an incomplete wizard", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        StartupWizardCompleted: false,
        ProductName: "Jellyfin Server",
        Version: "10.9.0",
        ServerName: "orrdia-test",
      }),
    )
    const probe = await probeStartupState("https://o.example/", { fetchImpl })
    expect(probe).toEqual({
      startupCompleted: false,
      productName: "Jellyfin Server",
      version: "10.9.0",
      serverName: "orrdia-test",
    })
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toBe("https://o.example/System/Info/Public")
  })

  it("treats StartupWizardCompleted=true as completed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, { StartupWizardCompleted: true, ProductName: "Jellyfin Server" }),
    )
    const probe = await probeStartupState("https://o.example", { fetchImpl })
    expect(probe.startupCompleted).toBe(true)
  })

  it("throws OrrdiaSetupError on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => textRes(502, "bad gateway"))
    await expect(probeStartupState("https://o.example", { fetchImpl })).rejects.toBeInstanceOf(OrrdiaSetupError)
  })

  it("throws OrrdiaSetupError on network rejection (status=0)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND")
    })
    await expect(probeStartupState("https://o.example", { fetchImpl })).rejects.toMatchObject({
      name: "OrrdiaSetupError",
      status: 0,
    })
  })

  it("throws OrrdiaSetupError on non-JSON body", async () => {
    const fetchImpl = vi.fn(async () => textRes(200, "<html>not json</html>"))
    await expect(probeStartupState("https://o.example", { fetchImpl })).rejects.toBeInstanceOf(OrrdiaSetupError)
  })
})

describe("submitStartupConfiguration", () => {
  it("POSTs to /Startup/Configuration with the locale payload", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitStartupConfiguration(
      "https://o.example/",
      { UICulture: "en-US", MetadataCountryCode: "US", PreferredMetadataLanguage: "en" },
      { fetchImpl },
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://o.example/Startup/Configuration")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      UICulture: "en-US",
      MetadataCountryCode: "US",
      PreferredMetadataLanguage: "en",
    })
  })

  it("rejects with body preserved on 400 (e.g. invalid culture)", async () => {
    const fetchImpl = vi.fn(async () => textRes(400, "invalid culture"))
    await expect(
      submitStartupConfiguration(
        "https://o.example",
        { UICulture: "??", MetadataCountryCode: "US", PreferredMetadataLanguage: "en" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ name: "OrrdiaSetupError", status: 400, body: "invalid culture" })
  })
})

describe("submitStartupUser", () => {
  it("POSTs Name+Password to /Startup/User", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitStartupUser(
      "https://o.example",
      { Name: "admin", Password: "hunter2" },
      { fetchImpl },
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://o.example/Startup/User")
    expect(JSON.parse(init.body as string)).toEqual({ Name: "admin", Password: "hunter2" })
  })

  it("surfaces server error message on weak-password 400", async () => {
    const fetchImpl = vi.fn(async () => textRes(400, "Password is too weak"))
    try {
      await submitStartupUser(
        "https://o.example",
        { Name: "admin", Password: "x" },
        { fetchImpl },
      )
      throw new Error("should have rejected")
    } catch (e) {
      expect(e).toBeInstanceOf(OrrdiaSetupError)
      expect((e as OrrdiaSetupError).status).toBe(400)
      expect((e as OrrdiaSetupError).body).toBe("Password is too weak")
    }
  })
})

describe("submitStartupRemoteAccess", () => {
  it("defaults EnableAutomaticPortMapping to false", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitStartupRemoteAccess(
      "https://o.example",
      { EnableRemoteAccess: true },
      { fetchImpl },
    )
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      EnableRemoteAccess: true,
      EnableAutomaticPortMapping: false,
    })
  })

  it("respects an explicit EnableAutomaticPortMapping", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitStartupRemoteAccess(
      "https://o.example",
      { EnableRemoteAccess: false, EnableAutomaticPortMapping: true },
      { fetchImpl },
    )
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      EnableRemoteAccess: false,
      EnableAutomaticPortMapping: true,
    })
  })
})

describe("submitStartupComplete", () => {
  it("POSTs an empty body to /Startup/Complete", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitStartupComplete("https://o.example", { fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://o.example/Startup/Complete")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it("throws OrrdiaSetupError on 500", async () => {
    const fetchImpl = vi.fn(async () => textRes(500, "boom"))
    await expect(submitStartupComplete("https://o.example", { fetchImpl })).rejects.toBeInstanceOf(OrrdiaSetupError)
  })
})

describe("submitVirtualFolder", () => {
  it("POSTs to /Library/VirtualFolders with auth header + path-infos body", async () => {
    const fetchImpl = vi.fn(async () => textRes(204, ""))
    await submitVirtualFolder(
      session,
      { Name: "Movies", CollectionType: "movies", Paths: ["/data/movies"] },
      { fetchImpl },
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("https://o.example/Library/VirtualFolders?")
    expect(url).toContain("name=Movies")
    expect(url).toContain("collectionType=movies")
    expect(url).toContain("refreshLibrary=true")
    const headers = init.headers as Record<string, string>
    expect(headers["X-Emby-Authorization"]).toContain('Token="tok-xyz"')
    expect(JSON.parse(init.body as string)).toEqual({
      LibraryOptions: { PathInfos: [{ Path: "/data/movies" }] },
    })
  })

  it("propagates server 400 with the original body for inline display", async () => {
    const fetchImpl = vi.fn(async () => textRes(400, "Path not found: /missing"))
    await expect(
      submitVirtualFolder(
        session,
        { Name: "Movies", CollectionType: "movies", Paths: ["/missing"] },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "OrrdiaSetupError",
      status: 400,
      body: "Path not found: /missing",
    })
  })
})
