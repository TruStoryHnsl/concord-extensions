// v0.2.0 baseline tests + v0.3.2 cold-reader negative cases (malformed
// auth header inputs, expired-token surfaces, mid-stream connection drop
// emulation).

import { describe, expect, it, vi } from "vitest"
import {
  authenticateByName,
  buildEmbyAuthHeader,
  normalizeBaseUrl,
} from "../auth"
import { OrrdiaAuthError, ServerConfig } from "../types"

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockTextResponse(status: number, body: string): Response {
  return new Response(body, { status })
}

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://o.example/")).toBe("https://o.example")
    expect(normalizeBaseUrl("https://o.example///")).toBe("https://o.example")
    expect(normalizeBaseUrl("https://o.example")).toBe("https://o.example")
  })
})

describe("buildEmbyAuthHeader", () => {
  it("emits the five MediaBrowser fields in order without token", () => {
    const h = buildEmbyAuthHeader({
      clientName: "Concord",
      deviceName: "Browser",
      deviceId: "dev-1",
      clientVersion: "0.1.0",
    })
    expect(h).toBe(
      'MediaBrowser Client="Concord", Device="Browser", DeviceId="dev-1", Version="0.1.0"',
    )
  })

  it("appends Token field when provided", () => {
    const h = buildEmbyAuthHeader({
      clientName: "Concord",
      deviceName: "Browser",
      deviceId: "dev-1",
      clientVersion: "0.1.0",
      token: "abc",
    })
    expect(h).toContain('Token="abc"')
    expect(h.startsWith("MediaBrowser ")).toBe(true)
  })
})

describe("authenticateByName", () => {
  const baseConfig: ServerConfig = {
    baseUrl: "https://o.example/",
    username: "alice",
    password: "secret",
    deviceId: "dev-1",
  }

  it("posts to /Users/AuthenticateByName with X-Emby-Authorization header", async () => {
    const fetchImpl = vi.fn(async () =>
      mockJsonResponse(200, {
        User: { Id: "user-1", Name: "alice", ServerId: "srv-1" },
        AccessToken: "tok-1",
        ServerId: "srv-1",
      }),
    )
    const session = await authenticateByName(baseConfig, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://o.example/Users/AuthenticateByName")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["X-Emby-Authorization"]).toContain('Client="Concord-Orrdia-Bridge"')
    expect(headers["X-Emby-Authorization"]).toContain('DeviceId="dev-1"')
    expect(JSON.parse(init.body as string)).toEqual({ Username: "alice", Pw: "secret" })

    expect(session.userId).toBe("user-1")
    expect(session.accessToken).toBe("tok-1")
    expect(session.serverId).toBe("srv-1")
    expect(session.baseUrl).toBe("https://o.example") // normalized
  })

  it("throws OrrdiaAuthError on 401", async () => {
    const fetchImpl = vi.fn(async () => mockTextResponse(401, "bad creds"))
    await expect(authenticateByName(baseConfig, { fetchImpl })).rejects.toBeInstanceOf(OrrdiaAuthError)
  })

  it("throws when AccessToken missing from response", async () => {
    const fetchImpl = vi.fn(async () => mockJsonResponse(200, { User: { Id: "u" } }))
    await expect(authenticateByName(baseConfig, { fetchImpl })).rejects.toBeInstanceOf(OrrdiaAuthError)
  })

  it("throws when fetch itself rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND")
    })
    await expect(authenticateByName(baseConfig, { fetchImpl })).rejects.toBeInstanceOf(OrrdiaAuthError)
  })

  it("throws OrrdiaAuthError on 403 (token revoked / expired token surface)", async () => {
    const fetchImpl = vi.fn(async () => mockTextResponse(403, "token expired"))
    const err = (await authenticateByName(baseConfig, { fetchImpl }).catch((e) => e)) as OrrdiaAuthError
    expect(err).toBeInstanceOf(OrrdiaAuthError)
    expect(err.status).toBe(403)
  })

  it("throws OrrdiaAuthError on a stream that errors mid-body (response.json() rejects)", async () => {
    // Simulates a connection drop after headers but before the body
    // arrives — `res.json()` rejects with a parse / abort error.
    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("network reset")
      },
    } as unknown as Response
    const fetchImpl = vi.fn(async () => fakeRes)
    const err = (await authenticateByName(baseConfig, { fetchImpl }).catch((e) => e)) as OrrdiaAuthError
    expect(err).toBeInstanceOf(OrrdiaAuthError)
  })

  it("throws OrrdiaAuthError when AccessToken is empty string (not just missing)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockJsonResponse(200, { User: { Id: "u" }, AccessToken: "", ServerId: "srv" }),
    )
    await expect(authenticateByName(baseConfig, { fetchImpl })).rejects.toBeInstanceOf(OrrdiaAuthError)
  })
})

describe("buildEmbyAuthHeader — adversarial inputs", () => {
  it("does not break when device fields contain quotation marks (jellyfin will reject; we don't sanitize)", () => {
    // Documents the current contract: we pass through whatever the caller
    // gives us. Jellyfin's parser is the authority on rejection. If a
    // future hardening pass escapes these, this test must update.
    const h = buildEmbyAuthHeader({
      clientName: 'Concord"Bad',
      deviceName: "Browser",
      deviceId: "dev-1",
      clientVersion: "0.1.0",
    })
    expect(h).toContain('Concord"Bad')
  })

  it("emits a token-less header when token is undefined / empty", () => {
    const h = buildEmbyAuthHeader({
      clientName: "Concord",
      deviceName: "Browser",
      deviceId: "dev-1",
      clientVersion: "0.1.0",
      token: "",
    })
    // Empty token is falsy; no Token field should appear.
    expect(h.includes('Token=')).toBe(false)
  })
})

describe("normalizeBaseUrl — edge cases", () => {
  it("does not strip mid-string slashes (only trailing ones)", () => {
    expect(normalizeBaseUrl("https://o.example/path/")).toBe("https://o.example/path")
    expect(normalizeBaseUrl("https://o.example/path/sub/")).toBe("https://o.example/path/sub")
  })

  it("returns empty string unchanged (caller error, not normalize's job to validate)", () => {
    expect(normalizeBaseUrl("")).toBe("")
  })
})
