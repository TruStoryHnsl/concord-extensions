# Phase 0 — Scaffold + Worldview Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `concord-extensions` pnpm monorepo, migrate the `worldview` extension from `concord/ext/worldview/`, add tests, a pack script, and a GitHub Actions release pipeline.

**Architecture:** pnpm workspaces root with `packages/worldview/` as the first workspace. Each extension is an independent TypeScript + Vite project building to a static web app (HTML + JS bundle). Pure logic is exported from extension source files so it can be unit tested with vitest. GitHub Actions publishes `.zip` release artifacts on version tag pushes.

**Tech Stack:** pnpm workspaces, TypeScript 5.4, Vite 5, vitest 1.5, jsdom (test environment), GitHub Actions

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `pnpm-workspace.yaml` | Declares `packages/*` as workspaces |
| Create | `package.json` | Root private package, engine constraints |
| Create | `packages/worldview/manifest.json` | Extension metadata (id, version, pricing, entry, permissions) |
| Create | `packages/worldview/index.html` | Iframe entry point — mounts `#worldview-root`, loads TS module |
| Create | `packages/worldview/vite.config.ts` | Vite build config + vitest env |
| Create | `packages/worldview/package.json` | Package deps, dev/build/test/pack scripts |
| Create | `packages/worldview/tsconfig.json` | TS strict config targeting ES2020 + DOM |
| Migrate+refactor | `packages/worldview/src/index.ts` | Extension logic — pure functions exported for testing, DOM bootstrap internal |
| Create | `packages/worldview/src/__tests__/logic.test.ts` | Unit tests for all exported pure functions |
| Create | `packages/worldview/scripts/pack.mjs` | Copies manifest into dist, zips to `<id>@<version>.zip` |
| Create | `.github/workflows/release.yml` | On `concord-ext-worldview@*` tag: build + pack + GitHub Release |
| Note | `concord/ext/worldview/` | Remove from main concord repo after this plan is complete (separate commit in that repo) |

---

## Task 1: Scaffold monorepo root

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "concord-extensions",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 3: Install to verify workspace resolution**

Run: `pnpm install`
Expected: lockfile created, no errors. (`packages/` is empty so no workspace packages yet — that's fine.)

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspaces monorepo root"
```

---

## Task 2: Create worldview package skeleton

**Files:**
- Create: `packages/worldview/package.json`
- Create: `packages/worldview/tsconfig.json`
- Create: `packages/worldview/vite.config.ts`
- Create: `packages/worldview/manifest.json`
- Create: `packages/worldview/index.html`

- [ ] **Step 1: Create `packages/worldview/package.json`**

```json
{
  "name": "concord-ext-worldview",
  "version": "0.1.0",
  "description": "Worldview extension for Concord — reference implementation of the INS-036 session model",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "pack": "pnpm build && node scripts/pack.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^1.5.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/worldview/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2020", "DOM"],
    "noEmit": true
  },
  "include": ["src/**/*", "scripts/**/*", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `packages/worldview/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `packages/worldview/manifest.json`**

```json
{
  "id": "com.concord.worldview",
  "version": "0.1.0",
  "name": "Worldview",
  "description": "Shared counter reference implementation of the INS-036 extension session model.",
  "pricing": "free",
  "entry": "index.html",
  "permissions": ["state_events"],
  "minConcordVersion": "0.1.0"
}
```

- [ ] **Step 5: Create `packages/worldview/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Worldview</title>
</head>
<body>
  <div id="worldview-root"></div>
  <script type="module" src="/src/index.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Install workspace deps**

Run from repo root: `pnpm install`
Expected: `packages/worldview/node_modules/` populated, lockfile updated.

- [ ] **Step 7: Commit skeleton**

```bash
git add packages/worldview/package.json packages/worldview/tsconfig.json packages/worldview/vite.config.ts packages/worldview/manifest.json packages/worldview/index.html pnpm-lock.yaml
git commit -m "chore(worldview): add package skeleton with Vite + vitest"
```

---

## Task 3: Write failing tests for worldview pure logic

**Files:**
- Create: `packages/worldview/src/__tests__/logic.test.ts`

The tests import functions not yet exported from `src/index.ts`. They will fail at import time — that confirms the tests are wired correctly before the implementation exists.

- [ ] **Step 1: Create `packages/worldview/src/__tests__/logic.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  isConcordShellMessage,
  canIncrement,
  canReset,
  displayName,
  applyInit,
  applyParticipantJoin,
  applyParticipantLeave,
  applyHostTransfer,
  makeInitialState,
} from '../index'
import type { WorldviewState } from '../index'

describe('isConcordShellMessage', () => {
  it('accepts a valid concord:init message', () => {
    expect(isConcordShellMessage({ type: 'concord:init', payload: {}, version: 1 })).toBe(true)
  })
  it('rejects a non-concord type prefix', () => {
    expect(isConcordShellMessage({ type: 'other:thing', payload: {}, version: 1 })).toBe(false)
  })
  it('rejects version !== 1', () => {
    expect(isConcordShellMessage({ type: 'concord:init', payload: {}, version: 2 })).toBe(false)
  })
  it('rejects null', () => {
    expect(isConcordShellMessage(null)).toBe(false)
  })
  it('rejects missing type field', () => {
    expect(isConcordShellMessage({ payload: {}, version: 1 })).toBe(false)
  })
})

describe('displayName', () => {
  it('strips @ and server part from a full Matrix user ID', () => {
    expect(displayName('@alice:concord.app')).toBe('alice')
  })
  it('strips @ from a local-only ID', () => {
    expect(displayName('@bob')).toBe('bob')
  })
})

describe('canIncrement', () => {
  let base: WorldviewState
  beforeEach(() => { base = makeInitialState() })

  it('returns true for a participant in shared mode', () => {
    expect(canIncrement({ ...base, mySeat: 'participant', mode: 'shared' })).toBe(true)
  })
  it('returns false for an observer', () => {
    expect(canIncrement({ ...base, mySeat: 'observer', mode: 'shared' })).toBe(false)
  })
  it('returns false for a spectator', () => {
    expect(canIncrement({ ...base, mySeat: 'spectator', mode: 'shared' })).toBe(false)
  })
  it('returns false in shared_readonly mode even for host', () => {
    expect(canIncrement({ ...base, mySeat: 'host', mode: 'shared_readonly' })).toBe(false)
  })
  it('returns false for non-host in shared_admin_input mode', () => {
    expect(canIncrement({ ...base, mySeat: 'participant', mode: 'shared_admin_input' })).toBe(false)
  })
  it('returns true for host in shared_admin_input mode', () => {
    expect(canIncrement({ ...base, mySeat: 'host', mode: 'shared_admin_input' })).toBe(true)
  })
})

describe('canReset', () => {
  let base: WorldviewState
  beforeEach(() => { base = makeInitialState() })

  it('returns true for the host', () => {
    expect(canReset({ ...base, mySeat: 'host' })).toBe(true)
  })
  it('returns false for a participant', () => {
    expect(canReset({ ...base, mySeat: 'participant' })).toBe(false)
  })
  it('returns false for an observer', () => {
    expect(canReset({ ...base, mySeat: 'observer' })).toBe(false)
  })
})

describe('applyInit', () => {
  it('sets sessionId, mode, participantId, seat, and records participant', () => {
    const result = applyInit(makeInitialState(), {
      sessionId: 's1', extensionId: 'ext1', mode: 'shared',
      participantId: '@alice:concord.app', seat: 'host', surfaces: [],
    })
    expect(result.sessionId).toBe('s1')
    expect(result.mode).toBe('shared')
    expect(result.myParticipantId).toBe('@alice:concord.app')
    expect(result.mySeat).toBe('host')
    expect(result.participants.get('@alice:concord.app')).toBe('host')
  })
  it('does not mutate the previous state', () => {
    const base = makeInitialState()
    applyInit(base, {
      sessionId: 's1', extensionId: 'ext1', mode: 'shared',
      participantId: '@alice:concord.app', seat: 'host', surfaces: [],
    })
    expect(base.sessionId).toBeNull()
  })
})

describe('applyParticipantJoin', () => {
  it('adds a participant to the map', () => {
    const result = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'participant' })
    expect(result.participants.get('@bob:concord.app')).toBe('participant')
  })
  it('sets the host field when the joining seat is host', () => {
    const result = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'host' })
    expect(result.host).toBe('@bob:concord.app')
  })
  it('does not mutate the previous state', () => {
    const base = makeInitialState()
    applyParticipantJoin(base, { participantId: '@bob:concord.app', seat: 'participant' })
    expect(base.participants.size).toBe(0)
  })
})

describe('applyParticipantLeave', () => {
  it('removes the participant from the map', () => {
    const withBob = applyParticipantJoin(makeInitialState(), { participantId: '@bob:concord.app', seat: 'participant' })
    const result = applyParticipantLeave(withBob, { participantId: '@bob:concord.app' })
    expect(result.participants.has('@bob:concord.app')).toBe(false)
  })
  it('clears the host field when the current host leaves', () => {
    const base = { ...makeInitialState(), host: '@bob:concord.app' }
    const result = applyParticipantLeave(base, { participantId: '@bob:concord.app' })
    expect(result.host).toBeNull()
  })
  it('does not clear the host field when a non-host leaves', () => {
    const base = { ...makeInitialState(), host: '@alice:concord.app' }
    const result = applyParticipantLeave(base, { participantId: '@bob:concord.app' })
    expect(result.host).toBe('@alice:concord.app')
  })
})

describe('applyHostTransfer', () => {
  it('updates the host field and swaps seat values', () => {
    const base: WorldviewState = {
      ...makeInitialState(),
      host: '@alice:concord.app',
      participants: new Map([['@alice:concord.app', 'host'], ['@bob:concord.app', 'participant']]),
    }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.host).toBe('@bob:concord.app')
    expect(result.participants.get('@bob:concord.app')).toBe('host')
    expect(result.participants.get('@alice:concord.app')).toBe('participant')
  })
  it('promotes mySeat to host when I am the new host', () => {
    const base: WorldviewState = { ...makeInitialState(), myParticipantId: '@bob:concord.app', mySeat: 'participant' }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.mySeat).toBe('host')
  })
  it('demotes mySeat to participant when I was the previous host', () => {
    const base: WorldviewState = { ...makeInitialState(), myParticipantId: '@alice:concord.app', mySeat: 'host' }
    const result = applyHostTransfer(base, { previousHostId: '@alice:concord.app', newHostId: '@bob:concord.app' })
    expect(result.mySeat).toBe('participant')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `pnpm -C packages/worldview test`
Expected: import error (`isConcordShellMessage is not exported` or similar). This confirms the tests are wired before the exports exist.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/worldview/src/__tests__/logic.test.ts
git commit -m "test(worldview): add failing unit tests for pure logic exports"
```

---

## Task 4: Migrate and refactor `src/index.ts`

**Files:**
- Create: `packages/worldview/src/index.ts`

The key structural change: split the module into (a) exported pure functions — types, helpers, state transition functions — and (b) internal DOM + bootstrap code that calls those pure functions. State transitions are immutable: they take a `WorldviewState` value in and return a new `WorldviewState` out without mutating the input.

- [ ] **Step 1: Create `packages/worldview/src/index.ts`**

```typescript
/**
 * Worldview Extension — Concord INS-036 Reference Implementation.
 *
 * Pure logic functions (makeInitialState, applyInit, etc.) are exported for
 * unit testing. Module-level state and all DOM code are kept internal.
 *
 * @see docs/extensions/session-model.md
 * @see docs/extensions/shell-api.md
 */

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

function sendAction(action: string, data?: Record<string, unknown>): void {
  window.parent.postMessage({ type: "extension_action", action, data: data ?? {} }, "*")
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

// ─── Bootstrap ────────────────────────────────────────────────────────────

window.addEventListener("message", (event: MessageEvent) => {
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
```

- [ ] **Step 2: Run tests — confirm they pass**

Run: `pnpm -C packages/worldview test`
Expected: all suites pass, 0 failures.

- [ ] **Step 3: Run typecheck**

Run: `pnpm -C packages/worldview typecheck`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/worldview/src/index.ts
git commit -m "feat(worldview): migrate extension + export pure functions for testing"
```

---

## Task 5: Pack script

**Files:**
- Create: `packages/worldview/scripts/pack.mjs`
- Create: `packages/worldview/.gitignore`

- [ ] **Step 1: Create `packages/worldview/scripts/pack.mjs`**

```javascript
import { copyFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'))
const distDir = resolve(root, 'dist')
const outputName = `${manifest.id}@${manifest.version}.zip`
const outputPath = resolve(root, outputName)

if (!existsSync(distDir)) {
  console.error('dist/ not found — run pnpm build first')
  process.exit(1)
}

copyFileSync(resolve(root, 'manifest.json'), resolve(distDir, 'manifest.json'))

const result = spawnSync('zip', ['-r', outputPath, '.'], { cwd: distDir, stdio: 'inherit' })
if (result.status !== 0) {
  console.error('zip failed')
  process.exit(result.status ?? 1)
}

console.log(`Packed: ${outputName}`)
```

- [ ] **Step 2: Build and pack**

Run: `pnpm -C packages/worldview pack`
Expected: `dist/` is built, then `com.concord.worldview@0.1.0.zip` appears in `packages/worldview/`.

Verify zip contents:
```bash
unzip -l packages/worldview/com.concord.worldview@0.1.0.zip
```
Expected: at minimum `index.html`, `manifest.json`, and at least one `.js` file under `assets/`.

- [ ] **Step 3: Create `packages/worldview/.gitignore`**

```
dist/
*.zip
```

- [ ] **Step 4: Commit**

```bash
git add packages/worldview/scripts/pack.mjs packages/worldview/.gitignore
git commit -m "chore(worldview): add pack script — produces <id>@<version>.zip"
```

---

## Task 6: GitHub Actions release pipeline

**Files:**
- Create: `.github/workflows/release.yml`

Trigger: push of a tag matching `concord-ext-worldview@*`. Builds, tests, packs, and creates a GitHub Release with the `.zip` as an artifact.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release worldview

on:
  push:
    tags:
      - 'concord-ext-worldview@*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm -C packages/worldview test

      - name: Build and pack
        run: pnpm -C packages/worldview pack

      - name: Get artifact filename
        id: artifact
        run: |
          ID=$(node -p "require('./packages/worldview/manifest.json').id")
          VERSION=$(node -p "require('./packages/worldview/manifest.json').version")
          echo "filename=${ID}@${VERSION}.zip" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          files: packages/worldview/${{ steps.artifact.outputs.filename }}
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release pipeline for worldview"
```

- [ ] **Step 3: Tag and verify**

```bash
git tag concord-ext-worldview@0.1.0
git push origin concord-ext-worldview@0.1.0
```

Expected: Actions tab on GitHub shows `Release worldview` workflow running. On success, a GitHub Release is created with `com.concord.worldview@0.1.0.zip` attached.

---

## Task 7: Remove worldview from main concord repo

This task runs in the **`concord/` repo**, not this one.

- [ ] **Step 1: Delete `ext/worldview/` in the concord repo**

```bash
git -C /home/corr/projects/concord rm -r ext/worldview/
```

- [ ] **Step 2: Append migration note to `concord/PLAN.md`**

Find the INS-036 Wave 5 checked item and append:
```
  *Migration note (2026-04-17): worldview source moved to `concord-extensions` repo. `ext/worldview/` removed from this repo.*
```

- [ ] **Step 3: Commit in the concord repo**

```bash
git -C /home/corr/projects/concord commit -m "chore(ext): remove worldview — migrated to concord-extensions repo"
```
