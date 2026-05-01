/**
 * Pre-auth dispatcher (INS-009 W9).
 *
 * Replaces the v0.2.0 "always render the connect form" path. On mount:
 *
 *   1. If no baseUrl is known, render the existing mountServerConfig
 *      form (which already accepts a URL alongside username/password).
 *      The URL field doubles as a probe trigger — submission triggers
 *      probeStartupState; if the probe says wizard incomplete we
 *      transition to the wizard.
 *
 *   2. If a baseUrl IS known (e.g. v0.4.0+ persistence ships), probe
 *      it first. Wizard or connect form depending on probe result.
 *
 * The dispatcher owns the bridge between two UI subtrees:
 *   - mountSetupWizard for first-run setup
 *   - mountServerConfig for credential entry against a finalized server
 *
 * Both ultimately produce an AuthSession via the same authenticateByName
 * path — so the bootstrap caller passes a single onConnected callback
 * and doesn't care which path got it there.
 */

import type { FetchLike } from "../engine/auth"
import { authenticateByName } from "../engine/auth"
import {
  OrrdiaSetupError,
  probeStartupState,
} from "../engine/jellyfin-setup"
import type { AuthSession, ServerConfig } from "../engine/types"
import { clearChildren } from "./dom-util"
import { mountServerConfig } from "./server-config"
import { mountSetupWizard } from "./setup-wizard"

export interface MountSetupOrConnectOpts {
  /**
   * Pre-known server URL. v0.3.2 wires this in from a persisted
   * ServerConfig so the connect form is pre-filled with the URL the
   * user used last session.
   */
  initialBaseUrl?: string
  /** Pre-fill the connect form's username + password fields. v0.3.2. */
  prefilledConfig?: Partial<ServerConfig>
  /** Fired when the user has a valid AuthSession. */
  onConnected: (session: AuthSession) => void
  /**
   * Optional companion to onConnected — fires with the ServerConfig
   * that produced the session, so the bootstrap layer can persist it.
   * Decoupled from onConnected so callers without persistence don't
   * need to know about it.
   */
  onAuthenticated?: (config: ServerConfig, session: AuthSession) => void
  /** Injected fetch for tests. */
  fetchImpl?: FetchLike
}

export interface MountSetupOrConnectHandle {
  unmount: () => void
}

/**
 * Mount the dispatcher. Internal state machine is intentionally tiny
 * (probe-result branching only); the rich state machine is inside
 * mountSetupWizard.
 */
export function mountSetupOrConnect(
  root: HTMLElement,
  opts: MountSetupOrConnectOpts,
): MountSetupOrConnectHandle {
  const fetchImpl = opts.fetchImpl

  /**
   * Render the existing connect form. Called either:
   *   (a) at startup when no baseUrl is known yet, OR
   *   (b) after a probe reveals StartupWizardCompleted=true.
   * In case (a) the form's onConnect MUST first probe the URL the user
   * just entered and divert to the wizard if the server is fresh.
   */
  function renderConnect(prefilled?: Partial<ServerConfig>): void {
    clearChildren(root)
    const handle = mountServerConfig(root, {
      initial: prefilled,
      // urlOnly relaxes the form's required-fields check so the user can
      // probe a brand-new server (which has no users yet) without
      // inventing credentials. The dispatcher's onConnect picks the
      // right next step from the probe result.
      urlOnly: true,
      onConnect: async (config: ServerConfig) => {
        try {
          const probe = await probeStartupState(config.baseUrl, { fetchImpl })
          if (!probe.startupCompleted) {
            // Server is fresh — divert to the setup wizard pre-filled
            // with the URL the user already typed.
            renderWizard(config.baseUrl)
            return
          }
        } catch (err) {
          // Probe failed — surface the error, let the user fix the URL.
          // We don't drop into the wizard because we don't know whether
          // the server even exists.
          handle.setError(probeErrorMessage(err))
          return
        }
        // Probe says completed; proceed with the credentials the user
        // entered (existing v0.2.0 behavior).
        if (!config.username) {
          handle.setError("Username is required to sign in to this server.")
          return
        }
        try {
          const session = await authenticateByName(config, { fetchImpl })
          opts.onAuthenticated?.(config, session)
          opts.onConnected(session)
        } catch (err) {
          handle.setError(authErrorMessage(err))
        }
      },
    })
  }

  function renderWizard(baseUrl: string): void {
    clearChildren(root)
    mountSetupWizard(root, {
      initialBaseUrl: baseUrl,
      onConnected: (session) => opts.onConnected(session),
      onAlreadyCompleted: (url) => {
        // Wizard's probe revealed completed=true mid-flight (e.g. user
        // restarted with a now-already-set-up server). Hand off to the
        // connect form, pre-filling the URL.
        renderConnect({ baseUrl: url })
      },
      fetchImpl,
    })
  }

  // Initial dispatch: if we have a baseUrl, probe first; otherwise show
  // the connect form (which itself does a probe-on-submit). v0.3.2:
  // prefilledConfig (typically loaded from localStorage) seeds the
  // connect form so a returning user doesn't re-type credentials.
  if (opts.initialBaseUrl) {
    renderWizard(opts.initialBaseUrl)
  } else {
    renderConnect(opts.prefilledConfig)
  }

  return {
    unmount: () => clearChildren(root),
  }
}

function probeErrorMessage(err: unknown): string {
  if (err instanceof OrrdiaSetupError) {
    if (err.status === 0) return `Could not reach server: ${err.body}`
    return `Server responded with HTTP ${err.status} from ${err.endpoint}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function authErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
