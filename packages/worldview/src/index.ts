/**
 * Worldview Extension — Concord INS-036 Reference Implementation.
 *
 * Pure logic functions (makeInitialState, applyInit, etc.) are exported for
 * unit testing. Module-level state and all DOM code are kept internal.
 *
 * @see docs/extensions/session-model.md
 * @see docs/extensions/shell-api.md
 * @see docs/extensions/ux-modes.md
 */

import {
  WORLDVIEW_CONFIG_SPEC,
  readConfig,
  writeConfig,
  clearConfig,
  validateConfig,
  maskSecret,
  type ConfigValues,
  type KVStore,
} from "./config"

// ─── Types (exported) ─────────────────────────────────────────────────────

export type Mode =
  | "shared"
  | "shared_readonly"
  | "shared_admin_input"
  | "per_user"
  | "hybrid"

export type Seat = "host" | "participant" | "observer" | "spectator"

export interface ConcordInitPayload {
  sessionId: string
  extensionId: string
  mode: Mode
  participantId: string
  seat: Seat
  surfaces: unknown[]
}

export interface ConcordParticipantJoinPayload {
  participantId: string
  seat: Seat
}

export interface ConcordParticipantLeavePayload {
  participantId: string
}

export interface ConcordHostTransferPayload {
  previousHostId: string
  newHostId: string
}

export type ConcordShellMessage =
  | { type: "concord:init"; payload: ConcordInitPayload; version: 1 }
  | { type: "concord:participant_join"; payload: ConcordParticipantJoinPayload; version: 1 }
  | { type: "concord:participant_leave"; payload: ConcordParticipantLeavePayload; version: 1 }
  | { type: "concord:host_transfer"; payload: ConcordHostTransferPayload; version: 1 }
  | { type: "concord:surface_resize"; payload: { surfaceId: string; widthPx: number; heightPx: number }; version: 1 }

export interface WorldviewState {
  sessionId: string | null
  mode: Mode
  myParticipantId: string | null
  mySeat: Seat
  counter: number
  participants: Map<string, Seat>
  host: string | null
}

// ─── Pure helpers (exported for testing) ──────────────────────────────────

export function makeInitialState(): WorldviewState {
  return {
    sessionId: null,
    mode: "shared",
    myParticipantId: null,
    mySeat: "participant",
    counter: 0,
    participants: new Map(),
    host: null,
  }
}

export function isConcordShellMessage(data: unknown): data is ConcordShellMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).type === "string" &&
    ((data as Record<string, unknown>).type as string).startsWith("concord:") &&
    (data as Record<string, unknown>).version === 1
  )
}

export function displayName(matrixUserId: string): string {
  return matrixUserId.split(":")[0].replace("@", "")
}

export function canIncrement(state: WorldviewState): boolean {
  if (state.mySeat === "observer" || state.mySeat === "spectator") return false
  if (state.mode === "shared_admin_input" && state.mySeat !== "host") return false
  if (state.mode === "shared_readonly") return false
  return true
}

export function canReset(state: WorldviewState): boolean {
  return state.mySeat === "host"
}

export function applyInit(prev: WorldviewState, payload: ConcordInitPayload): WorldviewState {
  const participants = new Map(prev.participants)
  participants.set(payload.participantId, payload.seat)
  return { ...prev, sessionId: payload.sessionId, mode: payload.mode, myParticipantId: payload.participantId, mySeat: payload.seat, participants }
}

export function applyParticipantJoin(prev: WorldviewState, payload: ConcordParticipantJoinPayload): WorldviewState {
  const participants = new Map(prev.participants)
  participants.set(payload.participantId, payload.seat)
  const host = payload.seat === "host" ? payload.participantId : prev.host
  return { ...prev, participants, host }
}

export function applyParticipantLeave(prev: WorldviewState, payload: ConcordParticipantLeavePayload): WorldviewState {
  const participants = new Map(prev.participants)
  participants.delete(payload.participantId)
  const host = prev.host === payload.participantId ? null : prev.host
  return { ...prev, participants, host }
}

export function applyHostTransfer(prev: WorldviewState, payload: ConcordHostTransferPayload): WorldviewState {
  const participants = new Map(prev.participants)
  if (participants.has(payload.previousHostId)) participants.set(payload.previousHostId, "participant")
  participants.set(payload.newHostId, "host")
  let mySeat = prev.mySeat
  if (payload.newHostId === prev.myParticipantId) mySeat = "host"
  else if (payload.previousHostId === prev.myParticipantId) mySeat = "participant"
  return { ...prev, host: payload.newHostId, participants, mySeat }
}

// ─── DOM helpers (internal) ───────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Partial<Record<string, string>>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v)
  if (text !== undefined) node.textContent = text
  return node
}

function renderDOM(state: WorldviewState): void {
  const root = document.getElementById("worldview-root")
  if (!root) return
  root.textContent = ""

  const header = el("header")
  header.appendChild(el("h1", {}, "Worldview"))
  const info = el("p", { class: "session-info" })
  info.appendChild(el("span", {}, "Session: "))
  info.appendChild(el("code", {}, state.sessionId ?? "—"))
  info.appendChild(document.createElement("br"))
  info.appendChild(el("span", {}, `Mode: ${state.mode} · Your seat: ${state.mySeat}`))
  info.appendChild(document.createElement("br"))
  info.appendChild(el("span", {}, `Host: ${state.host ? displayName(state.host) : "—"}`))
  header.appendChild(info)

  const settingsBtn = el("button", {
    id: "btn-settings",
    class: "btn btn-ghost",
    "aria-label": "Open settings",
  }, "Settings")
  settingsBtn.addEventListener("click", () => openConfigPanel())
  header.appendChild(settingsBtn)

  root.appendChild(header)

  const section = el("section", { class: "counter-section" })
  section.appendChild(el("div", { id: "counter-value", class: "counter-value" }, String(state.counter)))
  const actions = el("div", { class: "counter-actions" })
  if (canIncrement(state)) {
    const incBtn = el("button", { id: "btn-increment", class: "btn btn-primary" }, "+1")
    incBtn.addEventListener("click", handleIncrement)
    actions.appendChild(incBtn)
  }
  if (canReset(state)) {
    const resetBtn = el("button", { id: "btn-reset", class: "btn btn-danger" }, "Reset")
    resetBtn.addEventListener("click", handleReset)
    actions.appendChild(resetBtn)
  }
  if (!canIncrement(state) && !canReset(state)) {
    actions.appendChild(el("p", { class: "read-only-notice" }, `Read-only (${state.mySeat})`))
  }
  section.appendChild(actions)
  root.appendChild(section)

  const pSection = el("section", { class: "participants-section" })
  pSection.appendChild(el("h2", {}, `Participants (${state.participants.size})`))
  const pList = el("div", { class: "participant-list" })
  if (state.participants.size === 0) {
    pList.appendChild(el("em", {}, "No participants yet"))
  } else {
    for (const [id, seat] of state.participants.entries()) {
      pList.appendChild(el("span", { class: `participant ${seat}` }, `${displayName(id)} (${seat})`))
    }
  }
  pSection.appendChild(pList)
  root.appendChild(pSection)
}

// ─── Module state + action handlers (internal) ────────────────────────────

let state = makeInitialState()
let shellOrigin = "*"

function sendAction(action: string, data?: Record<string, unknown>): void {
  window.parent.postMessage({ type: "extension_action", action, data: data ?? {} }, shellOrigin)
}

function handleIncrement(): void {
  if (!canIncrement(state)) return
  state = { ...state, counter: state.counter + 1 }
  renderDOM(state)
  sendAction("send_state_events", { counter: state.counter })
}

function handleReset(): void {
  if (!canReset(state)) return
  state = { ...state, counter: 0 }
  renderDOM(state)
  sendAction("admin_commands", { op: "reset_counter" })
}

// ─── Config panel (INS-002) ───────────────────────────────────────────────

function getConfigStore(): KVStore | null {
  try {
    // Vitest runs tests via src/__tests__ with a jsdom environment that DOES
    // expose localStorage, but we guard anyway so code fails gracefully in
    // environments that don't.
    return typeof localStorage !== "undefined" ? localStorage : null
  } catch {
    return null
  }
}

function openConfigPanel(): void {
  const store = getConfigStore()
  if (!store) return
  const existing = document.getElementById("worldview-config-panel")
  if (existing) {
    existing.remove()
    return
  }

  const values: ConfigValues = { ...readConfig(store, WORLDVIEW_CONFIG_SPEC.extensionId) }

  const panel = el("div", {
    id: "worldview-config-panel",
    class: "config-panel",
    role: "dialog",
    "aria-label": "Worldview settings",
  })
  panel.appendChild(el("h2", {}, "Settings"))

  const form = document.createElement("form")
  form.addEventListener("submit", (e) => e.preventDefault())

  const inputsByKey = new Map<string, HTMLInputElement>()
  const errorSlotsByKey = new Map<string, HTMLElement>()

  for (const field of WORLDVIEW_CONFIG_SPEC.fields) {
    const row = el("div", { class: "config-row" })
    const label = el("label", { for: `cfg-${field.key}` }, field.label)
    row.appendChild(label)

    const input = el("input", {
      id: `cfg-${field.key}`,
      name: field.key,
      type: field.type === "secret" ? "password" : "text",
      value: values[field.key] ?? "",
      "data-field-type": field.type,
    }) as HTMLInputElement
    input.value = values[field.key] ?? ""
    input.addEventListener("input", () => {
      values[field.key] = input.value
    })
    row.appendChild(input)
    inputsByKey.set(field.key, input)

    if (field.type === "secret" && (values[field.key] ?? "").length > 0) {
      const mask = el("p", { class: "config-masked" }, `Stored: ${maskSecret(values[field.key] ?? "")}`)
      row.appendChild(mask)
    }
    if (field.help) row.appendChild(el("p", { class: "config-help" }, field.help))

    const err = el("p", { class: "config-error" })
    err.hidden = true
    errorSlotsByKey.set(field.key, err)
    row.appendChild(err)

    form.appendChild(row)
  }

  const actions = el("div", { class: "config-actions" })
  const saveBtn = el("button", { id: "btn-config-save", type: "button", class: "btn btn-primary" }, "Save")
  const clearBtn = el("button", { id: "btn-config-clear", type: "button", class: "btn btn-danger" }, "Clear")
  const cancelBtn = el("button", { id: "btn-config-cancel", type: "button", class: "btn btn-ghost" }, "Cancel")

  saveBtn.addEventListener("click", () => {
    const errors = validateConfig(WORLDVIEW_CONFIG_SPEC, values)
    // Reset error UI
    for (const slot of errorSlotsByKey.values()) {
      slot.textContent = ""
      slot.hidden = true
    }
    if (Object.keys(errors).length > 0) {
      for (const [k, msg] of Object.entries(errors)) {
        const slot = errorSlotsByKey.get(k)
        if (slot) {
          slot.textContent = msg
          slot.hidden = false
        }
      }
      return
    }
    writeConfig(store, WORLDVIEW_CONFIG_SPEC.extensionId, values)
    panel.remove()
  })

  clearBtn.addEventListener("click", () => {
    clearConfig(store, WORLDVIEW_CONFIG_SPEC.extensionId)
    for (const input of inputsByKey.values()) input.value = ""
    for (const k of Object.keys(values)) delete values[k]
  })

  cancelBtn.addEventListener("click", () => {
    panel.remove()
  })

  actions.appendChild(saveBtn)
  actions.appendChild(clearBtn)
  actions.appendChild(cancelBtn)
  form.appendChild(actions)

  panel.appendChild(form)

  const root = document.getElementById("worldview-root") ?? document.body
  root.appendChild(panel)
}

// ─── Bootstrap ────────────────────────────────────────────────────────────

window.addEventListener("message", (event: MessageEvent) => {
  if (shellOrigin === "*" && event.origin !== "") shellOrigin = event.origin
  if (!isConcordShellMessage(event.data)) return
  switch (event.data.type) {
    case "concord:init":
      state = applyInit(state, event.data.payload)
      break
    case "concord:participant_join":
      state = applyParticipantJoin(state, event.data.payload)
      break
    case "concord:participant_leave":
      state = applyParticipantLeave(state, event.data.payload)
      break
    case "concord:host_transfer":
      state = applyHostTransfer(state, event.data.payload)
      break
    case "concord:surface_resize": {
      const root = document.getElementById("worldview-root")
      if (root) root.classList.toggle("narrow", event.data.payload.widthPx < 400)
      return
    }
  }
  renderDOM(state)
})

document.addEventListener("DOMContentLoaded", () => renderDOM(state))
