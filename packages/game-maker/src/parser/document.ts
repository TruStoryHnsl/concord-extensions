/**
 * Parse a `.game` document into HEADER / STATE / SCRIPT sections.
 *
 * Format (spec section 4):
 *
 * ===== HEADER =====
 * key: value
 *
 * ===== STATE =====
 * <yaml-lite>
 *
 * ===== SCRIPT =====
 * <indentation-sensitive statements>
 *
 * The parser is deliberately strict: unknown sections, missing required header
 * keys, or out-of-order sections throw ParseError.
 */

import type { GameDocument, GameHeader, StateTree, StateValue } from "../types"
import { parseScript } from "./script"

export class ParseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(line != null ? `line ${line}: ${message}` : message)
    this.name = "ParseError"
  }
}

interface RawSections {
  header: string
  state: string
  script: string
}

const SECTION_RE = /^\s*=====\s*(HEADER|STATE|SCRIPT)\s*=====\s*$/

export function splitSections(src: string): RawSections {
  const lines = src.split(/\r?\n/)
  let current: "HEADER" | "STATE" | "SCRIPT" | null = null
  const buffers: Record<"HEADER" | "STATE" | "SCRIPT", string[]> = {
    HEADER: [],
    STATE: [],
    SCRIPT: [],
  }
  const seen = new Set<"HEADER" | "STATE" | "SCRIPT">()
  const order: Array<"HEADER" | "STATE" | "SCRIPT"> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = SECTION_RE.exec(line)
    if (m) {
      const name = m[1] as "HEADER" | "STATE" | "SCRIPT"
      if (seen.has(name)) throw new ParseError(`duplicate section ${name}`, i + 1)
      seen.add(name)
      order.push(name)
      current = name
      continue
    }
    if (current == null) {
      if (line.trim() === "") continue
      throw new ParseError(`content outside a section`, i + 1)
    }
    buffers[current].push(line)
  }
  if (!seen.has("HEADER")) throw new ParseError("missing HEADER section")
  if (!seen.has("STATE")) throw new ParseError("missing STATE section")
  if (!seen.has("SCRIPT")) throw new ParseError("missing SCRIPT section")
  const expected: Array<"HEADER" | "STATE" | "SCRIPT"> = ["HEADER", "STATE", "SCRIPT"]
  for (let i = 0; i < expected.length; i++) {
    if (order[i] !== expected[i]) {
      throw new ParseError(`sections out of order: expected HEADER -> STATE -> SCRIPT`)
    }
  }
  return {
    header: buffers.HEADER.join("\n"),
    state: buffers.STATE.join("\n"),
    script: buffers.SCRIPT.join("\n"),
  }
}

// HEADER

const REQUIRED_HEADER_KEYS: ReadonlyArray<keyof GameHeader> = ["title", "author", "version", "mode"]

export function parseHeader(raw: string): GameHeader {
  const out: Record<string, unknown> = {}
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, "").trimEnd()
    if (line.trim() === "") continue
    const m = /^([a-zA-Z_][\w]*)\s*:\s*(.*)$/.exec(line)
    if (!m) throw new ParseError(`bad header syntax: ${line}`)
    const key = m[1]
    const value = m[2].trim()
    out[key] = parseHeaderValue(key, value)
  }
  for (const k of REQUIRED_HEADER_KEYS) {
    if (out[k as string] === undefined) throw new ParseError(`missing required header key: ${k}`)
  }
  if (out.mode !== "chat" && out.mode !== "hybrid") {
    throw new ParseError(`header.mode must be "chat" or "hybrid", got ${JSON.stringify(out.mode)}`)
  }
  return out as GameHeader
}

function parseHeaderValue(key: string, v: string): unknown {
  if (key === "tags") {
    return v
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }
  if (key === "min_players" || key === "max_players") {
    const n = Number(v)
    if (!Number.isInteger(n)) throw new ParseError(`${key} must be an integer, got ${v}`)
    return n
  }
  if (key === "defer_to_human") {
    if (v === "true") return true
    if (v === "false") return false
    throw new ParseError(`defer_to_human must be true or false, got ${v}`)
  }
  return v
}

// STATE (yaml-lite)

export function parseState(raw: string): StateTree {
  const lines = preProcess(raw)
  const [value] = parseYamlLite(lines, 0, 0)
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ParseError("STATE section must be a mapping at the top level")
  }
  return value as StateTree
}

interface YLine { indent: number; content: string; lineNo: number }

function preProcess(raw: string): YLine[] {
  return raw
    .split(/\r?\n/)
    .map((line, idx) => {
      const stripped = line.replace(/#.*$/, "").trimEnd()
      return { stripped, idx }
    })
    .filter((r) => r.stripped.trim() !== "")
    .map((r) => {
      const indent = r.stripped.match(/^ */)![0].length
      if (indent % 2 !== 0) throw new ParseError(`STATE indentation must be multiples of 2 spaces`, r.idx + 1)
      return { indent, content: r.stripped.slice(indent), lineNo: r.idx + 1 }
    })
}

function parseYamlLite(lines: YLine[], start: number, indent: number): [StateValue, number] {
  if (start >= lines.length) return [null, start]
  const first = lines[start]
  if (first.indent < indent) return [null, start]
  if (first.content.startsWith("- ") || first.content === "-") {
    const arr: StateValue[] = []
    let i = start
    while (i < lines.length && lines[i].indent === indent && (lines[i].content.startsWith("- ") || lines[i].content === "-")) {
      const rest = lines[i].content === "-" ? "" : lines[i].content.slice(2)
      if (rest === "") {
        const [val, next] = parseYamlLite(lines, i + 1, indent + 2)
        arr.push(val)
        i = next
      } else if (/^[a-zA-Z_][\w]*\s*:/.test(rest)) {
        const mapping: { [k: string]: StateValue } = {}
        const m = /^([a-zA-Z_][\w]*)\s*:\s*(.*)$/.exec(rest)!
        const key = m[1]
        const val = m[2]
        if (val.trim() === "") {
          const [nested, next] = parseYamlLite(lines, i + 1, indent + 2)
          mapping[key] = nested
          i = next
        } else {
          mapping[key] = parseScalar(val)
          i++
        }
        while (i < lines.length && lines[i].indent === indent + 2 && !lines[i].content.startsWith("- ")) {
          const km = /^([a-zA-Z_][\w]*)\s*:\s*(.*)$/.exec(lines[i].content)
          if (!km) throw new ParseError(`bad mapping line: ${lines[i].content}`, lines[i].lineNo)
          const k2 = km[1]
          const v2 = km[2]
          if (v2.trim() === "") {
            const [nested, next] = parseYamlLite(lines, i + 1, indent + 4)
            mapping[k2] = nested
            i = next
          } else {
            mapping[k2] = parseScalar(v2)
            i++
          }
        }
        arr.push(mapping)
      } else {
        arr.push(parseScalar(rest))
        i++
      }
    }
    return [arr, i]
  }
  const mapping: { [k: string]: StateValue } = {}
  let i = start
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i]
    if (line.content.startsWith("- ")) break
    const m = /^([a-zA-Z_][\w]*)\s*:\s*(.*)$/.exec(line.content)
    if (!m) throw new ParseError(`bad mapping line: ${line.content}`, line.lineNo)
    const key = m[1]
    const val = m[2]
    if (val.trim() === "") {
      const [nested, next] = parseYamlLite(lines, i + 1, indent + 2)
      mapping[key] = nested
      i = next
    } else {
      mapping[key] = parseScalar(val)
      i++
    }
  }
  return [mapping, i]
}

function parseScalar(v: string): StateValue {
  const trimmed = v.trim()
  if (trimmed === "null" || trimmed === "") return null
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// Top-level

export function parseGameDocument(src: string): GameDocument {
  const sections = splitSections(src)
  const header = parseHeader(sections.header)
  const state = parseState(sections.state)
  const script = parseScript(sections.script)
  return { header, state, script }
}
