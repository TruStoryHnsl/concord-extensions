/**
 * Setup-wizard FSM + render functions (INS-009 W9).
 *
 * Two distinct layers in this module:
 *
 *  1) `createSetupMachine(...)` is a PURE state machine. Every transition
 *     is a pure function of (state, event). The machine doesn't touch
 *     the DOM and doesn't import jsdom. It can be unit-tested directly:
 *     drive events at it, assert the resulting state. No render contract,
 *     no browser. (See §10.2 of the spec.)
 *
 *  2) `mountSetupWizard(...)` is the DOM driver. It owns one root
 *     element, subscribes to the machine, and rerenders by dispatching
 *     to a per-state render function. Each render function takes the
 *     machine's `send` callback so user input dispatches events back in.
 *
 * Why split: a same-session test can hammer the FSM through every error
 * path, every retry, every preserve-fields-after-failure case without
 * spinning up jsdom. The DOM layer then only needs a couple of smoke
 * tests confirming "render(state) attaches the right inputs" — the
 * combinatorics live in the pure layer.
 *
 * State graph (per PLAN.md):
 *
 *   detecting --probeOk(completed=true)--> connected
 *   detecting --probeOk(completed=false)--> wizardWelcome
 *   detecting --probeError--> serverPrompt
 *   serverPrompt --submitUrl--> detecting
 *   wizardWelcome --next--> wizardAdmin    (after Configuration POST)
 *   wizardAdmin --next--> wizardLibrary    (after User POST)
 *   wizardLibrary --next/skip--> wizardRemote (after optional VirtualFolder)
 *   wizardRemote --next--> wizardFinalizing (after RemoteAccess + Complete + auth)
 *   wizardFinalizing --done--> connected (calls onConnected with AuthSession)
 *   any wizard step --error--> wizardError(reason, returnTo)
 *   wizardError --retry--> returnTo (with fields preserved)
 *
 * If a probe between steps reveals StartupWizardCompleted=true (someone
 * else completed setup out-of-band), the machine jumps to the connect
 * form so the user re-enters their pre-existing creds rather than
 * trying to create a new admin against a finalized server.
 */

import type { FetchLike } from "../engine/auth"
import { authenticateByName } from "../engine/auth"
import type { AuthSession, ServerConfig } from "../engine/types"
import {
  OrrdiaSetupError,
  probeStartupState,
  submitStartupComplete,
  submitStartupConfiguration,
  submitStartupRemoteAccess,
  submitStartupUser,
  submitVirtualFolder,
  type StartupProbe,
} from "../engine/jellyfin-setup"
import { clearChildren } from "./dom-util"

export type WizardStateName =
  | "detecting"
  | "serverPrompt"
  | "wizardWelcome"
  | "wizardAdmin"
  | "wizardLibrary"
  | "wizardRemote"
  | "wizardFinalizing"
  | "wizardError"
  | "connected"

export interface AdminFields {
  name: string
  password: string
  confirm: string
}

export interface LibraryFields {
  /** Empty string means "skip" — treat as no library to add. */
  name: string
  collectionType: string // "movies" | "tvshows" | "music" | ...
  path: string
}

export interface RemoteFields {
  enableRemoteAccess: boolean
}

/**
 * The full state value. The machine carries enough context to redraw
 * any state from scratch, including preserving partial inputs across
 * error retries.
 */
export interface WizardState {
  name: WizardStateName
  /** Server URL the wizard is operating against (post-probe). */
  baseUrl: string
  /** Last successful probe — undefined until first probe completes. */
  probe?: StartupProbe
  /** Preserved across step-failures so the user doesn't re-type. */
  admin: AdminFields
  library: LibraryFields
  remote: RemoteFields
  /** Set on `wizardError`; cleared on retry. */
  errorMessage?: string
  /** State to return to when the user clicks Retry on a wizardError. */
  errorReturnTo?: WizardStateName
  /** Set on `connected`; the auth session handed back to the host. */
  session?: AuthSession
  /** Last typed but unsubmitted server URL when in serverPrompt state. */
  serverPromptValue: string
  /** Last in-flight error from probe (kept on serverPrompt for inline UI). */
  probeError?: string
}

export type WizardEvent =
  | { type: "PROBE_OK"; probe: StartupProbe }
  | { type: "PROBE_FAIL"; reason: string }
  | { type: "URL_SUBMIT"; baseUrl: string }
  | { type: "URL_CHANGE"; baseUrl: string }
  | { type: "WELCOME_CONTINUE" }
  | { type: "ADMIN_SUBMIT"; admin: AdminFields }
  | { type: "LIBRARY_SUBMIT"; library: LibraryFields }
  | { type: "LIBRARY_SKIP" }
  | { type: "REMOTE_SUBMIT"; remote: RemoteFields }
  | { type: "FINALIZE_DONE"; session: AuthSession }
  | { type: "STEP_ERROR"; reason: string; returnTo: WizardStateName }
  | { type: "RETRY" }
  | { type: "RESET_TO_PROMPT" }

export const WIZARD_INITIAL_ADMIN: AdminFields = { name: "", password: "", confirm: "" }
export const WIZARD_INITIAL_LIBRARY: LibraryFields = { name: "", collectionType: "movies", path: "" }
export const WIZARD_INITIAL_REMOTE: RemoteFields = { enableRemoteAccess: false }

export function createInitialState(initialBaseUrl = ""): WizardState {
  return {
    name: initialBaseUrl ? "detecting" : "serverPrompt",
    baseUrl: initialBaseUrl,
    admin: { ...WIZARD_INITIAL_ADMIN },
    library: { ...WIZARD_INITIAL_LIBRARY },
    remote: { ...WIZARD_INITIAL_REMOTE },
    serverPromptValue: initialBaseUrl,
  }
}

/**
 * Pure transition function. (state, event) -> nextState.
 *
 * No fetches happen here. The driver layer is responsible for kicking
 * off any side-effect implied by a state transition (e.g. when the
 * machine enters `detecting`, the driver issues a probe and dispatches
 * PROBE_OK or PROBE_FAIL).
 */
export function reduceWizard(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case "URL_CHANGE":
      return { ...state, serverPromptValue: event.baseUrl }

    case "URL_SUBMIT":
      return {
        ...state,
        baseUrl: event.baseUrl,
        serverPromptValue: event.baseUrl,
        name: "detecting",
        probeError: undefined,
      }

    case "PROBE_OK": {
      // Out-of-band completion guard: even if we had been mid-wizard,
      // a fresh probe revealing completed=true means the user should
      // hand off to the existing connect form.
      if (event.probe.startupCompleted) {
        return {
          ...state,
          probe: event.probe,
          // `connected` is the FSM's terminal value here — but the
          // driver translates this to "render the existing
          // mountServerConfig form" because no AuthSession exists yet.
          // We keep `name=connected` short-circuit semantics tight by
          // reusing it; the dispatcher (setup-or-connect) reads
          // probe.startupCompleted to choose its render path.
          name: "connected",
        }
      }
      return { ...state, probe: event.probe, name: "wizardWelcome" }
    }

    case "PROBE_FAIL":
      return { ...state, name: "serverPrompt", probeError: event.reason }

    case "WELCOME_CONTINUE":
      return { ...state, name: "wizardAdmin" }

    case "ADMIN_SUBMIT":
      return { ...state, admin: event.admin, name: "wizardLibrary" }

    case "LIBRARY_SUBMIT":
      return { ...state, library: event.library, name: "wizardRemote" }

    case "LIBRARY_SKIP":
      // Preserve any half-typed library fields in case the user backs
      // up and decides to fill it in (forward-only for v0.3.0, but the
      // FSM is structured so a Back button is a one-line addition).
      return { ...state, name: "wizardRemote" }

    case "REMOTE_SUBMIT":
      return { ...state, remote: event.remote, name: "wizardFinalizing" }

    case "FINALIZE_DONE":
      return { ...state, session: event.session, name: "connected" }

    case "STEP_ERROR":
      return {
        ...state,
        name: "wizardError",
        errorMessage: event.reason,
        errorReturnTo: event.returnTo,
      }

    case "RETRY":
      // Returning to the step that errored, with all field state
      // preserved. The step's render function reads from state.admin /
      // state.library / state.remote — those were never cleared.
      if (!state.errorReturnTo) return state
      return {
        ...state,
        name: state.errorReturnTo,
        errorMessage: undefined,
        errorReturnTo: undefined,
      }

    case "RESET_TO_PROMPT":
      return { ...state, name: "serverPrompt", probeError: undefined }

    default: {
      const _exhaustive: never = event
      void _exhaustive
      return state
    }
  }
}

/**
 * Decide whether the machine implies a side-effect. Pure: returns a
 * descriptor; the driver actually executes it. This is the single
 * coupling point between the FSM and the network layer — and it's
 * itself testable without doing any I/O.
 */
export type WizardEffect =
  | { kind: "none" }
  | { kind: "probe"; baseUrl: string }
  | { kind: "submitConfigAndAdvance"; baseUrl: string }
  | { kind: "submitAdminAndAdvance"; baseUrl: string; admin: AdminFields }
  | { kind: "submitLibraryAndAdvance"; admin: AdminFields; baseUrl: string; library: LibraryFields }
  | { kind: "submitRemoteAndFinalize"; baseUrl: string; admin: AdminFields; remote: RemoteFields }

export function effectFor(state: WizardState): WizardEffect {
  switch (state.name) {
    case "detecting":
      if (!state.baseUrl) return { kind: "none" }
      return { kind: "probe", baseUrl: state.baseUrl }
    // Welcome → Admin form: the Configuration POST is fire-and-advance,
    // dispatched on the user clicking "Continue". We model that as a
    // single combined effect issued at the moment of the click; the
    // driver maps it to: POST Configuration, then ADMIN form rendered.
    // Effects for click-driven steps are NOT auto-issued from the
    // current state — they're synthesized by the driver in response to
    // user actions. So `effectFor(wizardWelcome) === none` is correct.
    case "serverPrompt":
    case "wizardWelcome":
    case "wizardAdmin":
    case "wizardLibrary":
    case "wizardRemote":
    case "wizardFinalizing":
    case "wizardError":
    case "connected":
      return { kind: "none" }
    default: {
      const _exhaustive: never = state.name
      void _exhaustive
      return { kind: "none" }
    }
  }
}

// ---------------------------------------------------------------------------
// DOM driver
// ---------------------------------------------------------------------------

export interface MountSetupWizardOpts {
  /** Optional pre-filled server URL (e.g. from prior session). */
  initialBaseUrl?: string
  /**
   * Called when the wizard finishes and an AuthSession is in hand.
   * The host should swap the wizard out for the post-auth UI.
   */
  onConnected: (session: AuthSession) => void
  /**
   * Called when probe reveals `StartupWizardCompleted=true`. The host
   * should render the existing mountServerConfig form so the user can
   * enter their pre-existing creds. The baseUrl is passed through so
   * the form can pre-fill it.
   */
  onAlreadyCompleted: (baseUrl: string) => void
  /** Injected fetch for tests. */
  fetchImpl?: FetchLike
  /**
   * Defaults for /Startup/Configuration. Spec §3 lists en-US/US/en
   * as a sane baseline. Surfaceable via an Advanced toggle later.
   */
  configDefaults?: {
    UICulture: string
    MetadataCountryCode: string
    PreferredMetadataLanguage: string
  }
}

export interface MountSetupWizardHandle {
  unmount: () => void
  /** Test hook — read the live FSM state. */
  getState: () => WizardState
  /** Test hook — drive events directly. */
  send: (event: WizardEvent) => void
}

const DEFAULT_CONFIG = {
  UICulture: "en-US",
  MetadataCountryCode: "US",
  PreferredMetadataLanguage: "en",
}

export function mountSetupWizard(
  root: HTMLElement,
  opts: MountSetupWizardOpts,
): MountSetupWizardHandle {
  const fetchImpl = opts.fetchImpl
  const configDefaults = opts.configDefaults ?? DEFAULT_CONFIG
  let state = createInitialState(opts.initialBaseUrl ?? "")

  function send(event: WizardEvent): void {
    const next = reduceWizard(state, event)
    state = next
    afterTransition()
    render()
  }

  function afterTransition(): void {
    // External-side-effect dispatcher. Keeps the reducer pure.
    if (state.name === "detecting" && state.baseUrl) {
      probeStartupState(state.baseUrl, { fetchImpl })
        .then((probe) => send({ type: "PROBE_OK", probe }))
        .catch((err) => send({ type: "PROBE_FAIL", reason: setupErrorMessage(err) }))
    }
    if (state.name === "connected") {
      // Two terminal subcases:
      //  - probe said completed=true and we have no session → hand off
      //    to the existing connect form via onAlreadyCompleted.
      //  - finalize step produced a session → onConnected.
      if (state.session) {
        opts.onConnected(state.session)
      } else if (state.probe?.startupCompleted) {
        opts.onAlreadyCompleted(state.baseUrl)
      }
    }
  }

  // ------- per-step click handlers (synthesize POSTs + dispatch) -------

  async function handleWelcomeContinue(): Promise<void> {
    try {
      await submitStartupConfiguration(state.baseUrl, configDefaults, { fetchImpl })
      send({ type: "WELCOME_CONTINUE" })
    } catch (err) {
      send({
        type: "STEP_ERROR",
        reason: setupErrorMessage(err),
        returnTo: "wizardWelcome",
      })
    }
  }

  async function handleAdminSubmit(admin: AdminFields): Promise<void> {
    try {
      await submitStartupUser(state.baseUrl, { Name: admin.name, Password: admin.password }, { fetchImpl })
      send({ type: "ADMIN_SUBMIT", admin })
    } catch (err) {
      // Preserve typed values in state.admin so retry redraws full form.
      state = { ...state, admin }
      send({
        type: "STEP_ERROR",
        reason: setupErrorMessage(err),
        returnTo: "wizardAdmin",
      })
    }
  }

  async function handleLibrarySubmit(library: LibraryFields): Promise<void> {
    // Skipping: empty name OR empty path. The library step is optional.
    if (!library.name.trim() || !library.path.trim()) {
      send({ type: "LIBRARY_SUBMIT", library })
      return
    }
    // Authentication is needed for /Library/VirtualFolders. The wizard
    // can't auth before /Startup/Complete, so VirtualFolder creation is
    // deferred until AFTER the finalize step succeeds. We just stash
    // the user's library choice and create it post-handoff.
    send({ type: "LIBRARY_SUBMIT", library })
  }

  function handleLibrarySkip(): void {
    send({ type: "LIBRARY_SKIP" })
  }

  async function handleRemoteSubmit(remote: RemoteFields): Promise<void> {
    state = { ...state, remote }
    send({ type: "REMOTE_SUBMIT", remote })
    // Now in wizardFinalizing — kick off the finalize chain.
    try {
      await submitStartupRemoteAccess(
        state.baseUrl,
        { EnableRemoteAccess: remote.enableRemoteAccess },
        { fetchImpl },
      )
      await submitStartupComplete(state.baseUrl, { fetchImpl })
      const session = await authenticateByName(
        {
          baseUrl: state.baseUrl,
          username: state.admin.name,
          password: state.admin.password,
        },
        { fetchImpl },
      )
      // Optional library creation post-auth. Failure here is non-fatal
      // — the user already has a working server; surface a soft warning
      // by completing anyway. Library management UI is out-of-scope.
      if (state.library.name.trim() && state.library.path.trim()) {
        try {
          await submitVirtualFolder(
            session,
            {
              Name: state.library.name.trim(),
              CollectionType: state.library.collectionType.trim() || "mixed",
              Paths: [state.library.path.trim()],
            },
            { fetchImpl },
          )
        } catch (libErr) {
          // Soft-warn via console; don't trap the user in an error
          // state when their core setup succeeded. Library can be
          // added later via the bridge UI (out-of-scope follow-up).
          // eslint-disable-next-line no-console
          console.warn("orrdia-bridge setup-wizard: library create failed", libErr)
        }
      }
      send({ type: "FINALIZE_DONE", session })
    } catch (err) {
      send({
        type: "STEP_ERROR",
        reason: setupErrorMessage(err),
        returnTo: "wizardRemote",
      })
    }
  }

  // ----------------------------- rendering -----------------------------

  function render(): void {
    // Note: when state.name === "connected", afterTransition() has
    // already handed off to onConnected / onAlreadyCompleted, which
    // may have unmounted us OR rendered something else into root.
    // Skip the clearChildren+render for that terminal case so we don't
    // wipe the parent's replacement render.
    if (state.name === "connected") return
    clearChildren(root)
    switch (state.name) {
      case "detecting":
        renderDetecting(root)
        break
      case "serverPrompt":
        renderServerPrompt(root, state, send)
        break
      case "wizardWelcome":
        renderWizardWelcome(root, state, handleWelcomeContinue)
        break
      case "wizardAdmin":
        renderWizardAdmin(root, state, handleAdminSubmit)
        break
      case "wizardLibrary":
        renderWizardLibrary(root, state, handleLibrarySubmit, handleLibrarySkip)
        break
      case "wizardRemote":
        renderWizardRemote(root, state, handleRemoteSubmit)
        break
      case "wizardFinalizing":
        renderFinalizing(root)
        break
      case "wizardError":
        renderWizardError(root, state, send)
        break
    }
  }

  // Initial render + initial side effect (probe if we have a URL).
  render()
  afterTransition()

  return {
    unmount: () => clearChildren(root),
    getState: () => state,
    send,
  }
}

// ---------------------------------------------------------------------------
// Render functions (one per state). Each is module-scope so it can be
// unit-tested independently if needed.
// ---------------------------------------------------------------------------

function makeInput(labelText: string, type: string, value: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement("label")
  label.style.display = "block"
  label.style.marginBottom = "0.5em"
  const span = document.createElement("span")
  span.textContent = labelText
  span.style.display = "block"
  label.appendChild(span)
  const input = document.createElement("input")
  input.type = type
  input.value = value
  input.style.width = "100%"
  input.style.padding = "0.4em"
  label.appendChild(input)
  return { label, input }
}

function makeErrBox(): HTMLDivElement {
  const box = document.createElement("div")
  box.className = "orrdia-error"
  box.style.color = "#c44"
  box.style.minHeight = "1.2em"
  return box
}

function renderDetecting(root: HTMLElement): void {
  const wrap = document.createElement("div")
  wrap.className = "orrdia-setup-detecting"
  const h = document.createElement("h2")
  h.textContent = "Connecting to orrdia…"
  wrap.appendChild(h)
  root.appendChild(wrap)
}

function renderServerPrompt(root: HTMLElement, state: WizardState, send: (e: WizardEvent) => void): void {
  const form = document.createElement("form")
  form.className = "orrdia-setup-server-prompt"
  const h = document.createElement("h2")
  h.textContent = "Where is orrdia?"
  form.appendChild(h)
  const p = document.createElement("p")
  p.textContent = "Enter the URL of your orrdia server (e.g. https://orrdia.example or http://192.168.1.100:8096)."
  form.appendChild(p)
  const url = makeInput("Server URL", "url", state.serverPromptValue || "")
  form.appendChild(url.label)
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = "Continue"
  form.appendChild(btn)
  const err = makeErrBox()
  if (state.probeError) err.textContent = state.probeError
  form.appendChild(err)
  url.input.addEventListener("input", () => {
    send({ type: "URL_CHANGE", baseUrl: url.input.value })
  })
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    const v = url.input.value.trim()
    if (!v) {
      err.textContent = "Server URL is required."
      return
    }
    send({ type: "URL_SUBMIT", baseUrl: v })
  })
  btn.addEventListener("click", () => form.dispatchEvent(new Event("submit", { cancelable: true })))
  root.appendChild(form)
}

function renderWizardWelcome(root: HTMLElement, state: WizardState, onContinue: () => void): void {
  const wrap = document.createElement("div")
  wrap.className = "orrdia-setup-welcome"
  const h = document.createElement("h2")
  h.textContent = "Set up orrdia"
  wrap.appendChild(h)
  const p = document.createElement("p")
  const product = state.probe?.productName ?? "orrdia"
  p.textContent = `${product} hasn't been configured yet. We'll set it up in a few quick steps.`
  wrap.appendChild(p)
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = "Set up orrdia"
  btn.addEventListener("click", () => onContinue())
  wrap.appendChild(btn)
  root.appendChild(wrap)
}

function renderWizardAdmin(
  root: HTMLElement,
  state: WizardState,
  onSubmit: (admin: AdminFields) => void,
): void {
  const form = document.createElement("form")
  form.className = "orrdia-setup-admin"
  const h = document.createElement("h2")
  h.textContent = "Create admin account"
  form.appendChild(h)
  const name = makeInput("Name", "text", state.admin.name)
  const pw = makeInput("Password", "password", state.admin.password)
  const confirm = makeInput("Confirm password", "password", state.admin.confirm)
  form.appendChild(name.label)
  form.appendChild(pw.label)
  form.appendChild(confirm.label)
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = "Create account"
  form.appendChild(btn)
  const err = makeErrBox()
  form.appendChild(err)
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    err.textContent = ""
    const next: AdminFields = {
      name: name.input.value.trim(),
      password: pw.input.value,
      confirm: confirm.input.value,
    }
    if (!next.name) {
      err.textContent = "Name is required."
      return
    }
    if (!next.password) {
      err.textContent = "Password is required."
      return
    }
    if (next.password !== next.confirm) {
      err.textContent = "Passwords do not match."
      return
    }
    onSubmit(next)
  })
  btn.addEventListener("click", () => form.dispatchEvent(new Event("submit", { cancelable: true })))
  root.appendChild(form)
}

function renderWizardLibrary(
  root: HTMLElement,
  state: WizardState,
  onSubmit: (library: LibraryFields) => void,
  onSkip: () => void,
): void {
  const form = document.createElement("form")
  form.className = "orrdia-setup-library"
  const h = document.createElement("h2")
  h.textContent = "Add a library (optional)"
  form.appendChild(h)
  const p = document.createElement("p")
  p.textContent = "You can add one library now, or skip and add libraries later."
  form.appendChild(p)
  const name = makeInput("Library name", "text", state.library.name)

  const typeLabel = document.createElement("label")
  typeLabel.style.display = "block"
  typeLabel.style.marginBottom = "0.5em"
  const typeSpan = document.createElement("span")
  typeSpan.textContent = "Library type"
  typeSpan.style.display = "block"
  typeLabel.appendChild(typeSpan)
  const typeSelect = document.createElement("select")
  typeSelect.style.width = "100%"
  typeSelect.style.padding = "0.4em"
  ;["movies", "tvshows", "music", "books", "homevideos", "musicvideos", "boxsets", "mixed"].forEach((t) => {
    const opt = document.createElement("option")
    opt.value = t
    opt.textContent = t
    if (t === state.library.collectionType) opt.selected = true
    typeSelect.appendChild(opt)
  })
  typeLabel.appendChild(typeSelect)

  const path = makeInput("Server path (e.g. /data/movies)", "text", state.library.path)
  form.appendChild(name.label)
  form.appendChild(typeLabel)
  form.appendChild(path.label)

  const submitBtn = document.createElement("button")
  submitBtn.type = "button"
  submitBtn.textContent = "Add library and continue"
  form.appendChild(submitBtn)

  const skipBtn = document.createElement("button")
  skipBtn.type = "button"
  skipBtn.textContent = "Skip"
  skipBtn.style.marginLeft = "0.5em"
  skipBtn.addEventListener("click", () => onSkip())
  form.appendChild(skipBtn)

  form.addEventListener("submit", (e) => {
    e.preventDefault()
    onSubmit({
      name: name.input.value,
      collectionType: typeSelect.value,
      path: path.input.value,
    })
  })
  submitBtn.addEventListener("click", () => form.dispatchEvent(new Event("submit", { cancelable: true })))
  root.appendChild(form)
}

function renderWizardRemote(
  root: HTMLElement,
  state: WizardState,
  onSubmit: (remote: RemoteFields) => void,
): void {
  const form = document.createElement("form")
  form.className = "orrdia-setup-remote"
  const h = document.createElement("h2")
  h.textContent = "Remote access"
  form.appendChild(h)
  const label = document.createElement("label")
  label.style.display = "block"
  label.style.marginBottom = "0.5em"
  const cb = document.createElement("input")
  cb.type = "checkbox"
  cb.checked = state.remote.enableRemoteAccess
  label.appendChild(cb)
  const span = document.createElement("span")
  span.textContent = " Allow remote access"
  span.style.marginLeft = "0.5em"
  label.appendChild(span)
  form.appendChild(label)
  const p = document.createElement("p")
  p.textContent = "Off keeps orrdia accessible only on your local network."
  p.style.fontSize = "0.85em"
  p.style.opacity = "0.75"
  form.appendChild(p)
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = "Finish setup"
  form.appendChild(btn)
  form.addEventListener("submit", (e) => {
    e.preventDefault()
    onSubmit({ enableRemoteAccess: cb.checked })
  })
  btn.addEventListener("click", () => form.dispatchEvent(new Event("submit", { cancelable: true })))
  root.appendChild(form)
}

function renderFinalizing(root: HTMLElement): void {
  const wrap = document.createElement("div")
  wrap.className = "orrdia-setup-finalizing"
  const h = document.createElement("h2")
  h.textContent = "Finishing setup…"
  wrap.appendChild(h)
  const p = document.createElement("p")
  p.textContent = "Creating your admin account, signing you in…"
  wrap.appendChild(p)
  root.appendChild(wrap)
}

function renderWizardError(root: HTMLElement, state: WizardState, send: (e: WizardEvent) => void): void {
  const wrap = document.createElement("div")
  wrap.className = "orrdia-setup-error"
  const h = document.createElement("h2")
  h.textContent = "Setup error"
  wrap.appendChild(h)
  const p = document.createElement("p")
  p.textContent = state.errorMessage ?? "Something went wrong."
  p.style.color = "#c44"
  wrap.appendChild(p)

  const retry = document.createElement("button")
  retry.type = "button"
  retry.textContent = "Retry"
  retry.addEventListener("click", () => send({ type: "RETRY" }))
  wrap.appendChild(retry)

  const reset = document.createElement("button")
  reset.type = "button"
  reset.textContent = "Change server URL"
  reset.style.marginLeft = "0.5em"
  reset.addEventListener("click", () => send({ type: "RESET_TO_PROMPT" }))
  wrap.appendChild(reset)

  root.appendChild(wrap)
}

function setupErrorMessage(err: unknown): string {
  if (err instanceof OrrdiaSetupError) {
    if (err.body) return `${err.body} (HTTP ${err.status})`
    return err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}
