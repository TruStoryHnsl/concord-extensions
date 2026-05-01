import { describe, expect, it, vi } from "vitest"
import {
  createInitialState,
  effectFor,
  mountSetupWizard,
  reduceWizard,
  WIZARD_INITIAL_ADMIN,
  WIZARD_INITIAL_LIBRARY,
  WIZARD_INITIAL_REMOTE,
  type WizardState,
} from "../setup-wizard"
import type { AuthSession } from "../../engine/types"

const session: AuthSession = {
  baseUrl: "https://o.example",
  userId: "u-1",
  accessToken: "tok-xyz",
  serverId: "srv",
  deviceId: "dev-1",
  clientName: "Concord-Orrdia-Bridge",
  clientVersion: "0.3.0",
  deviceName: "Concord",
}

// Synthesize Response objects for the injected fetch.
function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
function err(status: number, body: string): Response {
  return new Response(body, { status })
}

// Helper: wait for the FSM to settle by yielding to the microtask
// queue several times (for chained promises in the finalize step).
async function flushPromises(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

// ===========================================================================
// Pure FSM tests — drive (state, event) -> nextState directly.
// ===========================================================================

describe("createInitialState", () => {
  it("starts in serverPrompt when no URL is provided", () => {
    const s = createInitialState()
    expect(s.name).toBe("serverPrompt")
    expect(s.baseUrl).toBe("")
    expect(s.admin).toEqual(WIZARD_INITIAL_ADMIN)
    expect(s.library).toEqual(WIZARD_INITIAL_LIBRARY)
    expect(s.remote).toEqual(WIZARD_INITIAL_REMOTE)
  })

  it("starts in detecting when an initial URL is provided", () => {
    const s = createInitialState("https://o.example")
    expect(s.name).toBe("detecting")
    expect(s.baseUrl).toBe("https://o.example")
  })
})

describe("reduceWizard — happy path", () => {
  it("PROBE_OK(completed=false) → wizardWelcome", () => {
    const s = createInitialState("https://o.example")
    const next = reduceWizard(s, {
      type: "PROBE_OK",
      probe: { startupCompleted: false, productName: "Jellyfin Server" },
    })
    expect(next.name).toBe("wizardWelcome")
    expect(next.probe?.productName).toBe("Jellyfin Server")
  })

  it("PROBE_OK(completed=true) → connected (out-of-band complete handoff)", () => {
    const s = createInitialState("https://o.example")
    const next = reduceWizard(s, {
      type: "PROBE_OK",
      probe: { startupCompleted: true, productName: "Jellyfin Server" },
    })
    expect(next.name).toBe("connected")
    expect(next.probe?.startupCompleted).toBe(true)
  })

  it("walks the full happy path Welcome → Admin → Library → Remote → Finalizing → connected", () => {
    let s: WizardState = createInitialState("https://o.example")
    s = reduceWizard(s, { type: "PROBE_OK", probe: { startupCompleted: false } })
    expect(s.name).toBe("wizardWelcome")
    s = reduceWizard(s, { type: "WELCOME_CONTINUE" })
    expect(s.name).toBe("wizardAdmin")
    s = reduceWizard(s, {
      type: "ADMIN_SUBMIT",
      admin: { name: "alice", password: "hunter2", confirm: "hunter2" },
    })
    expect(s.name).toBe("wizardLibrary")
    expect(s.admin.name).toBe("alice")
    s = reduceWizard(s, {
      type: "LIBRARY_SUBMIT",
      library: { name: "Movies", collectionType: "movies", path: "/data/movies" },
    })
    expect(s.name).toBe("wizardRemote")
    expect(s.library.name).toBe("Movies")
    s = reduceWizard(s, {
      type: "REMOTE_SUBMIT",
      remote: { enableRemoteAccess: false },
    })
    expect(s.name).toBe("wizardFinalizing")
    s = reduceWizard(s, { type: "FINALIZE_DONE", session })
    expect(s.name).toBe("connected")
    expect(s.session).toBe(session)
  })

  it("LIBRARY_SKIP transitions to wizardRemote without recording library fields", () => {
    let s: WizardState = createInitialState("https://o.example")
    s = reduceWizard(s, { type: "PROBE_OK", probe: { startupCompleted: false } })
    s = reduceWizard(s, { type: "WELCOME_CONTINUE" })
    s = reduceWizard(s, {
      type: "ADMIN_SUBMIT",
      admin: { name: "a", password: "p", confirm: "p" },
    })
    s = reduceWizard(s, { type: "LIBRARY_SKIP" })
    expect(s.name).toBe("wizardRemote")
    expect(s.library.name).toBe("")
  })
})

describe("reduceWizard — error + retry", () => {
  it("STEP_ERROR moves to wizardError carrying returnTo", () => {
    let s: WizardState = createInitialState("https://o.example")
    s = reduceWizard(s, { type: "PROBE_OK", probe: { startupCompleted: false } })
    s = reduceWizard(s, { type: "WELCOME_CONTINUE" })
    s = reduceWizard(s, {
      type: "STEP_ERROR",
      reason: "Password too weak (HTTP 400)",
      returnTo: "wizardAdmin",
    })
    expect(s.name).toBe("wizardError")
    expect(s.errorMessage).toBe("Password too weak (HTTP 400)")
    expect(s.errorReturnTo).toBe("wizardAdmin")
  })

  it("RETRY returns to errorReturnTo with admin fields preserved", () => {
    let s: WizardState = createInitialState("https://o.example")
    s = reduceWizard(s, { type: "PROBE_OK", probe: { startupCompleted: false } })
    s = reduceWizard(s, { type: "WELCOME_CONTINUE" })
    // Driver normally writes admin into state before STEP_ERROR.
    s = { ...s, admin: { name: "alice", password: "weak", confirm: "weak" } }
    s = reduceWizard(s, {
      type: "STEP_ERROR",
      reason: "weak password",
      returnTo: "wizardAdmin",
    })
    expect(s.name).toBe("wizardError")
    s = reduceWizard(s, { type: "RETRY" })
    expect(s.name).toBe("wizardAdmin")
    expect(s.admin.name).toBe("alice")
    expect(s.admin.password).toBe("weak")
    expect(s.errorMessage).toBeUndefined()
    expect(s.errorReturnTo).toBeUndefined()
  })

  it("RETRY is a no-op if no errorReturnTo is set", () => {
    const s = createInitialState("https://o.example")
    expect(reduceWizard(s, { type: "RETRY" })).toEqual(s)
  })

  it("RESET_TO_PROMPT clears probe error and goes to serverPrompt", () => {
    let s: WizardState = createInitialState("https://o.example")
    s = reduceWizard(s, { type: "PROBE_FAIL", reason: "ENOTFOUND" })
    expect(s.name).toBe("serverPrompt")
    expect(s.probeError).toBe("ENOTFOUND")
    s = reduceWizard(s, { type: "RESET_TO_PROMPT" })
    expect(s.name).toBe("serverPrompt")
    expect(s.probeError).toBeUndefined()
  })
})

describe("reduceWizard — server URL editing", () => {
  it("URL_CHANGE buffers value without changing state name", () => {
    let s = createInitialState()
    s = reduceWizard(s, { type: "URL_CHANGE", baseUrl: "https://x" })
    expect(s.name).toBe("serverPrompt")
    expect(s.serverPromptValue).toBe("https://x")
  })

  it("URL_SUBMIT moves to detecting with the new URL", () => {
    let s = createInitialState()
    s = reduceWizard(s, { type: "URL_SUBMIT", baseUrl: "https://x" })
    expect(s.name).toBe("detecting")
    expect(s.baseUrl).toBe("https://x")
  })

  it("PROBE_FAIL drops back to serverPrompt with the failure reason", () => {
    let s = createInitialState("https://x")
    s = reduceWizard(s, { type: "PROBE_FAIL", reason: "DNS lookup failed" })
    expect(s.name).toBe("serverPrompt")
    expect(s.probeError).toBe("DNS lookup failed")
  })
})

describe("effectFor", () => {
  it("requests a probe in detecting state", () => {
    const s = createInitialState("https://o.example")
    expect(effectFor(s)).toEqual({ kind: "probe", baseUrl: "https://o.example" })
  })

  it("returns none in detecting if baseUrl is empty", () => {
    const s = createInitialState()
    s.name = "detecting"
    expect(effectFor(s)).toEqual({ kind: "none" })
  })

  it("returns none for click-driven steps (driver synthesizes side effects)", () => {
    const states: Array<WizardState["name"]> = [
      "serverPrompt",
      "wizardWelcome",
      "wizardAdmin",
      "wizardLibrary",
      "wizardRemote",
      "wizardFinalizing",
      "wizardError",
      "connected",
    ]
    for (const name of states) {
      const s = createInitialState("https://o.example")
      s.name = name
      expect(effectFor(s).kind).toBe("none")
    }
  })
})

// ===========================================================================
// Driver tests — exercise mountSetupWizard with injected fetch + jsdom.
// ===========================================================================

describe("mountSetupWizard — DOM driver", () => {
  it("renders detecting state immediately and probes the server", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () =>
      ok({ StartupWizardCompleted: false, ProductName: "Jellyfin Server" }),
    )
    const onConnected = vi.fn()
    const onAlreadyCompleted = vi.fn()
    const handle = mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected,
      onAlreadyCompleted,
      fetchImpl,
    })

    // First render is the detecting screen.
    expect(root.querySelector(".orrdia-setup-detecting")).not.toBeNull()
    expect(handle.getState().name).toBe("detecting")

    await flushPromises()
    expect(fetchImpl).toHaveBeenCalled()
    expect(handle.getState().name).toBe("wizardWelcome")
    expect(root.querySelector(".orrdia-setup-welcome")).not.toBeNull()
  })

  it("falls back to serverPrompt when the probe fails", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () => err(502, "bad gateway"))
    const handle = mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      onAlreadyCompleted: vi.fn(),
      fetchImpl,
    })

    await flushPromises()
    expect(handle.getState().name).toBe("serverPrompt")
    expect(handle.getState().probeError).toContain("502")
    expect(root.querySelector(".orrdia-setup-server-prompt")).not.toBeNull()
  })

  it("hands off to onAlreadyCompleted when probe says completed=true", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () =>
      ok({ StartupWizardCompleted: true, ProductName: "Jellyfin Server" }),
    )
    const onAlreadyCompleted = vi.fn()
    mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      onAlreadyCompleted,
      fetchImpl,
    })
    await flushPromises()
    expect(onAlreadyCompleted).toHaveBeenCalledWith("https://o.example")
  })

  it("calls /Startup/Configuration when the user clicks Continue from welcome", async () => {
    const root = document.createElement("div")
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: false })
      }
      if (url.endsWith("/Startup/Configuration")) {
        return new Response("{}", { status: 200 })
      }
      throw new Error("unexpected url " + url)
    })
    const handle = mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      onAlreadyCompleted: vi.fn(),
      fetchImpl,
    })
    await flushPromises()
    const btn = root.querySelector(".orrdia-setup-welcome button") as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    await flushPromises()
    expect(calls.some((u) => u.endsWith("/Startup/Configuration"))).toBe(true)
    expect(handle.getState().name).toBe("wizardAdmin")
  })

  it("on admin-submit failure, returns to wizardAdmin via Retry with values preserved", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: false })
      }
      if (url.endsWith("/Startup/Configuration")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/User")) return err(400, "Password too weak")
      throw new Error("unexpected url " + url)
    })
    const handle = mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      onAlreadyCompleted: vi.fn(),
      fetchImpl,
    })
    await flushPromises()
    // Welcome → Admin
    ;(root.querySelector(".orrdia-setup-welcome button") as HTMLButtonElement).click()
    await flushPromises()
    expect(handle.getState().name).toBe("wizardAdmin")

    // Fill admin form
    const inputs = root.querySelectorAll(".orrdia-setup-admin input")
    expect(inputs.length).toBe(3)
    ;(inputs[0] as HTMLInputElement).value = "alice"
    ;(inputs[1] as HTMLInputElement).value = "weakpw"
    ;(inputs[2] as HTMLInputElement).value = "weakpw"
    const form = root.querySelector(".orrdia-setup-admin") as HTMLFormElement
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await flushPromises()

    expect(handle.getState().name).toBe("wizardError")
    expect(handle.getState().errorMessage).toContain("Password too weak")
    expect(handle.getState().admin.name).toBe("alice")

    // Retry → returns to wizardAdmin with name still pre-filled
    const retryBtn = root.querySelectorAll(".orrdia-setup-error button")[0] as HTMLButtonElement
    retryBtn.click()
    expect(handle.getState().name).toBe("wizardAdmin")
    const refilled = root.querySelectorAll(".orrdia-setup-admin input")
    expect((refilled[0] as HTMLInputElement).value).toBe("alice")
    expect((refilled[1] as HTMLInputElement).value).toBe("weakpw")
  })

  it("walks the full happy path: probe → welcome → admin → skip-library → remote → finalize → onConnected", async () => {
    const root = document.createElement("div")
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: false, ProductName: "orrdia" })
      }
      if (url.endsWith("/Startup/Configuration")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/User")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/RemoteAccess")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/Complete")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Users/AuthenticateByName")) {
        return ok({
          User: { Id: "user-1", ServerId: "srv-1" },
          AccessToken: "tok-1",
          ServerId: "srv-1",
        })
      }
      throw new Error("unexpected url " + url)
    })
    const onConnected = vi.fn()
    const handle = mountSetupWizard(root, {
      initialBaseUrl: "https://o.example",
      onConnected,
      onAlreadyCompleted: vi.fn(),
      fetchImpl,
    })
    await flushPromises()
    ;(root.querySelector(".orrdia-setup-welcome button") as HTMLButtonElement).click()
    await flushPromises()
    const adminInputs = root.querySelectorAll(".orrdia-setup-admin input")
    ;(adminInputs[0] as HTMLInputElement).value = "alice"
    ;(adminInputs[1] as HTMLInputElement).value = "hunter2"
    ;(adminInputs[2] as HTMLInputElement).value = "hunter2"
    ;(root.querySelector(".orrdia-setup-admin") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    )
    await flushPromises()
    expect(handle.getState().name).toBe("wizardLibrary")
    // Click skip
    const skipBtn = Array.from(
      root.querySelectorAll(".orrdia-setup-library button"),
    ).find((b) => (b as HTMLButtonElement).textContent === "Skip") as HTMLButtonElement
    skipBtn.click()
    expect(handle.getState().name).toBe("wizardRemote")
    ;(root.querySelector(".orrdia-setup-remote") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    )
    await flushPromises()
    await flushPromises()
    expect(onConnected).toHaveBeenCalledTimes(1)
    const passed = onConnected.mock.calls[0][0] as AuthSession
    expect(passed.userId).toBe("user-1")
    expect(passed.accessToken).toBe("tok-1")
    expect(handle.getState().name).toBe("connected")
    // Verify the right call sequence happened
    expect(calls.some((u) => u.endsWith("/Startup/RemoteAccess"))).toBe(true)
    expect(calls.some((u) => u.endsWith("/Startup/Complete"))).toBe(true)
    expect(calls.some((u) => u.endsWith("/Users/AuthenticateByName"))).toBe(true)
  })
})
