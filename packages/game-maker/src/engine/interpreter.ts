/**
 * Game Maker Protocol interpreter.
 *
 * Pure functions over (SessionState, GameDocument, Statements, rng) → RunResult.
 * The interpreter never mutates input state — it produces a new SessionState
 * plus a list of NarratorEvents to emit.
 *
 * See docs/extensions/game-maker-protocol.md section 6 for the DSL spec.
 */

import type {
  DiceExpr, Expr, GameDocument, NarratorEvent, RunResult, SessionState,
  Statement, StateValue,
} from "../types"
import { readPath, writePath } from "./state"
import { describeRoll, rollDice } from "./dice"

export function makeInitialSession(doc: GameDocument): SessionState {
  return {
    state: doc.state,
    phase: null,
    clock: 0,
    ended: false,
    outcome: null,
    vars: {},
    optionPresentationCount: 0,
  }
}

/** Run the document's `on start` block, then enter the first phase found. */
export function start(doc: GameDocument, rng: () => number, options?: { rollerLabel?: string }): RunResult {
  let session = makeInitialSession(doc)
  const events: NarratorEvent[] = []
  if (doc.script.start) {
    const r = runStatements(doc, session, doc.script.start, rng, options)
    session = r.next
    events.push(...r.events)
  }
  if (!session.phase && !session.ended) {
    // If no `advance to phase:` ran, enter the first declared phase
    const first = doc.script.phases.keys().next()
    if (!first.done) {
      const r = enterPhase(doc, session, first.value, rng, options)
      session = r.next
      events.push(...r.events)
    }
  } else if (session.phase && !session.ended) {
    // `on start` already advanced into a phase via `advance to phase:` — the
    // enterPhase body ran as part of that statement. Just present options.
    const r = presentOptions(doc, session)
    session = r.next
    events.push(...r.events)
  }
  return { next: session, events }
}

/**
 * Choose one of the current phase's options by label. Runs the option's body;
 * if the body advances to a phase or ends the game, that happens here.
 * Automatically ticks clock for `clock_unit: turn`.
 */
export function chooseOption(
  doc: GameDocument,
  prev: SessionState,
  label: string,
  rng: () => number,
  options?: { rollerLabel?: string },
): RunResult {
  if (prev.ended) return { next: prev, events: [{ kind: "error", message: "session ended" }] }
  if (!prev.phase) return { next: prev, events: [{ kind: "error", message: "no active phase" }] }
  const phase = doc.script.phases.get(prev.phase)
  if (!phase) return { next: prev, events: [{ kind: "error", message: `unknown phase ${prev.phase}` }] }

  const opts = phase.body.filter((s): s is Extract<Statement, { kind: "option" }> => s.kind === "option")
  const chosen = opts.find((o) => o.label === label)
  if (!chosen) return { next: prev, events: [{ kind: "error", message: `no option "${label}" in phase ${prev.phase}` }] }

  let session = prev
  const events: NarratorEvent[] = []
  const r1 = runStatements(doc, session, chosen.body, rng, options)
  session = r1.next
  events.push(...r1.events)

  const clockUnit = doc.header.clock_unit ?? "turn"
  if (clockUnit === "turn" && !session.ended) {
    session = { ...session, clock: session.clock + 1 }
    const r2 = runGlobalClockHandlers(doc, session, rng, options)
    session = r2.next
    events.push(...r2.events)
  }
  if (!session.ended && session.phase) {
    const r3 = presentOptions(doc, session)
    session = r3.next
    events.push(...r3.events)
  }
  return { next: session, events }
}

/** Increment clock manually (clock_unit=manual, or GM /tick). */
export function tick(doc: GameDocument, prev: SessionState, rng: () => number): RunResult {
  if (prev.ended) return { next: prev, events: [] }
  let session = { ...prev, clock: prev.clock + 1 }
  const events: NarratorEvent[] = []
  const r = runGlobalClockHandlers(doc, session, rng)
  session = r.next
  events.push(...r.events)
  return { next: session, events }
}

function runGlobalClockHandlers(
  doc: GameDocument,
  prev: SessionState,
  rng: () => number,
  options?: { rollerLabel?: string },
): RunResult {
  let session = prev
  const events: NarratorEvent[] = []
  for (const h of doc.script.globalHandlers) {
    if (h.event.kind !== "clock") continue
    const v = h.event.value
    const c = session.clock
    const ok =
      (h.event.op === ">=" && c >= v) ||
      (h.event.op === ">" && c > v) ||
      (h.event.op === "==" && c === v) ||
      (h.event.op === "<" && c < v) ||
      (h.event.op === "<=" && c <= v)
    if (!ok) continue
    const r = runStatements(doc, session, h.body, rng, options)
    session = r.next
    events.push(...r.events)
    if (session.ended) break
  }
  return { next: session, events }
}

function enterPhase(
  doc: GameDocument,
  prev: SessionState,
  phaseName: string,
  rng: () => number,
  options?: { rollerLabel?: string },
): RunResult {
  const phase = doc.script.phases.get(phaseName)
  if (!phase) return { next: prev, events: [{ kind: "error", message: `unknown phase: ${phaseName}` }] }
  let session: SessionState = { ...prev, phase: phaseName, vars: {} }
  const events: NarratorEvent[] = [{ kind: "phase_entered", phase: phaseName }]
  // Run all body statements that are not declarative (option/on are declarative).
  const body = phase.body.filter((s) => s.kind !== "option" && s.kind !== "on")
  const r = runStatements(doc, session, body, rng, options)
  session = r.next
  events.push(...r.events)
  return { next: session, events }
}

function presentOptions(doc: GameDocument, prev: SessionState): RunResult {
  const phase = prev.phase ? doc.script.phases.get(prev.phase) : undefined
  if (!phase) return { next: prev, events: [] }
  const events: NarratorEvent[] = []
  let count = prev.optionPresentationCount
  for (const stmt of phase.body) {
    if (stmt.kind === "option") {
      events.push({ kind: "option_presented", label: stmt.label })
      count++
    }
  }
  return { next: { ...prev, optionPresentationCount: count }, events }
}

// -- core statement runner ------------------------------------------------

function runStatements(
  doc: GameDocument,
  prev: SessionState,
  stmts: Statement[],
  rng: () => number,
  options?: { rollerLabel?: string },
): RunResult {
  let session = prev
  const events: NarratorEvent[] = []
  for (const stmt of stmts) {
    if (session.ended) break
    const r = runOne(doc, session, stmt, rng, options)
    session = r.next
    events.push(...r.events)
  }
  return { next: session, events }
}

function runOne(
  doc: GameDocument,
  prev: SessionState,
  stmt: Statement,
  rng: () => number,
  options?: { rollerLabel?: string },
): RunResult {
  switch (stmt.kind) {
    case "say": {
      if (stmt.text === "") return { next: prev, events: [] } // await-player-speech stub
      return { next: prev, events: [{ kind: "say", text: stmt.text }] }
    }
    case "whisper":
      return { next: prev, events: [{ kind: "whisper", target: stmt.target, text: stmt.text }] }
    case "ask":
      return { next: prev, events: [{ kind: "ask", target: stmt.target, prompt: stmt.prompt, assign: stmt.assign }] }
    case "option":
      // options aren't directly executed here — they're listed by
      // presentOptions(). Skipping preserves declarative semantics.
      return { next: prev, events: [] }
    case "require": {
      const ok = toBool(evalExpr(stmt.condition, prev))
      if (!ok) return { next: prev, events: [{ kind: "error", message: "requirement not met" }] }
      return { next: prev, events: [] }
    }
    case "roll": {
      const modVal = stmt.expr.modifier ? toNumber(evalExpr(stmt.expr.modifier, prev)) : 0
      const result = rollDice(stmt.expr, modVal, rng)
      const vars = { ...prev.vars, [stmt.assign]: result.total }
      const transcript = describeRoll(stmt.expr, result, options?.rollerLabel)
      return { next: { ...prev, vars }, events: [{ kind: "roll_transcript", text: transcript }] }
    }
    case "set": {
      const value = evalExpr(stmt.value, prev)
      const next = { ...prev, state: writePath(prev.state, stmt.path, value) }
      return { next, events: [] }
    }
    case "inc": {
      const cur = toNumber(readPath(prev.state, stmt.path))
      const next = { ...prev, state: writePath(prev.state, stmt.path, cur + 1) }
      return { next, events: [] }
    }
    case "dec": {
      const cur = toNumber(readPath(prev.state, stmt.path))
      const next = { ...prev, state: writePath(prev.state, stmt.path, cur - 1) }
      return { next, events: [] }
    }
    case "if": {
      const ok = toBool(evalExpr(stmt.condition, prev))
      const body = ok ? stmt.then : stmt.else ?? []
      return runStatements(doc, prev, body, rng, options)
    }
    case "advance": {
      if (!doc.script.phases.has(stmt.phase)) {
        return { next: prev, events: [{ kind: "error", message: `unknown phase: ${stmt.phase}` }] }
      }
      return enterPhase(doc, prev, stmt.phase, rng, options)
    }
    case "end":
      return {
        next: { ...prev, ended: true, outcome: stmt.outcome },
        events: [{ kind: "ended", outcome: stmt.outcome }],
      }
    case "on":
      // Handlers declared inside a phase body are registered lazily; v1 only
      // supports global (top-level) handlers, which are collected at parse.
      return { next: prev, events: [] }
    case "include":
      return { next: prev, events: [{ kind: "error", message: "include not supported in v1" }] }
  }
}

// -- expression evaluator ------------------------------------------------

export function evalExpr(e: Expr, session: SessionState): StateValue {
  switch (e.kind) {
    case "literal":
      return e.value as StateValue
    case "path": {
      // local var binding wins over state path
      if (e.path in session.vars) return session.vars[e.path]
      // special well-known names
      if (e.path === "clock") return session.clock
      if (e.path === "phase") return session.phase
      const v = readPath(session.state, e.path)
      return v === undefined ? null : v
    }
    case "unop":
      return !toBool(evalExpr(e.operand, session))
    case "binop":
      return evalBinop(e.op, evalExpr(e.left, session), evalExpr(e.right, session))
    case "dice":
      throw new Error("dice literals are only valid in `roll <dice> as <var>` statements")
  }
}

function evalBinop(op: string, a: StateValue, b: StateValue): StateValue {
  switch (op) {
    case "+":
      if (typeof a === "string" || typeof b === "string") return String(a) + String(b)
      return toNumber(a) + toNumber(b)
    case "-": return toNumber(a) - toNumber(b)
    case "*": return toNumber(a) * toNumber(b)
    case "/": return toNumber(a) / toNumber(b)
    case "==": return deepEq(a, b)
    case "!=": return !deepEq(a, b)
    case "<": return toNumber(a) < toNumber(b)
    case "<=": return toNumber(a) <= toNumber(b)
    case ">": return toNumber(a) > toNumber(b)
    case ">=": return toNumber(a) >= toNumber(b)
    case "and": return toBool(a) && toBool(b)
    case "or": return toBool(a) || toBool(b)
  }
  throw new Error(`unknown binary op: ${op}`)
}

function deepEq(a: StateValue, b: StateValue): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((x, i) => deepEq(x, b[i]))
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    return ak.every((k) => deepEq(
      (a as { [k: string]: StateValue })[k],
      (b as { [k: string]: StateValue })[k],
    ))
  }
  return false
}

function toNumber(v: StateValue | undefined): number {
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toBool(v: StateValue | undefined): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v !== 0
  if (typeof v === "string") return v.length > 0
  if (v === null || v === undefined) return false
  return true
}

/**
 * Dispatch an inbound chat message against any global `on message contains`
 * handlers. Used by the DOM bootstrap; pure here for testability.
 */
export function handleMessage(
  doc: GameDocument,
  prev: SessionState,
  text: string,
  rng: () => number,
): RunResult {
  if (prev.ended) return { next: prev, events: [] }
  let session = prev
  const events: NarratorEvent[] = []
  for (const h of doc.script.globalHandlers) {
    if (h.event.kind !== "message") continue
    if (!text.includes(h.event.contains)) continue
    const r = runStatements(doc, session, h.body, rng)
    session = r.next
    events.push(...r.events)
    if (session.ended) break
  }
  if (doc.header.clock_unit === "message" && !session.ended) {
    session = { ...session, clock: session.clock + 1 }
    const r = runGlobalClockHandlers(doc, session, rng)
    session = r.next
    events.push(...r.events)
  }
  return { next: session, events }
}
