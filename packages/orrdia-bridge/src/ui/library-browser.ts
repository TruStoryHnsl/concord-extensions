/**
 * Library browser. Spec section 5.
 *
 * Two-stage browse:
 *   1. List user views (Movies, Shows, ...) on first mount.
 *   2. Click a view -> list its items via listItems(parentId=...).
 *      Click a folder/series -> drill in. Click a leaf -> onSelect(item).
 */

import { listItems, listLibraries } from "../engine/client"
import { AuthSession, LibraryView, MediaItem } from "../engine/types"
import { clearChildren } from "./dom-util"

export interface MountLibraryBrowserOpts {
  session: AuthSession
  onSelect: (item: MediaItem) => void
  onError?: (err: unknown) => void
}

export function mountLibraryBrowser(
  root: HTMLElement,
  opts: MountLibraryBrowserOpts,
): { unmount: () => void } {
  clearChildren(root)
  const container = document.createElement("div")
  container.className = "orrdia-library"
  container.dataset["state"] = "loading-views"
  root.appendChild(container)

  const breadcrumb = document.createElement("div")
  breadcrumb.className = "orrdia-breadcrumb"
  container.appendChild(breadcrumb)

  const grid = document.createElement("div")
  grid.className = "orrdia-grid"
  grid.style.display = "grid"
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))"
  grid.style.gap = "0.5em"
  container.appendChild(grid)

  type Crumb = { id: string | null; name: string }
  const trail: Crumb[] = [{ id: null, name: "Libraries" }]

  function renderBreadcrumb(): void {
    clearChildren(breadcrumb)
    trail.forEach((c, i) => {
      if (i > 0) {
        const sep = document.createElement("span")
        sep.textContent = " / "
        breadcrumb.appendChild(sep)
      }
      if (i < trail.length - 1) {
        const link = document.createElement("a")
        link.href = "#"
        link.textContent = c.name
        link.addEventListener("click", (e) => {
          e.preventDefault()
          while (trail.length > i + 1) trail.pop()
          if (trail.length === 1) loadViews()
          else loadFolder(trail[trail.length - 1])
        })
        breadcrumb.appendChild(link)
      } else {
        const span = document.createElement("span")
        span.textContent = c.name
        breadcrumb.appendChild(span)
      }
    })
  }

  async function loadViews(): Promise<void> {
    container.dataset["state"] = "loading-views"
    clearChildren(grid)
    try {
      const views = await listLibraries(opts.session)
      container.dataset["state"] = "ready"
      renderBreadcrumb()
      for (const v of views) renderViewTile(v)
    } catch (err) {
      container.dataset["state"] = "error"
      grid.textContent = `Failed to load libraries: ${describe(err)}`
      opts.onError?.(err)
    }
  }

  function renderViewTile(v: LibraryView): void {
    const tile = document.createElement("button")
    tile.type = "button"
    tile.className = "orrdia-tile orrdia-tile-view"
    tile.dataset["viewId"] = v.id
    tile.textContent = v.name || "(unnamed)"
    tile.addEventListener("click", () => {
      trail.push({ id: v.id, name: v.name })
      loadFolder({ id: v.id, name: v.name })
    })
    grid.appendChild(tile)
  }

  async function loadFolder(crumb: Crumb): Promise<void> {
    container.dataset["state"] = "loading-items"
    clearChildren(grid)
    renderBreadcrumb()
    try {
      const items = await listItems(opts.session, { parentId: crumb.id ?? undefined })
      container.dataset["state"] = "ready"
      for (const it of items) renderItemTile(it)
    } catch (err) {
      container.dataset["state"] = "error"
      grid.textContent = `Failed to load items: ${describe(err)}`
      opts.onError?.(err)
    }
  }

  function renderItemTile(it: MediaItem): void {
    const tile = document.createElement("button")
    tile.type = "button"
    tile.className = "orrdia-tile orrdia-tile-item"
    tile.dataset["itemId"] = it.id
    tile.dataset["itemType"] = it.type
    tile.textContent = `${it.name}${it.type ? ` (${it.type})` : ""}`
    tile.addEventListener("click", () => {
      const isFolder =
        it.hasChildren ||
        it.type === "Folder" ||
        it.type === "Series" ||
        it.type === "Season"
      if (isFolder) {
        trail.push({ id: it.id, name: it.name })
        loadFolder({ id: it.id, name: it.name })
      } else {
        opts.onSelect(it)
      }
    })
    grid.appendChild(tile)
  }

  loadViews()

  return {
    unmount: () => {
      clearChildren(root)
    },
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
