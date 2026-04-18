/**
 * Immutable state-tree path operations.
 *
 * Paths use dotted keys with array index brackets:
 *   "suspects[0].alive"
 *   "clock"
 *   "phase"
 */

import type { StateTree, StateValue } from "../types"

export type PathSegment = { kind: "key"; key: string } | { kind: "index"; index: number }

export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  let i = 0
  let buf = ""
  while (i < path.length) {
    const c = path[i]
    if (c === ".") {
      if (buf.length > 0) {
        segments.push({ kind: "key", key: buf })
        buf = ""
      }
      i++
    } else if (c === "[") {
      if (buf.length > 0) {
        segments.push({ kind: "key", key: buf })
        buf = ""
      }
      const close = path.indexOf("]", i)
      if (close < 0) throw new Error(`unterminated index in path: ${path}`)
      const idxStr = path.slice(i + 1, close)
      const idx = parseInt(idxStr, 10)
      if (!Number.isInteger(idx) || idx < 0) throw new Error(`bad index in path: ${path}`)
      segments.push({ kind: "index", index: idx })
      i = close + 1
    } else {
      buf += c
      i++
    }
  }
  if (buf.length > 0) segments.push({ kind: "key", key: buf })
  return segments
}

export function readPath(tree: StateTree, path: string): StateValue | undefined {
  const segs = parsePath(path)
  let current: StateValue = tree as StateValue
  for (const s of segs) {
    if (current === null || typeof current !== "object") return undefined
    if (s.kind === "key") {
      if (Array.isArray(current)) return undefined
      current = (current as { [k: string]: StateValue })[s.key]
      if (current === undefined) return undefined
    } else {
      if (!Array.isArray(current)) return undefined
      current = current[s.index]
      if (current === undefined) return undefined
    }
  }
  return current
}

export function writePath(tree: StateTree, path: string, value: StateValue): StateTree {
  const segs = parsePath(path)
  if (segs.length === 0) throw new Error(`cannot write empty path`)

  function rec(node: StateValue, depth: number): StateValue {
    const seg = segs[depth]
    const isLeaf = depth === segs.length - 1
    if (seg.kind === "key") {
      const base: { [k: string]: StateValue } =
        node !== null && typeof node === "object" && !Array.isArray(node)
          ? { ...(node as { [k: string]: StateValue }) }
          : {}
      if (isLeaf) base[seg.key] = value
      else base[seg.key] = rec(base[seg.key] ?? null, depth + 1)
      return base
    } else {
      const base: StateValue[] = Array.isArray(node) ? [...node] : []
      while (base.length <= seg.index) base.push(null)
      if (isLeaf) base[seg.index] = value
      else base[seg.index] = rec(base[seg.index] ?? null, depth + 1)
      return base
    }
  }

  return rec(tree as StateValue, 0) as StateTree
}
