/**
 * Shared types for the orrdia HTTP client and the playback session.
 *
 * Mirrors spec section 3 (server-config) and section 5 (browsing) of
 * docs/extensions/specs/orrdia-bridge.md.
 */

export interface ServerConfig {
  baseUrl: string
  username: string
  password: string
  deviceName?: string
  deviceId?: string
  clientName?: string
  clientVersion?: string
}

export interface AuthSession {
  baseUrl: string
  userId: string
  accessToken: string
  serverId: string
  deviceId: string
  clientName: string
  clientVersion: string
  deviceName: string
  expiresAt?: number
}

export interface LibraryView {
  id: string
  name: string
  collectionType?: string
  imageTags?: { Primary?: string }
}

export interface MediaSource {
  id: string
  container?: string
  size?: number
  path?: string
  protocol?: "File" | "Http" | string
}

export interface MediaItem {
  id: string
  name: string
  type: string
  parentId?: string
  runTimeTicks?: number
  overview?: string
  imageTags?: { Primary?: string; Backdrop?: string }
  hasChildren?: boolean
  mediaSources?: MediaSource[]
}

/** Typed errors. */
export class OrrdiaAuthError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string, message?: string) {
    super(message ?? `OrrdiaAuthError: HTTP ${status}`)
    this.name = "OrrdiaAuthError"
    this.status = status
    this.body = body
  }
}

export class OrrdiaClientError extends Error {
  readonly status: number
  readonly body: string
  readonly url: string
  constructor(status: number, body: string, url: string, message?: string) {
    super(message ?? `OrrdiaClientError: HTTP ${status} for ${url}`)
    this.name = "OrrdiaClientError"
    this.status = status
    this.body = body
    this.url = url
  }
}

/** Raw orrdia/Jellyfin response shapes (we keep them loose; only what we use). */
export interface RawAuthResponse {
  User?: { Id?: string; Name?: string; ServerId?: string }
  AccessToken?: string
  ServerId?: string
}

export interface RawItemsResponse {
  Items?: RawItem[]
  TotalRecordCount?: number
}

export interface RawItem {
  Id?: string
  Name?: string
  Type?: string
  ParentId?: string
  CollectionType?: string
  RunTimeTicks?: number
  Overview?: string
  ImageTags?: Record<string, string>
  IsFolder?: boolean
  MediaSources?: Array<{
    Id?: string
    Container?: string
    Size?: number
    Path?: string
    Protocol?: string
  }>
}
