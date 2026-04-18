import { describe, it, expect, beforeEach } from "vitest"
import {
  KVStore,
  configStorageKey,
  readConfig,
  writeConfig,
  clearConfig,
  validateConfig,
  maskSecret,
  WORLDVIEW_CONFIG_SPEC,
  type ConfigSpec,
} from "../config"

class MemoryStore implements KVStore {
  private data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  rawSet(key: string, value: string): void {
    this.data.set(key, value)
  }
}

const EXT_ID = "com.concord.worldview"

describe("configStorageKey", () => {
  it("namespaces by extension id", () => {
    expect(configStorageKey("com.concord.worldview")).toBe("concord.ext.com.concord.worldview.config")
  })
})

describe("readConfig", () => {
  let store: MemoryStore
  beforeEach(() => {
    store = new MemoryStore()
  })

  it("returns an empty object when nothing is stored", () => {
    expect(readConfig(store, EXT_ID)).toEqual({})
  })

  it("returns stored string values", () => {
    writeConfig(store, EXT_ID, { apiKey: "abc", serviceUrl: "https://example.com" })
    expect(readConfig(store, EXT_ID)).toEqual({ apiKey: "abc", serviceUrl: "https://example.com" })
  })

  it("returns an empty object on malformed JSON", () => {
    store.rawSet(configStorageKey(EXT_ID), "not json {")
    expect(readConfig(store, EXT_ID)).toEqual({})
  })

  it("drops non-string values", () => {
    store.rawSet(configStorageKey(EXT_ID), JSON.stringify({ ok: "yes", n: 7, nested: { a: 1 } }))
    expect(readConfig(store, EXT_ID)).toEqual({ ok: "yes" })
  })

  it("returns an empty object when stored value is not an object", () => {
    store.rawSet(configStorageKey(EXT_ID), JSON.stringify(["a", "b"]))
    expect(readConfig(store, EXT_ID)).toEqual({})
  })
})

describe("writeConfig", () => {
  it("persists values under the namespaced key", () => {
    const store = new MemoryStore()
    writeConfig(store, EXT_ID, { apiKey: "k" })
    expect(store.getItem(configStorageKey(EXT_ID))).toBe(JSON.stringify({ apiKey: "k" }))
  })

  it("overwrites previous values", () => {
    const store = new MemoryStore()
    writeConfig(store, EXT_ID, { apiKey: "old" })
    writeConfig(store, EXT_ID, { apiKey: "new" })
    expect(readConfig(store, EXT_ID)).toEqual({ apiKey: "new" })
  })
})

describe("clearConfig", () => {
  it("removes the stored entry", () => {
    const store = new MemoryStore()
    writeConfig(store, EXT_ID, { apiKey: "k" })
    clearConfig(store, EXT_ID)
    expect(readConfig(store, EXT_ID)).toEqual({})
  })
})

describe("validateConfig", () => {
  const spec: ConfigSpec = {
    extensionId: "test",
    fields: [
      { key: "reqStr", label: "Req Str", type: "string", required: true },
      { key: "optUrl", label: "Opt URL", type: "url" },
      { key: "reqUrl", label: "Req URL", type: "url", required: true },
      { key: "sec", label: "Secret", type: "secret" },
    ],
  }

  it("returns empty errors when all required fields are present and valid", () => {
    const errors = validateConfig(spec, { reqStr: "x", reqUrl: "https://a.example" })
    expect(errors).toEqual({})
  })

  it("flags missing required fields", () => {
    const errors = validateConfig(spec, {})
    expect(errors.reqStr).toMatch(/required/i)
    expect(errors.reqUrl).toMatch(/required/i)
  })

  it("treats whitespace-only values as missing for required fields", () => {
    const errors = validateConfig(spec, { reqStr: "   ", reqUrl: "https://a.example" })
    expect(errors.reqStr).toMatch(/required/i)
    expect(errors.reqUrl).toBeUndefined()
  })

  it("rejects non-http(s) URLs", () => {
    const errors = validateConfig(spec, { reqStr: "x", reqUrl: "ftp://a.example" })
    expect(errors.reqUrl).toMatch(/valid URL/i)
  })

  it("rejects malformed URLs", () => {
    const errors = validateConfig(spec, { reqStr: "x", reqUrl: "not a url" })
    expect(errors.reqUrl).toMatch(/valid URL/i)
  })

  it("accepts an empty optional URL field", () => {
    const errors = validateConfig(spec, { reqStr: "x", reqUrl: "https://a.example", optUrl: "" })
    expect(errors.optUrl).toBeUndefined()
  })

  it("validates a non-empty optional URL field", () => {
    const errors = validateConfig(spec, { reqStr: "x", reqUrl: "https://a.example", optUrl: "nope" })
    expect(errors.optUrl).toMatch(/valid URL/i)
  })
})

describe("maskSecret", () => {
  it("returns empty string for empty input", () => {
    expect(maskSecret("")).toBe("")
  })
  it("masks entirely for short inputs", () => {
    expect(maskSecret("abcd")).toBe("****")
    expect(maskSecret("ab")).toBe("**")
  })
  it("keeps first 2 and last 2 chars for long inputs", () => {
    const m = maskSecret("abcdefgh")
    expect(m.startsWith("ab")).toBe(true)
    expect(m.endsWith("gh")).toBe(true)
    expect(m).toBe("ab****gh")
  })
  it("always produces at least 4 stars in the middle", () => {
    const m = maskSecret("abcde")
    expect(m).toBe("ab****de")
  })
})

describe("WORLDVIEW_CONFIG_SPEC", () => {
  it("declares the worldview extension id", () => {
    expect(WORLDVIEW_CONFIG_SPEC.extensionId).toBe("com.concord.worldview")
  })

  it("includes apiKey, serviceUrl, and displayName fields", () => {
    const keys = WORLDVIEW_CONFIG_SPEC.fields.map(f => f.key)
    expect(keys).toEqual(expect.arrayContaining(["apiKey", "serviceUrl", "displayName"]))
  })

  it("marks apiKey as secret and serviceUrl as url", () => {
    const byKey = Object.fromEntries(WORLDVIEW_CONFIG_SPEC.fields.map(f => [f.key, f]))
    expect(byKey.apiKey.type).toBe("secret")
    expect(byKey.serviceUrl.type).toBe("url")
  })

  it("validates cleanly on an empty values object (all fields optional)", () => {
    expect(validateConfig(WORLDVIEW_CONFIG_SPEC, {})).toEqual({})
  })
})
