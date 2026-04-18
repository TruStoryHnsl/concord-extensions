/**
 * Worldview in-app config (INS-002).
 *
 * Pure functions for reading/writing/validating user configuration.
 * Storage abstraction is a minimal `KVStore` interface so tests can pass a
 * fake in-memory store and production can pass `window.localStorage`.
 *
 * Config is scoped by extension id so two extensions in the same origin don't
 * collide. Keys are stored under `concord.ext.<extensionId>.config`.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type ConfigFieldType = "string" | "secret" | "url"

export interface ConfigFieldSpec {
  /** Key used in the stored record. */
  key: string
  /** Label shown in the config UI. */
  label: string
  /** How to treat the value for display + validation. */
  type: ConfigFieldType
  /** Optional free-form help text. */
  help?: string
  /** If true, the field must be non-empty for `validateConfig` to return an empty error map. */
  required?: boolean
}

export interface ConfigSpec {
  extensionId: string
  fields: ConfigFieldSpec[]
}

export type ConfigValues = Record<string, string>

export type ConfigErrors = Record<string, string>

// ─── Storage key helper ───────────────────────────────────────────────────

export function configStorageKey(extensionId: string): string {
  return `concord.ext.${extensionId}.config`
}

// ─── Read / write ─────────────────────────────────────────────────────────

export function readConfig(store: KVStore, extensionId: string): ConfigValues {
  const raw = store.getItem(configStorageKey(extensionId))
  if (raw === null) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    const out: ConfigValues = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeConfig(store: KVStore, extensionId: string, values: ConfigValues): void {
  store.setItem(configStorageKey(extensionId), JSON.stringify(values))
}

export function clearConfig(store: KVStore, extensionId: string): void {
  store.removeItem(configStorageKey(extensionId))
}

// ─── Validation ───────────────────────────────────────────────────────────

export function validateConfig(spec: ConfigSpec, values: ConfigValues): ConfigErrors {
  const errors: ConfigErrors = {}
  for (const field of spec.fields) {
    const raw = values[field.key]
    const v = typeof raw === "string" ? raw.trim() : ""
    if (field.required && v.length === 0) {
      errors[field.key] = `${field.label} is required`
      continue
    }
    if (v.length === 0) continue // optional + empty = OK
    if (field.type === "url" && !isProbablyUrl(v)) {
      errors[field.key] = `${field.label} must be a valid URL`
    }
  }
  return errors
}

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────

/**
 * Mask a secret-type value for display: keep first 2 and last 2 chars,
 * replace the middle with asterisks. Short values become all asterisks.
 */
export function maskSecret(value: string): string {
  if (value.length === 0) return ""
  if (value.length <= 4) return "*".repeat(value.length)
  return value.slice(0, 2) + "*".repeat(Math.max(4, value.length - 4)) + value.slice(-2)
}

// ─── Default Worldview config spec ────────────────────────────────────────

export const WORLDVIEW_CONFIG_SPEC: ConfigSpec = {
  extensionId: "com.concord.worldview",
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "secret",
      help: "External service API key used by Worldview integrations.",
      required: false,
    },
    {
      key: "serviceUrl",
      label: "Service URL",
      type: "url",
      help: "Base URL of the external service (https://...).",
      required: false,
    },
    {
      key: "displayName",
      label: "Display Name",
      type: "string",
      help: "Optional override for how Worldview labels you.",
      required: false,
    },
  ],
}
