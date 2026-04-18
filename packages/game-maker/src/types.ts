/**
 * Shared types for the Game Maker Protocol (INS-007).
 *
 * @see docs/extensions/game-maker-protocol.md
 */

// ─── Document ─────────────────────────────────────────────────────────────

export interface GameHeader {
  title: string
  author: string
  version: string
  mode: "chat" | "hybrid"
  min_players?: number
  max_players?: number
  tags?: string[]
  description?: string
  defer_to_human?: boolean
  clock_unit?: "turn" | "minute" | "message" | "manual"
  // Any header field the spec doesn't name is preserved verbatim.
  [key: string]: unknown
}

/** YAML-lite STATE tree. Values are primitives, records, or arrays of either. */
export type StateValue =
  | string
  | number
  | boolean
  | null
  | StateValue[]
  | { [key: string]: StateValue }

export type StateTree = { [key: string]: StateValue }

// ─── Script AST ───────────────────────────────────────────────────────────

export type Expr =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "path"; path: string }            // e.g. suspects[0].alive
  | { kind: "binop"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "unop"; op: "not"; operand: Expr }
  | { kind: "dice"; expr: DiceExpr }

export type BinaryOp =
  | "+" | "-" | "*" | "/"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "and" | "or"

/**
 * A dice roll expression. `modifier` may itself be any Expr — it is resolved
 * against the current state at roll time.
 */
export interface DiceExpr {
  count: number                   // M in MdN
  sides: number                   // N in MdN
  modifier?: Expr                 // + K  (any integer-valued expression)
  keep?: { mode: "highest" | "lowest"; count: number }
}

export type Statement =
  | { kind: "say"; text: string }
  | { kind: "whisper"; target: string; text: string }
  | { kind: "ask"; target: string; prompt: string; assign: string }
  | { kind: "option"; label: string; body: Statement[] }
  | { kind: "require"; condition: Expr }
  | { kind: "roll"; expr: DiceExpr; assign: string }
  | { kind: "set"; path: string; value: Expr }
  | { kind: "inc"; path: string }
  | { kind: "dec"; path: string }
  | { kind: "if"; condition: Expr; then: Statement[]; else?: Statement[] }
  | { kind: "advance"; phase: string }
  | { kind: "end"; outcome: string }
  | { kind: "on"; event: EventTrigger; body: Statement[] }
  | { kind: "include"; path: string }

export type EventTrigger =
  | { kind: "clock"; op: ">=" | ">" | "==" | "<" | "<="; value: number }
  | { kind: "message"; contains: string }
  | { kind: "player_joined" }
  | { kind: "start" }

export interface Phase {
  name: string
  body: Statement[]
}

export interface GameScript {
  /** `on start:` handler, if present. */
  start?: Statement[]
  phases: Map<string, Phase>
  /** Handlers declared outside phases — see docs §6.4 */
  globalHandlers: Extract<Statement, { kind: "on" }>[]
}

export interface GameDocument {
  header: GameHeader
  state: StateTree
  script: GameScript
}

// ─── Runtime ──────────────────────────────────────────────────────────────

/** One emitted output side-effect from the interpreter. */
export type NarratorEvent =
  | { kind: "say"; text: string }
  | { kind: "whisper"; target: string; text: string }
  | { kind: "ask"; target: string; prompt: string; assign: string }
  | { kind: "roll_transcript"; text: string }
  | { kind: "phase_entered"; phase: string }
  | { kind: "ended"; outcome: string }
  | { kind: "option_presented"; label: string }
  | { kind: "error"; message: string }

export interface SessionState {
  state: StateTree
  phase: string | null
  clock: number
  ended: boolean
  outcome: string | null
  /** Captured `ask`/`roll` variable bindings local to the current phase. */
  vars: { [name: string]: StateValue }
  /** Count of option presentations in this phase (for option cycling / debug). */
  optionPresentationCount: number
}

export interface RunResult {
  next: SessionState
  events: NarratorEvent[]
}
