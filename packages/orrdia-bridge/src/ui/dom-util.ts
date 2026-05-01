/**
 * DOM helpers — minimal node manipulation primitives used by the
 * orrdia-bridge UI surfaces. Avoids any HTML-string parsing path.
 */

/** Remove every child of a node by direct DOM API. */
export function clearChildren(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}
