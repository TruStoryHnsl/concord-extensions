/**
 * ServerConfig persistence (INS-009 v0.3.2).
 *
 * Spec section 6 deferral: previously every mount re-prompted the user
 * for orrdia URL + credentials because ServerConfig was held only in
 * extension session state. v0.3.2 persists it via localStorage scoped
 * per-extension-id so a user who connects once survives a page reload
 * and a remount of the extension surface.
 *
 * Storage key: `concord-ext:<extensionId>:serverConfig` (scoped so two
 * extensions never collide on a single Concord install).
 *
 * Schema: opaque JSON-serialized ServerConfig. Schema-version field
 * lets future migrations spot stale entries; mismatches return null
 * rather than crashing.
 *
 * Failure modes:
 *  - localStorage unavailable (private mode, server-side render, hostile
 *    sandbox) → load returns null, save is a no-op. Caller treats as
 *    "no persistence available, fall through to the old per-mount form."
 *  - Stored JSON corrupted → load returns null + clears the bad entry
 *    so future saves work cleanly.
 *  - schemaVersion mismatch → same as corruption.
 */

import { ServerConfig } from "../engine/types"

const DEFAULT_EXTENSION_ID = "com.concord.orrdia-bridge"
const SCHEMA_VERSION = 1

/** Storage record envelope — keeps room for future schema migrations. */
interface PersistedRecord {
  schemaVersion: number
  config: ServerConfig
  /** Wall-clock ms when saved. Used for diagnostic / future expiry checks. */
  savedAtMs: number
}

export interface PersistenceOpts {
  /**
   * Extension id used to scope the storage key. Defaults to the bridge's
   * manifest id; tests / multi-instance harnesses can override.
   */
  extensionId?: string
  /** Injectable storage for tests / non-browser environments. */
  storage?: Storage | null
}

function storageKey(extensionId: string): string {
  return `concord-ext:${extensionId}:serverConfig`
}

function getDefaultStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    // Some sandboxes throw on access (Safari with cookies disabled,
    // strict iframe sandboxes). Use a try/catch around the whole getter.
    const s = window.localStorage
    if (!s) return null
    // Probe with a write+read to confirm writability — Safari reports a
    // localStorage object that throws on every set in private mode.
    const probeKey = `__concord_probe_${Date.now()}`
    s.setItem(probeKey, "1")
    s.removeItem(probeKey)
    return s
  } catch {
    return null
  }
}

/**
 * Load a persisted ServerConfig. Returns null when no record exists,
 * the storage is unavailable, the JSON is corrupt, or the schema
 * version doesn't match.
 */
export function loadServerConfig(opts: PersistenceOpts = {}): ServerConfig | null {
  const storage = opts.storage === undefined ? getDefaultStorage() : opts.storage
  if (!storage) return null
  const extensionId = opts.extensionId ?? DEFAULT_EXTENSION_ID
  const key = storageKey(extensionId)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupted payload — clear it so the next save isn't blocked by
    // garbage and so future loads don't keep re-parsing it.
    try {
      storage.removeItem(key)
    } catch {
      // best-effort
    }
    return null
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION ||
    typeof (parsed as { config?: unknown }).config !== "object" ||
    (parsed as { config?: unknown }).config === null
  ) {
    return null
  }
  const config = (parsed as PersistedRecord).config
  // Minimum field: baseUrl must be a non-empty string. Username may be
  // absent (the urlOnly probe flow lets a fresh server be saved before
  // the wizard finishes), in which case the consumer treats the saved
  // record as "URL hint only."
  if (typeof config.baseUrl !== "string" || config.baseUrl.length === 0) return null
  return config
}

/**
 * Persist a ServerConfig. Best-effort — no throw if storage is
 * unavailable. Returns true on successful write so callers can
 * optionally surface "couldn't save creds" to the user.
 */
export function saveServerConfig(
  config: ServerConfig,
  opts: PersistenceOpts = {},
): boolean {
  const storage = opts.storage === undefined ? getDefaultStorage() : opts.storage
  if (!storage) return false
  const extensionId = opts.extensionId ?? DEFAULT_EXTENSION_ID
  const key = storageKey(extensionId)
  const record: PersistedRecord = {
    schemaVersion: SCHEMA_VERSION,
    config,
    savedAtMs: Date.now(),
  }
  try {
    storage.setItem(key, JSON.stringify(record))
    return true
  } catch {
    // QuotaExceededError or sandbox restriction — fall through.
    return false
  }
}

/** Drop the persisted record. Used after permission_denied / invalidation. */
export function clearServerConfig(opts: PersistenceOpts = {}): void {
  const storage = opts.storage === undefined ? getDefaultStorage() : opts.storage
  if (!storage) return
  const extensionId = opts.extensionId ?? DEFAULT_EXTENSION_ID
  const key = storageKey(extensionId)
  try {
    storage.removeItem(key)
  } catch {
    // best-effort
  }
}
