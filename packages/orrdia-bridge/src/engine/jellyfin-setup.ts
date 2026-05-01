/**
 * Jellyfin/orrdia first-run setup-wizard API client (INS-009 W9).
 *
 * Spec section 3 (amended) — these endpoints are unauthenticated WHILE
 * `StartupWizardCompleted` is false. Once `Startup/Complete` is called,
 * the server flips that flag to true and the same paths reject without
 * a valid AccessToken. The setup-wizard FSM uses these to walk the user
 * from "fresh server, no admin" → "admin created, ready to authenticate
 * with the just-created credentials".
 *
 * fetch is injected (FetchLike) so unit tests run without touching
 * globalThis. Same pattern as engine/auth.ts.
 *
 * Endpoints used:
 *   GET  {baseUrl}/System/Info/Public        — probe (no auth, always)
 *   POST {baseUrl}/Startup/Configuration     — set locale/metadata
 *   POST {baseUrl}/Startup/User              — create admin
 *   POST {baseUrl}/Startup/RemoteAccess      — toggle remote access
 *   POST {baseUrl}/Startup/Complete          — finalize
 *   POST {baseUrl}/Library/VirtualFolders    — optional library (authed)
 */

import type { FetchLike } from "./auth"
import { normalizeBaseUrl, buildEmbyAuthHeader } from "./auth"
import type { AuthSession } from "./types"

/** Public probe response — only the fields the wizard needs. */
export interface StartupProbe {
  /**
   * True when Jellyfin's first-run wizard has already been completed.
   * Drives the dispatcher: false → render setup wizard, true → render
   * existing connect form.
   */
  startupCompleted: boolean
  /** "Jellyfin Server" or the orrdia rebrand. Surfaces in welcome step. */
  productName?: string
  /** Server version, e.g. "10.9.0". Useful for compatibility messaging. */
  version?: string
  /** Server name as configured (defaults to hostname pre-setup). */
  serverName?: string
}

/** Raw shape of GET /System/Info/Public. Loose by design. */
interface RawPublicInfo {
  StartupWizardCompleted?: boolean
  ProductName?: string
  Version?: string
  ServerName?: string
}

export interface StartupConfigurationPayload {
  UICulture: string
  MetadataCountryCode: string
  PreferredMetadataLanguage: string
}

export interface StartupUserPayload {
  /** Admin display name. Cannot be empty; server returns 400 otherwise. */
  Name: string
  /** Admin password. Server may reject as too weak (400). */
  Password: string
}

export interface StartupRemoteAccessPayload {
  EnableRemoteAccess: boolean
  /** Always false from the wizard — UPnP is risky on most LANs. */
  EnableAutomaticPortMapping?: boolean
}

export interface VirtualFolderPayload {
  /** Display name shown in the library browser. */
  Name: string
  /**
   * Jellyfin collection-type token. Common values:
   *   "movies", "tvshows", "music", "books", "homevideos",
   *   "musicvideos", "boxsets", "mixed"
   */
  CollectionType: string
  /**
   * Filesystem path(s) on the SERVER (not the client). e.g. "/data/movies".
   * The client cannot validate that the path exists; server will respond
   * with the result of the scan.
   */
  Paths: string[]
  /** Optional refresh trigger; defaults to true. */
  RefreshLibrary?: boolean
}

/** Typed setup-wizard error. Carries HTTP status + raw body for inline display. */
export class OrrdiaSetupError extends Error {
  readonly status: number
  readonly body: string
  readonly endpoint: string
  constructor(status: number, body: string, endpoint: string, message?: string) {
    super(message ?? `OrrdiaSetupError: HTTP ${status} from ${endpoint}`)
    this.name = "OrrdiaSetupError"
    this.status = status
    this.body = body
    this.endpoint = endpoint
  }
}

export interface SetupClientOpts {
  fetchImpl?: FetchLike
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

/**
 * GET {baseUrl}/System/Info/Public.
 *
 * Returns a normalized StartupProbe. Throws OrrdiaSetupError on network
 * failure or non-2xx (the dispatcher distinguishes these from a
 * successful probe-says-incomplete to render the correct step).
 */
export async function probeStartupState(
  baseUrl: string,
  opts: SetupClientOpts = {},
): Promise<StartupProbe> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = `${normalizeBaseUrl(baseUrl)}/System/Info/Public`

  let res: Response
  try {
    res = await fetchImpl(url, { method: "GET" })
  } catch (e) {
    throw new OrrdiaSetupError(0, String(e), url, `OrrdiaSetupError: network failure contacting ${url}`)
  }

  if (!res.ok) {
    const body = await safeReadText(res)
    throw new OrrdiaSetupError(res.status, body, url)
  }

  let raw: RawPublicInfo
  try {
    raw = (await res.json()) as RawPublicInfo
  } catch (e) {
    throw new OrrdiaSetupError(res.status, String(e), url, `OrrdiaSetupError: probe response was not valid JSON`)
  }

  return {
    startupCompleted: Boolean(raw.StartupWizardCompleted),
    productName: raw.ProductName,
    version: raw.Version,
    serverName: raw.ServerName,
  }
}

async function postUnauthed(
  baseUrl: string,
  path: string,
  body: unknown,
  opts: SetupClientOpts,
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = `${normalizeBaseUrl(baseUrl)}${path}`
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new OrrdiaSetupError(0, String(e), url, `OrrdiaSetupError: network failure contacting ${url}`)
  }
  if (!res.ok) {
    const text = await safeReadText(res)
    throw new OrrdiaSetupError(res.status, text, url)
  }
}

/** POST /Startup/Configuration. */
export async function submitStartupConfiguration(
  baseUrl: string,
  payload: StartupConfigurationPayload,
  opts: SetupClientOpts = {},
): Promise<void> {
  await postUnauthed(baseUrl, "/Startup/Configuration", payload, opts)
}

/** POST /Startup/User — creates the initial admin account. */
export async function submitStartupUser(
  baseUrl: string,
  payload: StartupUserPayload,
  opts: SetupClientOpts = {},
): Promise<void> {
  await postUnauthed(baseUrl, "/Startup/User", payload, opts)
}

/** POST /Startup/RemoteAccess — UPnP off by default. */
export async function submitStartupRemoteAccess(
  baseUrl: string,
  payload: StartupRemoteAccessPayload,
  opts: SetupClientOpts = {},
): Promise<void> {
  const body = {
    EnableRemoteAccess: payload.EnableRemoteAccess,
    EnableAutomaticPortMapping: payload.EnableAutomaticPortMapping ?? false,
  }
  await postUnauthed(baseUrl, "/Startup/RemoteAccess", body, opts)
}

/**
 * POST /Startup/Complete — flips StartupWizardCompleted to true.
 *
 * After this call, all /Startup/* endpoints reject without auth.
 * The next step in the FSM is to authenticate as the just-created admin.
 */
export async function submitStartupComplete(
  baseUrl: string,
  opts: SetupClientOpts = {},
): Promise<void> {
  // Jellyfin accepts an empty POST body here.
  await postUnauthed(baseUrl, "/Startup/Complete", {}, opts)
}

/**
 * POST /Library/VirtualFolders — adds a library AFTER auth.
 *
 * Per spec, the wizard can optionally seed one library before handoff.
 * Jellyfin requires AccessToken for this endpoint even pre-Complete in
 * recent builds, so it takes a session, not a bare baseUrl.
 *
 * Query params (collectionType, refreshLibrary, name) are appended;
 * the body carries `LibraryOptions.PathInfos[]` per Jellyfin convention.
 */
export async function submitVirtualFolder(
  session: AuthSession,
  payload: VirtualFolderPayload,
  opts: SetupClientOpts = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const params = new URLSearchParams({
    name: payload.Name,
    collectionType: payload.CollectionType,
    refreshLibrary: String(payload.RefreshLibrary ?? true),
  })
  const url = `${normalizeBaseUrl(session.baseUrl)}/Library/VirtualFolders?${params.toString()}`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Emby-Authorization": buildEmbyAuthHeader({
      clientName: session.clientName,
      deviceName: session.deviceName,
      deviceId: session.deviceId,
      clientVersion: session.clientVersion,
      token: session.accessToken,
    }),
  }

  const body = {
    LibraryOptions: {
      PathInfos: payload.Paths.map((p) => ({ Path: p })),
    },
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new OrrdiaSetupError(0, String(e), url, `OrrdiaSetupError: network failure contacting ${url}`)
  }
  if (!res.ok) {
    const text = await safeReadText(res)
    throw new OrrdiaSetupError(res.status, text, url)
  }
}
