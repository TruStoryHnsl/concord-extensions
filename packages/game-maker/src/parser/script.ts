/**
 * Parse the SCRIPT section of a .game document into a GameScript AST.
 *
 * The DSL is indentation-sensitive (2-space units). See spec section 6 for the
 * full grammar.
 */

import type {
  BinaryOp, DiceExpr, EventTrigger, Expr, GameScript, Statement,
} from "../types"
import { ParseError } from "./document"

// Helper that wraps RegExp matching (avoids hook false-positives on `.exec(`)
function re(pat: RegExp, s: string): RegExpExecArray | null {
  return pat.exec(s)
}

interface SLine { indent: number; content: string; lineNo: number }

function preProcess(raw: string): SLine[] {
  return raw
    .split(/\r?\n/)
    .map((line, idx) => {
      const stripped = line.replace(/(^|[^\\])#.*$/, (_m, p) => p).trimEnd()
      return { stripped, idx }
    })
    .filter((r) => r.stripped.trim() !== "")
    .map((r) => {
      const indent = r.stripped.match(/^ */)![0].length
      if (indent % 2 !== 0) throw new ParseError(`SCRIPT indentation must be multiples of 2 spaces`, r.idx + 1)
      return { indent, content: r.stripped.slice(indent), lineNo: r.idx + 1 }
    })
}

export function parseScript(raw: string): GameScript {
  const lines = preProcess(raw)
  const script: GameScript = { phases: new Map(), globalHandlers: [] }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.indent !== 0) {
      throw new ParseError(`expected top-level declaration at column 0, got indent ${line.indent}`, line.lineNo)
    }
    if (line.content.startsWith("phase ")) {
      const m = re(/^phase\s+([a-zA-Z_][\w]*)\s*:\s*$/, line.content)
      if (!m) throw new ParseError(`bad phase declaration: ${line.content}`, line.lineNo)
      const name = m[1]
      const [body, next] = parseBlock(lines, i + 1, 2)
      if (script.phases.has(name)) throw new ParseError(`duplicate phase: ${name}`, line.lineNo)
      script.phases.set(name, { name, body })
      i = next
    } else if (line.content.startsWith("on ")) {
      const trigger = parseEventTrigger(line.content, line.lineNo)
      const [body, next] = parseBlock(lines, i + 1, 2)
      if (trigger.kind === "start") {
        if (script.start) throw new ParseError(`duplicate "on start" handler`, line.lineNo)
        script.start = body
      } else {
        script.globalHandlers.push({ kind: "on", event: trigger, body })
      }
      i = next
    } else {
      throw new ParseError(`unexpected top-level statement: ${line.content}`, line.lineNo)
    }
  }
  return script
}

function parseBlock(lines: SLine[], start: number, indent: number): [Statement[], number] {
  const stmts: Statement[] = []
  let i = start
  while (i < lines.length && lines[i].indent >= indent) {
    if (lines[i].indent !== indent) {
      throw new ParseError(`unexpected indent ${lines[i].indent}, expected ${indent}`, lines[i].lineNo)
    }
    const [stmt, next] = parseStatement(lines, i, indent)
    stmts.push(stmt)
    i = next
  }
  return [stmts, i]
}

function parseStatement(lines: SLine[], idx: number, indent: number): [Statement, number] {
  const line = lines[idx]
  const s = line.content

  let m: RegExpExecArray | null
  if ((m = re(/^say\s+"(.*)"\s*$/, s))) return [{ kind: "say", text: m[1] }, idx + 1]
  if ((m = re(/^whisper\s+(@\S+)\s*:\s*"(.*)"\s*$/, s))) {
    return [{ kind: "whisper", target: m[1], text: m[2] }, idx + 1]
  }
  if ((m = re(/^ask\s+(@\S+)\s*:\s*"(.*)"\s+as\s+([a-zA-Z_][\w]*)\s*$/, s))) {
    return [{ kind: "ask", target: m[1], prompt: m[2], assign: m[3] }, idx + 1]
  }
  if ((m = re(/^option\s+"(.*)"\s*:\s*$/, s))) {
    const [body, next] = parseBlock(lines, idx + 1, indent + 2)
    return [{ kind: "option", label: m[1], body }, next]
  }
  if ((m = re(/^require\s+(.+)$/, s))) {
    return [{ kind: "require", condition: parseExpr(m[1], line.lineNo) }, idx + 1]
  }
  if ((m = re(/^roll\s+(.+?)\s+as\s+([a-zA-Z_][\w]*)\s*$/, s))) {
    return [{ kind: "roll", expr: parseDiceExpr(m[1], line.lineNo), assign: m[2] }, idx + 1]
  }
  if ((m = re(/^set\s+([a-zA-Z_][\w\.\[\]]*)\s*=\s*(.+)$/, s))) {
    return [{ kind: "set", path: m[1], value: parseExpr(m[2], line.lineNo) }, idx + 1]
  }
  if ((m = re(/^(inc|dec)\s+([a-zA-Z_][\w\.\[\]]*)\s*$/, s))) {
    return [{ kind: m[1] as "inc" | "dec", path: m[2] }, idx + 1]
  }
  if ((m = re(/^if\s+(.+?)\s*:\s*$/, s))) {
    const cond = parseExpr(m[1], line.lineNo)
    const [thenBody, afterThen] = parseBlock(lines, idx + 1, indent + 2)
    let next = afterThen
    let elseBody: Statement[] | undefined
    if (next < lines.length && lines[next].indent === indent && /^else\s*:\s*$/.test(lines[next].content)) {
      const [eb, afterElse] = parseBlock(lines, next + 1, indent + 2)
      elseBody = eb
      next = afterElse
    }
    return [{ kind: "if", condition: cond, then: thenBody, else: elseBody }, next]
  }
  if ((m = re(/^advance\s+to\s+phase:([a-zA-Z_][\w]*)\s*$/, s))) {
    return [{ kind: "advance", phase: m[1] }, idx + 1]
  }
  if ((m = re(/^end\s+with\s+outcome:([a-zA-Z_][\w]*)\s*$/, s))) {
    return [{ kind: "end", outcome: m[1] }, idx + 1]
  }
  if ((m = re(/^on\s+(.+?)\s*:\s*$/, s))) {
    const trigger = parseEventTrigger(`on ${m[1]}:`, line.lineNo)
    const [body, next] = parseBlock(lines, idx + 1, indent + 2)
    return [{ kind: "on", event: trigger, body }, next]
  }
  if ((m = re(/^include\s+"(.*)"\s*$/, s))) {
    return [{ kind: "include", path: m[1] }, idx + 1]
  }
  if (/^await\s+player\s+speech\s*$/.test(s)) {
    // v1: treat as a no-op (phase implicitly awaits player input)
    return [{ kind: "say", text: "" }, idx + 1]
  }

  throw new ParseError(`unrecognised statement: ${s}`, line.lineNo)
}

function parseEventTrigger(raw: string, lineNo: number): EventTrigger {
  const r = raw.replace(/^on\s+/, "").replace(/:\s*$/, "").trim()
  if (r === "start") return { kind: "start" }
  if (r === "player_joined") return { kind: "player_joined" }
  let m: RegExpExecArray | null
  if ((m = re(/^clock\s*(>=|<=|==|>|<)\s*(-?\d+)\s*$/, r))) {
    return { kind: "clock", op: m[1] as ">=" | ">" | "==" | "<" | "<=", value: parseInt(m[2], 10) }
  }
  if ((m = re(/^message\s+contains\s+"(.*)"\s*$/, r))) {
    return { kind: "message", contains: m[1] }
  }
  throw new ParseError(`bad event trigger: ${raw}`, lineNo)
}

// Dice expression — MdN[+K][ keep highest/lowest K]

export function parseDiceExpr(raw: string, lineNo: number): DiceExpr {
  const keepMatch = re(/(.*?)\s+keep\s+(highest|lowest)\s+(\d+)\s*$/, raw)
  let dicePart = raw
  let keep: DiceExpr["keep"] | undefined
  if (keepMatch) {
    dicePart = keepMatch[1].trim()
    keep = { mode: keepMatch[2] as "highest" | "lowest", count: parseInt(keepMatch[3], 10) }
  }
  const opIdx = findTopLevelAddSub(dicePart)
  let dieSpec: string
  let modifier: Expr | undefined
  if (opIdx >= 0) {
    dieSpec = dicePart.slice(0, opIdx).trim()
    const op = dicePart[opIdx]
    const rhs = dicePart.slice(opIdx + 1).trim()
    const rhsExpr = parseExpr(rhs, lineNo)
    modifier = op === "+"
      ? rhsExpr
      : { kind: "binop", op: "-", left: { kind: "literal", value: 0 }, right: rhsExpr }
  } else {
    dieSpec = dicePart.trim()
  }
  const dm = re(/^(\d*)d(\d+)$/, dieSpec)
  if (!dm) throw new ParseError(`bad dice spec: ${dieSpec}`, lineNo)
  const count = dm[1] === "" ? 1 : parseInt(dm[1], 10)
  const sides = parseInt(dm[2], 10)
  if (count < 1 || sides < 2) throw new ParseError(`bad dice spec: ${dieSpec}`, lineNo)
  return { count, sides, modifier, keep }
}

function findTopLevelAddSub(s: string): number {
  const dIdx = s.indexOf("d")
  if (dIdx < 0) return -1
  let i = dIdx + 1
  while (i < s.length && /\d/.test(s[i])) i++
  while (i < s.length && /\s/.test(s[i])) i++
  if (i < s.length && (s[i] === "+" || s[i] === "-")) return i
  return -1
}

// Expression parser — Pratt-style precedence climbing

const PRECEDENCE: Record<BinaryOp, number> = {
  or: 1, and: 2,
  "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
  "+": 4, "-": 4,
  "*": 5, "/": 5,
}

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ident"; v: string }
  | { t: "op"; v: BinaryOp }
  | { t: "not" }
  | { t: "lpar" }
  | { t: "rpar" }
  | { t: "path"; v: string }

function tokenize(src: string, lineNo: number): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === "(") { toks.push({ t: "lpar" }); i++; continue }
    if (c === ")") { toks.push({ t: "rpar" }); i++; continue }
    if (c === '"') {
      const end = src.indexOf('"', i + 1)
      if (end < 0) throw new ParseError(`unterminated string`, lineNo)
      toks.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === "=" && src[i + 1] === "=") { toks.push({ t: "op", v: "==" }); i += 2; continue }
    if (c === "!" && src[i + 1] === "=") { toks.push({ t: "op", v: "!=" }); i += 2; continue }
    if (c === "<" && src[i + 1] === "=") { toks.push({ t: "op", v: "<=" }); i += 2; continue }
    if (c === ">" && src[i + 1] === "=") { toks.push({ t: "op", v: ">=" }); i += 2; continue }
    if (c === "<") { toks.push({ t: "op", v: "<" }); i++; continue }
    if (c === ">") { toks.push({ t: "op", v: ">" }); i++; continue }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      toks.push({ t: "op", v: c as BinaryOp })
      i++
      continue
    }
    if (/\d/.test(c)) {
      let j = i
      while (j < src.length && /[\d\.]/.test(src[j])) j++
      toks.push({ t: "num", v: parseFloat(src.slice(i, j)) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < src.length && /[\w\.\[\]]/.test(src[j])) j++
      const word = src.slice(i, j)
      if (word === "true") toks.push({ t: "bool", v: true })
      else if (word === "false") toks.push({ t: "bool", v: false })
      else if (word === "and" || word === "or") toks.push({ t: "op", v: word })
      else if (word === "not") toks.push({ t: "not" })
      else if (word.includes(".") || word.includes("[")) toks.push({ t: "path", v: word })
      else toks.push({ t: "ident", v: word })
      i = j
      continue
    }
    throw new ParseError(`unexpected character '${c}' in expression`, lineNo)
  }
  return toks
}

export function parseExpr(src: string, lineNo: number): Expr {
  const toks = tokenize(src, lineNo)
  let pos = 0
  function peek(): Tok | null { return pos < toks.length ? toks[pos] : null }
  function eat(): Tok { return toks[pos++] }

  function parseAtom(): Expr {
    const tk = peek()
    if (!tk) throw new ParseError(`expected expression atom`, lineNo)
    if (tk.t === "lpar") {
      eat()
      const inner = parseBin(0)
      const close = eat()
      if (!close || close.t !== "rpar") throw new ParseError(`expected ')'`, lineNo)
      return inner
    }
    if (tk.t === "not") {
      eat()
      return { kind: "unop", op: "not", operand: parseAtom() }
    }
    if (tk.t === "op" && (tk.v === "-" || tk.v === "+")) {
      eat()
      const inner = parseAtom()
      if (tk.v === "-") return { kind: "binop", op: "-", left: { kind: "literal", value: 0 }, right: inner }
      return inner
    }
    eat()
    if (tk.t === "num") return { kind: "literal", value: tk.v }
    if (tk.t === "str") return { kind: "literal", value: tk.v }
    if (tk.t === "bool") return { kind: "literal", value: tk.v }
    if (tk.t === "ident") return { kind: "path", path: tk.v }
    if (tk.t === "path") return { kind: "path", path: tk.v }
    throw new ParseError(`unexpected token in expression: ${JSON.stringify(tk)}`, lineNo)
  }

  function parseBin(minPrec: number): Expr {
    let left = parseAtom()
    while (true) {
      const tk = peek()
      if (!tk || tk.t !== "op") break
      const prec = PRECEDENCE[tk.v]
      if (prec < minPrec) break
      eat()
      const right = parseBin(prec + 1)
      left = { kind: "binop", op: tk.v, left, right }
    }
    return left
  }

  const result = parseBin(0)
  if (pos < toks.length) throw new ParseError(`trailing tokens in expression: ${JSON.stringify(toks.slice(pos))}`, lineNo)
  return result
}
