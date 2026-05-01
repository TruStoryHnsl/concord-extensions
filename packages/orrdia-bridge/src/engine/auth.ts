/**
 * orrdia/Jellyfin authentication.
 *
 * POST {baseUrl}/Users/AuthenticateByName with X-Emby-Authorization
 * header. Returns an AuthSession used by the rest of the client.
 *
 * The fetch implementation is injectable so unit tests can mock the
 * network without touching globalThis.
 */

import {
  AuthSession,
  OrrdiaAuthError,
  RawAuthResponse,
  ServerConfig,
} from "./types"

export type FetchLike = typeof fetch

const DEFAULT_DEVICE_NAME = "Concord"
const DEFAULT_CLIENT_NAME = "Concord-Orrdia-Bridge"
const DEFAULT_CLIENT_VERSION = "0.1.0"

/** Build the X-Emby-Authorization header value. Format documented in spec §4.1. */
export function buildEmbyAuthHeader(opts: {
  clientName: string
  deviceName: string
  deviceId: string
  clientVersion: string
  token?: string
}): string {
  const fields: string[] = [
    `Client="${opts.clientName}"`,
    `Device="${opts.deviceName}"`,
    `DeviceId="${opts.deviceId}"`,
    `Version="${opts.clientVersion}"`,
  ]
  if (opts.token) fields.push(`Token="${opts.token}"`)
  return `MediaBrowser ${fields.join(", ")}`
}

/** Trim a trailing slash from baseUrl for clean concatenation. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

/** Generate a stable-enough device id for the dev fallback. */
export function makeDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback for non-Web crypto environments (older jsdom): not cryptographically
  // strong but suffices as a per-session device identifier.
  return `concord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface AuthenticateOpts {
  fetchImpl?: FetchLike
}

/**
 * POST /Users/AuthenticateByName, returning an AuthSession on success.
 * Throws OrrdiaAuthError on non-2xx responses or malformed payloads.
 */
export async function authenticateByName(
  config: ServerConfig,
  opts: AuthenticateOpts = {},
): Promise<AuthSession> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const deviceName = config.deviceName ?? DEFAULT_DEVICE_NAME
  const deviceId = config.deviceId ?? makeDeviceId()
  const clientName = config.clientName ?? DEFAULT_CLIENT_NAME
  const clientVersion = config.clientVersion ?? DEFAULT_CLIENT_VERSION

  const url = `${baseUrl}/Users/AuthenticateByName`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Emby-Authorization": buildEmbyAuthHeader({
      clientName,
      deviceName,
      deviceId,
      clientVersion,
    }),
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ Username: config.username, Pw: config.password }),
    })
  } catch (e) {
    throw new OrrdiaAuthError(
      0,
      String(e),
      `OrrdiaAuthError: network failure contacting ${baseUrl}`,
    )
  }

  if (!res.ok) {
    const body = await safeReadText(res)
    throw new OrrdiaAuthError(res.status, body)
  }

  let data: RawAuthResponse
  try {
    data = (await res.json()) as RawAuthResponse
  } catch (e) {
    throw new OrrdiaAuthError(
      res.status,
      String(e),
      "OrrdiaAuthError: response was not valid JSON",
    )
  }

  if (!data.AccessToken || !data.User?.Id) {
    throw new OrrdiaAuthError(
      res.status,
      JSON.stringify(data),
      "OrrdiaAuthError: response missing AccessToken or User.Id",
    )
  }

  return {
    baseUrl,
    userId: data.User.Id,
    accessToken: data.AccessToken,
    serverId: data.ServerId ?? data.User.ServerId ?? "",
    deviceId,
    clientName,
    clientVersion,
    deviceName,
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}
