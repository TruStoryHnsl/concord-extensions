/**
 * Pure SVG/DOM board renderer.
 *
 * `renderBoard` returns a detached SVG element. No engine logic lives here;
 * callers drive state transitions via engine modules.
 */

import type { Board, Color, Square } from "../engine/types"

const SVG_NS = "http://www.w3.org/2000/svg"
const CELL = 48

export interface RenderOptions {
  flipped?: boolean
  highlight?: Square[]
  selected?: Square | null
}

export function renderBoard(board: Board, opts: RenderOptions = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", `0 0 ${CELL * 8} ${CELL * 8}`)
  svg.setAttribute("width", String(CELL * 8))
  svg.setAttribute("height", String(CELL * 8))
  svg.setAttribute("class", "board")
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const dispRank = opts.flipped ? r : 7 - r
      const dispFile = opts.flipped ? 7 - f : f
      const rect = document.createElementNS(SVG_NS, "rect")
      rect.setAttribute("x", String(dispFile * CELL))
      rect.setAttribute("y", String(dispRank * CELL))
      rect.setAttribute("width", String(CELL))
      rect.setAttribute("height", String(CELL))
      rect.setAttribute("class", `sq ${(f + r) % 2 === 0 ? "dark" : "light"}`)
      rect.setAttribute("data-file", String(f))
      rect.setAttribute("data-rank", String(r))
      svg.appendChild(rect)
      const p = board[r][f]
      if (p) {
        const text = document.createElementNS(SVG_NS, "text")
        text.setAttribute("x", String(dispFile * CELL + CELL / 2))
        text.setAttribute("y", String(dispRank * CELL + CELL / 2 + 6))
        text.setAttribute("text-anchor", "middle")
        text.setAttribute("class", `piece piece-${p.color}`)
        text.textContent = pieceGlyph(p.kind, p.color)
        svg.appendChild(text)
      }
      if (opts.highlight?.some((h) => h.file === f && h.rank === r)) {
        rect.setAttribute("class", rect.getAttribute("class") + " highlight")
      }
      if (opts.selected && opts.selected.file === f && opts.selected.rank === r) {
        rect.setAttribute("class", rect.getAttribute("class") + " selected")
      }
    }
  }
  return svg
}

function pieceGlyph(kind: string, color: Color): string {
  const w = { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659", m: "\u25CB", k: "\u25C9" }
  const b = { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F", m: "\u25CF", k: "\u25C9" }
  const table: Record<string, string> = color === "white" ? w : b
  return table[kind] ?? "?"
}
