/**
 * Server-config form. Spec section 3.
 *
 * Renders three inputs (baseUrl, username, password) + Connect button.
 * On submit, calls `onConnect(config)` which the bootstrap wires to
 * `authenticateByName` and resolves to an AuthSession.
 *
 * v0.1.0: no persistence; credentials are entered every mount.
 */

import { ServerConfig } from "../engine/types"
import { clearChildren } from "./dom-util"

export interface MountServerConfigOpts {
  initial?: Partial<ServerConfig>
  onConnect: (config: ServerConfig) => void | Promise<void>
  /**
   * When true, the form only requires a non-empty Server URL on submit
   * (username/password may be blank). The host is expected to call the
   * setup-wizard / probe layer with the URL alone. Default false keeps
   * v0.2.0 behavior: URL+username both required.
   *
   * Used by mountSetupOrConnect (INS-009 W9) to let users probe a fresh
   * server without inventing credentials they don't yet have.
   */
  urlOnly?: boolean
}

export function mountServerConfig(
  root: HTMLElement,
  opts: MountServerConfigOpts,
): { unmount: () => void; setError: (msg: string) => void } {
  clearChildren(root)
  const form = document.createElement("form")
  form.id = "orrdia-server-config"

  const title = document.createElement("h2")
  title.textContent = "Connect to orrdia"
  form.appendChild(title)

  const baseUrl = makeInput("Server URL", "url", opts.initial?.baseUrl ?? "")
  const username = makeInput("Username", "text", opts.initial?.username ?? "")
  const password = makeInput("Password", "password", "")

  form.appendChild(baseUrl.label)
  form.appendChild(username.label)
  form.appendChild(password.label)

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.textContent = "Connect"
  form.appendChild(btn)

  const errBox = document.createElement("div")
  errBox.className = "orrdia-error"
  errBox.style.color = "#c44"
  errBox.style.minHeight = "1.2em"
  form.appendChild(errBox)

  form.addEventListener("submit", (e) => {
    e.preventDefault()
    errBox.textContent = ""
    const config: ServerConfig = {
      baseUrl: baseUrl.input.value.trim(),
      username: username.input.value.trim(),
      password: password.input.value,
    }
    if (!config.baseUrl) {
      errBox.textContent = opts.urlOnly
        ? "Server URL is required."
        : "Base URL and username are required."
      return
    }
    if (!opts.urlOnly && !config.username) {
      errBox.textContent = "Base URL and username are required."
      return
    }
    Promise.resolve(opts.onConnect(config)).catch((err) => {
      errBox.textContent = err?.message ?? String(err)
    })
  })

  root.appendChild(form)

  return {
    unmount: () => {
      clearChildren(root)
    },
    setError: (msg: string) => {
      errBox.textContent = msg
    },
  }
}

function makeInput(labelText: string, type: string, defaultValue: string) {
  const label = document.createElement("label")
  label.style.display = "block"
  label.style.marginBottom = "0.5em"

  const span = document.createElement("span")
  span.textContent = labelText
  span.style.display = "block"
  label.appendChild(span)

  const input = document.createElement("input")
  input.type = type
  input.value = defaultValue
  input.style.width = "100%"
  input.style.padding = "0.4em"
  label.appendChild(input)

  return { label, input }
}
