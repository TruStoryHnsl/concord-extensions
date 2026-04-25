/**
 * Shared collapsible Rules panel for chess-checkers.
 *
 * Layout: docked to the right of the board on desktop, above the board on
 * narrow viewports. Default state is expanded on first mount of a game;
 * the collapsed flag is persisted in localStorage keyed
 * `chessCheckers.rulesCollapsed.<gameId>`.
 *
 * Mounts into a wrapper that splits the supplied root into two columns:
 * a `gameArea` (where the game UI renders) and the rules panel.
 *
 * Mirrors packages/card-suite/src/games/ui-rules-panel.ts.
 */

import { RulesDoc } from "../games/rules-doc-types"

const LS_PREFIX = "chessCheckers.rulesCollapsed."

export interface RulesPanelHandle {
  readonly gameArea: HTMLElement
  readonly rulesPanel: HTMLElement
  destroy(): void
}

export function readCollapsedFlag(gameId: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem(LS_PREFIX + gameId) === "1"
  } catch {
    return false
  }
}

export function writeCollapsedFlag(gameId: string, collapsed: boolean): void {
  try {
    if (typeof localStorage === "undefined") return
    if (collapsed) localStorage.setItem(LS_PREFIX + gameId, "1")
    else localStorage.removeItem(LS_PREFIX + gameId)
  } catch {
    /* ignore */
  }
}

export function mountRulesPanel(
  root: HTMLElement,
  doc: RulesDoc,
  gameId: string,
): RulesPanelHandle {
  const wrapper = document.createElement("div")
  wrapper.dataset.role = "rules-wrapper"
  wrapper.style.display = "flex"
  wrapper.style.flexDirection = isNarrow() ? "column" : "row"
  wrapper.style.gap = "12px"
  wrapper.style.alignItems = "flex-start"
  wrapper.style.width = "100%"

  const gameArea = document.createElement("div")
  gameArea.dataset.role = "game-area"
  gameArea.style.flex = "1 1 auto"
  gameArea.style.minWidth = "0"

  const rulesPanel = document.createElement("aside")
  rulesPanel.dataset.role = "rules-panel"
  rulesPanel.dataset.gameId = gameId
  rulesPanel.style.background = "#212121"
  rulesPanel.style.border = "1px solid #3a3a3a"
  rulesPanel.style.borderRadius = "8px"
  rulesPanel.style.boxSizing = "border-box"
  rulesPanel.style.color = "#e8e8e8"
  rulesPanel.style.fontFamily = "system-ui, -apple-system, sans-serif"
  rulesPanel.style.fontSize = "13px"
  rulesPanel.style.lineHeight = "1.5"
  rulesPanel.style.flex = "0 0 auto"

  let collapsed = readCollapsedFlag(gameId)

  const header = document.createElement("div")
  header.style.display = "flex"
  header.style.justifyContent = "space-between"
  header.style.alignItems = "center"
  header.style.gap = "8px"
  header.style.padding = "10px 12px"

  const title = document.createElement("div")
  title.dataset.role = "rules-title"
  title.textContent = `Rules · ${doc.title}`
  title.style.fontSize = "13px"
  title.style.fontWeight = "600"
  header.appendChild(title)

  const toggle = document.createElement("button")
  toggle.dataset.role = "rules-toggle"
  toggle.type = "button"
  toggle.setAttribute("aria-label", "Toggle rules panel")
  toggle.style.background = "#2c2c2c"
  toggle.style.color = "#e8e8e8"
  toggle.style.border = "1px solid #3a3a3a"
  toggle.style.borderRadius = "4px"
  toggle.style.fontSize = "12px"
  toggle.style.fontWeight = "600"
  toggle.style.padding = "2px 8px"
  toggle.style.cursor = "pointer"
  toggle.style.lineHeight = "1.4"
  header.appendChild(toggle)

  rulesPanel.appendChild(header)

  const body = document.createElement("div")
  body.dataset.role = "rules-body"
  body.style.padding = "0 12px 12px 12px"
  rulesPanel.appendChild(body)

  for (const section of doc.sections) {
    const h = document.createElement("div")
    h.style.fontWeight = "600"
    h.style.marginTop = "8px"
    h.style.marginBottom = "4px"
    h.style.fontSize = "12px"
    h.style.opacity = "0.85"
    h.textContent = section.heading
    body.appendChild(h)
    const p = document.createElement("p")
    p.style.margin = "0 0 4px 0"
    p.style.fontSize = "13px"
    p.textContent = section.body
    body.appendChild(p)
  }

  function applyCollapsed(): void {
    if (collapsed) {
      body.style.display = "none"
      toggle.textContent = "?"
      toggle.title = "Show rules"
      rulesPanel.dataset.collapsed = "true"
      rulesPanel.style.minWidth = "0"
      rulesPanel.style.width = "auto"
    } else {
      body.style.display = ""
      toggle.textContent = "×"
      toggle.title = "Hide rules"
      rulesPanel.dataset.collapsed = "false"
      rulesPanel.style.minWidth = isNarrow() ? "0" : "260px"
      rulesPanel.style.width = isNarrow() ? "100%" : "300px"
    }
  }

  toggle.addEventListener("click", () => {
    collapsed = !collapsed
    writeCollapsedFlag(gameId, collapsed)
    applyCollapsed()
  })

  applyCollapsed()

  if (isNarrow()) {
    wrapper.appendChild(rulesPanel)
    wrapper.appendChild(gameArea)
  } else {
    wrapper.appendChild(gameArea)
    wrapper.appendChild(rulesPanel)
  }

  root.appendChild(wrapper)

  let mql: MediaQueryList | null = null
  const onChange = (): void => {
    if (isNarrow()) {
      wrapper.style.flexDirection = "column"
      if (wrapper.firstChild !== rulesPanel) {
        wrapper.insertBefore(rulesPanel, gameArea)
      }
    } else {
      wrapper.style.flexDirection = "row"
      if (wrapper.firstChild !== gameArea) {
        wrapper.insertBefore(gameArea, rulesPanel)
      }
    }
    applyCollapsed()
  }
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      mql = window.matchMedia("(max-width: 720px)")
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange)
      } else if (
        typeof (mql as unknown as { addListener?: (l: () => void) => void }).addListener ===
        "function"
      ) {
        ;(mql as unknown as { addListener: (l: () => void) => void }).addListener(onChange)
      }
    }
  } catch {
    /* matchMedia not available */
  }

  return {
    gameArea,
    rulesPanel,
    destroy(): void {
      try {
        if (mql) {
          if (typeof mql.removeEventListener === "function") {
            mql.removeEventListener("change", onChange)
          } else if (
            typeof (mql as unknown as { removeListener?: (l: () => void) => void })
              .removeListener === "function"
          ) {
            ;(mql as unknown as { removeListener: (l: () => void) => void }).removeListener(
              onChange,
            )
          }
        }
      } catch {
        /* ignore */
      }
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild)
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
    },
  }
}

function isNarrow(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 720px)").matches
    }
  } catch {
    /* fall through */
  }
  return false
}
