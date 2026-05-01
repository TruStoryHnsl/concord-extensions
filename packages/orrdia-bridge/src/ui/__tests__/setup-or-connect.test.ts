import { describe, expect, it, vi } from "vitest"
import { mountSetupOrConnect } from "../setup-or-connect"
import type { AuthSession } from "../../engine/types"

function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
function errRes(status: number, body: string): Response {
  return new Response(body, { status })
}

async function flushPromises(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

describe("mountSetupOrConnect", () => {
  it("starts on the connect form when no initial baseUrl is provided", () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn()
    mountSetupOrConnect(root, {
      onConnected: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(root.querySelector("#orrdia-server-config")).not.toBeNull()
    expect(root.querySelector(".orrdia-setup-detecting")).toBeNull()
  })

  it("on connect-form submit with a fresh server, diverts into the wizard", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: false, ProductName: "Jellyfin Server" })
      }
      throw new Error("unexpected url " + url)
    })
    mountSetupOrConnect(root, {
      onConnected: vi.fn(),
      fetchImpl,
    })
    const form = root.querySelector("#orrdia-server-config") as HTMLFormElement
    const inputs = form.querySelectorAll("input")
    ;(inputs[0] as HTMLInputElement).value = "https://o.example"
    // Username left blank — wizard should kick in regardless.
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await flushPromises()

    // Detecting screen renders briefly, then welcome.
    await flushPromises()
    expect(root.querySelector(".orrdia-setup-welcome")).not.toBeNull()
  })

  it("on connect-form submit with a finalized server, attempts auth and surfaces 401", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: true })
      }
      if (url.endsWith("/Users/AuthenticateByName")) {
        return errRes(401, "bad creds")
      }
      throw new Error("unexpected url " + url)
    })
    mountSetupOrConnect(root, {
      onConnected: vi.fn(),
      fetchImpl,
    })
    const form = root.querySelector("#orrdia-server-config") as HTMLFormElement
    const inputs = form.querySelectorAll("input")
    ;(inputs[0] as HTMLInputElement).value = "https://o.example"
    ;(inputs[1] as HTMLInputElement).value = "alice"
    ;(inputs[2] as HTMLInputElement).value = "wrong"
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await flushPromises(30)
    const err = root.querySelector(".orrdia-error") as HTMLDivElement
    expect(err.textContent).toContain("HTTP 401")
  })

  it("surfaces a probe network failure inline without diverting to the wizard", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND")
    })
    mountSetupOrConnect(root, {
      onConnected: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const form = root.querySelector("#orrdia-server-config") as HTMLFormElement
    const inputs = form.querySelectorAll("input")
    ;(inputs[0] as HTMLInputElement).value = "https://nope.invalid"
    form.dispatchEvent(new Event("submit", { cancelable: true }))
    await flushPromises()
    const err = root.querySelector(".orrdia-error") as HTMLDivElement
    expect(err.textContent).toContain("Could not reach server")
    // Still on the connect form.
    expect(root.querySelector("#orrdia-server-config")).not.toBeNull()
    expect(root.querySelector(".orrdia-setup-welcome")).toBeNull()
  })

  it("with an initial baseUrl, starts in the wizard (probe drives the next render)", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () => ok({ StartupWizardCompleted: false }))
    mountSetupOrConnect(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      fetchImpl,
    })
    expect(root.querySelector(".orrdia-setup-detecting")).not.toBeNull()
    await flushPromises()
    expect(root.querySelector(".orrdia-setup-welcome")).not.toBeNull()
  })

  it("when wizard probe says completed=true, hands off to the connect form pre-filled with baseUrl", async () => {
    const root = document.createElement("div")
    const fetchImpl = vi.fn(async () => ok({ StartupWizardCompleted: true }))
    mountSetupOrConnect(root, {
      initialBaseUrl: "https://o.example",
      onConnected: vi.fn(),
      fetchImpl,
    })
    await flushPromises()
    const baseUrlInput = root.querySelector("#orrdia-server-config input") as HTMLInputElement
    expect(baseUrlInput).not.toBeNull()
    expect(baseUrlInput.value).toBe("https://o.example")
  })

  it("calls onConnected with the AuthSession after a successful end-to-end wizard run", async () => {
    const root = document.createElement("div")
    let session: AuthSession | undefined
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/System/Info/Public")) {
        return ok({ StartupWizardCompleted: false })
      }
      if (url.endsWith("/Startup/Configuration")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/User")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/RemoteAccess")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Startup/Complete")) return new Response("{}", { status: 200 })
      if (url.endsWith("/Users/AuthenticateByName")) {
        return ok({
          User: { Id: "u-1", ServerId: "srv" },
          AccessToken: "tok-end-to-end",
          ServerId: "srv",
        })
      }
      throw new Error("unexpected url " + url)
    })
    mountSetupOrConnect(root, {
      initialBaseUrl: "https://o.example",
      onConnected: (s) => {
        session = s
      },
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
    // Skip library
    const skipBtn = Array.from(
      root.querySelectorAll(".orrdia-setup-library button"),
    ).find((b) => (b as HTMLButtonElement).textContent === "Skip") as HTMLButtonElement
    skipBtn.click()
    ;(root.querySelector(".orrdia-setup-remote") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    )
    await flushPromises()
    await flushPromises()
    expect(session).toBeDefined()
    expect(session!.accessToken).toBe("tok-end-to-end")
  })
})
