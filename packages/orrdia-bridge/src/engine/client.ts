/**
 * Thin orrdia/Jellyfin HTTP client.
 *
 * Two operations for v0.1.0:
 *   - listLibraries(session)       -> LibraryView[]   (top-level Views)
 *   - listItems(session, parentId) -> MediaItem[]     (children of a folder/series)
 *
 * Pure-ish: every call takes an explicit `fetchImpl` for testability.
 */

import { buildEmbyAuthHeader } from "./auth"
import {
  AuthSession,
  LibraryView,
  MediaItem,
  MediaSource,
  OrrdiaClientError,
  RawItem,
  RawItemsResponse,
} from "./types"

export type FetchLike = typeof fetch

interface RequestOpts {
  fetchImpl?: FetchLike
}

const DEFAULT_LIST_FIELDS = "Overview,RunTimeTicks,MediaSources"
const DEFAULT_INCLUDE_TYPES = "Movie,Series,Season,Episode,Folder"
const DEFAULT_LIMIT = 200

function authHeaders(session: AuthSession): Record<string, string> {
  return {
    "X-Emby-Token": session.accessToken,
    "X-Emby-Authorization": buildEmbyAuthHeader({
      clientName: session.clientName,
      deviceName: session.deviceName,
      deviceId: session.deviceId,
      clientVersion: session.clientVersion,
      token: session.accessToken,
    }),
    Accept: "application/json",
  }
}

async function jsonGet<T>(url: string, headers: Record<string, string>, fetchImpl: FetchLike): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(url, { method: "GET", headers })
  } catch (e) {
    throw new OrrdiaClientError(0, String(e), url, `OrrdiaClientError: network failure for ${url}`)
  }
  if (!res.ok) {
    const body = await safeReadText(res)
    throw new OrrdiaClientError(res.status, body, url)
  }
  try {
    return (await res.json()) as T
  } catch (e) {
    throw new OrrdiaClientError(res.status, String(e), url, "OrrdiaClientError: invalid JSON response")
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

/** GET /Users/{userId}/Views — top-level libraries. */
export async function listLibraries(
  session: AuthSession,
  opts: RequestOpts = {},
): Promise<LibraryView[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = `${session.baseUrl}/Users/${encodeURIComponent(session.userId)}/Views`
  const data = await jsonGet<RawItemsResponse>(url, authHeaders(session), fetchImpl)
  const items = data.Items ?? []
  return items.map(rawToLibraryView)
}

export interface ListItemsOpts extends RequestOpts {
  parentId?: string
  includeItemTypes?: string
  fields?: string
  limit?: number
  startIndex?: number
  recursive?: boolean
}

/** GET /Users/{userId}/Items — children of a parent (or all top-level when parentId omitted). */
export async function listItems(
  session: AuthSession,
  opts: ListItemsOpts = {},
): Promise<MediaItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const params = new URLSearchParams()
  if (opts.parentId) params.set("ParentId", opts.parentId)
  params.set("IncludeItemTypes", opts.includeItemTypes ?? DEFAULT_INCLUDE_TYPES)
  params.set("Fields", opts.fields ?? DEFAULT_LIST_FIELDS)
  params.set("Recursive", String(opts.recursive ?? false))
  params.set("Limit", String(opts.limit ?? DEFAULT_LIMIT))
  if (opts.startIndex !== undefined) params.set("StartIndex", String(opts.startIndex))
  const url =
    `${session.baseUrl}/Users/${encodeURIComponent(session.userId)}/Items?` +
    params.toString()
  const data = await jsonGet<RawItemsResponse>(url, authHeaders(session), fetchImpl)
  const items = data.Items ?? []
  return items.map(rawToMediaItem)
}

function rawToLibraryView(raw: RawItem): LibraryView {
  return {
    id: raw.Id ?? "",
    name: raw.Name ?? "",
    collectionType: raw.CollectionType,
    imageTags: raw.ImageTags
      ? { Primary: raw.ImageTags.Primary }
      : undefined,
  }
}

function rawToMediaItem(raw: RawItem): MediaItem {
  const sources: MediaSource[] | undefined = raw.MediaSources?.map((s) => ({
    id: s.Id ?? "",
    container: s.Container,
    size: s.Size,
    path: s.Path,
    protocol: s.Protocol,
  }))
  return {
    id: raw.Id ?? "",
    name: raw.Name ?? "",
    type: raw.Type ?? "",
    parentId: raw.ParentId,
    runTimeTicks: raw.RunTimeTicks,
    overview: raw.Overview,
    imageTags: raw.ImageTags
      ? {
          Primary: raw.ImageTags.Primary,
          Backdrop: raw.ImageTags.Backdrop,
        }
      : undefined,
    hasChildren: raw.IsFolder,
    mediaSources: sources,
  }
}

/** Build an Image URL for an item using a known imageTag. Pure builder. */
export function imageUrl(
  session: AuthSession,
  itemId: string,
  opts: {
    type?: "Primary" | "Backdrop"
    fillHeight?: number
    fillWidth?: number
    quality?: number
    tag?: string
  } = {},
): string {
  const params = new URLSearchParams()
  if (opts.fillHeight) params.set("fillHeight", String(opts.fillHeight))
  if (opts.fillWidth) params.set("fillWidth", String(opts.fillWidth))
  params.set("quality", String(opts.quality ?? 80))
  if (opts.tag) params.set("tag", opts.tag)
  params.set("api_key", session.accessToken)
  return (
    `${session.baseUrl}/Items/${encodeURIComponent(itemId)}/Images/` +
    `${opts.type ?? "Primary"}?${params.toString()}`
  )
}
